"""License-to-Persona Fit API routes.

  - POST /orgs/{org_id}/license-fit/run     — kick off analysis
  - GET  /orgs/{org_id}/license-fit/latest  — summary + KPI + savings
  - GET  /orgs/{org_id}/license-fit/items   — paginated per-user
                                              assessments
  - GET  /orgs/{org_id}/license-fit/history — trend over time
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
from app.domain.models import LicenseFitAssessment, LicenseFitRun
from app.services.license_fit import LicenseFitService


logger = logging.getLogger(__name__)
router = APIRouter()


# ---------------------------------------------------------------- responses


class RunResponse(BaseModel):
    run_id: str
    snapshot_at: str
    users_assessed: int
    total_annual_savings_cents: int


class RunSummary(BaseModel):
    run_id: Optional[str]
    snapshot_at: Optional[str]
    users_assessed: int
    users_right_sized: int
    users_overbuilt: int
    users_wrong_cloud: int
    users_underused: int
    users_inactive_billed: int
    users_unknown: int
    total_annual_savings_cents: int
    total_current_annual_cost_cents: int
    has_data: bool
    duration_ms: Optional[int]
    error: Optional[str]
    source_diagnostics: Optional[Dict[str, Any]] = None


class AssessmentResponse(BaseModel):
    id: str
    user_sf_id: str
    user_name: Optional[str] = None
    user_username: Optional[str] = None
    user_is_active: bool
    user_profile_name: Optional[str] = None
    user_department: Optional[str] = None
    user_title: Optional[str] = None
    last_login_at: Optional[str] = None
    days_since_login: Optional[int] = None
    current_license_name: Optional[str] = None
    current_monthly_cost_cents: int
    persona: str
    fit_category: str
    confidence: str
    recommended_license_name: Optional[str] = None
    recommended_monthly_cost_cents: Optional[int] = None
    annual_savings_cents: int
    accounts_owned: int
    opportunities_owned: int
    cases_owned: int
    leads_owned: int
    contacts_owned: int
    evidence: Dict[str, Any] = {}

    @classmethod
    def from_orm(cls, row: LicenseFitAssessment) -> "AssessmentResponse":
        def iso(v):
            return v.isoformat() if v is not None else None

        return cls(
            id=row.id,
            user_sf_id=row.user_sf_id,
            user_name=row.user_name,
            user_username=row.user_username,
            user_is_active=row.user_is_active,
            user_profile_name=row.user_profile_name,
            user_department=row.user_department,
            user_title=row.user_title,
            last_login_at=iso(row.last_login_at),
            days_since_login=row.days_since_login,
            current_license_name=row.current_license_name,
            current_monthly_cost_cents=row.current_monthly_cost_cents,
            persona=row.persona,
            fit_category=row.fit_category,
            confidence=row.confidence,
            recommended_license_name=row.recommended_license_name,
            recommended_monthly_cost_cents=row.recommended_monthly_cost_cents,
            annual_savings_cents=row.annual_savings_cents,
            accounts_owned=row.accounts_owned,
            opportunities_owned=row.opportunities_owned,
            cases_owned=row.cases_owned,
            leads_owned=row.leads_owned,
            contacts_owned=row.contacts_owned,
            evidence=row.evidence or {},
        )


class AssessmentListResponse(BaseModel):
    run_id: Optional[str]
    total: int
    items: List[AssessmentResponse]


class HistoryPoint(BaseModel):
    run_id: str
    snapshot_at: str
    users_assessed: int
    total_annual_savings_cents: int


# ---------------------------------------------------------------- helpers


def _enforce_same_org(org_id: str, current_org_id: str) -> None:
    if org_id != current_org_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot access another org's license-fit data.",
        )


async def _latest_run(
    db: AsyncSession, org_id: str
) -> Optional[LicenseFitRun]:
    result = await db.execute(
        select(LicenseFitRun)
        .where(LicenseFitRun.organization_id == org_id)
        .order_by(desc(LicenseFitRun.snapshot_at))
        .limit(1)
    )
    return result.scalar_one_or_none()


# ---------------------------------------------------------------- endpoints


@router.post(
    "/orgs/{org_id}/license-fit/run",
    response_model=RunResponse,
)
async def run_license_fit(
    org_id: str,
    current_org_id: str = Depends(get_current_org),
    actor_email: str = Depends(get_current_actor_email),
    db: AsyncSession = Depends(get_database),
) -> RunResponse:
    """Kick off a right-sizing analysis. Reads user snapshots +
    profile join + a few aggregate SOQLs (owner counts per key
    SObject). Usually 5-30 seconds."""
    _enforce_same_org(org_id, current_org_id)
    service = LicenseFitService(db, org_id)
    try:
        run = await service.run(actor_email=actor_email)
    except Exception as e:
        logger.exception(
            "License-fit run crashed for org %s", org_id
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "message": "License-fit run failed",
                "error_type": type(e).__name__,
                "error": str(e),
            },
        )
    return RunResponse(
        run_id=run.id,
        snapshot_at=run.snapshot_at.isoformat(),
        users_assessed=run.users_assessed,
        total_annual_savings_cents=run.total_annual_savings_cents,
    )


@router.get(
    "/orgs/{org_id}/license-fit/latest",
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
            users_assessed=0,
            users_right_sized=0,
            users_overbuilt=0,
            users_wrong_cloud=0,
            users_underused=0,
            users_inactive_billed=0,
            users_unknown=0,
            total_annual_savings_cents=0,
            total_current_annual_cost_cents=0,
            has_data=False,
            duration_ms=None,
            error=None,
            source_diagnostics=None,
        )
    return RunSummary(
        run_id=run.id,
        snapshot_at=run.snapshot_at.isoformat(),
        users_assessed=run.users_assessed,
        users_right_sized=run.users_right_sized,
        users_overbuilt=run.users_overbuilt,
        users_wrong_cloud=run.users_wrong_cloud,
        users_underused=run.users_underused,
        users_inactive_billed=run.users_inactive_billed,
        users_unknown=run.users_unknown,
        total_annual_savings_cents=run.total_annual_savings_cents,
        total_current_annual_cost_cents=run.total_current_annual_cost_cents,
        has_data=True,
        duration_ms=run.duration_ms,
        error=run.error,
        source_diagnostics=run.source_diagnostics or None,
    )


@router.get(
    "/orgs/{org_id}/license-fit/items",
    response_model=AssessmentListResponse,
)
async def list_assessments(
    org_id: str,
    fit_category: Optional[str] = Query(
        None,
        pattern=(
            "^(right_sized|overbuilt|wrong_cloud|underused|"
            "inactive_billed|unknown)$"
        ),
        description="Filter to a single fit category.",
    ),
    persona: Optional[str] = Query(
        None,
        pattern=(
            "^(sales|service|marketing|admin|platform|readonly|"
            "community|inactive|unknown)$"
        ),
        description="Filter to a single persona.",
    ),
    search: Optional[str] = Query(
        None,
        max_length=100,
        description="Case-insensitive match on user name / username.",
    ),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    current_org_id: str = Depends(get_current_org),
    db: AsyncSession = Depends(get_database),
) -> AssessmentListResponse:
    """Per-user assessments, sorted by annual savings (highest first)
    so the consultant's list is naturally actionable."""
    _enforce_same_org(org_id, current_org_id)
    run = await _latest_run(db, org_id)
    if run is None:
        return AssessmentListResponse(run_id=None, total=0, items=[])

    conditions = [LicenseFitAssessment.run_id == run.id]
    if fit_category:
        conditions.append(LicenseFitAssessment.fit_category == fit_category)
    if persona:
        conditions.append(LicenseFitAssessment.persona == persona)
    if search:
        from sqlalchemy import func, or_

        needle = f"%{search.lower()}%"
        conditions.append(
            or_(
                func.lower(LicenseFitAssessment.user_name).like(needle),
                func.lower(LicenseFitAssessment.user_username).like(needle),
            )
        )

    from sqlalchemy import func

    total_row = await db.execute(
        select(func.count())
        .select_from(LicenseFitAssessment)
        .where(*conditions)
    )
    total = int(total_row.scalar() or 0)

    rows = list(
        (
            await db.execute(
                select(LicenseFitAssessment)
                .where(*conditions)
                .order_by(
                    desc(LicenseFitAssessment.annual_savings_cents),
                    LicenseFitAssessment.user_name,
                )
                .limit(limit)
                .offset(offset)
            )
        )
        .scalars()
        .all()
    )

    return AssessmentListResponse(
        run_id=run.id,
        total=total,
        items=[AssessmentResponse.from_orm(r) for r in rows],
    )


@router.get(
    "/orgs/{org_id}/license-fit/history",
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
        select(LicenseFitRun)
        .where(LicenseFitRun.organization_id == org_id)
        .order_by(desc(LicenseFitRun.snapshot_at))
        .limit(limit)
    )
    runs = list(result.scalars().all())
    return [
        HistoryPoint(
            run_id=r.id,
            snapshot_at=r.snapshot_at.isoformat(),
            users_assessed=r.users_assessed,
            total_annual_savings_cents=r.total_annual_savings_cents,
        )
        for r in reversed(runs)
    ]
