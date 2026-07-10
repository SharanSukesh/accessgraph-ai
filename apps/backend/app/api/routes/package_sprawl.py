"""Managed-Package Sprawl API routes.

  - POST  /orgs/{org_id}/package-sprawl/run       — kick off pull
  - GET   /orgs/{org_id}/package-sprawl/latest    — summary
  - GET   /orgs/{org_id}/package-sprawl/packages  — per-package list
  - GET   /orgs/{org_id}/package-sprawl/history   — score-over-time
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
from app.domain.models import InstalledPackage, PackageSprawlRun
from app.services.package_sprawl import PackageSprawlService


logger = logging.getLogger(__name__)
router = APIRouter()


# ---------------------------------------------------------------- responses


class RunResponse(BaseModel):
    run_id: str
    snapshot_at: str
    packages_total: int
    packages_unused: int


class RunSummary(BaseModel):
    run_id: Optional[str]
    snapshot_at: Optional[str]
    packages_total: int
    packages_active: int
    packages_underused: int
    packages_unused: int
    avg_utilization_pct: float
    total_licenses_allowed: int
    total_licenses_used: int
    has_data: bool
    duration_ms: Optional[int]
    error: Optional[str]


class PackageResponse(BaseModel):
    id: str
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
    # v2 wiring signals — None means the query failed (permissions / no
    # Tooling access) vs 0 which means we queried and got no rows.
    dependency_count: Optional[int] = None
    record_count_total: Optional[int] = None
    async_job_count: Optional[int] = None
    scheduled_job_count: Optional[int] = None
    utilization_tier: str
    evidence: Dict[str, Any] = {}

    @classmethod
    def from_orm(cls, row: InstalledPackage) -> "PackageResponse":
        return cls(
            id=row.id,
            sf_package_id=row.sf_package_id,
            sf_version_id=row.sf_version_id,
            name=row.name,
            namespace_prefix=row.namespace_prefix,
            description=row.description,
            version_name=row.version_name,
            version_number=row.version_number,
            is_beta=row.is_beta,
            is_deprecated=row.is_deprecated,
            is_managed=row.is_managed,
            apex_class_count=row.apex_class_count,
            flow_count=row.flow_count,
            custom_object_count=row.custom_object_count,
            licenses_allowed=row.licenses_allowed,
            licenses_used=row.licenses_used,
            dependency_count=row.dependency_count,
            record_count_total=row.record_count_total,
            async_job_count=row.async_job_count,
            scheduled_job_count=row.scheduled_job_count,
            utilization_tier=row.utilization_tier,
            evidence=row.evidence or {},
        )


class PackageListResponse(BaseModel):
    run_id: Optional[str]
    packages: List[PackageResponse]


class HistoryPoint(BaseModel):
    run_id: str
    snapshot_at: str
    packages_total: int
    packages_unused: int
    avg_utilization_pct: float


# ---------------------------------------------------------------- helpers


def _enforce_same_org(org_id: str, current_org_id: str) -> None:
    if org_id != current_org_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot access another org's package-sprawl data.",
        )


async def _latest_run(
    db: AsyncSession, org_id: str
) -> Optional[PackageSprawlRun]:
    result = await db.execute(
        select(PackageSprawlRun)
        .where(PackageSprawlRun.organization_id == org_id)
        .order_by(desc(PackageSprawlRun.snapshot_at))
        .limit(1)
    )
    return result.scalar_one_or_none()


# ---------------------------------------------------------------- endpoints


@router.post(
    "/orgs/{org_id}/package-sprawl/run",
    response_model=RunResponse,
)
async def run_package_sprawl(
    org_id: str,
    current_org_id: str = Depends(get_current_org),
    actor_email: str = Depends(get_current_actor_email),
    db: AsyncSession = Depends(get_database),
) -> RunResponse:
    """Kick off a package-sprawl pull synchronously. Typically 5-30
    seconds depending on the number of installed packages."""
    _enforce_same_org(org_id, current_org_id)
    service = PackageSprawlService(db, org_id)
    try:
        run = await service.run(actor_email=actor_email)
    except Exception as e:
        logger.exception("Package-sprawl run crashed for org %s", org_id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "message": "Package-sprawl run failed",
                "error_type": type(e).__name__,
                "error": str(e),
            },
        )
    return RunResponse(
        run_id=run.id,
        snapshot_at=run.snapshot_at.isoformat(),
        packages_total=run.packages_total,
        packages_unused=run.packages_unused,
    )


@router.get(
    "/orgs/{org_id}/package-sprawl/latest",
    response_model=RunSummary,
)
async def get_latest_summary(
    org_id: str,
    current_org_id: str = Depends(get_current_org),
    db: AsyncSession = Depends(get_database),
) -> RunSummary:
    """Headline stats for the last run. Returns has_data=False when
    no run exists so the page can render an empty state."""
    _enforce_same_org(org_id, current_org_id)
    run = await _latest_run(db, org_id)
    if run is None:
        return RunSummary(
            run_id=None,
            snapshot_at=None,
            packages_total=0,
            packages_active=0,
            packages_underused=0,
            packages_unused=0,
            avg_utilization_pct=0.0,
            total_licenses_allowed=0,
            total_licenses_used=0,
            has_data=False,
            duration_ms=None,
            error=None,
        )
    return RunSummary(
        run_id=run.id,
        snapshot_at=run.snapshot_at.isoformat(),
        packages_total=run.packages_total,
        packages_active=run.packages_active,
        packages_underused=run.packages_underused,
        packages_unused=run.packages_unused,
        avg_utilization_pct=round(run.avg_utilization_pct, 1),
        total_licenses_allowed=run.total_licenses_allowed,
        total_licenses_used=run.total_licenses_used,
        has_data=True,
        duration_ms=run.duration_ms,
        error=run.error,
    )


@router.get(
    "/orgs/{org_id}/package-sprawl/packages",
    response_model=PackageListResponse,
)
async def list_packages(
    org_id: str,
    tier: Optional[str] = Query(
        None,
        pattern="^(active|underused|unused)$",
        description="Filter to a single tier.",
    ),
    current_org_id: str = Depends(get_current_org),
    db: AsyncSession = Depends(get_database),
) -> PackageListResponse:
    """Per-package list from the most recent run. Ordered unused-first
    so consultants see the actionable items at the top."""
    _enforce_same_org(org_id, current_org_id)
    run = await _latest_run(db, org_id)
    if run is None:
        return PackageListResponse(run_id=None, packages=[])

    # Custom sort — unused first, then underused, then active. Within
    # tier: alphabetical by name.
    tier_priority = {"unused": 0, "underused": 1, "active": 2}
    conditions = [InstalledPackage.run_id == run.id]
    if tier:
        conditions.append(InstalledPackage.utilization_tier == tier)

    rows = list(
        (await db.execute(
            select(InstalledPackage)
            .where(*conditions)
            .order_by(
                InstalledPackage.utilization_tier,
                InstalledPackage.name,
            )
        )).scalars().all()
    )
    # Python-side re-sort to respect our custom tier priority (SQL
    # ORDER BY on the tier string alphabetises "active" first, which
    # is the wrong end of the actionability spectrum).
    rows.sort(key=lambda r: (tier_priority.get(r.utilization_tier, 99), r.name))

    return PackageListResponse(
        run_id=run.id,
        packages=[PackageResponse.from_orm(r) for r in rows],
    )


@router.get(
    "/orgs/{org_id}/package-sprawl/history",
    response_model=List[HistoryPoint],
)
async def get_history(
    org_id: str,
    limit: int = Query(30, ge=1, le=100),
    current_org_id: str = Depends(get_current_org),
    db: AsyncSession = Depends(get_database),
) -> List[HistoryPoint]:
    """Score-over-time trend."""
    _enforce_same_org(org_id, current_org_id)
    result = await db.execute(
        select(PackageSprawlRun)
        .where(PackageSprawlRun.organization_id == org_id)
        .order_by(desc(PackageSprawlRun.snapshot_at))
        .limit(limit)
    )
    runs = list(result.scalars().all())
    return [
        HistoryPoint(
            run_id=r.id,
            snapshot_at=r.snapshot_at.isoformat(),
            packages_total=r.packages_total,
            packages_unused=r.packages_unused,
            avg_utilization_pct=round(r.avg_utilization_pct, 1),
        )
        for r in reversed(runs)
    ]
