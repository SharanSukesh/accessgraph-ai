"""Change-Risk Radar Service — SetupAuditTrail ingest + blast-radius scoring.

Fifth analysis engine alongside Anomaly, Risk, Equity, and Data Quality.
Pulls SF's SetupAuditTrail for a configurable window (default 30 days),
scores every event by "blast radius" (how broadly the change could
affect users / data / access), and persists results for the frontend
timeline. No existing engine or table is mutated.

Entrypoint:
    service = ChangeRiskRadarService(db, org_id)
    run = await service.run(actor_email=..., since_days=30)

Scoring model — blast_radius (0-100):

  * base score by Section — SF's own category is the strongest signal:
      Manage Profiles        80
      Connected Apps         85
      Sharing Rules / Sharing 75
      Field-Level Security   75
      Metadata Deploy        70
      Password Policies      70
      Session Settings       70
      Manage Permission Sets 65
      Manage Users           60
      Package Manager        60
      Custom Settings        50
      Custom Metadata        45
      Company Information    40
      default                30
  * +15 modifier when Display text contains "delete" / "install" /
    "uninstall" — those are broader-impact than routine tweaks.
  * clamped to [0, 100].

Tier bands:
  critical >= 80
  high     >= 65
  medium   >= 40
  low      <  40
"""
from __future__ import annotations

import logging
import time
from collections import Counter
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.models import (
    ChangeAuditEvent,
    ChangeAuditRun,
    SalesforceConnection,
)
from app.salesforce.client import SalesforceAPIClient


logger = logging.getLogger(__name__)


# ----------------------------------------------------------------------
# Configuration
# ----------------------------------------------------------------------

DEFAULT_SINCE_DAYS = 30
DEFAULT_MAX_EVENTS = 5000

# Cap ingested events per run. SetupAuditTrail can grow to tens of
# thousands of rows on a chatty org, and we render every event in the
# UI timeline — bound it so response payloads stay reasonable.
MAX_EVENTS_PER_RUN = 5000

# Section → base score. Cases that aren't listed default to 30
# (low-blast). Kept as a plain dict for O(1) lookup and easy tuning.
SECTION_SCORES: Dict[str, int] = {
    "Manage Profiles": 80,
    "Connected Apps": 85,
    "Sharing Rules": 75,
    "Sharing Defaults": 75,
    "Field-Level Security": 75,
    "Metadata Deploy": 70,
    "Password Policies": 70,
    "Session Settings": 70,
    "Manage Permission Sets": 65,
    "Manage Users": 60,
    "Package Manager": 60,
    "Custom Settings": 50,
    "Custom Metadata": 45,
    "Company Information": 40,
    "Certificate and Key Management": 65,
    "Login IP Ranges": 70,
    "Trusted IP Ranges": 70,
}
DEFAULT_SECTION_SCORE = 30

# Display-text keywords that bump blast radius. Case-insensitive substring
# match. "install" catches package installs, "delete" catches destructive
# metadata changes, etc.
BLAST_MODIFIERS: List[Tuple[str, int]] = [
    ("delete", 15),
    ("uninstall", 15),
    ("install", 10),
    ("permanently", 10),
]

# Tier band thresholds — inclusive lower bound. Rendered as coloured
# badges on the timeline.
TIER_CRITICAL = 80
TIER_HIGH = 65
TIER_MEDIUM = 40

# What counts as "high-blast" in the KPI card ≡ >= TIER_HIGH.
HIGH_BLAST_THRESHOLD = TIER_HIGH


# ----------------------------------------------------------------------
# Result shapes
# ----------------------------------------------------------------------


@dataclass
class ScoredEvent:
    """In-memory result for one event before it's persisted."""
    sf_event_id: str
    created_at_sf: datetime
    actor_id: Optional[str]
    actor_name: Optional[str]
    section: Optional[str]
    action: Optional[str]
    display: str
    delegate_user: Optional[str]
    blast_radius: float
    blast_tier: str
    reasoning: Dict[str, Any]


# ----------------------------------------------------------------------
# Service
# ----------------------------------------------------------------------


class ChangeRiskRadarService:
    """Runs the SetupAuditTrail pull + scoring for one org.

    Usage:
        service = ChangeRiskRadarService(db, org_id)
        run = await service.run(actor_email="ops@newton.example")

    The service is stateless past `db` and `org_id`; construct one per
    invocation. All Salesforce IO goes through SalesforceAPIClient.
    """

    def __init__(
        self,
        db: AsyncSession,
        org_id: str,
        *,
        since_days: int = DEFAULT_SINCE_DAYS,
        max_events: int = DEFAULT_MAX_EVENTS,
    ) -> None:
        self.db = db
        self.org_id = org_id
        self.since_days = since_days
        self.max_events = min(max_events, MAX_EVENTS_PER_RUN)

    # ------------------------------------------------------------------
    # Public entrypoint
    # ------------------------------------------------------------------

    async def run(self, *, actor_email: Optional[str] = None) -> ChangeAuditRun:
        """Pull SetupAuditTrail, score each event, persist. Returns the
        run row. Fails soft — errors get logged + stored on the run's
        `error` column but a partial run still lands.
        """
        import httpx  # local import — only needed for 401 detection

        started = time.monotonic()
        since = datetime.now(timezone.utc) - timedelta(days=self.since_days)

        try:
            client = await self._client()
        except Exception as exc:
            logger.exception("change-risk: _client() failed for org %s", self.org_id)
            raise RuntimeError(f"Failed to build Salesforce client: {exc}") from exc

        # Retry-once on 401 (mirrors the DataQualityService pattern).
        try:
            raw_events = await client.extract_setup_audit_trail(
                since_days=self.since_days,
                limit=self.max_events,
            )
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code == 401:
                logger.warning(
                    "change-risk: 401 on SetupAuditTrail — refreshing token"
                )
                try:
                    client = await self._refresh_access_token()
                    raw_events = await client.extract_setup_audit_trail(
                        since_days=self.since_days,
                        limit=self.max_events,
                    )
                except Exception as refresh_exc:
                    logger.exception(
                        "change-risk: token refresh failed for org %s",
                        self.org_id,
                    )
                    raise RuntimeError(
                        "Salesforce access token expired and refresh failed. "
                        "Please reconnect Salesforce from the sidebar."
                    ) from refresh_exc
            else:
                logger.exception(
                    "change-risk: SetupAuditTrail pull failed for org %s "
                    "with HTTP %s", self.org_id, exc.response.status_code,
                )
                raise RuntimeError(
                    f"Salesforce SetupAuditTrail returned HTTP "
                    f"{exc.response.status_code}: {exc}"
                ) from exc
        except Exception as exc:
            logger.exception(
                "change-risk: SetupAuditTrail pull failed for org %s",
                self.org_id,
            )
            raise RuntimeError(
                f"Failed to fetch SetupAuditTrail: {exc}"
            ) from exc

        # Score every event. Errors on individual events get logged but
        # don't sink the whole run.
        scored: List[ScoredEvent] = []
        for raw in raw_events:
            try:
                scored.append(self._score_event(raw))
            except Exception as exc:  # noqa: BLE001
                logger.info(
                    "change-risk: failed to score event %s: %s",
                    raw.get("Id"), exc,
                )
                continue

        # Rollups for the KPI card. "by_section" and "by_actor" are top-5
        # tallies; the frontend renders them as small evidence lists.
        section_counter: Counter[str] = Counter(
            e.section for e in scored if e.section
        )
        actor_counter: Counter[str] = Counter(
            e.actor_name for e in scored if e.actor_name
        )
        rollups = {
            "by_section": dict(section_counter.most_common(5)),
            "by_actor": dict(actor_counter.most_common(5)),
            "by_tier": {
                "critical": sum(1 for e in scored if e.blast_tier == "critical"),
                "high": sum(1 for e in scored if e.blast_tier == "high"),
                "medium": sum(1 for e in scored if e.blast_tier == "medium"),
                "low": sum(1 for e in scored if e.blast_tier == "low"),
            },
        }

        high_blast = sum(1 for e in scored if e.blast_radius >= HIGH_BLAST_THRESHOLD)
        unique_actors = len({e.actor_id for e in scored if e.actor_id})
        avg_blast = (
            sum(e.blast_radius for e in scored) / len(scored) if scored else 0.0
        )

        run = ChangeAuditRun(
            organization_id=self.org_id,
            snapshot_at=datetime.now(timezone.utc),
            since=since,
            events_ingested=len(scored),
            high_blast_count=high_blast,
            unique_actors=unique_actors,
            avg_blast_radius=avg_blast,
            rollups=rollups,
            duration_ms=int((time.monotonic() - started) * 1000),
        )

        try:
            self.db.add(run)
            await self.db.flush()

            for e in scored:
                self.db.add(
                    ChangeAuditEvent(
                        organization_id=self.org_id,
                        run_id=run.id,
                        sf_event_id=(e.sf_event_id or "")[:18],
                        created_at_sf=e.created_at_sf,
                        actor_id=(e.actor_id or None) and e.actor_id[:18],
                        actor_name=(e.actor_name or None) and e.actor_name[:255],
                        section=(e.section or None) and e.section[:120],
                        action=(e.action or None) and e.action[:120],
                        display=e.display or "",
                        delegate_user=(e.delegate_user or None) and e.delegate_user[:120],
                        blast_radius=e.blast_radius,
                        blast_tier=e.blast_tier,
                        reasoning=e.reasoning,
                    )
                )
            await self.db.commit()
            await self.db.refresh(run)
        except Exception as exc:
            logger.exception(
                "change-risk: DB persist failed for org %s "
                "(ingested=%d)", self.org_id, len(scored),
            )
            try:
                await self.db.rollback()
            except Exception:  # noqa: BLE001
                pass
            raise RuntimeError(
                f"Failed to persist change-risk run: "
                f"{type(exc).__name__}: {exc}"
            ) from exc

        logger.info(
            "change-risk run %s by %s: %d events ingested, %d high-blast, "
            "%d unique actors, avg_blast=%.1f",
            run.id,
            actor_email or "system",
            run.events_ingested,
            run.high_blast_count,
            run.unique_actors,
            run.avg_blast_radius,
        )
        return run

    # ------------------------------------------------------------------
    # Scoring
    # ------------------------------------------------------------------

    def _score_event(self, raw: Dict[str, Any]) -> ScoredEvent:
        """Score one SetupAuditTrail row into a ScoredEvent."""
        section = raw.get("Section") or None
        display = raw.get("Display") or ""
        action = raw.get("Action") or None

        # Actor is a nested lookup because we selected `CreatedBy.Id`
        # etc. SF returns them as a nested dict under CreatedBy.
        created_by = raw.get("CreatedBy") or {}
        actor_id = created_by.get("Id")
        actor_name = created_by.get("Name") or created_by.get("Username")

        # Base score from Section, or default.
        base_score = SECTION_SCORES.get(section or "", DEFAULT_SECTION_SCORE)

        # Modifiers from Display text.
        display_lower = display.lower()
        applied_modifiers: List[Dict[str, Any]] = []
        modifier_sum = 0
        for keyword, bump in BLAST_MODIFIERS:
            if keyword in display_lower:
                modifier_sum += bump
                applied_modifiers.append({"keyword": keyword, "bump": bump})

        blast_radius = float(min(100, base_score + modifier_sum))
        blast_tier = _tier_for(blast_radius)

        # Reasoning payload — surfaced in the timeline drilldown so
        # power users can see WHY an event scored high.
        reasoning = {
            "section_base": base_score,
            "section_used": section or "default",
            "modifiers": applied_modifiers,
            "final": blast_radius,
        }

        # Parse the SF timestamp. `CreatedDate` comes back as ISO 8601.
        created_at_sf = _parse_sf_datetime(raw.get("CreatedDate"))

        return ScoredEvent(
            sf_event_id=str(raw.get("Id") or ""),
            created_at_sf=created_at_sf,
            actor_id=actor_id,
            actor_name=actor_name,
            section=section,
            action=action,
            display=display,
            delegate_user=raw.get("DelegateUser") or None,
            blast_radius=blast_radius,
            blast_tier=blast_tier,
            reasoning=reasoning,
        )

    # ------------------------------------------------------------------
    # Support
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
        """Refresh the stored OAuth token — mirrors the DataQualityService
        method so the two features share behaviour."""
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
            "change-risk: access token expired, refreshing (sandbox=%s)",
            is_sandbox,
        )
        oauth_client = SalesforceOAuthClient(login_url=login_url)
        token_response = await oauth_client.refresh_access_token(
            conn.refresh_token
        )
        conn.access_token = token_response.access_token
        conn.instance_url = token_response.instance_url
        await self.db.commit()
        logger.info("change-risk: access token refreshed")
        return SalesforceAPIClient(
            instance_url=token_response.instance_url,
            access_token=token_response.access_token,
        )


# ----------------------------------------------------------------------
# Helpers
# ----------------------------------------------------------------------


def _tier_for(blast_radius: float) -> str:
    """Map a 0-100 blast radius into a UI tier label."""
    if blast_radius >= TIER_CRITICAL:
        return "critical"
    if blast_radius >= TIER_HIGH:
        return "high"
    if blast_radius >= TIER_MEDIUM:
        return "medium"
    return "low"


def _parse_sf_datetime(raw: Optional[str]) -> datetime:
    """Parse an SF ISO 8601 timestamp into a timezone-aware UTC datetime.

    SF returns strings like "2026-07-09T14:22:31.000+0000". Python's
    fromisoformat handles the base shape once we normalise "+0000" to
    "+00:00"; if parsing fails we fall back to `now` rather than
    dropping the event.
    """
    if not raw:
        return datetime.now(timezone.utc)
    normalized = raw.replace("Z", "+00:00")
    # SF's "+0000" isn't accepted by fromisoformat until Python 3.11 —
    # add the colon manually if needed.
    if len(normalized) >= 5 and (normalized[-5] in ("+", "-") and normalized[-3] != ":"):
        normalized = normalized[:-2] + ":" + normalized[-2:]
    try:
        parsed = datetime.fromisoformat(normalized)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed
    except (ValueError, TypeError):
        return datetime.now(timezone.utc)
