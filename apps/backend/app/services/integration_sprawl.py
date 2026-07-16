"""Integration Sprawl Service — Integration Blast Radius feature.

Fourth sprawl surface (after Package / Report / Automation). Pulls the
five integration inventories the Salesforce data model exposes and
tiers each entry by activity + activation state:

  Sources (integration_type + direction):
    connected_app         inbound   — inbound OAuth apps
    named_credential      outbound  — outbound HTTP callouts
    external_data_source  outbound  — Salesforce Connect / OData
    auth_provider         sso       — SSO providers
    remote_site           outbound  — legacy outbound URL whitelist

Tier scoring (precedence: broken > stale > healthy > unknown):

  broken   — IsActive=False on surfaces that expose the flag, OR the
             matching LoginHistory application has >= 5 failed logins
             in the last 180 days.
  stale    — active but no LoginHistory activity for inbound/SSO
             surfaces in 180 days, OR outbound surface with no other
             usage signal.
  healthy  — active + recent activity (inbound / SSO) or active with
             no negative signal (outbound / RemoteSite / EDS with no
             failure info available).
  unknown  — no usable signal — v1 fallback for surfaces we can't
             score cleanly yet.

Entrypoint:
    service = IntegrationSprawlService(db, org_id)
    run = await service.run(actor_email=...)
"""
from __future__ import annotations

import logging
import time
from collections import defaultdict
from dataclasses import dataclass, field as dc_field
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.models import (
    IntegrationInventoryItem,
    IntegrationSprawlRun,
    SalesforceConnection,
)
from app.salesforce.client import SalesforceAPIClient


logger = logging.getLogger(__name__)


# ----------------------------------------------------------------------
# Configuration
# ----------------------------------------------------------------------

# LoginHistory look-back window used for the "stale" cutoff on inbound
# OAuth apps + SSO providers.
STALE_DAYS_THRESHOLD = 180

# Minimum failed-login count to flag an integration as broken.
BROKEN_MIN_FAILED_LOGINS = 5

# Cap on how many rows we persist per run. Real orgs rarely exceed a
# few hundred integrations; the cap is a runaway guard.
MAX_ITEMS_PER_RUN = 10_000

# LoginHistory.Application values we filter out from the connected-app
# join. These represent regular user logins, not integration traffic.
GENERIC_APPLICATION_NAMES = {
    "Browser",
    "Lightning",
    "Salesforce for Web",
    "Salesforce Anywhere",
    "Chatter",
    "",
    None,
}


# ----------------------------------------------------------------------
# Result shape
# ----------------------------------------------------------------------


@dataclass
class ScoredItem:
    sf_id: str
    integration_type: str
    direction: str
    name: str
    developer_name: Optional[str]
    endpoint: Optional[str]
    namespace_prefix: Optional[str]
    is_active: Optional[bool]
    login_count_180d: Optional[int]
    failed_login_count_180d: Optional[int]
    last_used_at: Optional[datetime]
    tier: str
    evidence: Dict[str, Any] = dc_field(default_factory=dict)


# ----------------------------------------------------------------------
# Helpers
# ----------------------------------------------------------------------


def _parse_sf_datetime(raw: Optional[str]) -> Optional[datetime]:
    """Same SF timestamp parser used across the sprawl services."""
    if not raw:
        return None
    try:
        s = raw.replace("Z", "+00:00")
        if len(s) >= 5 and s[-5] in "+-" and s[-3] != ":":
            s = s[:-2] + ":" + s[-2:]
        dt = datetime.fromisoformat(s)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except Exception:  # noqa: BLE001
        return None


def _extract_sf_error(exc: Any) -> str:
    try:
        body = exc.response.json()
        if isinstance(body, list) and body:
            first = body[0]
            code = first.get("errorCode") or ""
            msg = first.get("message") or ""
            return f"{code}: {msg}" if code else msg
        if isinstance(body, dict):
            return str(body.get("message") or body)
    except Exception:  # noqa: BLE001
        pass
    return str(exc)


# ----------------------------------------------------------------------
# Service
# ----------------------------------------------------------------------


class IntegrationSprawlService:
    """Runs integration inventory + tier scoring for one org."""

    def __init__(self, db: AsyncSession, org_id: str):
        self.db = db
        self.org_id = org_id

    # ------------------------------------------------------------------
    # Public entrypoint
    # ------------------------------------------------------------------

    async def run(
        self, *, actor_email: Optional[str] = None
    ) -> IntegrationSprawlRun:
        import httpx  # local — only needed for 401 detection

        started = time.monotonic()

        try:
            client = await self._client()
        except Exception as exc:
            logger.exception(
                "integration-sprawl: _client() failed for org %s",
                self.org_id,
            )
            raise RuntimeError(
                f"Failed to build Salesforce client: {exc}"
            ) from exc

        # Per-source diagnostics captured whether the pull succeeds or
        # fails so the frontend can render an honest "here's what SF
        # returned" panel on the zero-items empty state.
        diagnostics: Dict[str, Dict[str, Any]] = {
            "connected_apps": {"raw_count": 0, "error": None},
            "named_credentials": {"raw_count": 0, "error": None},
            "external_data_sources": {"raw_count": 0, "error": None},
            "auth_providers": {"raw_count": 0, "error": None},
            "remote_sites": {"raw_count": 0, "error": None},
            "login_history": {"raw_count": 0, "error": None},
        }

        # -- Inbound OAuth ------------------------------------------
        connected_apps: List[Dict[str, Any]] = []
        try:
            connected_apps = await client.extract_connected_applications()
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code == 401:
                logger.warning(
                    "integration-sprawl: 401 on ConnectedApplication — "
                    "refreshing token"
                )
                try:
                    client = await self._refresh_access_token()
                    connected_apps = (
                        await client.extract_connected_applications()
                    )
                except Exception as refresh_exc:
                    logger.exception(
                        "integration-sprawl: token refresh failed for "
                        "org %s",
                        self.org_id,
                    )
                    raise RuntimeError(
                        "Salesforce access token expired and refresh "
                        "failed. Please reconnect Salesforce."
                    ) from refresh_exc
            else:
                diagnostics["connected_apps"]["error"] = (
                    f"HTTP {exc.response.status_code}: "
                    f"{_extract_sf_error(exc)}"
                )
        except Exception as exc:  # noqa: BLE001
            diagnostics["connected_apps"]["error"] = (
                f"{type(exc).__name__}: {exc}"
            )
        diagnostics["connected_apps"]["raw_count"] = len(connected_apps)

        # -- Outbound HTTP ------------------------------------------
        named_creds: List[Dict[str, Any]] = []
        try:
            named_creds = await client.extract_named_credentials()
        except Exception as exc:  # noqa: BLE001
            diagnostics["named_credentials"]["error"] = (
                f"{type(exc).__name__}: {exc}"
            )
        diagnostics["named_credentials"]["raw_count"] = len(named_creds)

        # -- External Data Sources (SF Connect) ---------------------
        external_ds: List[Dict[str, Any]] = []
        try:
            external_ds = await client.extract_external_data_sources()
        except Exception as exc:  # noqa: BLE001
            diagnostics["external_data_sources"]["error"] = (
                f"{type(exc).__name__}: {exc}"
            )
        diagnostics["external_data_sources"]["raw_count"] = len(external_ds)

        # -- SSO Auth Providers -------------------------------------
        auth_providers: List[Dict[str, Any]] = []
        try:
            auth_providers = await client.extract_auth_providers()
        except Exception as exc:  # noqa: BLE001
            diagnostics["auth_providers"]["error"] = (
                f"{type(exc).__name__}: {exc}"
            )
        diagnostics["auth_providers"]["raw_count"] = len(auth_providers)

        # -- Legacy Remote Sites ------------------------------------
        remote_sites: List[Dict[str, Any]] = []
        try:
            remote_sites = await client.extract_remote_site_settings()
        except Exception as exc:  # noqa: BLE001
            diagnostics["remote_sites"]["error"] = (
                f"{type(exc).__name__}: {exc}"
            )
        diagnostics["remote_sites"]["raw_count"] = len(remote_sites)

        # -- LoginHistory --------------------------------------------
        # We pull the full 180-day slice once and aggregate in Python
        # by Application. Way cheaper than firing a per-app aggregate
        # query and avoids SF's aggregate-SOQL restrictions.
        logins_by_app: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
        try:
            login_rows = await client.get_login_history(
                since_days=STALE_DAYS_THRESHOLD
            )
            for row in login_rows:
                app_name = row.get("Application")
                if app_name in GENERIC_APPLICATION_NAMES:
                    continue
                logins_by_app[app_name].append(row)
            diagnostics["login_history"]["raw_count"] = len(login_rows)
        except Exception as exc:  # noqa: BLE001
            diagnostics["login_history"]["error"] = (
                f"{type(exc).__name__}: {exc}"
            )

        logger.warning(
            "integration-sprawl: org=%s connected_apps=%d "
            "named_creds=%d external_ds=%d auth_providers=%d "
            "remote_sites=%d login_apps=%d",
            self.org_id,
            len(connected_apps),
            len(named_creds),
            len(external_ds),
            len(auth_providers),
            len(remote_sites),
            len(logins_by_app),
        )

        # -- Score every item ---------------------------------------
        now = datetime.now(timezone.utc)
        scored: List[ScoredItem] = []
        for raw in connected_apps:
            item = self._score_connected_app(raw, logins_by_app, now)
            if item is not None:
                scored.append(item)
        for raw in named_creds:
            item = self._score_named_credential(raw, now)
            if item is not None:
                scored.append(item)
        for raw in external_ds:
            item = self._score_external_ds(raw, now)
            if item is not None:
                scored.append(item)
        for raw in auth_providers:
            item = self._score_auth_provider(raw, logins_by_app, now)
            if item is not None:
                scored.append(item)
        for raw in remote_sites:
            item = self._score_remote_site(raw, now)
            if item is not None:
                scored.append(item)

        # Sort by actionability — broken → stale → healthy → unknown.
        tier_rank = {
            "broken": 0,
            "stale": 1,
            "healthy": 2,
            "unknown": 3,
        }
        scored.sort(
            key=lambda i: (
                tier_rank.get(i.tier, 99),
                i.integration_type,
                i.name.lower(),
            )
        )
        capped = scored[:MAX_ITEMS_PER_RUN]

        # -- Rollups ------------------------------------------------
        counts: Dict[str, int] = defaultdict(int)
        for it in capped:
            counts[it.tier] += 1
        type_counts: Dict[str, int] = defaultdict(int)
        for it in capped:
            type_counts[it.integration_type] += 1

        logins_180d = sum(
            len(rows) for rows in logins_by_app.values()
        )
        failed_logins_180d = sum(
            1
            for rows in logins_by_app.values()
            for row in rows
            if (row.get("Status") or "").lower() != "success"
        )

        duration_ms = int((time.monotonic() - started) * 1000)

        run = IntegrationSprawlRun(
            organization_id=self.org_id,
            snapshot_at=datetime.now(timezone.utc),
            connected_apps_total=type_counts.get("connected_app", 0),
            named_credentials_total=type_counts.get(
                "named_credential", 0
            ),
            external_data_sources_total=type_counts.get(
                "external_data_source", 0
            ),
            auth_providers_total=type_counts.get("auth_provider", 0),
            remote_sites_total=type_counts.get("remote_site", 0),
            items_total=len(capped),
            items_healthy=counts.get("healthy", 0),
            items_stale=counts.get("stale", 0),
            items_broken=counts.get("broken", 0),
            items_unknown=counts.get("unknown", 0),
            logins_180d=logins_180d,
            failed_logins_180d=failed_logins_180d,
            duration_ms=duration_ms,
            error=None,
            source_diagnostics=diagnostics,
        )
        self.db.add(run)
        await self.db.flush()

        for it in capped:
            self.db.add(
                IntegrationInventoryItem(
                    organization_id=self.org_id,
                    run_id=run.id,
                    sf_id=it.sf_id,
                    integration_type=it.integration_type,
                    direction=it.direction,
                    name=it.name[:255],
                    developer_name=it.developer_name,
                    endpoint=(it.endpoint or None)
                    and it.endpoint[:500],
                    namespace_prefix=it.namespace_prefix,
                    is_active=it.is_active,
                    login_count_180d=it.login_count_180d,
                    failed_login_count_180d=it.failed_login_count_180d,
                    last_used_at=it.last_used_at,
                    tier=it.tier,
                    evidence=it.evidence,
                )
            )

        await self.db.commit()
        logger.info(
            "integration-sprawl: org=%s persisted run=%s items=%d "
            "(broken=%d stale=%d healthy=%d unknown=%d) in %dms",
            self.org_id,
            run.id,
            len(capped),
            counts.get("broken", 0),
            counts.get("stale", 0),
            counts.get("healthy", 0),
            counts.get("unknown", 0),
            duration_ms,
        )
        return run

    # ------------------------------------------------------------------
    # Per-item scoring
    # ------------------------------------------------------------------

    def _score_connected_app(
        self,
        raw: Dict[str, Any],
        logins_by_app: Dict[str, List[Dict[str, Any]]],
        now: datetime,
    ) -> Optional[ScoredItem]:
        sf_id = raw.get("Id")
        if not sf_id:
            return None
        name = raw.get("Name") or "(unnamed app)"

        # Join by name to LoginHistory.Application. Salesforce doesn't
        # expose a stable FK from LoginHistory → ConnectedApplication;
        # the name match is the only workable option without Event
        # Monitoring.
        matching = logins_by_app.get(name, [])
        login_count = len(matching)
        failed_count = sum(
            1
            for row in matching
            if (row.get("Status") or "").lower() != "success"
        )
        last_used = None
        if matching:
            times = [
                _parse_sf_datetime(row.get("LoginTime"))
                for row in matching
            ]
            times = [t for t in times if t is not None]
            if times:
                last_used = max(times)

        tier, reason = self._classify_inbound(
            login_count=login_count,
            failed_count=failed_count,
            last_used=last_used,
            now=now,
        )
        return ScoredItem(
            sf_id=sf_id,
            integration_type="connected_app",
            direction="inbound",
            name=name,
            developer_name=None,
            endpoint=raw.get("StartUrl") or raw.get("MobileStartUrl"),
            namespace_prefix=None,
            is_active=None,
            login_count_180d=login_count,
            failed_login_count_180d=failed_count,
            last_used_at=last_used,
            tier=tier,
            evidence={
                "tier_reason": reason,
                "admin_approved_only": bool(
                    raw.get("OptionsAllowAdminApprovedUsersOnly")
                ),
            },
        )

    def _score_named_credential(
        self, raw: Dict[str, Any], now: datetime
    ) -> Optional[ScoredItem]:
        sf_id = raw.get("Id")
        if not sf_id:
            return None
        name = (
            raw.get("MasterLabel")
            or raw.get("DeveloperName")
            or "(unnamed credential)"
        )
        # Outbound integrations don't leave breadcrumbs in LoginHistory,
        # so we score conservatively — always healthy unless we grow
        # richer telemetry. Real "stale" detection here needs
        # AsyncApexJob correlation which is a v2 refinement.
        tier = "healthy"
        reason = (
            "Named Credential inventoried — richer usage detection "
            "(Apex callout traffic) is a v2 refinement."
        )
        return ScoredItem(
            sf_id=sf_id,
            integration_type="named_credential",
            direction="outbound",
            name=name,
            developer_name=raw.get("DeveloperName"),
            endpoint=raw.get("Endpoint"),
            namespace_prefix=raw.get("NamespacePrefix"),
            is_active=None,
            login_count_180d=None,
            failed_login_count_180d=None,
            last_used_at=None,
            tier=tier,
            evidence={
                "tier_reason": reason,
                "principal_type": raw.get("PrincipalType"),
                "protocol_type": raw.get("ProtocolType"),
            },
        )

    def _score_external_ds(
        self, raw: Dict[str, Any], now: datetime
    ) -> Optional[ScoredItem]:
        sf_id = raw.get("Id")
        if not sf_id:
            return None
        name = (
            raw.get("MasterLabel")
            or raw.get("DeveloperName")
            or "(unnamed data source)"
        )
        # Same v1 limitation as NamedCredential — we can't join usage
        # without Event Monitoring. Report as healthy so the drilldown
        # surfaces the endpoint + type; the consultant can eyeball for
        # obvious sprawl.
        tier = "healthy"
        reason = (
            "External Data Source inventoried — usage detection is a "
            "v2 refinement."
        )
        return ScoredItem(
            sf_id=sf_id,
            integration_type="external_data_source",
            direction="outbound",
            name=name,
            developer_name=raw.get("DeveloperName"),
            endpoint=raw.get("Endpoint"),
            namespace_prefix=raw.get("NamespacePrefix"),
            is_active=None,
            login_count_180d=None,
            failed_login_count_180d=None,
            last_used_at=None,
            tier=tier,
            evidence={
                "tier_reason": reason,
                "external_type": raw.get("Type"),
                "is_writable": bool(raw.get("IsWritable")),
                "principal_type": raw.get("PrincipalType"),
            },
        )

    def _score_auth_provider(
        self,
        raw: Dict[str, Any],
        logins_by_app: Dict[str, List[Dict[str, Any]]],
        now: datetime,
    ) -> Optional[ScoredItem]:
        sf_id = raw.get("Id")
        if not sf_id:
            return None
        name = (
            raw.get("FriendlyName")
            or raw.get("DeveloperName")
            or "(unnamed provider)"
        )
        # SSO providers can appear in LoginHistory.AuthenticationServiceId
        # rather than Application, but the Application field also carries
        # provider names for some login paths — try the name match here
        # and mark unknown if we get no hits.
        matching = logins_by_app.get(name, [])
        login_count = len(matching)
        last_used = None
        if matching:
            times = [
                _parse_sf_datetime(row.get("LoginTime"))
                for row in matching
            ]
            times = [t for t in times if t is not None]
            if times:
                last_used = max(times)

        if login_count > 0:
            tier = "healthy"
            reason = (
                f"SSO provider matched {login_count} logins in the "
                f"last {STALE_DAYS_THRESHOLD} days."
            )
        else:
            tier = "unknown"
            reason = (
                "SSO provider inventoried; usage not confirmable via "
                "LoginHistory in this pull."
            )
        return ScoredItem(
            sf_id=sf_id,
            integration_type="auth_provider",
            direction="sso",
            name=name,
            developer_name=raw.get("DeveloperName"),
            endpoint=None,
            namespace_prefix=None,
            is_active=None,
            login_count_180d=login_count,
            failed_login_count_180d=None,
            last_used_at=last_used,
            tier=tier,
            evidence={
                "tier_reason": reason,
                "provider_type": raw.get("ProviderType"),
            },
        )

    def _score_remote_site(
        self, raw: Dict[str, Any], now: datetime
    ) -> Optional[ScoredItem]:
        sf_id = raw.get("Id")
        if not sf_id:
            return None
        name = (
            raw.get("DeveloperName")
            or raw.get("EndpointUrl")
            or "(unnamed remote site)"
        )
        is_active = bool(raw.get("IsActive"))
        if not is_active:
            tier = "broken"
            reason = "Remote Site is deactivated — dead endpoint config."
        else:
            tier = "stale"
            reason = (
                "Legacy Remote Site — flag for migration to Named "
                "Credentials. Modern integrations use Named Credentials."
            )
        return ScoredItem(
            sf_id=sf_id,
            integration_type="remote_site",
            direction="outbound",
            name=name,
            developer_name=raw.get("DeveloperName"),
            endpoint=raw.get("EndpointUrl"),
            namespace_prefix=None,
            is_active=is_active,
            login_count_180d=None,
            failed_login_count_180d=None,
            last_used_at=None,
            tier=tier,
            evidence={
                "tier_reason": reason,
                "description": raw.get("Description"),
            },
        )

    def _classify_inbound(
        self,
        *,
        login_count: int,
        failed_count: int,
        last_used: Optional[datetime],
        now: datetime,
    ) -> tuple[str, str]:
        """Tier for inbound OAuth apps (ConnectedApplication). Runs
        the broken > stale > healthy precedence documented at the top
        of the module."""
        if failed_count >= BROKEN_MIN_FAILED_LOGINS:
            return (
                "broken",
                f"{failed_count} failed logins in the last "
                f"{STALE_DAYS_THRESHOLD} days — auth is failing "
                "for this app.",
            )
        if login_count == 0:
            return (
                "stale",
                f"No LoginHistory activity in the last "
                f"{STALE_DAYS_THRESHOLD} days — cleanup candidate.",
            )
        if last_used and (now - last_used) > timedelta(days=90):
            return (
                "stale",
                f"Last used {(now - last_used).days} days ago — "
                "cleanup candidate.",
            )
        return (
            "healthy",
            f"{login_count} logins in the last "
            f"{STALE_DAYS_THRESHOLD} days.",
        )

    # ------------------------------------------------------------------
    # SF client support (mirrors PackageSprawl / ReportSprawl)
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
        login_url = (
            "https://test.salesforce.com" if is_sandbox else None
        )
        oauth_client = SalesforceOAuthClient(login_url=login_url)
        token_response = await oauth_client.refresh_access_token(
            conn.refresh_token
        )
        conn.access_token = token_response.access_token
        conn.instance_url = token_response.instance_url
        await self.db.commit()
        return SalesforceAPIClient(
            instance_url=token_response.instance_url,
            access_token=token_response.access_token,
        )
