"""Integration Sprawl API routes.

  - POST /orgs/{org_id}/integration-sprawl/run     — kick off pull
  - GET  /orgs/{org_id}/integration-sprawl/latest  — summary
  - GET  /orgs/{org_id}/integration-sprawl/items   — per-item list
  - GET  /orgs/{org_id}/integration-sprawl/history — trend over time
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
from app.domain.models import (
    IntegrationInventoryItem,
    IntegrationSprawlRun,
)
from app.services.integration_sprawl import IntegrationSprawlService


logger = logging.getLogger(__name__)
router = APIRouter()


# ---------------------------------------------------------------- responses


class RunResponse(BaseModel):
    run_id: str
    snapshot_at: str
    items_total: int
    items_broken: int
    items_stale: int


class RunSummary(BaseModel):
    run_id: Optional[str]
    snapshot_at: Optional[str]
    connected_apps_total: int
    named_credentials_total: int
    external_data_sources_total: int
    auth_providers_total: int
    remote_sites_total: int
    items_total: int
    items_healthy: int
    items_stale: int
    items_broken: int
    items_unknown: int
    logins_180d: int
    failed_logins_180d: int
    has_data: bool
    duration_ms: Optional[int]
    error: Optional[str]
    source_diagnostics: Optional[Dict[str, Any]] = None


class ItemResponse(BaseModel):
    id: str
    sf_id: str
    integration_type: str
    direction: str
    name: str
    developer_name: Optional[str] = None
    endpoint: Optional[str] = None
    namespace_prefix: Optional[str] = None
    is_active: Optional[bool] = None
    login_count_180d: Optional[int] = None
    failed_login_count_180d: Optional[int] = None
    last_used_at: Optional[str] = None
    tier: str
    evidence: Dict[str, Any] = {}

    @classmethod
    def from_orm(
        cls, row: IntegrationInventoryItem
    ) -> "ItemResponse":
        return cls(
            id=row.id,
            sf_id=row.sf_id,
            integration_type=row.integration_type,
            direction=row.direction,
            name=row.name,
            developer_name=row.developer_name,
            endpoint=row.endpoint,
            namespace_prefix=row.namespace_prefix,
            is_active=row.is_active,
            login_count_180d=row.login_count_180d,
            failed_login_count_180d=row.failed_login_count_180d,
            last_used_at=(
                row.last_used_at.isoformat() if row.last_used_at else None
            ),
            tier=row.tier,
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
    items_stale: int


# ---------------------------------------------------------------- helpers


def _enforce_same_org(org_id: str, current_org_id: str) -> None:
    if org_id != current_org_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Cannot access another org's integration-sprawl data."
            ),
        )


async def _latest_run(
    db: AsyncSession, org_id: str
) -> Optional[IntegrationSprawlRun]:
    result = await db.execute(
        select(IntegrationSprawlRun)
        .where(IntegrationSprawlRun.organization_id == org_id)
        .order_by(desc(IntegrationSprawlRun.snapshot_at))
        .limit(1)
    )
    return result.scalar_one_or_none()


# ---------------------------------------------------------------- endpoints


@router.post(
    "/orgs/{org_id}/integration-sprawl/run",
    response_model=RunResponse,
)
async def run_integration_sprawl(
    org_id: str,
    current_org_id: str = Depends(get_current_org),
    actor_email: str = Depends(get_current_actor_email),
    db: AsyncSession = Depends(get_database),
) -> RunResponse:
    """Kick off an integration sprawl pull. 5 Salesforce SObjects +
    a 180-day LoginHistory slice — usually 5-15 seconds even on
    large orgs."""
    _enforce_same_org(org_id, current_org_id)
    service = IntegrationSprawlService(db, org_id)
    try:
        run = await service.run(actor_email=actor_email)
    except Exception as e:
        logger.exception(
            "Integration-sprawl run crashed for org %s", org_id
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "message": "Integration-sprawl run failed",
                "error_type": type(e).__name__,
                "error": str(e),
            },
        )
    return RunResponse(
        run_id=run.id,
        snapshot_at=run.snapshot_at.isoformat(),
        items_total=run.items_total,
        items_broken=run.items_broken,
        items_stale=run.items_stale,
    )


@router.get(
    "/orgs/{org_id}/integration-sprawl/latest",
    response_model=RunSummary,
)
async def get_latest_summary(
    org_id: str,
    current_org_id: str = Depends(get_current_org),
    db: AsyncSession = Depends(get_database),
) -> RunSummary:
    _enforce_same_org(org_id, current_org_id)
    run = await _latest_run(db, org_id)
    if run is None:
        return RunSummary(
            run_id=None,
            snapshot_at=None,
            connected_apps_total=0,
            named_credentials_total=0,
            external_data_sources_total=0,
            auth_providers_total=0,
            remote_sites_total=0,
            items_total=0,
            items_healthy=0,
            items_stale=0,
            items_broken=0,
            items_unknown=0,
            logins_180d=0,
            failed_logins_180d=0,
            has_data=False,
            duration_ms=None,
            error=None,
            source_diagnostics=None,
        )
    return RunSummary(
        run_id=run.id,
        snapshot_at=run.snapshot_at.isoformat(),
        connected_apps_total=run.connected_apps_total,
        named_credentials_total=run.named_credentials_total,
        external_data_sources_total=run.external_data_sources_total,
        auth_providers_total=run.auth_providers_total,
        remote_sites_total=run.remote_sites_total,
        items_total=run.items_total,
        items_healthy=run.items_healthy,
        items_stale=run.items_stale,
        items_broken=run.items_broken,
        items_unknown=run.items_unknown,
        logins_180d=run.logins_180d,
        failed_logins_180d=run.failed_logins_180d,
        has_data=True,
        duration_ms=run.duration_ms,
        error=run.error,
        source_diagnostics=run.source_diagnostics or None,
    )


@router.get(
    "/orgs/{org_id}/integration-sprawl/items",
    response_model=ItemListResponse,
)
async def list_items(
    org_id: str,
    tier: Optional[str] = Query(
        None,
        pattern="^(healthy|stale|broken|unknown)$",
        description="Filter to a single tier.",
    ),
    integration_type: Optional[str] = Query(
        None,
        pattern=(
            "^(connected_app|named_credential|external_data_source|"
            "auth_provider|remote_site)$"
        ),
        description="Filter to a single integration type.",
    ),
    search: Optional[str] = Query(
        None,
        max_length=100,
        description="Case-insensitive match on name / developer_name.",
    ),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    current_org_id: str = Depends(get_current_org),
    db: AsyncSession = Depends(get_database),
) -> ItemListResponse:
    """Per-item list from the latest run. Ordered by tier (broken →
    stale → healthy → unknown) then by type + name within tier."""
    _enforce_same_org(org_id, current_org_id)
    run = await _latest_run(db, org_id)
    if run is None:
        return ItemListResponse(run_id=None, total=0, items=[])

    conditions = [IntegrationInventoryItem.run_id == run.id]
    if tier:
        conditions.append(IntegrationInventoryItem.tier == tier)
    if integration_type:
        conditions.append(
            IntegrationInventoryItem.integration_type
            == integration_type
        )
    if search:
        from sqlalchemy import func, or_

        needle = f"%{search.lower()}%"
        conditions.append(
            or_(
                func.lower(IntegrationInventoryItem.name).like(needle),
                func.lower(
                    IntegrationInventoryItem.developer_name
                ).like(needle),
            )
        )

    from sqlalchemy import func

    total_row = await db.execute(
        select(func.count())
        .select_from(IntegrationInventoryItem)
        .where(*conditions)
    )
    total = int(total_row.scalar() or 0)

    rows = list(
        (
            await db.execute(
                select(IntegrationInventoryItem)
                .where(*conditions)
                .order_by(
                    IntegrationInventoryItem.tier,
                    IntegrationInventoryItem.integration_type,
                    IntegrationInventoryItem.name,
                )
                .limit(limit)
                .offset(offset)
            )
        )
        .scalars()
        .all()
    )
    # Python-side re-sort: SQL alphabetises tiers wrong for our
    # actionability precedence.
    tier_priority = {
        "broken": 0,
        "stale": 1,
        "healthy": 2,
        "unknown": 3,
    }
    rows.sort(
        key=lambda r: (
            tier_priority.get(r.tier, 99),
            r.integration_type,
            r.name.lower(),
        )
    )

    return ItemListResponse(
        run_id=run.id,
        total=total,
        items=[ItemResponse.from_orm(r) for r in rows],
    )


@router.get(
    "/orgs/{org_id}/integration-sprawl/history",
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
        select(IntegrationSprawlRun)
        .where(IntegrationSprawlRun.organization_id == org_id)
        .order_by(desc(IntegrationSprawlRun.snapshot_at))
        .limit(limit)
    )
    runs = list(result.scalars().all())
    return [
        HistoryPoint(
            run_id=r.id,
            snapshot_at=r.snapshot_at.isoformat(),
            items_total=r.items_total,
            items_broken=r.items_broken,
            items_stale=r.items_stale,
        )
        for r in reversed(runs)
    ]
