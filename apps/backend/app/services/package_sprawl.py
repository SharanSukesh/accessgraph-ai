"""Managed-Package Sprawl Service — AppExchange inventory + tiered
usage detection.

Sixth analytics engine, third of Newton's Phase-1 features (after
Data Quality and Change-Risk Radar). Pulls every managed package
installed in the org, counts components per namespace (ApexClass,
Flow, CustomObject from global describe), joins licence usage where
available, and tiers each package as:

  - active     — has real component activity OR at least one licence
                 seat assigned. This is what a working install looks like.
  - underused  — component activity is low (few components) AND either
                 no licences assigned or very low % of allowed used.
  - unused     — zero components in namespace AND zero licence seats
                 assigned. Prime candidate for uninstall.

Frontend renders per-tier counts on the KPI strip and colours each
package card by its tier so consultants can spot dead installs at a
glance.

Entrypoint:
    service = PackageSprawlService(db, org_id)
    run = await service.run(actor_email=...)
"""
from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.models import (
    InstalledPackage,
    PackageSprawlRun,
    SalesforceConnection,
)
from app.salesforce.client import SalesforceAPIClient


logger = logging.getLogger(__name__)


# ----------------------------------------------------------------------
# Configuration
# ----------------------------------------------------------------------

# Cap on how many packages we'll deep-inspect per run. Each package
# needs 2 Tooling API calls (ApexClass + Flow counts) — 50 packages
# = 100 API calls, comfortably under the timeout. Increase later if we
# meet a real 100+-package tenant.
MAX_PACKAGES_PER_RUN = 50

# Tier thresholds. Deliberately conservative — a package with a
# handful of Apex classes and no assigned licences is more likely
# "vestigial" than "active".
ACTIVE_MIN_COMPONENTS = 5
ACTIVE_MIN_LICENSES_USED = 1


# ----------------------------------------------------------------------
# Result shape
# ----------------------------------------------------------------------


@dataclass
class ScoredPackage:
    """In-memory result for one package before persisting."""
    sf_package_id: str
    sf_version_id: Optional[str]
    name: str
    namespace_prefix: Optional[str]
    description: Optional[str]
    version_name: Optional[str]
    version_number: Optional[str]
    is_beta: bool
    is_deprecated: bool
    is_managed: bool
    apex_class_count: int
    flow_count: int
    custom_object_count: int
    licenses_allowed: Optional[int]
    licenses_used: Optional[int]
    utilization_tier: str
    evidence: Dict[str, Any]


# ----------------------------------------------------------------------
# Service
# ----------------------------------------------------------------------


class PackageSprawlService:
    """Runs the package-sprawl analysis for one org.

    Usage:
        service = PackageSprawlService(db, org_id)
        run = await service.run(actor_email="ops@newton.example")

    The service is stateless past `db` and `org_id`; construct one per
    invocation.
    """

    def __init__(
        self,
        db: AsyncSession,
        org_id: str,
        *,
        max_packages: int = MAX_PACKAGES_PER_RUN,
    ) -> None:
        self.db = db
        self.org_id = org_id
        self.max_packages = max_packages

    # ------------------------------------------------------------------
    # Public entrypoint
    # ------------------------------------------------------------------

    async def run(self, *, actor_email: Optional[str] = None) -> PackageSprawlRun:
        """Full package-sprawl pass. Persists a PackageSprawlRun row +
        one InstalledPackage per analysed managed package. Returns the
        run row.
        """
        import httpx  # local — only needed for 401 detection

        started = time.monotonic()

        try:
            client = await self._client()
        except Exception as exc:
            logger.exception(
                "package-sprawl: _client() failed for org %s", self.org_id
            )
            raise RuntimeError(f"Failed to build Salesforce client: {exc}") from exc

        # 1. Pull the full package list. Retry once on 401.
        try:
            raw_packages = await client.extract_installed_packages()
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code == 401:
                logger.warning(
                    "package-sprawl: 401 on InstalledSubscriberPackage — "
                    "refreshing token"
                )
                try:
                    client = await self._refresh_access_token()
                    raw_packages = await client.extract_installed_packages()
                except Exception as refresh_exc:
                    logger.exception(
                        "package-sprawl: token refresh failed for org %s",
                        self.org_id,
                    )
                    raise RuntimeError(
                        "Salesforce access token expired and refresh failed. "
                        "Please reconnect Salesforce from the sidebar."
                    ) from refresh_exc
            else:
                logger.exception(
                    "package-sprawl: package pull failed for org %s "
                    "with HTTP %s", self.org_id, exc.response.status_code,
                )
                raise RuntimeError(
                    f"Salesforce InstalledSubscriberPackage returned HTTP "
                    f"{exc.response.status_code}: {exc}"
                ) from exc
        except Exception as exc:
            logger.exception(
                "package-sprawl: package pull failed for org %s", self.org_id
            )
            raise RuntimeError(
                f"Failed to pull installed packages: {exc}"
            ) from exc

        # 2. Pull licences (best-effort — many orgs don't have them).
        try:
            raw_licenses = await client.extract_package_licenses()
        except Exception as exc:  # noqa: BLE001
            logger.info(
                "package-sprawl: license pull failed (%s) — proceeding "
                "without license enrichment", exc,
            )
            raw_licenses = []
        licenses_by_namespace: Dict[str, Dict[str, Any]] = {
            lic.get("NamespacePrefix"): lic
            for lic in raw_licenses
            if lic.get("NamespacePrefix")
        }

        # 3. Pull global describe so we can count custom objects in
        #    each namespace ("Namespace__ObjectName__c" — SF prefixes
        #    every custom object with the package's namespace).
        try:
            all_sobjects = await client.list_all_sobjects()
            all_object_names = [
                o.get("name") for o in all_sobjects if o.get("name")
            ]
        except Exception as exc:  # noqa: BLE001
            logger.info(
                "package-sprawl: global describe failed (%s) — object "
                "counts unavailable", exc,
            )
            all_object_names = []

        # 4. Cap total packages analysed to keep runtime bounded.
        capped = raw_packages[: self.max_packages]
        if len(raw_packages) > self.max_packages:
            logger.info(
                "package-sprawl: %d packages available, analysing top %d",
                len(raw_packages), self.max_packages,
            )

        scored: List[ScoredPackage] = []
        for raw in capped:
            try:
                pkg = await self._analyse_package(
                    client, raw, licenses_by_namespace, all_object_names
                )
                if pkg:
                    scored.append(pkg)
            except Exception as exc:  # noqa: BLE001
                logger.warning(
                    "package-sprawl: failed to analyse package %s: %s",
                    (raw.get("SubscriberPackage") or {}).get("Name"), exc,
                    exc_info=True,
                )

        # Rollups for the KPI strip.
        active = sum(1 for p in scored if p.utilization_tier == "active")
        underused = sum(1 for p in scored if p.utilization_tier == "underused")
        unused = sum(1 for p in scored if p.utilization_tier == "unused")
        total_allowed = sum(p.licenses_allowed or 0 for p in scored)
        total_used = sum(p.licenses_used or 0 for p in scored)
        utilization_pct = (
            (len([p for p in scored if p.utilization_tier != "unused"])
             / len(scored) * 100.0)
            if scored else 0.0
        )

        run = PackageSprawlRun(
            organization_id=self.org_id,
            snapshot_at=datetime.now(timezone.utc),
            packages_total=len(scored),
            packages_active=active,
            packages_underused=underused,
            packages_unused=unused,
            avg_utilization_pct=utilization_pct,
            total_licenses_allowed=total_allowed,
            total_licenses_used=total_used,
            duration_ms=int((time.monotonic() - started) * 1000),
        )

        try:
            self.db.add(run)
            await self.db.flush()
            for p in scored:
                self.db.add(
                    InstalledPackage(
                        organization_id=self.org_id,
                        run_id=run.id,
                        sf_package_id=(p.sf_package_id or "")[:18],
                        sf_version_id=(p.sf_version_id or None) and p.sf_version_id[:18],
                        name=(p.name or "unnamed")[:255],
                        namespace_prefix=(p.namespace_prefix or None)
                            and p.namespace_prefix[:120],
                        description=p.description,
                        version_name=(p.version_name or None) and p.version_name[:255],
                        version_number=(p.version_number or None)
                            and p.version_number[:60],
                        is_beta=p.is_beta,
                        is_deprecated=p.is_deprecated,
                        is_managed=p.is_managed,
                        apex_class_count=p.apex_class_count,
                        flow_count=p.flow_count,
                        custom_object_count=p.custom_object_count,
                        licenses_allowed=p.licenses_allowed,
                        licenses_used=p.licenses_used,
                        utilization_tier=p.utilization_tier,
                        evidence=p.evidence,
                    )
                )
            await self.db.commit()
            await self.db.refresh(run)
        except Exception as exc:
            logger.exception(
                "package-sprawl: DB persist failed for org %s "
                "(analysed=%d)", self.org_id, len(scored),
            )
            try:
                await self.db.rollback()
            except Exception:  # noqa: BLE001
                pass
            raise RuntimeError(
                f"Failed to persist package-sprawl run: "
                f"{type(exc).__name__}: {exc}"
            ) from exc

        logger.info(
            "package-sprawl run %s by %s: %d packages (%d active, %d "
            "underused, %d unused), utilization=%.1f%%",
            run.id, actor_email or "system",
            run.packages_total, active, underused, unused,
            utilization_pct,
        )
        return run

    # ------------------------------------------------------------------
    # Per-package analysis
    # ------------------------------------------------------------------

    async def _analyse_package(
        self,
        client: SalesforceAPIClient,
        raw: Dict[str, Any],
        licenses_by_namespace: Dict[str, Dict[str, Any]],
        all_object_names: List[str],
    ) -> Optional[ScoredPackage]:
        subscriber = raw.get("SubscriberPackage") or {}
        version = raw.get("SubscriberPackageVersion") or {}

        sf_package_id = subscriber.get("Id") or ""
        if not sf_package_id:
            return None

        namespace = subscriber.get("NamespacePrefix") or None
        name = subscriber.get("Name") or "Unnamed package"
        description = subscriber.get("Description") or None

        # Version formatting: "2.3.1" or None if no version metadata.
        major = version.get("MajorVersion")
        minor = version.get("MinorVersion")
        patch = version.get("PatchVersion")
        version_number = None
        if major is not None and minor is not None:
            parts = [str(major), str(minor)]
            if patch is not None:
                parts.append(str(patch))
            version_number = ".".join(parts)

        # Component counts. None from the SF client == query failed;
        # treat as 0 so the tier calc still works.
        apex_class_count = 0
        flow_count = 0
        if namespace:
            ac = await client.count_apex_classes_in_namespace(namespace)
            apex_class_count = ac or 0
            fc = await client.count_flows_in_namespace(namespace)
            flow_count = fc or 0
        custom_object_count = (
            sum(1 for n in all_object_names if n and n.startswith(f"{namespace}__"))
            if namespace else 0
        )

        # License data if the package has an AppExchange licence row.
        lic = licenses_by_namespace.get(namespace) if namespace else None
        licenses_allowed: Optional[int] = None
        licenses_used: Optional[int] = None
        if lic:
            allowed_raw = lic.get("AllowedLicenses")
            used_raw = lic.get("UsedLicenses")
            # SF returns "Unlimited" (string) for unlimited licences.
            # Store None so the frontend can render "Unlimited" itself.
            if isinstance(allowed_raw, int):
                licenses_allowed = allowed_raw
            if isinstance(used_raw, int):
                licenses_used = used_raw

        # ---- Tier decision -----------------------------------------
        # active if (>= ACTIVE_MIN_COMPONENTS components) OR (>= 1 seat used)
        # unused if (0 components AND (no licence OR 0 seats used))
        # underused otherwise
        total_components = apex_class_count + flow_count + custom_object_count
        licence_seats_used = licenses_used or 0

        is_active = (
            total_components >= ACTIVE_MIN_COMPONENTS
            or licence_seats_used >= ACTIVE_MIN_LICENSES_USED
        )
        is_unused = (
            total_components == 0 and licence_seats_used == 0
        )
        if is_active:
            tier = "active"
        elif is_unused:
            tier = "unused"
        else:
            tier = "underused"

        # Bump deprecated packages down a tier — a deprecated managed
        # package with any activity is still a red flag for consulting.
        if version.get("IsDeprecated"):
            if tier == "active":
                tier = "underused"
            elif tier == "underused":
                tier = "unused"

        evidence: Dict[str, Any] = {
            "reasoning": {
                "components": total_components,
                "components_breakdown": {
                    "apex_class": apex_class_count,
                    "flow": flow_count,
                    "custom_object": custom_object_count,
                },
                "licence_seats_used": licence_seats_used,
                "licence_seats_allowed": licenses_allowed,
                "deprecated_penalty": bool(version.get("IsDeprecated")),
                "final_tier": tier,
            },
        }

        return ScoredPackage(
            sf_package_id=sf_package_id,
            sf_version_id=version.get("Id") or None,
            name=name,
            namespace_prefix=namespace,
            description=description,
            version_name=version.get("Name") or None,
            version_number=version_number,
            is_beta=bool(version.get("IsBeta")),
            is_deprecated=bool(version.get("IsDeprecated")),
            is_managed=bool(version.get("IsManaged", True)),
            apex_class_count=apex_class_count,
            flow_count=flow_count,
            custom_object_count=custom_object_count,
            licenses_allowed=licenses_allowed,
            licenses_used=licenses_used,
            utilization_tier=tier,
            evidence=evidence,
        )

    # ------------------------------------------------------------------
    # Support (mirrors DataQualityService + ChangeRiskRadarService)
    # ------------------------------------------------------------------

    async def _client(self) -> SalesforceAPIClient:
        row = await self.db.execute(
            select(SalesforceConnection)
            .where(SalesforceConnection.organization_id == self.org_id)
            .order_by(desc(SalesforceConnection.created_at))
            .limit(1)
        )
        conn = row.scalar_one_or_none()
        if conn is None:
            raise RuntimeError(
                f"No Salesforce connection for organization {self.org_id}"
            )
        return SalesforceAPIClient(
            instance_url=conn.instance_url,
            access_token=conn.access_token,
        )

    async def _refresh_access_token(self) -> SalesforceAPIClient:
        from app.salesforce.oauth import SalesforceOAuthClient

        row = await self.db.execute(
            select(SalesforceConnection)
            .where(
                SalesforceConnection.organization_id == self.org_id,
                SalesforceConnection.is_active.is_(True),
            )
        )
        conn = row.scalar_one_or_none()
        if conn is None or not conn.refresh_token:
            raise RuntimeError(
                f"No refresh_token available for org {self.org_id} — "
                "user must re-authenticate with Salesforce."
            )
        instance_url = conn.instance_url or ""
        is_sandbox = (
            ".sandbox." in instance_url
            or ".scratch." in instance_url
            or instance_url.startswith("https://cs")
        )
        login_url = "https://test.salesforce.com" if is_sandbox else None
        logger.warning(
            "package-sprawl: access token expired, refreshing (sandbox=%s)",
            is_sandbox,
        )
        oauth_client = SalesforceOAuthClient(login_url=login_url)
        token_response = await oauth_client.refresh_access_token(
            conn.refresh_token
        )
        conn.access_token = token_response.access_token
        conn.instance_url = token_response.instance_url
        await self.db.commit()
        logger.info("package-sprawl: access token refreshed")
        return SalesforceAPIClient(
            instance_url=token_response.instance_url,
            access_token=token_response.access_token,
        )
