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
# now needs up to 6 SF queries (ApexClass + Flow + Deps + AsyncJobs
# + Scheduled + record-counts-per-custom-object), so 50 packages =
# ~350 API calls at the outer bound. Comfortably under the timeout
# on a healthy org but tight enough to warrant the cap.
MAX_PACKAGES_PER_RUN = 50

# Per-package record-count query cap. A package with 30 custom
# objects would fire 30 COUNT() queries; bound them so we don't blow
# a single package's slice of the run.
MAX_RECORD_COUNT_QUERIES_PER_PACKAGE = 15

# --- Tier thresholds ---
#
# v2 tiering (reference-based). Signals:
#   dep_count       — MetadataComponentDependency edges into namespace
#   record_count    — total records across package-brought custom objects
#   async_job_count — live AsyncApexJob rows in the namespace
#   scheduled_count — CronTrigger rows for scheduled Apex jobs
#   licence_seats   — used seats from PackageLicense
#
# ACTIVE if ANY of these is truthy — any real wiring signal promotes
# the package. Inventory counts (Apex / Flow / Object shipped inside
# the package) are no longer the primary driver; they're a fallback
# used to distinguish UNDERUSED from UNUSED.
ACTIVE_MIN_DEPENDENCIES = 1
ACTIVE_MIN_RECORDS = 1
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
    # v2 wiring signals — None means the query failed for this signal.
    dependency_count: Optional[int]
    record_count_total: Optional[int]
    async_job_count: Optional[int]
    scheduled_job_count: Optional[int]
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
        # WARNING level so it always shows in the default Railway
        # log stream. A run producing 0 scored packages when SF
        # returned > 0 raw packages is the exact signature of the
        # regression this line helps diagnose.
        logger.warning(
            "package-sprawl: org=%s extracted %d packages from SF, "
            "analysing top %d",
            self.org_id, len(raw_packages), len(capped),
        )

        scored: List[ScoredPackage] = []
        for raw in capped:
            pkg_name_for_log = (
                (raw.get("SubscriberPackage") or {}).get("Name")
                or "(unnamed)"
            )
            try:
                pkg = await self._analyse_package(
                    client, raw, licenses_by_namespace, all_object_names
                )
                if pkg:
                    scored.append(pkg)
            except Exception as exc:  # noqa: BLE001
                # If per-package analysis blows up (a new Tooling
                # query rejected by the org, an unexpected response
                # shape, whatever), still persist a stub for that
                # package rather than dropping it entirely. Silent
                # drops make the whole page look empty even when SF
                # returned real installs — which is a confusing
                # regression compared to "the package appears with
                # unknown signals".
                logger.warning(
                    "package-sprawl: failed to analyse package %s: %s "
                    "— persisting stub so it still appears in the list.",
                    pkg_name_for_log, exc,
                    exc_info=True,
                )
                try:
                    stub = self._build_stub_from_raw(raw, str(exc))
                    if stub:
                        scored.append(stub)
                except Exception:  # noqa: BLE001
                    # A stub build failing means we can't even
                    # identify the package — nothing safe to persist.
                    # Log once at exception level and move on.
                    logger.exception(
                        "package-sprawl: stub build also failed for %s",
                        pkg_name_for_log,
                    )

        # Rollups for the KPI strip. Salesforce returns -1 on
        # PackageLicense.AllowedLicenses when the allowance is
        # "unlimited"; exclude those from the seat aggregate so the
        # KPI stays a meaningful "used of allowed" ratio.
        active = sum(1 for p in scored if p.utilization_tier == "active")
        underused = sum(1 for p in scored if p.utilization_tier == "underused")
        unused = sum(1 for p in scored if p.utilization_tier == "unused")
        total_allowed = sum(
            (p.licenses_allowed or 0)
            for p in scored
            if p.licenses_allowed is not None and p.licenses_allowed >= 0
        )
        total_used = sum(p.licenses_used or 0 for p in scored)
        utilization_pct = (
            (len([p for p in scored if p.utilization_tier != "unused"])
             / len(scored) * 100.0)
            if scored else 0.0
        )

        logger.warning(
            "package-sprawl: org=%s scored %d packages "
            "(active=%d underused=%d unused=%d)",
            self.org_id, len(scored), active, underused, unused,
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
                        dependency_count=p.dependency_count,
                        record_count_total=p.record_count_total,
                        async_job_count=p.async_job_count,
                        scheduled_job_count=p.scheduled_job_count,
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

    def _build_stub_from_raw(
        self, raw: Dict[str, Any], error_reason: str
    ) -> Optional[ScoredPackage]:
        """Build a minimum-viable ScoredPackage from just the identity
        fields (name, namespace, version) when the enrichment pipeline
        blew up. The package still appears in the UI with wiring
        signals as None so the user can see it exists — much better
        than silent drops leaving the whole page empty.
        """
        subscriber = raw.get("SubscriberPackage") or {}
        version = raw.get("SubscriberPackageVersion") or {}
        sf_package_id = subscriber.get("Id") or ""
        if not sf_package_id:
            return None
        major = version.get("MajorVersion")
        minor = version.get("MinorVersion")
        patch = version.get("PatchVersion")
        version_number: Optional[str] = None
        if major is not None and minor is not None:
            parts = [str(major), str(minor)]
            if patch is not None:
                parts.append(str(patch))
            version_number = ".".join(parts)
        return ScoredPackage(
            sf_package_id=sf_package_id,
            sf_version_id=version.get("Id") or None,
            name=subscriber.get("Name") or "Unnamed package",
            namespace_prefix=subscriber.get("NamespacePrefix") or None,
            description=subscriber.get("Description") or None,
            version_name=version.get("Name") or None,
            version_number=version_number,
            is_beta=bool(version.get("IsBeta")),
            is_deprecated=bool(version.get("IsDeprecated")),
            is_managed=bool(version.get("IsManaged", True)),
            apex_class_count=0,
            flow_count=0,
            custom_object_count=0,
            licenses_allowed=None,
            licenses_used=None,
            dependency_count=None,
            record_count_total=None,
            async_job_count=None,
            scheduled_job_count=None,
            # Underused rather than Unused: signals are unknown, not
            # confirmed-empty. This keeps a real install from getting
            # mis-flagged for uninstall just because enrichment failed.
            utilization_tier="underused",
            evidence={
                "reasoning": {
                    "wiring_signals": [],
                    "final_tier": "underused",
                    "stub_reason": error_reason,
                },
                "top_dependents": [],
                "supplemental_dependents_count": 0,
                "record_counts_by_object": {},
            },
        )

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
        # treat as 0 so the tier calc still works. lwc / aura / trigger
        # counts are extra colour for the expandable detail card — they
        # don't feed the tier decision (dependency_count is stronger),
        # so they live in the evidence blob rather than as promoted
        # columns.
        apex_class_count = 0
        flow_count = 0
        lwc_count: Optional[int] = None
        aura_count: Optional[int] = None
        apex_trigger_count: Optional[int] = None
        if namespace:
            ac = await client.count_apex_classes_in_namespace(namespace)
            apex_class_count = ac or 0
            fc = await client.count_flows_in_namespace(namespace)
            flow_count = fc or 0
            lwc_count = await client.count_lightning_components_in_namespace(
                namespace
            )
            aura_count = await client.count_aura_bundles_in_namespace(namespace)
            apex_trigger_count = await client.count_apex_triggers_in_namespace(
                namespace
            )
        # List of package-brought custom objects (used for record counts).
        package_object_names: List[str] = (
            [n for n in all_object_names if n and n.startswith(f"{namespace}__")]
            if namespace else []
        )
        custom_object_count = len(package_object_names)

        # ---- Real wiring signals (v2) ------------------------------
        # dependency_count — how many customer-owned components
        # reference something inside this package. THE strongest
        # active-tier signal.
        dependency_count: Optional[int] = None
        top_dependents: List[Dict[str, Any]] = []
        if namespace:
            dependency_count = await client.count_metadata_dependencies_by_namespace(
                namespace
            )
            if dependency_count and dependency_count > 0:
                # 50-row cap. The card still only surfaces 5 by default;
                # the expandable detail view uses the rest so the reader
                # can see the full picture of *where* the package is
                # actually used without another round-trip.
                top_dependents = await client.top_metadata_dependents(
                    namespace, limit=50
                )

        # Supplemental dependency detection — MetadataComponentDependency
        # has documented coverage gaps (beta 2GP packages especially;
        # also CustomTab / FlexiPage / Report edges). We backstop with a
        # direct CustomTab → LWC lookup so a customer app whose tab
        # displays a managed-package LWC doesn't get mis-flagged as
        # Unused. Hits are tagged with source="customtab_lwc" so the UI
        # can distinguish them from primary index hits, but they DO
        # promote to Active tier — a real reference is a real reference
        # regardless of which pass caught it.
        #
        # Belt-and-suspenders exception handling: the SF client method
        # already swallows failures, but a bad field name / SOQL shape
        # in an org we haven't tested against would produce a Python
        # error INSIDE the client method between the try and the
        # except (e.g., AttributeError chasing an unexpected response
        # shape). That outer try here guarantees a supplemental-pass
        # failure never tanks the per-package analysis — the whole
        # run would come back with 0 packages if it did.
        supplemental_dependents: List[Dict[str, Any]] = []
        if namespace:
            try:
                supplemental_dependents = (
                    await client.find_supplemental_customtab_references(
                        namespace
                    )
                )
            except Exception as exc:  # noqa: BLE001
                logger.info(
                    "Supplemental CustomTab pass raised for namespace=%s: "
                    "%s — continuing without supplemental hits.",
                    namespace, exc,
                )
                supplemental_dependents = []
            if supplemental_dependents:
                top_dependents = top_dependents + supplemental_dependents

        # record_count_total — sum of record counts across every
        # package-brought custom object. Non-zero = someone's storing
        # data here. Bounded by MAX_RECORD_COUNT_QUERIES_PER_PACKAGE
        # to keep the per-package slice of the run finite.
        record_count_total: Optional[int] = None
        record_counts_by_object: Dict[str, int] = {}
        objects_for_count = package_object_names[:MAX_RECORD_COUNT_QUERIES_PER_PACKAGE]
        if objects_for_count:
            record_count_total = 0
            for obj_name in objects_for_count:
                cnt = await client.count_sobject(obj_name)
                if cnt is not None:
                    record_counts_by_object[obj_name] = cnt
                    record_count_total += cnt

        # async_job_count — running / queued Apex batch / queueable /
        # future jobs from this namespace.
        async_job_count: Optional[int] = None
        if namespace:
            async_job_count = await client.count_async_apex_jobs_by_namespace(
                namespace
            )

        # scheduled_job_count — CronTrigger for scheduled Apex.
        scheduled_job_count: Optional[int] = None
        if namespace:
            scheduled_job_count = await client.count_scheduled_apex_by_namespace(
                namespace
            )

        # License data if the package has an AppExchange licence row.
        lic = licenses_by_namespace.get(namespace) if namespace else None
        licenses_allowed: Optional[int] = None
        licenses_used: Optional[int] = None
        if lic:
            allowed_raw = lic.get("AllowedLicenses")
            used_raw = lic.get("UsedLicenses")
            # Salesforce returns -1 on AllowedLicenses to mean
            # "unlimited seats" (not the string "Unlimited" as older
            # docs suggested). We preserve the -1 so the frontend can
            # render it as "unlimited" rather than a bogus fraction,
            # and the aggregate roll-up excludes -1 from the total-
            # allowed sum.
            if isinstance(allowed_raw, int):
                licenses_allowed = allowed_raw
            if isinstance(used_raw, int):
                licenses_used = used_raw

        # ---- Tier decision (v2 — reference-based) -----------------
        # ACTIVE if any real wiring signal fires:
        #   - customer code references package components (deps > 0)
        #   - records exist in package-brought custom objects
        #   - Apex batch/queueable/future jobs from the namespace are
        #     currently running
        #   - scheduled Apex from the namespace is on the books
        #   - AppExchange licence seats are actually used
        # UNUSED if none of the above AND no components at all inside
        # the package. That's a truly abandoned install.
        # UNDERUSED covers the gap: components exist but nothing is
        # wired to them — worth investigating.
        total_components = apex_class_count + flow_count + custom_object_count
        licence_seats_used = licenses_used or 0
        wiring_signals: List[str] = []
        if (dependency_count or 0) >= ACTIVE_MIN_DEPENDENCIES:
            wiring_signals.append("dependencies")
        # Supplemental customtab hits are worth their own signal —
        # they're proof-of-usage in a form the primary index missed.
        if supplemental_dependents:
            wiring_signals.append("supplemental_deps")
        if (record_count_total or 0) >= ACTIVE_MIN_RECORDS:
            wiring_signals.append("records")
        if (async_job_count or 0) >= 1:
            wiring_signals.append("async_jobs")
        if (scheduled_job_count or 0) >= 1:
            wiring_signals.append("scheduled_jobs")
        if licence_seats_used >= ACTIVE_MIN_LICENSES_USED:
            wiring_signals.append("licence_seats")

        if wiring_signals:
            tier = "active"
        elif total_components == 0:
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
                "wiring_signals": wiring_signals,
                "components": total_components,
                "components_breakdown": {
                    "apex_class": apex_class_count,
                    "apex_trigger": apex_trigger_count,
                    "flow": flow_count,
                    "lwc": lwc_count,
                    "aura": aura_count,
                    "custom_object": custom_object_count,
                },
                "dependency_count": dependency_count,
                "record_count_total": record_count_total,
                "async_job_count": async_job_count,
                "scheduled_job_count": scheduled_job_count,
                "licence_seats_used": licence_seats_used,
                "licence_seats_allowed": licenses_allowed,
                "deprecated_penalty": bool(version.get("IsDeprecated")),
                "final_tier": tier,
            },
            # Sample-level evidence surfaced on the drill-down.
            "top_dependents": top_dependents,
            "supplemental_dependents_count": len(supplemental_dependents),
            "record_counts_by_object": record_counts_by_object,
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
            dependency_count=dependency_count,
            record_count_total=record_count_total,
            async_job_count=async_job_count,
            scheduled_job_count=scheduled_job_count,
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
