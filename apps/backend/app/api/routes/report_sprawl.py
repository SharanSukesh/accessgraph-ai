"""Report & Dashboard Sprawl API routes.

  - POST /orgs/{org_id}/report-sprawl/run     — kick off pull
  - GET  /orgs/{org_id}/report-sprawl/latest  — summary
  - GET  /orgs/{org_id}/report-sprawl/items   — per-item list
  - GET  /orgs/{org_id}/report-sprawl/history — trend over time
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import case, desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_database
from app.auth.deps import get_current_actor_email, require_org_access
from app.domain.models import ReportInventoryItem, ReportSprawlRun
from app.services.report_sprawl import TIER_RANK, ReportSprawlService


logger = logging.getLogger(__name__)
router = APIRouter()


# ---------------------------------------------------------------- responses


class RunResponse(BaseModel):
    run_id: str
    snapshot_at: str
    items_total: int
    items_zombie: int
    items_orphaned: int
    items_duplicate: int
    items_unknown_usage: int


class RunSummary(BaseModel):
    run_id: Optional[str]
    snapshot_at: Optional[str]
    reports_total: int
    dashboards_total: int
    items_total: int
    items_live: int
    items_zombie: int
    items_orphaned: int
    items_duplicate: int
    items_unknown_usage: int
    items_never_referenced: int
    avg_days_since_last_view: Optional[int]
    duplicate_groups: int
    has_data: bool
    duration_ms: Optional[int]
    error: Optional[str]


class ItemResponse(BaseModel):
    id: str
    sf_id: str
    item_type: str
    name: str
    developer_name: Optional[str] = None
    folder_name: Optional[str] = None
    folder_id: Optional[str] = None
    owner_sf_id: Optional[str] = None
    owner_name: Optional[str] = None
    owner_is_active: Optional[bool] = None
    description: Optional[str] = None
    report_format: Optional[str] = None
    created_at_sf: Optional[str] = None
    last_referenced_at: Optional[str] = None
    last_run_at: Optional[str] = None
    last_modified_at: Optional[str] = None
    days_since_last_view: Optional[int] = None
    tier: str
    duplicate_group_key: Optional[str] = None
    evidence: Dict[str, Any] = {}

    @classmethod
    def from_orm(cls, row: ReportInventoryItem) -> "ItemResponse":
        def iso(v):
            return v.isoformat() if v is not None else None

        return cls(
            id=row.id,
            sf_id=row.sf_id,
            item_type=row.item_type,
            name=row.name,
            developer_name=row.developer_name,
            folder_name=row.folder_name,
            folder_id=row.folder_id,
            owner_sf_id=row.owner_sf_id,
            owner_name=row.owner_name,
            owner_is_active=row.owner_is_active,
            description=row.description,
            report_format=row.report_format,
            created_at_sf=iso(row.created_at_sf),
            last_referenced_at=iso(row.last_referenced_at),
            last_run_at=iso(row.last_run_at),
            last_modified_at=iso(row.last_modified_at),
            days_since_last_view=row.days_since_last_view,
            tier=row.tier,
            duplicate_group_key=row.duplicate_group_key,
            evidence=row.evidence or {},
        )


class ItemListResponse(BaseModel):
    run_id: Optional[str]
    total: int
    items: List[ItemResponse]


class HistoryPoint(BaseModel):
    run_id: str
    snapshot_at: str
    items_total: int
    items_zombie: int
    items_orphaned: int
    items_duplicate: int
    items_unknown_usage: int


# ---------------------------------------------------------------- helpers


_TIER_ORDER = case(TIER_RANK, value=ReportInventoryItem.tier, else_=99)


async def _latest_run(
    db: AsyncSession, org_id: str
) -> Optional[ReportSprawlRun]:
    result = await db.execute(
        select(ReportSprawlRun)
        .where(ReportSprawlRun.organization_id == org_id)
        .order_by(desc(ReportSprawlRun.snapshot_at))
        .limit(1)
    )
    return result.scalar_one_or_none()


# ---------------------------------------------------------------- endpoints


@router.post(
    "/orgs/{org_id}/report-sprawl/run",
    response_model=RunResponse,
)
async def run_report_sprawl(
    org_id: str,
    _org: str = Depends(require_org_access),
    actor_email: str = Depends(get_current_actor_email),
    db: AsyncSession = Depends(get_database),
) -> RunResponse:
    """Kick off a report + dashboard sprawl pull synchronously. Larger
    orgs (10k+ items) take 30-60 seconds. Frontend shows a spinner
    until the response arrives."""
    service = ReportSprawlService(db, org_id)
    try:
        run = await service.run(actor_email=actor_email)
    except Exception as e:
        logger.exception("Report-sprawl run crashed for org %s", org_id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "message": "Report-sprawl run failed",
                "error_type": type(e).__name__,
                "error": str(e),
            },
        )
    return RunResponse(
        run_id=run.id,
        snapshot_at=run.snapshot_at.isoformat(),
        items_total=run.items_total,
        items_zombie=run.items_zombie,
        items_orphaned=run.items_orphaned,
        items_duplicate=run.items_duplicate,
        items_unknown_usage=run.items_unknown_usage,
    )


@router.get(
    "/orgs/{org_id}/report-sprawl/latest",
    response_model=RunSummary,
)
async def get_latest_summary(
    org_id: str,
    _org: str = Depends(require_org_access),
    db: AsyncSession = Depends(get_database),
) -> RunSummary:
    """Rollup for the KPI strip. Returns has_data=False when no run
    has ever been executed for this org so the page can render an
    empty state."""
    run = await _latest_run(db, org_id)
    if run is None:
        return RunSummary(
            run_id=None,
            snapshot_at=None,
            reports_total=0,
            dashboards_total=0,
            items_total=0,
            items_live=0,
            items_zombie=0,
            items_orphaned=0,
            items_duplicate=0,
            items_unknown_usage=0,
            items_never_referenced=0,
            avg_days_since_last_view=None,
            duplicate_groups=0,
            has_data=False,
            duration_ms=None,
            error=None,
        )
    return RunSummary(
        run_id=run.id,
        snapshot_at=run.snapshot_at.isoformat(),
        reports_total=run.reports_total,
        dashboards_total=run.dashboards_total,
        items_total=run.items_total,
        items_live=run.items_live,
        items_zombie=run.items_zombie,
        items_orphaned=run.items_orphaned,
        items_duplicate=run.items_duplicate,
        items_unknown_usage=run.items_unknown_usage,
        items_never_referenced=run.items_never_referenced,
        avg_days_since_last_view=run.avg_days_since_last_view,
        duplicate_groups=run.duplicate_groups,
        has_data=True,
        duration_ms=run.duration_ms,
        error=run.error,
    )


@router.get(
    "/orgs/{org_id}/report-sprawl/items",
    response_model=ItemListResponse,
)
async def list_items(
    org_id: str,
    tier: Optional[str] = Query(
        None,
        pattern="^(live|zombie|orphaned|duplicate|unknown_usage)$",
        description="Filter to a single tier.",
    ),
    item_type: Optional[str] = Query(
        None,
        pattern="^(report|dashboard)$",
        description="Filter to reports or dashboards only.",
    ),
    search: Optional[str] = Query(
        None,
        max_length=100,
        description="Case-insensitive substring match on name / folder.",
    ),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    _org: str = Depends(require_org_access),
    db: AsyncSession = Depends(get_database),
) -> ItemListResponse:
    """Per-item list from the most recent run. Ordered by tier
    actionability (orphaned first) then by staleness (oldest first)
    within tier."""
    run = await _latest_run(db, org_id)
    if run is None:
        return ItemListResponse(run_id=None, total=0, items=[])

    conditions = [ReportInventoryItem.run_id == run.id]
    if tier:
        conditions.append(ReportInventoryItem.tier == tier)
    if item_type:
        conditions.append(ReportInventoryItem.item_type == item_type)
    if search:
        needle = f"%{search.lower()}%"
        # Case-insensitive across name + folder_name (either one hits).
        conditions.append(
            or_(
                func.lower(ReportInventoryItem.name).like(needle),
                func.lower(ReportInventoryItem.folder_name).like(needle),
            )
        )

    # Total for pagination display — separate count query is cheaper
    # than pulling all rows into memory.
    total_row = await db.execute(
        select(func.count()).select_from(ReportInventoryItem).where(*conditions)
    )
    total = int(total_row.scalar() or 0)

    rows = list(
        (
            await db.execute(
                select(ReportInventoryItem)
                .where(*conditions)
                .order_by(
                    _TIER_ORDER,
                    desc(
                        ReportInventoryItem.days_since_last_view
                    ).nulls_last(),
                    ReportInventoryItem.name,
                )
                .limit(limit)
                .offset(offset)
            )
        )
        .scalars()
        .all()
    )
    return ItemListResponse(
        run_id=run.id,
        total=total,
        items=[ItemResponse.from_orm(r) for r in rows],
    )


@router.get(
    "/orgs/{org_id}/report-sprawl/history",
    response_model=List[HistoryPoint],
)
async def get_history(
    org_id: str,
    limit: int = Query(30, ge=1, le=100),
    _org: str = Depends(require_org_access),
    db: AsyncSession = Depends(get_database),
) -> List[HistoryPoint]:
    """Trend of run-over-run sprawl counters — powers a sparkline
    strip on the summary card."""
    result = await db.execute(
        select(ReportSprawlRun)
        .where(ReportSprawlRun.organization_id == org_id)
        .order_by(desc(ReportSprawlRun.snapshot_at))
        .limit(limit)
    )
    runs = list(result.scalars().all())
    return [
        HistoryPoint(
            run_id=r.id,
            snapshot_at=r.snapshot_at.isoformat(),
            items_total=r.items_total,
            items_zombie=r.items_zombie,
            items_orphaned=r.items_orphaned,
            items_duplicate=r.items_duplicate,
            items_unknown_usage=r.items_unknown_usage,
        )
        for r in reversed(runs)
    ]
