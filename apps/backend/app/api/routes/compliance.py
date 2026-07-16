"""Compliance Scorecard API routes (Roadmap #8).

  - GET  /orgs/{org_id}/compliance/frameworks       — list frameworks + counts
  - POST /orgs/{org_id}/compliance/{framework}/run  — run & persist scorecard
  - GET  /orgs/{org_id}/compliance/{framework}/latest — latest run + results
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_database
from app.auth.deps import get_current_actor_email
from app.services.compliance_scorecard import (
    ComplianceScorecardService,
    FRAMEWORK_LABELS,
)


logger = logging.getLogger(__name__)
router = APIRouter()


# ---------------------------------------------------------------- responses


class FrameworkInfo(BaseModel):
    framework: str
    label: str
    control_count: int


class ControlResultOut(BaseModel):
    control_id: str
    name: str
    section: str
    description: str
    status: str  # passed | failed | not_applicable
    passed: bool
    metric: str
    metric_value: float
    evidence: List[str]
    recommendation: str
    deep_link: Optional[str]


class ScorecardRunOut(BaseModel):
    run_id: Optional[str]
    framework: str
    label: str
    snapshot_at: Optional[str]
    duration_ms: Optional[int]
    controls_total: int
    controls_passed: int
    controls_failed: int
    controls_not_applicable: int
    score_pct: float
    results: List[ControlResultOut]
    has_data: bool


# ---------------------------------------------------------------- endpoints


@router.get(
    "/orgs/{org_id}/compliance/frameworks",
    response_model=List[FrameworkInfo],
)
async def list_frameworks(
    org_id: str,
    db: AsyncSession = Depends(get_database),
) -> List[FrameworkInfo]:
    """Static list of frameworks Newton scores + how many controls each has.

    Cheap — reads the in-memory rule library, no DB IO.
    """
    service = ComplianceScorecardService(db, org_id)
    rows = service.list_frameworks()
    return [FrameworkInfo(**r) for r in rows]


@router.post(
    "/orgs/{org_id}/compliance/{framework}/run",
    response_model=ScorecardRunOut,
    status_code=status.HTTP_200_OK,
)
async def run_scorecard(
    org_id: str,
    framework: str,
    db: AsyncSession = Depends(get_database),
    actor_email: Optional[str] = Depends(get_current_actor_email),
) -> ScorecardRunOut:
    """Run every control in `framework` against the org and persist a
    ComplianceScorecardRun. Returns the full per-control payload so the
    frontend can render immediately without a second fetch.
    """
    service = ComplianceScorecardService(db, org_id)
    try:
        run = await service.run(framework, actor_email=actor_email)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:  # noqa: BLE001
        logger.exception("compliance scorecard run failed")
        raise HTTPException(status_code=500, detail=str(exc))

    return ScorecardRunOut(
        run_id=run.id,
        framework=run.framework,
        label=FRAMEWORK_LABELS.get(run.framework, run.framework),
        snapshot_at=run.snapshot_at.isoformat() if run.snapshot_at else None,
        duration_ms=run.duration_ms,
        controls_total=run.controls_total,
        controls_passed=run.controls_passed,
        controls_failed=run.controls_failed,
        controls_not_applicable=run.controls_not_applicable,
        score_pct=run.score_pct,
        results=[ControlResultOut(**r) for r in run.results],
        has_data=True,
    )


@router.get(
    "/orgs/{org_id}/compliance/{framework}/latest",
    response_model=ScorecardRunOut,
)
async def latest_scorecard(
    org_id: str,
    framework: str,
    db: AsyncSession = Depends(get_database),
) -> ScorecardRunOut:
    """Latest persisted scorecard for a framework. Returns an empty
    ScorecardRunOut with has_data=False if the org has never run this
    framework — lets the frontend show a run-first empty state without
    a 404 loop.
    """
    framework = framework.upper()
    if framework not in FRAMEWORK_LABELS:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown framework {framework!r}",
        )
    service = ComplianceScorecardService(db, org_id)
    run = await service.latest(framework)
    if run is None:
        return ScorecardRunOut(
            run_id=None,
            framework=framework,
            label=FRAMEWORK_LABELS[framework],
            snapshot_at=None,
            duration_ms=None,
            controls_total=0,
            controls_passed=0,
            controls_failed=0,
            controls_not_applicable=0,
            score_pct=0.0,
            results=[],
            has_data=False,
        )
    return ScorecardRunOut(
        run_id=run.id,
        framework=run.framework,
        label=FRAMEWORK_LABELS.get(run.framework, run.framework),
        snapshot_at=run.snapshot_at.isoformat() if run.snapshot_at else None,
        duration_ms=run.duration_ms,
        controls_total=run.controls_total,
        controls_passed=run.controls_passed,
        controls_failed=run.controls_failed,
        controls_not_applicable=run.controls_not_applicable,
        score_pct=run.score_pct,
        results=[ControlResultOut(**r) for r in run.results],
        has_data=True,
    )
