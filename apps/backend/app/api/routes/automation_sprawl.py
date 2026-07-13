"""Automation Sprawl API routes.

  - POST /orgs/{org_id}/automation-sprawl/run     — kick off pull
  - GET  /orgs/{org_id}/automation-sprawl/latest  — summary
  - GET  /orgs/{org_id}/automation-sprawl/items   — per-item list
  - GET  /orgs/{org_id}/automation-sprawl/history — trend over time
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
from app.domain.models import AutomationInventoryItem, AutomationSprawlRun
from app.services.automation_sprawl import AutomationSprawlService


logger = logging.getLogger(__name__)
router = APIRouter()


# ---------------------------------------------------------------- responses


class RunResponse(BaseModel):
    run_id: str
    snapshot_at: str
    items_total: int
    items_broken: int
    items_orphaned: int
    items_dormant: int


class RunSummary(BaseModel):
    run_id: Optional[str]
    snapshot_at: Optional[str]
    flows_total: int
    triggers_total: int
    items_total: int
    items_active: int
    items_dormant: int
    items_orphaned: int
    items_broken: int
    avg_days_since_modified: Optional[int]
    duplicate_groups: int
    has_data: bool
    duration_ms: Optional[int]
    error: Optional[str]


class ItemResponse(BaseModel):
    id: str
    sf_id: str
    item_type: str
    name: str
    api_name: Optional[str] = None
    description: Optional[str] = None
    namespace_prefix: Optional[str] = None
    process_type: Optional[str] = None
    trigger_type: Optional[str] = None
    target_object: Optional[str] = None
    api_version: Optional[str] = None
    length_without_comments: Optional[int] = None
    is_active: Optional[bool] = None
    is_valid: Optional[bool] = None
    owner_sf_id: Optional[str] = None
    owner_name: Optional[str] = None
    owner_is_active: Optional[bool] = None
    last_modified_at: Optional[str] = None
    days_since_modified: Optional[int] = None
    tier: str
    duplicate_group_key: Optional[str] = None
    evidence: Dict[str, Any] = {}

    @classmethod
    def from_orm(cls, row: AutomationInventoryItem) -> "ItemResponse":
        def iso(v):
            return v.isoformat() if v is not None else None

        return cls(
            id=row.id,
            sf_id=row.sf_id,
            item_type=row.item_type,
            name=row.name,
            api_name=row.api_name,
            description=row.description,
            namespace_prefix=row.namespace_prefix,
            process_type=row.process_type,
            trigger_type=row.trigger_type,
            target_object=row.target_object,
            api_version=row.api_version,
            length_without_comments=row.length_without_comments,
            is_active=row.is_active,
            is_valid=row.is_valid,
            owner_sf_id=row.owner_sf_id,
            owner_name=row.owner_name,
            owner_is_active=row.owner_is_active,
            last_modified_at=iso(row.last_modified_at),
            days_since_modified=row.days_since_modified,
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
    items_broken: int
    items_orphaned: int
    items_dormant: int


# ---------------------------------------------------------------- helpers


def _enforce_same_org(org_id: str, current_org_id: str) -> None:
    if org_id != current_org_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot access another org's automation-sprawl data.",
        )


async def _latest_run(
    db: AsyncSession, org_id: str
) -> Optional[AutomationSprawlRun]:
    result = await db.execute(
        select(AutomationSprawlRun)
        .where(AutomationSprawlRun.organization_id == org_id)
        .order_by(desc(AutomationSprawlRun.snapshot_at))
        .limit(1)
    )
    return result.scalar_one_or_none()


# ---------------------------------------------------------------- endpoints


@router.post(
    "/orgs/{org_id}/automation-sprawl/run",
    response_model=RunResponse,
)
async def run_automation_sprawl(
    org_id: str,
    current_org_id: str = Depends(get_current_org),
    actor_email: str = Depends(get_current_actor_email),
    db: AsyncSession = Depends(get_database),
) -> RunResponse:
    """Kick off an automation sprawl pull. Two Tooling API queries
    (FlowDefinitionView + ApexTrigger), so typically 5-15 seconds
    even on large orgs."""
    _enforce_same_org(org_id, current_org_id)
    service = AutomationSprawlService(db, org_id)
    try:
        run = await service.run(actor_email=actor_email)
    except Exception as e:
        logger.exception(
            "Automation-sprawl run crashed for org %s", org_id
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "message": "Automation-sprawl run failed",
                "error_type": type(e).__name__,
                "error": str(e),
            },
        )
    return RunResponse(
        run_id=run.id,
        snapshot_at=run.snapshot_at.isoformat(),
        items_total=run.items_total,
        items_broken=run.items_broken,
        items_orphaned=run.items_orphaned,
        items_dormant=run.items_dormant,
    )


@router.get(
    "/orgs/{org_id}/automation-sprawl/latest",
    response_model=RunSummary,
)
async def get_latest_summary(
    org_id: str,
    current_org_id: str = Depends(get_current_org),
    db: AsyncSession = Depends(get_database),
) -> RunSummary:
    """KPI + tier rollup. has_data=False when no run has ever run
    for this org so the frontend can render an empty state."""
    _enforce_same_org(org_id, current_org_id)
    run = await _latest_run(db, org_id)
    if run is None:
        return RunSummary(
            run_id=None,
            snapshot_at=None,
            flows_total=0,
            triggers_total=0,
            items_total=0,
            items_active=0,
            items_dormant=0,
            items_orphaned=0,
            items_broken=0,
            avg_days_since_modified=None,
            duplicate_groups=0,
            has_data=False,
            duration_ms=None,
            error=None,
        )
    return RunSummary(
        run_id=run.id,
        snapshot_at=run.snapshot_at.isoformat(),
        flows_total=run.flows_total,
        triggers_total=run.triggers_total,
        items_total=run.items_total,
        items_active=run.items_active,
        items_dormant=run.items_dormant,
        items_orphaned=run.items_orphaned,
        items_broken=run.items_broken,
        avg_days_since_modified=run.avg_days_since_modified,
        duplicate_groups=run.duplicate_groups,
        has_data=True,
        duration_ms=run.duration_ms,
        error=run.error,
    )


@router.get(
    "/orgs/{org_id}/automation-sprawl/items",
    response_model=ItemListResponse,
)
async def list_items(
    org_id: str,
    tier: Optional[str] = Query(
        None,
        pattern="^(active|dormant|orphaned|broken)$",
        description="Filter to a single tier.",
    ),
    item_type: Optional[str] = Query(
        None,
        pattern="^(flow|trigger)$",
        description="Filter to flows or triggers only.",
    ),
    search: Optional[str] = Query(
        None,
        max_length=100,
        description="Case-insensitive substring match on name / api_name.",
    ),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    current_org_id: str = Depends(get_current_org),
    db: AsyncSession = Depends(get_database),
) -> ItemListResponse:
    """Per-item list from the latest run. Ordered by tier
    actionability (broken first) then by staleness within tier."""
    _enforce_same_org(org_id, current_org_id)
    run = await _latest_run(db, org_id)
    if run is None:
        return ItemListResponse(run_id=None, total=0, items=[])

    conditions = [AutomationInventoryItem.run_id == run.id]
    if tier:
        conditions.append(AutomationInventoryItem.tier == tier)
    if item_type:
        conditions.append(AutomationInventoryItem.item_type == item_type)
    if search:
        from sqlalchemy import func, or_

        needle = f"%{search.lower()}%"
        conditions.append(
            or_(
                func.lower(AutomationInventoryItem.name).like(needle),
                func.lower(AutomationInventoryItem.api_name).like(needle),
            )
        )

    from sqlalchemy import func

    total_row = await db.execute(
        select(func.count())
        .select_from(AutomationInventoryItem)
        .where(*conditions)
    )
    total = int(total_row.scalar() or 0)

    rows = list(
        (
            await db.execute(
                select(AutomationInventoryItem)
                .where(*conditions)
                .order_by(
                    AutomationInventoryItem.tier,
                    desc(AutomationInventoryItem.days_since_modified),
                    AutomationInventoryItem.name,
                )
                .limit(limit)
                .offset(offset)
            )
        )
        .scalars()
        .all()
    )
    # Python-side re-sort so `broken` lands first (SQL alphabetises).
    tier_priority = {
        "broken": 0,
        "orphaned": 1,
        "dormant": 2,
        "active": 3,
    }
    rows.sort(
        key=lambda r: (
            tier_priority.get(r.tier, 99),
            -(r.days_since_modified or 0),
            r.name.lower(),
        )
    )

    return ItemListResponse(
        run_id=run.id,
        total=total,
        items=[ItemResponse.from_orm(r) for r in rows],
    )


@router.get(
    "/orgs/{org_id}/automation-sprawl/history",
    response_model=List[HistoryPoint],
)
async def get_history(
    org_id: str,
    limit: int = Query(30, ge=1, le=100),
    current_org_id: str = Depends(get_current_org),
    db: AsyncSession = Depends(get_database),
) -> List[HistoryPoint]:
    _enforce_same_org(org_id, current_org_id)
    result = await db.execute(
        select(AutomationSprawlRun)
        .where(AutomationSprawlRun.organization_id == org_id)
        .order_by(desc(AutomationSprawlRun.snapshot_at))
        .limit(limit)
    )
    runs = list(result.scalars().all())
    return [
        HistoryPoint(
            run_id=r.id,
            snapshot_at=r.snapshot_at.isoformat(),
            items_total=r.items_total,
            items_broken=r.items_broken,
            items_orphaned=r.items_orphaned,
            items_dormant=r.items_dormant,
        )
        for r in reversed(runs)
    ]
