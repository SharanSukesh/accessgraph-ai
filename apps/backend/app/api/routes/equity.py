"""Equity API routes.

Three endpoints surface the RL-driven equity track:
- POST /orgs/{org_id}/equity/recommendations/generate — runs the policy
- GET  /orgs/{org_id}/equity/diagnostic — latest equity snapshot
- GET  /orgs/{org_id}/equity/users/{user_sf_id} — per-user disparity

The list of equity recommendations themselves continues to be served by
GET /orgs/{org_id}/recommendations?rec_type=grant_for_equity (unchanged).
"""
from __future__ import annotations

import logging
import math
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_database
from app.services.equity_diagnostic import EquityDiagnosticService
from app.services.equity_recommendations import (
    DEFAULT_BUDGET,
    EquityRecommendationService,
)


logger = logging.getLogger(__name__)
router = APIRouter()


# ----- Response models -----


class GenerateResponse(BaseModel):
    snapshot_id: str
    recommendations_created: int
    equity_index: float
    disparity: float
    most_disadvantaged_group: Optional[str]
    vip_count: int
    per_dept_utilities: Dict[str, float]
    edge_type_counts: Dict[str, int]


class DiagnosticResponse(BaseModel):
    snapshot_id: Optional[str]
    snapshot_at: Optional[str]
    equity_index: float
    disparity: float
    most_disadvantaged_group: Optional[str]
    vip_count: int
    per_dept_utilities: Dict[str, float]
    edge_type_counts: Dict[str, int]
    recommendations_generated: int
    has_data: bool
    salesforce_instance_url: Optional[str] = None
    # Which tier of the grouping-fallback ladder the equity metric used.
    # Values: 'department' | 'role' | 'profile' | 'unassigned' |
    # 'no_vips' | null (pre-fallback snapshots). The frontend renders
    # a small note explaining the tier + which SF field was used so
    # consultants aren't left wondering why the buckets look odd.
    grouping_key: Optional[str] = None


class HistoryPointResponse(BaseModel):
    snapshot_at: str
    equity_index: float
    disparity: float
    vip_count: int
    recommendations_generated: int


class UserEquityRowResponse(BaseModel):
    user_sf_id: str
    name: str
    department: Optional[str]
    is_vip: bool
    distance_to_nearest_vip: Optional[float]
    inverse_distance_utility: float
    department_avg_utility: float
    open_recommendations: int


class UserDisparityResponse(BaseModel):
    user_sf_id: str
    department: Optional[str]
    distance_to_nearest_vip: Optional[float]  # null when unreachable
    inverse_distance_utility: float
    department_avg_utility: float
    org_avg_utility: float
    is_vip: bool


# ----- Endpoints -----


@router.post(
    "/orgs/{org_id}/equity/recommendations/generate",
    response_model=GenerateResponse,
)
async def generate_equity_recommendations(
    org_id: str,
    budget: int = DEFAULT_BUDGET,
    db: AsyncSession = Depends(get_database),
) -> GenerateResponse:
    if budget < 1 or budget > 200:
        raise HTTPException(status_code=400, detail="budget must be in [1, 200]")
    service = EquityRecommendationService(db, budget=budget)
    try:
        result = await service.generate(org_id)
    except Exception as exc:
        logger.exception("Equity recs generation failed for org %s", org_id)
        raise HTTPException(status_code=500, detail=str(exc))
    return GenerateResponse(**result.__dict__)


@router.get(
    "/orgs/{org_id}/equity/diagnostic",
    response_model=DiagnosticResponse,
)
async def get_equity_diagnostic(
    org_id: str,
    db: AsyncSession = Depends(get_database),
) -> DiagnosticResponse:
    service = EquityDiagnosticService(db)
    payload = await service.latest_diagnostic(org_id)
    return DiagnosticResponse(**payload.__dict__)


@router.get(
    "/orgs/{org_id}/equity/history",
    response_model=List[HistoryPointResponse],
)
async def get_equity_history(
    org_id: str,
    limit: int = Query(30, ge=1, le=200),
    db: AsyncSession = Depends(get_database),
) -> List[HistoryPointResponse]:
    """Equity Index trend across past snapshots (chronological).

    Feeds the sparkline on the Equity dashboard. Default 30 points
    is roughly a month of daily generates; capped at 200.
    """
    service = EquityDiagnosticService(db)
    points = await service.history(org_id, limit=limit)
    return [HistoryPointResponse(**p.__dict__) for p in points]


@router.get(
    "/orgs/{org_id}/equity/users",
    response_model=List[UserEquityRowResponse],
)
async def list_user_equity(
    org_id: str,
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    include_vips: bool = Query(True),
    db: AsyncSession = Depends(get_database),
) -> List[UserEquityRowResponse]:
    """Per-user equity stats for the LWC + admin user list.

    Returns rows sorted with worst-off juniors first; VIPs land at the
    end (or are excluded entirely if include_vips=false). Each row also
    counts the user's open equity recommendations so the LWC can show a
    badge without an additional round-trip.
    """
    service = EquityDiagnosticService(db)
    rows = await service.user_equity_list(
        org_id, limit=limit, offset=offset, include_vips=include_vips,
    )
    out: List[UserEquityRowResponse] = []
    for r in rows:
        dist = r.distance_to_nearest_vip
        if dist is not None and not math.isfinite(dist):
            dist = None
        out.append(UserEquityRowResponse(
            user_sf_id=r.user_sf_id,
            name=r.name,
            department=r.department,
            is_vip=r.is_vip,
            distance_to_nearest_vip=dist,
            inverse_distance_utility=r.inverse_distance_utility,
            department_avg_utility=r.department_avg_utility,
            open_recommendations=r.open_recommendations,
        ))
    return out


@router.get(
    "/orgs/{org_id}/equity/users/{user_sf_id}",
    response_model=UserDisparityResponse,
)
async def get_user_disparity(
    org_id: str,
    user_sf_id: str,
    db: AsyncSession = Depends(get_database),
) -> UserDisparityResponse:
    service = EquityDiagnosticService(db)
    try:
        payload = await service.user_disparity(org_id, user_sf_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    distance: Optional[float] = (
        payload.distance_to_nearest_vip
        if math.isfinite(payload.distance_to_nearest_vip)
        else None
    )
    return UserDisparityResponse(
        user_sf_id=payload.user_sf_id,
        department=payload.department,
        distance_to_nearest_vip=distance,
        inverse_distance_utility=payload.inverse_distance_utility,
        department_avg_utility=payload.department_avg_utility,
        org_avg_utility=payload.org_avg_utility,
        is_vip=payload.is_vip,
    )
