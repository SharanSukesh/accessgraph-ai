"""Report & Dashboard Sprawl Service — inventory + tier scoring for
every Report and Dashboard in a Salesforce org.

Mirror of the Managed-Package Sprawl pattern applied to analytics
content. Pulls every Report + Dashboard visible to the running user,
joins Folder + Owner metadata, detects duplicate name clusters, and
classifies each into one of four tiers:

  live      — referenced within the last 12 months. In active use.
  zombie    — not referenced for >12 months (or never referenced).
              Cleanup candidate.
  orphaned  — owner is inactive. Nobody accountable for the item.
  duplicate — normalised name matches at least one sibling in the
              same run. Consolidation candidate.

Tier precedence (highest actionability first):

    orphaned > duplicate > zombie > live

Rationale: an orphaned item is highest concern for GRC because
there's no owner to certify it. Duplicate is next because it's the
consolidation story ("you have 6 copies of Monthly Pipeline"). Zombie
third for cleanup. Live is default.

Entrypoint:
    service = ReportSprawlService(db, org_id)
    run = await service.run(actor_email=...)
"""
from __future__ import annotations

import hashlib
import logging
import re
import time
from collections import defaultdict
from dataclasses import dataclass, field as dc_field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.models import (
    ReportInventoryItem,
    ReportSprawlRun,
    SalesforceConnection,
)
from app.salesforce.client import SalesforceAPIClient


logger = logging.getLogger(__name__)


# ----------------------------------------------------------------------
# Configuration
# ----------------------------------------------------------------------

# Days-since-last-referenced threshold above which we tier `zombie`.
# 365 matches the consulting pitch: "reports not viewed in 12 months".
ZOMBIE_DAYS_THRESHOLD = 365

# Safety cap. An org with more items than this hits some ceiling —
# almost certainly a client we WANT to know about, but we still bound
# the query so a single run doesn't hang the whole page. If the total
# exceeds this, we still process every returned row from SF's
# `queryAll` pager; this cap is just how many we persist per run.
MAX_ITEMS_PER_RUN = 25_000


# ----------------------------------------------------------------------
# Result shape
# ----------------------------------------------------------------------


@dataclass
class ScoredItem:
    """One item after tier classification, before DB persist."""
    sf_id: str
    item_type: str  # 'report' | 'dashboard'
    name: str
    developer_name: Optional[str]
    folder_name: Optional[str]
    folder_id: Optional[str]
    owner_sf_id: Optional[str]
    owner_name: Optional[str]
    owner_is_active: Optional[bool]
    description: Optional[str]
    report_format: Optional[str]
    created_at_sf: Optional[datetime]
    last_referenced_at: Optional[datetime]
    last_run_at: Optional[datetime]
    last_modified_at: Optional[datetime]
    days_since_last_view: Optional[int]
    tier: str
    duplicate_group_key: Optional[str]
    evidence: Dict[str, Any] = dc_field(default_factory=dict)


# ----------------------------------------------------------------------
# Helpers
# ----------------------------------------------------------------------


_COPY_SUFFIX = re.compile(
    r"\s*(?:-\s*)?(?:copy(?:\s*(?:of|\d+))?|\(\d+\))\s*$",
    re.IGNORECASE,
)
_NON_ALNUM = re.compile(r"[^0-9a-z]+")


def _normalise_name(name: str) -> str:
    """Collapse a display title down to a duplicate-detection key.

    Strategy:
      1. Lowercase, strip whitespace.
      2. Repeatedly strip trailing 'copy', 'copy 2', '(1)', ' - copy'
         suffixes — Salesforce's "Save As" adds these mechanically.
      3. Collapse everything non-alphanumeric to single spaces.
      4. Strip.

    Returns "" for items whose name is empty or too short to compare
    (< 3 chars after normalisation). The caller treats "" as
    "unnormalisable" and skips duplicate detection for that item.
    """
    if not name:
        return ""
    n = name.lower().strip()
    # Strip up to 3 nested copy suffixes ("Report copy copy (2)").
    for _ in range(3):
        stripped = _COPY_SUFFIX.sub("", n).strip()
        if stripped == n:
            break
        n = stripped
    n = _NON_ALNUM.sub(" ", n).strip()
    n = re.sub(r"\s+", " ", n)
    return n if len(n) >= 3 else ""


def _hash_key(item_type: str, normalised: str) -> str:
    """Stable short hash for duplicate group membership. Same input →
    same key across runs so trend analysis stays coherent."""
    digest = hashlib.sha1(
        f"{item_type}:{normalised}".encode("utf-8")
    ).hexdigest()
    return digest[:16]


def _parse_sf_datetime(raw: Optional[str]) -> Optional[datetime]:
    """SF returns datetimes as ISO-8601 with timezone (e.g.
    '2024-09-14T18:23:45.000+0000'). Python's fromisoformat handles
    most of these, but the '+0000' form without a colon is only
    accepted in 3.11+. We normalise to '+00:00' for older runtimes
    just in case."""
    if not raw:
        return None
    try:
        s = raw.replace("Z", "+00:00")
        # +0000 → +00:00
        if len(s) >= 5 and s[-5] in "+-" and s[-3] != ":":
            s = s[:-2] + ":" + s[-2:]
        dt = datetime.fromisoformat(s)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except Exception:  # noqa: BLE001
        return None


def _days_between(reference: datetime, target: Optional[datetime]) -> Optional[int]:
    if target is None:
        return None
    delta = reference - target
    return max(delta.days, 0)


# ----------------------------------------------------------------------
# Service
# ----------------------------------------------------------------------


class ReportSprawlService:
    """Runs report + dashboard sprawl analysis for one org.

    Stateful only for the duration of `.run()` — every intermediate
    structure falls out of scope when the coroutine returns.
    """

    def __init__(self, db: AsyncSession, org_id: str):
        self.db = db
        self.org_id = org_id

    # ------------------------------------------------------------------
    # Public entrypoint
    # ------------------------------------------------------------------

    async def run(
        self, *, actor_email: Optional[str] = None
    ) -> ReportSprawlRun:
        """Full sprawl pass. Persists a ReportSprawlRun + one
        ReportInventoryItem per Report/Dashboard. Returns the run row.
        """
        import httpx  # local — only needed for 401 detection

        started = time.monotonic()

        try:
            client = await self._client()
        except Exception as exc:
            logger.exception(
                "report-sprawl: _client() failed for org %s", self.org_id
            )
            raise RuntimeError(
                f"Failed to build Salesforce client: {exc}"
            ) from exc

        # -- Reports --------------------------------------------------
        # Reports commonly proliferate to the tens of thousands. Retry
        # once on 401 (mirrors package-sprawl's pattern) and continue
        # with an empty list on other failures so we can still surface
        # dashboards.
        raw_reports: List[Dict[str, Any]] = []
        try:
            raw_reports = await client.extract_reports()
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code == 401:
                logger.warning(
                    "report-sprawl: 401 on Report — refreshing token"
                )
                try:
                    client = await self._refresh_access_token()
                    raw_reports = await client.extract_reports()
                except Exception as refresh_exc:
                    logger.exception(
                        "report-sprawl: token refresh failed for org %s",
                        self.org_id,
                    )
                    raise RuntimeError(
                        "Salesforce access token expired and refresh "
                        "failed. Please reconnect Salesforce."
                    ) from refresh_exc
            else:
                logger.exception(
                    "report-sprawl: Report pull failed HTTP %s",
                    exc.response.status_code,
                )
        except Exception as exc:  # noqa: BLE001
            logger.info(
                "report-sprawl: Report pull failed (%s) — continuing "
                "with dashboards only", exc,
            )

        # -- Dashboards ----------------------------------------------
        raw_dashboards: List[Dict[str, Any]] = []
        try:
            raw_dashboards = await client.extract_dashboards()
        except Exception as exc:  # noqa: BLE001
            logger.info(
                "report-sprawl: Dashboard pull failed (%s)", exc
            )

        # -- Folders (for Dashboard.FolderId → name) ------------------
        raw_folders: List[Dict[str, Any]] = []
        try:
            raw_folders = await client.extract_folders()
        except Exception as exc:  # noqa: BLE001
            logger.info(
                "report-sprawl: Folder pull failed (%s) — dashboards "
                "will show FolderId instead of name",
                exc,
            )
        folders_by_id: Dict[str, str] = {
            f["Id"]: f.get("Name") or f.get("DeveloperName") or ""
            for f in raw_folders
            if f.get("Id")
        }

        # -- Users (for owner name + active flag) --------------------
        # Owner ids come from either .OwnerId (Report) or .RunningUserId
        # (Dashboard). We resolve both to a single {sf_id -> user} map.
        owner_ids = {
            r.get("OwnerId") for r in raw_reports if r.get("OwnerId")
        } | {
            d.get("RunningUserId")
            for d in raw_dashboards
            if d.get("RunningUserId")
        }
        owner_ids.discard(None)
        users_by_id = await self._resolve_users(client, list(owner_ids))

        # -- Score every item ----------------------------------------
        now = datetime.now(timezone.utc)
        report_items = [
            self._score_report(r, users_by_id, now) for r in raw_reports
        ]
        dashboard_items = [
            self._score_dashboard(d, users_by_id, folders_by_id, now)
            for d in raw_dashboards
        ]
        # Drop any that failed to score (returned None).
        report_items = [x for x in report_items if x is not None]
        dashboard_items = [x for x in dashboard_items if x is not None]
        all_items: List[ScoredItem] = report_items + dashboard_items

        # -- Duplicate detection (post-scoring pass) -----------------
        # Group by (item_type, normalised_name). Groups of ≥2 flag as
        # duplicate. This can override an item's initial tier
        # (`zombie` → `duplicate`) but NOT `orphaned` — orphaned always
        # wins because "no owner" is the highest-priority signal.
        groups: Dict[str, List[ScoredItem]] = defaultdict(list)
        for it in all_items:
            if it.duplicate_group_key:
                groups[it.duplicate_group_key].append(it)
        duplicate_group_count = 0
        for key, members in groups.items():
            if len(members) < 2:
                continue
            duplicate_group_count += 1
            sibling_ids = sorted(m.sf_id for m in members)
            for it in members:
                # Preserve orphaned — never demote a real "no owner"
                # signal to a "duplicate name" one.
                if it.tier == "orphaned":
                    it.evidence["duplicate_group"] = {
                        "key": key,
                        "size": len(members),
                        "sibling_ids": sibling_ids,
                    }
                    continue
                it.tier = "duplicate"
                it.evidence.update(
                    {
                        "tier_reason": (
                            f"{len(members)} items share this normalised "
                            f"name"
                        ),
                        "duplicate_group": {
                            "key": key,
                            "size": len(members),
                            "sibling_ids": sibling_ids,
                        },
                    }
                )

        # -- Cap for persistence (SF returned more than we want to
        #    store this run — sort by "most actionable first" so we
        #    keep the useful rows).
        tier_rank = {
            "orphaned": 0,
            "duplicate": 1,
            "zombie": 2,
            "live": 3,
        }
        all_items.sort(
            key=lambda i: (
                tier_rank.get(i.tier, 99),
                -(i.days_since_last_view or 0),
                i.name.lower(),
            )
        )
        capped = all_items[:MAX_ITEMS_PER_RUN]
        if len(all_items) > MAX_ITEMS_PER_RUN:
            logger.warning(
                "report-sprawl: org=%s scored %d items, capping to %d",
                self.org_id, len(all_items), MAX_ITEMS_PER_RUN,
            )

        # -- Rollups -------------------------------------------------
        counts = {"live": 0, "zombie": 0, "orphaned": 0, "duplicate": 0}
        for it in capped:
            counts[it.tier] = counts.get(it.tier, 0) + 1
        never_referenced = sum(
            1 for it in capped if it.days_since_last_view is None
        )
        days_values = [
            it.days_since_last_view
            for it in capped
            if it.days_since_last_view is not None
        ]
        avg_days = (
            int(round(sum(days_values) / len(days_values)))
            if days_values
            else None
        )

        # -- Persist -------------------------------------------------
        duration_ms = int((time.monotonic() - started) * 1000)
        run = ReportSprawlRun(
            organization_id=self.org_id,
            snapshot_at=datetime.now(timezone.utc),
            reports_total=sum(1 for it in capped if it.item_type == "report"),
            dashboards_total=sum(
                1 for it in capped if it.item_type == "dashboard"
            ),
            items_total=len(capped),
            items_live=counts.get("live", 0),
            items_zombie=counts.get("zombie", 0),
            items_orphaned=counts.get("orphaned", 0),
            items_duplicate=counts.get("duplicate", 0),
            items_never_referenced=never_referenced,
            avg_days_since_last_view=avg_days,
            duplicate_groups=duplicate_group_count,
            duration_ms=duration_ms,
            error=None,
        )
        self.db.add(run)
        await self.db.flush()

        for it in capped:
            self.db.add(
                ReportInventoryItem(
                    organization_id=self.org_id,
                    run_id=run.id,
                    sf_id=it.sf_id,
                    item_type=it.item_type,
                    name=it.name[:255],
                    developer_name=(it.developer_name or None),
                    folder_name=(it.folder_name or None),
                    folder_id=it.folder_id,
                    owner_sf_id=it.owner_sf_id,
                    owner_name=(it.owner_name or None),
                    owner_is_active=it.owner_is_active,
                    description=(
                        (it.description or "")[:1000] or None
                    ),
                    report_format=it.report_format,
                    created_at_sf=it.created_at_sf,
                    last_referenced_at=it.last_referenced_at,
                    last_run_at=it.last_run_at,
                    last_modified_at=it.last_modified_at,
                    days_since_last_view=it.days_since_last_view,
                    tier=it.tier,
                    duplicate_group_key=it.duplicate_group_key,
                    evidence=it.evidence,
                )
            )

        await self.db.commit()
        logger.info(
            "report-sprawl: org=%s persisted run=%s items=%d "
            "(live=%d zombie=%d orphaned=%d duplicate=%d) in %dms",
            self.org_id, run.id, len(capped),
            counts.get("live", 0), counts.get("zombie", 0),
            counts.get("orphaned", 0), counts.get("duplicate", 0),
            duration_ms,
        )
        return run

    # ------------------------------------------------------------------
    # Per-item scoring
    # ------------------------------------------------------------------

    def _score_report(
        self,
        raw: Dict[str, Any],
        users_by_id: Dict[str, Dict[str, Any]],
        now: datetime,
    ) -> Optional[ScoredItem]:
        sf_id = raw.get("Id")
        if not sf_id:
            return None
        name = raw.get("Name") or "(unnamed report)"
        owner_id = raw.get("OwnerId")
        owner = users_by_id.get(owner_id) if owner_id else None
        owner_active = owner.get("IsActive") if owner else None

        last_ref = _parse_sf_datetime(raw.get("LastReferencedDate"))
        last_run = _parse_sf_datetime(raw.get("LastRunDate"))
        # Prefer LastReferencedDate (broadest signal). Fall back to
        # LastRunDate for orgs that don't populate the former.
        signal_ts = last_ref or last_run
        days = _days_between(now, signal_ts)

        tier, reason = self._classify(owner_active, days)
        normalised = _normalise_name(name)

        return ScoredItem(
            sf_id=sf_id,
            item_type="report",
            name=name,
            developer_name=raw.get("DeveloperName"),
            folder_name=raw.get("FolderName"),
            folder_id=None,  # Report doesn't expose FolderId inline
            owner_sf_id=owner_id,
            owner_name=(owner or {}).get("Name"),
            owner_is_active=owner_active,
            description=raw.get("Description"),
            report_format=raw.get("Format"),
            created_at_sf=_parse_sf_datetime(raw.get("CreatedDate")),
            last_referenced_at=last_ref,
            last_run_at=last_run,
            last_modified_at=_parse_sf_datetime(
                raw.get("LastModifiedDate")
            ),
            days_since_last_view=days,
            tier=tier,
            duplicate_group_key=(
                _hash_key("report", normalised) if normalised else None
            ),
            evidence={
                "tier_reason": reason,
                "normalised_name": normalised,
            },
        )

    def _score_dashboard(
        self,
        raw: Dict[str, Any],
        users_by_id: Dict[str, Dict[str, Any]],
        folders_by_id: Dict[str, str],
        now: datetime,
    ) -> Optional[ScoredItem]:
        sf_id = raw.get("Id")
        if not sf_id:
            return None
        name = raw.get("Title") or "(unnamed dashboard)"
        # Dashboard doesn't have an OwnerId — but RunningUserId is the
        # closest analogue for tier purposes (if the running user is
        # inactive, the dashboard renders blank).
        owner_id = raw.get("RunningUserId")
        owner = users_by_id.get(owner_id) if owner_id else None
        owner_active = owner.get("IsActive") if owner else None

        last_ref = _parse_sf_datetime(raw.get("LastReferencedDate"))
        days = _days_between(now, last_ref)

        tier, reason = self._classify(owner_active, days)
        normalised = _normalise_name(name)

        folder_id = raw.get("FolderId")
        folder_name = folders_by_id.get(folder_id) if folder_id else None

        return ScoredItem(
            sf_id=sf_id,
            item_type="dashboard",
            name=name,
            developer_name=raw.get("DeveloperName"),
            folder_name=folder_name,
            folder_id=folder_id,
            owner_sf_id=owner_id,
            owner_name=(owner or {}).get("Name"),
            owner_is_active=owner_active,
            description=raw.get("Description"),
            report_format=None,
            created_at_sf=_parse_sf_datetime(raw.get("CreatedDate")),
            last_referenced_at=last_ref,
            last_run_at=None,
            last_modified_at=_parse_sf_datetime(
                raw.get("LastModifiedDate")
            ),
            days_since_last_view=days,
            tier=tier,
            duplicate_group_key=(
                _hash_key("dashboard", normalised) if normalised else None
            ),
            evidence={
                "tier_reason": reason,
                "normalised_name": normalised,
            },
        )

    def _classify(
        self,
        owner_is_active: Optional[bool],
        days_since_view: Optional[int],
    ) -> tuple[str, str]:
        """Base tier BEFORE duplicate-detection can override it.
        Duplicate resolution runs as a separate post-pass in run().

        Precedence at this stage:
          1. orphaned  — owner is inactive OR unknown (fail-safe)
          2. zombie    — never referenced OR >12 months since reference
          3. live      — referenced within last 12 months
        """
        if owner_is_active is False:
            return (
                "orphaned",
                "Owner is marked inactive — no one is accountable for "
                "this item",
            )
        if owner_is_active is None:
            return (
                "orphaned",
                "Owner could not be resolved — likely an inactive or "
                "deleted user",
            )
        if days_since_view is None:
            return (
                "zombie",
                "Never referenced — no view or run activity on record",
            )
        if days_since_view > ZOMBIE_DAYS_THRESHOLD:
            return (
                "zombie",
                f"Not referenced in {days_since_view} days "
                f"(>{ZOMBIE_DAYS_THRESHOLD} day threshold)",
            )
        return (
            "live",
            f"Referenced {days_since_view} days ago — in active use",
        )

    # ------------------------------------------------------------------
    # Owner resolution
    # ------------------------------------------------------------------

    async def _resolve_users(
        self,
        client: SalesforceAPIClient,
        user_ids: List[str],
    ) -> Dict[str, Dict[str, Any]]:
        """Look up Name + IsActive for a batch of user ids. Batches at
        200 ids per SOQL (SF's IN-list ceiling)."""
        if not user_ids:
            return {}
        result: Dict[str, Dict[str, Any]] = {}
        # Deduplicate + batch to avoid the 20k SOQL length limit.
        unique = list({uid for uid in user_ids if uid})
        BATCH = 200
        for start in range(0, len(unique), BATCH):
            slice_ids = unique[start : start + BATCH]
            joined = ",".join(f"'{uid}'" for uid in slice_ids)
            soql = (
                f"SELECT Id, Name, IsActive FROM User "
                f"WHERE Id IN ({joined})"
            )
            try:
                rows = await client.query_all(soql)
                for row in rows:
                    if row.get("Id"):
                        result[row["Id"]] = row
            except Exception as exc:  # noqa: BLE001
                logger.info(
                    "report-sprawl: user-resolve batch failed (%s)", exc
                )
        return result

    # ------------------------------------------------------------------
    # Support (mirrors PackageSprawlService + DataQualityService)
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
        logger.warning(
            "report-sprawl: access token expired, refreshing (sandbox=%s)",
            is_sandbox,
        )
        oauth_client = SalesforceOAuthClient(login_url=login_url)
        token_response = await oauth_client.refresh_access_token(
            conn.refresh_token
        )
        conn.access_token = token_response.access_token
        conn.instance_url = token_response.instance_url
        await self.db.commit()
        logger.info("report-sprawl: access token refreshed")
        return SalesforceAPIClient(
            instance_url=token_response.instance_url,
            access_token=token_response.access_token,
        )
