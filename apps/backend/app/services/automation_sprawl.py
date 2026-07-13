"""Automation Sprawl Service — inventory + tier scoring for every Flow
and Apex Trigger in a Salesforce org.

Mirror of the Report Sprawl pattern. Pulls every FlowDefinitionView +
ApexTrigger row visible to the running user, checks compile / activation
state, resolves the last-modifier's active status, and classifies each
into one of four tiers:

  active   — currently active + owner active + modified in last 12 months.
             Real, healthy automation.
  dormant  — currently active but hasn't been touched in >12 months.
             Nobody has looked at it in a year — cleanup candidate.
  orphaned — last modifier is an inactive (departed) user.
             Highest-priority signal because nobody's accountable.
  broken   — Flow is IsOutOfDate=True (active version doesn't match the
             latest saved version) OR ApexTrigger IsValid=False (doesn't
             compile against current schema). Silently corrupting data.

Tier precedence (highest actionability first):

    broken > orphaned > dormant > active

Rationale: `broken` tops the list because it's ACTIVELY causing errors
in production (invalid trigger fires and logs exceptions; out-of-date
flow fires stale logic). `orphaned` next because nobody can certify it.
`dormant` third for cleanup. `active` is default.

Entrypoint:
    service = AutomationSprawlService(db, org_id)
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
    AutomationInventoryItem,
    AutomationSprawlRun,
    SalesforceConnection,
)
from app.salesforce.client import SalesforceAPIClient


logger = logging.getLogger(__name__)


# ----------------------------------------------------------------------
# Configuration
# ----------------------------------------------------------------------

# Days-since-last-modified above which we tier `dormant`. 365 matches
# the consulting pitch: "hasn't been touched in a year".
DORMANT_DAYS_THRESHOLD = 365

# Safety cap on how many items to persist per run. Modern orgs
# sometimes have thousands of flows (post-migration from Workflow
# Rules). We still process every returned row from SF but cap the
# persist step so a single run doesn't produce a 100k-row table.
MAX_ITEMS_PER_RUN = 25_000


# ----------------------------------------------------------------------
# Result shape
# ----------------------------------------------------------------------


@dataclass
class ScoredItem:
    sf_id: str
    item_type: str  # 'flow' | 'trigger'
    name: str
    api_name: Optional[str]
    description: Optional[str]
    namespace_prefix: Optional[str]
    process_type: Optional[str]
    trigger_type: Optional[str]
    target_object: Optional[str]
    api_version: Optional[str]
    length_without_comments: Optional[int]
    is_active: Optional[bool]
    is_valid: Optional[bool]
    owner_sf_id: Optional[str]
    owner_name: Optional[str]
    owner_is_active: Optional[bool]
    last_modified_at: Optional[datetime]
    days_since_modified: Optional[int]
    tier: str
    duplicate_group_key: Optional[str]
    evidence: Dict[str, Any] = dc_field(default_factory=dict)


# ----------------------------------------------------------------------
# Helpers
# ----------------------------------------------------------------------


# Automation rename patterns are more varied than report rename
# patterns because devs prefix them (Old X, New X, Backup X) as well
# as suffix them (X v2, X - Copy, X (Backup), X_Deprecated).
_QUALIFIER_WORDS = (
    "copy", "old", "new", "backup", "deprecated", "temp", "tmp"
)
_SUFFIX_ALTERNATIVES = (
    r"copy(?:\s*(?:of|\d+))?",     # copy / copy of / copy 2
    r"\(\w[\w\s]*\)",              # (Backup) / (1) / (Q3)
    r"v\d+",                       # v2 / v10
    r"old|new|backup|deprecated|temp|tmp",
)
_SUFFIX = re.compile(
    r"\s*(?:-\s*|_)?(?:" + "|".join(_SUFFIX_ALTERNATIVES) + r")\s*$",
    re.IGNORECASE,
)
_PREFIX = re.compile(
    r"^(?:" + "|".join(_QUALIFIER_WORDS) + r")[\s_-]+",
    re.IGNORECASE,
)
_NON_ALNUM = re.compile(r"[^0-9a-z]+")


def _normalise_name(name: str) -> str:
    """Collapse a display title down to a duplicate-detection key.

    Strategy:
      1. Lowercase, strip whitespace.
      2. Repeatedly strip trailing suffix qualifiers (copy / v2 /
         "(Backup)" / _Deprecated / etc.) — SF renaming conventions.
      3. Repeatedly strip leading prefix qualifiers ("Old X",
         "Backup X", "New X" — common when devs keep the old one
         alongside a rewrite).
      4. Collapse non-alnum runs to single spaces, trim.

    Returns "" for items too short (<3 chars) after normalising —
    caller treats "" as unnormalisable and skips duplicate detection.
    """
    if not name:
        return ""
    n = name.lower().strip()
    # Nested strip up to 3 times so "Old Backup X copy 2" fully collapses.
    for _ in range(3):
        prev = n
        n = _SUFFIX.sub("", n).strip()
        n = _PREFIX.sub("", n).strip()
        if n == prev:
            break
    n = _NON_ALNUM.sub(" ", n).strip()
    n = re.sub(r"\s+", " ", n)
    return n if len(n) >= 3 else ""


def _hash_key(item_type: str, normalised: str) -> str:
    digest = hashlib.sha1(
        f"{item_type}:{normalised}".encode("utf-8")
    ).hexdigest()
    return digest[:16]


def _parse_sf_datetime(raw: Optional[str]) -> Optional[datetime]:
    """Same SF timestamp parser used by report_sprawl."""
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


def _days_between(
    reference: datetime, target: Optional[datetime]
) -> Optional[int]:
    if target is None:
        return None
    delta = reference - target
    return max(delta.days, 0)


def _extract_sf_error(exc: Any) -> str:
    """Pull the human-readable Salesforce error message out of an
    HTTPStatusError so diagnostics show something more useful than
    "HTTP 400". SF error responses come back as
    [{"message": "...", "errorCode": "..."}]."""
    try:
        body = exc.response.json()
        if isinstance(body, list) and body:
            first = body[0]
            code = first.get("errorCode") or ""
            msg = first.get("message") or ""
            return f"{code}: {msg}" if code else msg
        if isinstance(body, dict):
            return str(
                body.get("message") or body.get("error_description") or body
            )
    except Exception:  # noqa: BLE001
        pass
    return str(exc)


# ----------------------------------------------------------------------
# Service
# ----------------------------------------------------------------------


class AutomationSprawlService:
    """Runs Flow + ApexTrigger sprawl analysis for one org.

    Stateful only during .run() — every intermediate structure falls
    out of scope when the coroutine returns.
    """

    def __init__(self, db: AsyncSession, org_id: str):
        self.db = db
        self.org_id = org_id

    # ------------------------------------------------------------------
    # Public entrypoint
    # ------------------------------------------------------------------

    async def run(
        self, *, actor_email: Optional[str] = None
    ) -> AutomationSprawlRun:
        import httpx  # local — only needed for 401 detection

        started = time.monotonic()

        try:
            client = await self._client()
        except Exception as exc:
            logger.exception(
                "automation-sprawl: _client() failed for org %s",
                self.org_id,
            )
            raise RuntimeError(
                f"Failed to build Salesforce client: {exc}"
            ) from exc

        # Per-source diagnostics. Captured whether the pull succeeds
        # or fails so the frontend can render an honest "here's what
        # actually happened" panel when items_total is unexpectedly 0.
        diagnostics: Dict[str, Dict[str, Any]] = {
            "flows": {"raw_count": 0, "error": None},
            "triggers": {"raw_count": 0, "error": None},
            "users": {"resolved_count": 0, "error": None},
        }

        # -- Flows ----------------------------------------------------
        raw_flows: List[Dict[str, Any]] = []
        try:
            raw_flows = await client.extract_flows()
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code == 401:
                logger.warning(
                    "automation-sprawl: 401 on Flow — refreshing token"
                )
                try:
                    client = await self._refresh_access_token()
                    raw_flows = await client.extract_flows()
                except Exception as refresh_exc:
                    logger.exception(
                        "automation-sprawl: token refresh failed for "
                        "org %s", self.org_id,
                    )
                    raise RuntimeError(
                        "Salesforce access token expired and refresh "
                        "failed. Please reconnect Salesforce."
                    ) from refresh_exc
            else:
                diagnostics["flows"]["error"] = (
                    f"HTTP {exc.response.status_code}: "
                    f"{_extract_sf_error(exc)}"
                )
                logger.warning(
                    "automation-sprawl: Flow query HTTP %s — %s",
                    exc.response.status_code,
                    diagnostics["flows"]["error"],
                )
        except Exception as exc:  # noqa: BLE001
            diagnostics["flows"]["error"] = f"{type(exc).__name__}: {exc}"
            logger.info(
                "automation-sprawl: Flow pull failed — %s",
                diagnostics["flows"]["error"],
            )
        diagnostics["flows"]["raw_count"] = len(raw_flows)

        # -- Triggers -------------------------------------------------
        raw_triggers: List[Dict[str, Any]] = []
        try:
            raw_triggers = await client.extract_apex_triggers()
        except httpx.HTTPStatusError as exc:
            diagnostics["triggers"]["error"] = (
                f"HTTP {exc.response.status_code}: "
                f"{_extract_sf_error(exc)}"
            )
            logger.warning(
                "automation-sprawl: ApexTrigger query HTTP %s — %s",
                exc.response.status_code,
                diagnostics["triggers"]["error"],
            )
        except Exception as exc:  # noqa: BLE001
            diagnostics["triggers"]["error"] = (
                f"{type(exc).__name__}: {exc}"
            )
            logger.info(
                "automation-sprawl: ApexTrigger pull failed — %s",
                diagnostics["triggers"]["error"],
            )
        diagnostics["triggers"]["raw_count"] = len(raw_triggers)

        # -- Users (batch resolve last-modifier active-status) --------
        # Tooling API rejects some inline User joins depending on org
        # config, so we ask for Name + IsActive via the regular /query
        # endpoint after collecting all last-modifier ids.
        owner_ids = {
            f.get("LastModifiedById")
            for f in raw_flows
            if f.get("LastModifiedById")
        } | {
            t.get("LastModifiedById")
            for t in raw_triggers
            if t.get("LastModifiedById")
        }
        owner_ids.discard(None)
        try:
            users_by_id = await self._resolve_users(
                client, list(owner_ids)
            )
            diagnostics["users"]["resolved_count"] = len(users_by_id)
        except Exception as exc:  # noqa: BLE001
            users_by_id = {}
            diagnostics["users"]["error"] = (
                f"{type(exc).__name__}: {exc}"
            )
            logger.info(
                "automation-sprawl: user-resolve batch failed — %s",
                diagnostics["users"]["error"],
            )

        logger.warning(
            "automation-sprawl: org=%s SF returned flows=%d triggers=%d "
            "resolved_users=%d",
            self.org_id,
            len(raw_flows),
            len(raw_triggers),
            diagnostics["users"]["resolved_count"],
        )

        # -- Score every item ----------------------------------------
        now = datetime.now(timezone.utc)
        flow_items = [
            self._score_flow(f, users_by_id, now) for f in raw_flows
        ]
        trigger_items = [
            self._score_trigger(t, users_by_id, now)
            for t in raw_triggers
        ]
        flow_items = [x for x in flow_items if x is not None]
        trigger_items = [x for x in trigger_items if x is not None]
        all_items: List[ScoredItem] = flow_items + trigger_items

        # -- Duplicate detection post-pass ---------------------------
        # Same rule as Report Sprawl: promote zombie/dormant items to
        # `duplicate` when a name cluster of ≥2 is detected, but NEVER
        # override a higher-priority tier (broken, orphaned).
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
                # Automation Sprawl doesn't use a `duplicate` TIER
                # (broken/orphaned/dormant/active per user's picked
                # scheme), so we just stamp duplicate-cluster
                # membership on evidence for the drilldown UI.
                it.evidence["duplicate_group"] = {
                    "key": key,
                    "size": len(members),
                    "sibling_ids": sibling_ids,
                }

        # -- Cap ------------------------------------------------------
        tier_rank = {
            "broken": 0,
            "orphaned": 1,
            "dormant": 2,
            "active": 3,
        }
        all_items.sort(
            key=lambda i: (
                tier_rank.get(i.tier, 99),
                -(i.days_since_modified or 0),
                i.name.lower(),
            )
        )
        capped = all_items[:MAX_ITEMS_PER_RUN]
        if len(all_items) > MAX_ITEMS_PER_RUN:
            logger.warning(
                "automation-sprawl: org=%s scored %d items, capping to %d",
                self.org_id, len(all_items), MAX_ITEMS_PER_RUN,
            )

        # -- Rollups -------------------------------------------------
        counts = {
            "active": 0,
            "dormant": 0,
            "orphaned": 0,
            "broken": 0,
        }
        for it in capped:
            counts[it.tier] = counts.get(it.tier, 0) + 1
        days_values = [
            it.days_since_modified
            for it in capped
            if it.days_since_modified is not None
        ]
        avg_days = (
            int(round(sum(days_values) / len(days_values)))
            if days_values
            else None
        )

        # -- Persist -------------------------------------------------
        duration_ms = int((time.monotonic() - started) * 1000)
        run = AutomationSprawlRun(
            organization_id=self.org_id,
            snapshot_at=datetime.now(timezone.utc),
            flows_total=sum(
                1 for it in capped if it.item_type == "flow"
            ),
            triggers_total=sum(
                1 for it in capped if it.item_type == "trigger"
            ),
            items_total=len(capped),
            items_active=counts.get("active", 0),
            items_dormant=counts.get("dormant", 0),
            items_orphaned=counts.get("orphaned", 0),
            items_broken=counts.get("broken", 0),
            avg_days_since_modified=avg_days,
            duplicate_groups=duplicate_group_count,
            duration_ms=duration_ms,
            error=None,
            source_diagnostics=diagnostics,
        )
        self.db.add(run)
        await self.db.flush()

        for it in capped:
            self.db.add(
                AutomationInventoryItem(
                    organization_id=self.org_id,
                    run_id=run.id,
                    sf_id=it.sf_id,
                    item_type=it.item_type,
                    name=it.name[:255],
                    api_name=it.api_name,
                    description=(
                        (it.description or "")[:1000] or None
                    ),
                    namespace_prefix=it.namespace_prefix,
                    process_type=it.process_type,
                    trigger_type=it.trigger_type,
                    target_object=it.target_object,
                    api_version=it.api_version,
                    length_without_comments=it.length_without_comments,
                    is_active=it.is_active,
                    is_valid=it.is_valid,
                    owner_sf_id=it.owner_sf_id,
                    owner_name=it.owner_name,
                    owner_is_active=it.owner_is_active,
                    last_modified_at=it.last_modified_at,
                    days_since_modified=it.days_since_modified,
                    tier=it.tier,
                    duplicate_group_key=it.duplicate_group_key,
                    evidence=it.evidence,
                )
            )

        await self.db.commit()
        logger.info(
            "automation-sprawl: org=%s persisted run=%s items=%d "
            "(active=%d dormant=%d orphaned=%d broken=%d) in %dms",
            self.org_id, run.id, len(capped),
            counts["active"], counts["dormant"],
            counts["orphaned"], counts["broken"],
            duration_ms,
        )
        return run

    # ------------------------------------------------------------------
    # Per-item scoring
    # ------------------------------------------------------------------

    def _score_flow(
        self,
        raw: Dict[str, Any],
        users_by_id: Dict[str, Dict[str, Any]],
        now: datetime,
    ) -> Optional[ScoredItem]:
        sf_id = raw.get("Id")
        if not sf_id:
            return None
        name = raw.get("Label") or raw.get("ApiName") or "(unnamed flow)"
        api_name = raw.get("ApiName")
        owner_id = raw.get("LastModifiedById")
        modifier = users_by_id.get(owner_id) if owner_id else None
        owner_active = (modifier or {}).get("IsActive")

        last_modified = _parse_sf_datetime(raw.get("LastModifiedDate"))
        days = _days_between(now, last_modified)

        is_active = bool(raw.get("IsActive"))
        # IsOutOfDate=True means active version diverges from latest
        # saved — usually a partial deploy or a broken save. Treat as
        # NOT valid.
        is_out_of_date = bool(raw.get("IsOutOfDate"))
        is_valid = (not is_out_of_date) if is_active else None

        tier, reason = self._classify(
            is_active=is_active,
            is_valid=is_valid,
            owner_active=owner_active,
            days=days,
            broken_signal=(
                "Active version is out of date (latest saved edits "
                "haven't been activated)"
                if (is_active and is_out_of_date)
                else None
            ),
        )
        normalised = _normalise_name(name)

        return ScoredItem(
            sf_id=sf_id,
            item_type="flow",
            name=name,
            api_name=api_name,
            description=raw.get("Description"),
            namespace_prefix=raw.get("NamespacePrefix"),
            process_type=raw.get("ProcessType"),
            trigger_type=raw.get("TriggerType"),
            target_object=None,
            api_version=None,
            length_without_comments=None,
            is_active=is_active,
            is_valid=is_valid,
            owner_sf_id=owner_id,
            owner_name=(modifier or {}).get("Name"),
            owner_is_active=owner_active,
            last_modified_at=last_modified,
            days_since_modified=days,
            tier=tier,
            duplicate_group_key=(
                _hash_key("flow", normalised) if normalised else None
            ),
            evidence={
                "tier_reason": reason,
                "normalised_name": normalised,
                "is_out_of_date": is_out_of_date,
            },
        )

    def _score_trigger(
        self,
        raw: Dict[str, Any],
        users_by_id: Dict[str, Dict[str, Any]],
        now: datetime,
    ) -> Optional[ScoredItem]:
        sf_id = raw.get("Id")
        if not sf_id:
            return None
        name = raw.get("Name") or "(unnamed trigger)"
        owner_id = raw.get("LastModifiedById")
        modifier = users_by_id.get(owner_id) if owner_id else None
        owner_active = (modifier or {}).get("IsActive")

        last_modified = _parse_sf_datetime(raw.get("LastModifiedDate"))
        days = _days_between(now, last_modified)

        # Status: 'Active' | 'Inactive' | 'Deleted'
        status = raw.get("Status")
        is_active = status == "Active"
        # IsValid=False means it won't compile — broken irrespective
        # of activation state.
        is_valid = raw.get("IsValid")

        tier, reason = self._classify(
            is_active=is_active,
            is_valid=is_valid,
            owner_active=owner_active,
            days=days,
            broken_signal=(
                "Trigger fails to compile against the current schema"
                if is_valid is False
                else None
            ),
        )
        normalised = _normalise_name(name)

        return ScoredItem(
            sf_id=sf_id,
            item_type="trigger",
            name=name,
            api_name=name,
            description=None,
            namespace_prefix=raw.get("NamespacePrefix"),
            process_type=None,
            trigger_type=None,
            target_object=raw.get("TableEnumOrId"),
            api_version=(
                str(raw.get("ApiVersion"))
                if raw.get("ApiVersion") is not None
                else None
            ),
            length_without_comments=raw.get("LengthWithoutComments"),
            is_active=is_active,
            is_valid=is_valid,
            owner_sf_id=owner_id,
            owner_name=(modifier or {}).get("Name"),
            owner_is_active=owner_active,
            last_modified_at=last_modified,
            days_since_modified=days,
            tier=tier,
            duplicate_group_key=(
                _hash_key("trigger", normalised)
                if normalised
                else None
            ),
            evidence={
                "tier_reason": reason,
                "normalised_name": normalised,
                "status": status,
            },
        )

    def _classify(
        self,
        *,
        is_active: Optional[bool],
        is_valid: Optional[bool],
        owner_active: Optional[bool],
        days: Optional[int],
        broken_signal: Optional[str],
    ) -> tuple[str, str]:
        """Precedence: broken > orphaned > dormant > active.

        Note that `is_active=False` (admin-disabled but not broken) is
        NOT itself a tier — it flows through as `dormant` or `active`
        depending on last-modified age. That's on purpose: admins
        deactivate things intentionally, so it isn't a red flag. What
        IS a red flag is inactive-owner or invalid-compile.
        """
        if broken_signal:
            return "broken", broken_signal
        if is_valid is False:
            return (
                "broken",
                "Fails validation against the current org schema",
            )
        if owner_active is False:
            return (
                "orphaned",
                "Last modifier is inactive — no one accountable",
            )
        if owner_active is None:
            return (
                "orphaned",
                "Last modifier could not be resolved — likely a "
                "deleted user",
            )
        if days is None:
            # No LastModifiedDate at all — should be rare on a
            # Tooling API row but treat as dormant to fail safe.
            return (
                "dormant",
                "No last-modified date on record — likely stale",
            )
        if days > DORMANT_DAYS_THRESHOLD:
            return (
                "dormant",
                f"Not modified in {days} days "
                f"(>{DORMANT_DAYS_THRESHOLD} day threshold)",
            )
        return (
            "active",
            f"Modified {days} days ago — actively maintained",
        )

    # ------------------------------------------------------------------
    # Owner resolution
    # ------------------------------------------------------------------

    async def _resolve_users(
        self,
        client: SalesforceAPIClient,
        user_ids: List[str],
    ) -> Dict[str, Dict[str, Any]]:
        """Batch lookup Name + IsActive for the LastModifiedById values
        we saw on Flow / ApexTrigger rows. Batches at 200 ids per
        SOQL (SF IN-list ceiling). Uses the regular /query endpoint
        (User is queryable there), NOT Tooling."""
        if not user_ids:
            return {}
        result: Dict[str, Dict[str, Any]] = {}
        unique = list({uid for uid in user_ids if uid})
        BATCH = 200
        for start in range(0, len(unique), BATCH):
            slice_ids = unique[start : start + BATCH]
            joined = ",".join(f"'{uid}'" for uid in slice_ids)
            soql = (
                f"SELECT Id, Name, IsActive FROM User "
                f"WHERE Id IN ({joined})"
            )
            rows = await client.query_all(soql)
            for row in rows:
                if row.get("Id"):
                    result[row["Id"]] = row
        return result

    # ------------------------------------------------------------------
    # Support (mirrors PackageSprawl / ReportSprawl)
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
            "automation-sprawl: access token expired, refreshing "
            "(sandbox=%s)", is_sandbox,
        )
        oauth_client = SalesforceOAuthClient(login_url=login_url)
        token_response = await oauth_client.refresh_access_token(
            conn.refresh_token
        )
        conn.access_token = token_response.access_token
        conn.instance_url = token_response.instance_url
        await self.db.commit()
        logger.info("automation-sprawl: access token refreshed")
        return SalesforceAPIClient(
            instance_url=token_response.instance_url,
            access_token=token_response.access_token,
        )
