"""Change-Risk Radar API routes.

SetupAuditTrail ingest + blast-radius scoring — surfaces:

  - POST  /orgs/{org_id}/change-risk/run       — kick off a pull
  - GET   /orgs/{org_id}/change-risk/latest    — summary of the last run
  - GET   /orgs/{org_id}/change-risk/events    — paginated event timeline
  - GET   /orgs/{org_id}/change-risk/history   — score-over-time
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_database
from app.auth.deps import get_current_actor_email, get_current_org
from app.domain.models import ChangeAuditEvent, ChangeAuditRun
from app.services.change_risk_radar import ChangeRiskRadarService


logger = logging.getLogger(__name__)
router = APIRouter()


# ---------------------------------------------------------------- responses


class RunResponse(BaseModel):
    run_id: str
    snapshot_at: str
    events_ingested: int
    high_blast_count: int


class RunSummary(BaseModel):
    run_id: Optional[str]
    snapshot_at: Optional[str]
    since: Optional[str]
    events_ingested: int
    high_blast_count: int
    unique_actors: int
    avg_blast_radius: float
    rollups: Dict[str, Any] = {}
    has_data: bool
    duration_ms: Optional[int]
    error: Optional[str]


class EventResponse(BaseModel):
    id: str
    sf_event_id: str
    created_at_sf: str
    actor_id: Optional[str]
    actor_name: Optional[str]
    section: Optional[str]
    action: Optional[str]
    display: str
    delegate_user: Optional[str]
    blast_radius: float
    blast_tier: str
    reasoning: Dict[str, Any] = {}

    @classmethod
    def from_orm(cls, row: ChangeAuditEvent) -> "EventResponse":
        return cls(
            id=row.id,
            sf_event_id=row.sf_event_id,
            created_at_sf=row.created_at_sf.isoformat(),
            actor_id=row.actor_id,
            actor_name=row.actor_name,
            section=row.section,
            action=row.action,
            display=row.display,
            delegate_user=row.delegate_user,
            blast_radius=round(row.blast_radius, 1),
            blast_tier=row.blast_tier,
            reasoning=row.reasoning or {},
        )


class EventListResponse(BaseModel):
    run_id: Optional[str]
    total: int
    events: List[EventResponse]


class HistoryPoint(BaseModel):
    run_id: str
    snapshot_at: str
    events_ingested: int
    high_blast_count: int
    avg_blast_radius: float


# ---------------------------------------------------------------- helpers


def _enforce_same_org(org_id: str, current_org_id: str) -> None:
    if org_id != current_org_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot access another org's change-risk data.",
        )


async def _latest_run(
    db: AsyncSession, org_id: str
) -> Optional[ChangeAuditRun]:
    result = await db.execute(
        select(ChangeAuditRun)
        .where(ChangeAuditRun.organization_id == org_id)
        .order_by(desc(ChangeAuditRun.snapshot_at))
        .limit(1)
    )
    return result.scalar_one_or_none()


# ---------------------------------------------------------------- endpoints


@router.post(
    "/orgs/{org_id}/change-risk/run",
    response_model=RunResponse,
)
async def run_change_risk(
    org_id: str,
    since_days: int = Query(
        30, ge=1, le=180,
        description="How many days back to pull SetupAuditTrail for. "
                    "Clamped to [1, 180] since SF caps the audit trail "
                    "retention at 180 days on most editions.",
    ),
    business_hours_start: int = Query(
        9, ge=0, le=24,
        description="Hour of day (in the business timezone) that "
                    "starts the business-hours window. Off-hours = "
                    "everything before this hour.",
    ),
    business_hours_end: int = Query(
        18, ge=0, le=24,
        description="Hour of day (in the business timezone) that "
                    "ends the business-hours window. Off-hours = "
                    "everything at/after this hour.",
    ),
    business_timezone: str = Query(
        "UTC",
        description="IANA timezone name for the business hours (e.g. "
                    "'America/New_York', 'Europe/London'). Unknown "
                    "TZs silently fall back to UTC.",
    ),
    business_weekdays: str = Query(
        "0,1,2,3,4",
        description="Comma-separated Python weekday indices "
                    "(Mon=0, Sun=6) that count as business days.",
    ),
    current_org_id: str = Depends(get_current_org),
    actor_email: str = Depends(get_current_actor_email),
    db: AsyncSession = Depends(get_database),
) -> RunResponse:
    """Kick off a Change-Risk Radar pull synchronously.

    Typically 5-30 seconds. If it grows past ~60s we should move to
    the async background pattern the sync-job uses.
    """
    _enforce_same_org(org_id, current_org_id)

    # Parse the weekday list defensively — any junk falls back to
    # weekdays. Bounded to 0-6 so a mischievous client can't confuse
    # the weekday() checks downstream.
    try:
        weekdays = sorted({
            int(x)
            for x in business_weekdays.split(",")
            if x.strip().isdigit() and 0 <= int(x) <= 6
        })
        if not weekdays:
            weekdays = [0, 1, 2, 3, 4]
    except (ValueError, AttributeError):
        weekdays = [0, 1, 2, 3, 4]

    service = ChangeRiskRadarService(
        db,
        org_id,
        since_days=since_days,
        business_hours_start=business_hours_start,
        business_hours_end=business_hours_end,
        business_timezone=business_timezone,
        business_weekdays=weekdays,
    )
    try:
        run = await service.run(actor_email=actor_email)
    except Exception as e:
        logger.exception("Change-risk run crashed for org %s", org_id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "message": "Change-risk run failed",
                "error_type": type(e).__name__,
                "error": str(e),
            },
        )
    return RunResponse(
        run_id=run.id,
        snapshot_at=run.snapshot_at.isoformat(),
        events_ingested=run.events_ingested,
        high_blast_count=run.high_blast_count,
    )


@router.get(
    "/orgs/{org_id}/change-risk/latest",
    response_model=RunSummary,
)
async def get_latest_summary(
    org_id: str,
    current_org_id: str = Depends(get_current_org),
    db: AsyncSession = Depends(get_database),
) -> RunSummary:
    """Headline stats for the most recent run — powers the KPI cards
    on the /change-risk page. Returns has_data=False so the page can
    render an empty-state on first visit."""
    _enforce_same_org(org_id, current_org_id)
    run = await _latest_run(db, org_id)
    if run is None:
        return RunSummary(
            run_id=None,
            snapshot_at=None,
            since=None,
            events_ingested=0,
            high_blast_count=0,
            unique_actors=0,
            avg_blast_radius=0.0,
            rollups={},
            has_data=False,
            duration_ms=None,
            error=None,
        )
    return RunSummary(
        run_id=run.id,
        snapshot_at=run.snapshot_at.isoformat(),
        since=run.since.isoformat(),
        events_ingested=run.events_ingested,
        high_blast_count=run.high_blast_count,
        unique_actors=run.unique_actors,
        avg_blast_radius=round(run.avg_blast_radius, 1),
        rollups=run.rollups or {},
        has_data=True,
        duration_ms=run.duration_ms,
        error=run.error,
    )


@router.get(
    "/orgs/{org_id}/change-risk/events",
    response_model=EventListResponse,
)
async def list_events(
    org_id: str,
    tier: Optional[str] = Query(
        None,
        pattern="^(low|medium|high|critical)$",
        description="Filter to events of the given tier only.",
    ),
    section: Optional[str] = Query(None, description="Filter by SF Section."),
    actor: Optional[str] = Query(None, description="Filter by actor name."),
    limit: int = Query(200, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    current_org_id: str = Depends(get_current_org),
    db: AsyncSession = Depends(get_database),
) -> EventListResponse:
    """Paginated timeline. Orders most-recent first, applies optional
    filters (tier / section / actor).
    """
    _enforce_same_org(org_id, current_org_id)
    run = await _latest_run(db, org_id)
    if run is None:
        return EventListResponse(run_id=None, total=0, events=[])

    conditions = [
        ChangeAuditEvent.run_id == run.id,
    ]
    if tier:
        conditions.append(ChangeAuditEvent.blast_tier == tier)
    if section:
        conditions.append(ChangeAuditEvent.section == section)
    if actor:
        conditions.append(ChangeAuditEvent.actor_name == actor)

    # Two queries: total for pagination + the page itself.
    from sqlalchemy import func
    total_stmt = select(func.count()).select_from(ChangeAuditEvent).where(*conditions)
    total = (await db.execute(total_stmt)).scalar_one()

    page_stmt = (
        select(ChangeAuditEvent)
        .where(*conditions)
        .order_by(desc(ChangeAuditEvent.created_at_sf))
        .offset(offset)
        .limit(limit)
    )
    rows = list((await db.execute(page_stmt)).scalars().all())
    return EventListResponse(
        run_id=run.id,
        total=int(total),
        events=[EventResponse.from_orm(r) for r in rows],
    )


@router.get(
    "/orgs/{org_id}/change-risk/history",
    response_model=List[HistoryPoint],
)
async def get_history(
    org_id: str,
    limit: int = Query(30, ge=1, le=100),
    current_org_id: str = Depends(get_current_org),
    db: AsyncSession = Depends(get_database),
) -> List[HistoryPoint]:
    """Score-over-time trend for the sparkline on the KPI card."""
    _enforce_same_org(org_id, current_org_id)
    result = await db.execute(
        select(ChangeAuditRun)
        .where(ChangeAuditRun.organization_id == org_id)
        .order_by(desc(ChangeAuditRun.snapshot_at))
        .limit(limit)
    )
    runs = list(result.scalars().all())
    return [
        HistoryPoint(
            run_id=r.id,
            snapshot_at=r.snapshot_at.isoformat(),
            events_ingested=r.events_ingested,
            high_blast_count=r.high_blast_count,
            avg_blast_radius=round(r.avg_blast_radius, 1),
        )
        for r in reversed(runs)  # chronological order for charting
    ]
