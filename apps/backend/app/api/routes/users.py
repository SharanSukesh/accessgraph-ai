"""
User Access API Routes
"""
import logging
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_database
from app.domain.models import AccessAnomaly, Recommendation, RiskScore, UserSnapshot
from app.services.effective_access import EffectiveAccessService

logger = logging.getLogger(__name__)

router = APIRouter()


# ============================================================================
# Response Models
# ============================================================================


class UserResponse(BaseModel):
    id: str
    salesforce_id: str
    username: str
    name: str
    email: Optional[str]
    department: Optional[str]
    title: Optional[str]
    is_active: bool

    class Config:
        from_attributes = True


class AccessResponse(BaseModel):
    user_id: str
    objects: List[Dict]


class FieldAccessResponse(BaseModel):
    user_id: str
    fields: List[Dict]


class ExplanationResponse(BaseModel):
    user_id: str
    user_name: str
    object: str
    access: Dict
    paths: List[Dict]


class AnomalyResponse(BaseModel):
    id: str
    user_id: str
    anomaly_score: float
    severity: str
    reasons: List[str]
    detected_at: str

    class Config:
        from_attributes = True


class RiskScoreResponse(BaseModel):
    id: str
    entity_id: str
    risk_score: float
    risk_level: str
    reason_text: str

    class Config:
        from_attributes = True


class RecommendationResponse(BaseModel):
    id: str
    rec_type: str
    severity: str
    target_entity_id: str
    title: str
    description: str
    status: str

    class Config:
        from_attributes = True


# ============================================================================
# Endpoints
# ============================================================================


@router.get("/orgs/{org_id}/users", response_model=List[UserResponse])
async def list_users(
    org_id: str,
    is_active: Optional[bool] = None,
    department: Optional[str] = None,
    limit: int = Query(100, le=1000),
    db: AsyncSession = Depends(get_database),
):
    """List users in organization"""
    query = select(UserSnapshot).where(UserSnapshot.organization_id == org_id)

    if is_active is not None:
        query = query.where(UserSnapshot.is_active == is_active)
    if department:
        query = query.where(UserSnapshot.department == department)

    query = query.limit(limit)

    result = await db.execute(query)
    users = result.scalars().all()

    return [
        {
            "id": u.id,
            "salesforce_id": u.salesforce_id,
            "username": u.username,
            "name": u.name,
            "email": u.email,
            "department": u.department,
            "title": u.title,
            "is_active": u.is_active,
        }
        for u in users
    ]


@router.get("/orgs/{org_id}/users/{user_sf_id}", response_model=UserResponse)
async def get_user(
    org_id: str,
    user_sf_id: str,
    db: AsyncSession = Depends(get_database),
):
    """Get user details"""
    result = await db.execute(
        select(UserSnapshot).where(
            UserSnapshot.organization_id == org_id,
            UserSnapshot.salesforce_id == user_sf_id,
        )
    )
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    return {
        "id": user.id,
        "salesforce_id": user.salesforce_id,
        "username": user.username,
        "name": user.name,
        "email": user.email,
        "department": user.department,
        "title": user.title,
        "is_active": user.is_active,
    }


@router.get("/orgs/{org_id}/users/{user_sf_id}/access/objects", response_model=AccessResponse)
async def get_user_object_access(
    org_id: str,
    user_sf_id: str,
    db: AsyncSession = Depends(get_database),
):
    """Get effective object access for user"""
    service = EffectiveAccessService(db)
    try:
        access = await service.get_user_object_access(org_id, user_sf_id)
        return access
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/orgs/{org_id}/users/{user_sf_id}/access/fields", response_model=FieldAccessResponse)
async def get_user_field_access(
    org_id: str,
    user_sf_id: str,
    db: AsyncSession = Depends(get_database),
):
    """Get effective field access for user"""
    service = EffectiveAccessService(db)
    try:
        access = await service.get_user_field_access(org_id, user_sf_id)
        return access
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/orgs/{org_id}/users/{user_sf_id}/explain/object/{object_name}", response_model=ExplanationResponse)
async def explain_object_access(
    org_id: str,
    user_sf_id: str,
    object_name: str,
    db: AsyncSession = Depends(get_database),
):
    """Explain how user gets access to object"""
    service = EffectiveAccessService(db)
    try:
        explanation = await service.explain_user_object_access(org_id, user_sf_id, object_name)
        return explanation
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/orgs/{org_id}/users/{user_sf_id}/risk", response_model=RiskScoreResponse)
async def get_user_risk(
    org_id: str,
    user_sf_id: str,
    db: AsyncSession = Depends(get_database),
):
    """Get risk score for user"""
    result = await db.execute(
        select(RiskScore)
        .where(
            RiskScore.organization_id == org_id,
            RiskScore.entity_type == "user",
            RiskScore.entity_id == user_sf_id,
        )
        .order_by(RiskScore.calculated_at.desc())
        .limit(1)
    )
    risk = result.scalar_one_or_none()

    if not risk:
        raise HTTPException(status_code=404, detail="Risk score not found")

    return {
        "id": risk.id,
        "entity_id": risk.entity_id,
        "risk_score": risk.risk_score,
        "risk_level": risk.risk_level.value,
        "reason_text": risk.reason_text,
    }


@router.get("/orgs/{org_id}/users/{user_sf_id}/recommendations", response_model=List[RecommendationResponse])
async def get_user_recommendations(
    org_id: str,
    user_sf_id: str,
    db: AsyncSession = Depends(get_database),
):
    """Get recommendations for user"""
    result = await db.execute(
        select(Recommendation).where(
            Recommendation.organization_id == org_id,
            Recommendation.target_entity_id == user_sf_id,
        )
    )
    recs = result.scalars().all()

    return [
        {
            "id": r.id,
            "rec_type": r.rec_type.value,
            "severity": r.severity.value,
            "target_entity_id": r.target_entity_id,
            "title": r.title,
            "description": r.description,
            "status": r.status.value,
        }
        for r in recs
    ]


@router.get("/orgs/{org_id}/anomalies", response_model=List[AnomalyResponse])
async def list_anomalies(
    org_id: str,
    severity: Optional[str] = None,
    limit: int = Query(100, le=1000),
    db: AsyncSession = Depends(get_database),
):
    """List anomalies for organization"""
    query = select(AccessAnomaly).where(AccessAnomaly.organization_id == org_id)

    if severity:
        query = query.where(AccessAnomaly.severity == severity)

    query = query.order_by(AccessAnomaly.anomaly_score.desc()).limit(limit)

    result = await db.execute(query)
    anomalies = result.scalars().all()

    return [
        {
            "id": a.id,
            "user_id": a.user_id,
            "anomaly_score": a.anomaly_score,
            "severity": a.severity.value,
            "reasons": a.reasons,
            "detected_at": a.detected_at.isoformat(),
        }
        for a in anomalies
    ]


class TopAnomalousUserResponse(BaseModel):
    userId: str
    userName: str
    userEmail: str
    anomalyScore: float
    severity: str
    topReasons: List[str]
    riskScore: Optional[float] = None

    class Config:
        from_attributes = True


@router.get("/orgs/{org_id}/anomalies/users/top", response_model=List[TopAnomalousUserResponse])
async def get_top_anomalous_users(
    org_id: str,
    limit: int = Query(10, le=100),
    db: AsyncSession = Depends(get_database),
):
    """Get top anomalous users with aggregated metrics"""
    # Query anomalies with user info
    query = (
        select(AccessAnomaly, UserSnapshot)
        .join(UserSnapshot, AccessAnomaly.user_id == UserSnapshot.salesforce_id)
        .where(
            AccessAnomaly.organization_id == org_id,
            UserSnapshot.organization_id == org_id,
        )
        .order_by(AccessAnomaly.anomaly_score.desc())
        .limit(limit)
    )

    result = await db.execute(query)
    rows = result.all()

    return [
        {
            "userId": user.salesforce_id,
            "userName": user.name,
            "userEmail": user.email or "",
            "anomalyScore": anomaly.anomaly_score,
            "severity": anomaly.severity.value,
            "topReasons": anomaly.reasons[:3] if anomaly.reasons else [],
            "riskScore": None,  # Could be joined from RiskScore if needed
        }
        for anomaly, user in rows
    ]


@router.get("/orgs/{org_id}/recommendations", response_model=List[RecommendationResponse])
async def list_recommendations(
    org_id: str,
    rec_type: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = Query(100, le=1000),
    db: AsyncSession = Depends(get_database),
):
    """List recommendations for organization"""
    query = select(Recommendation).where(Recommendation.organization_id == org_id)

    if rec_type:
        query = query.where(Recommendation.rec_type == rec_type)
    if status:
        query = query.where(Recommendation.status == status)

    query = query.order_by(Recommendation.generated_at.desc()).limit(limit)

    result = await db.execute(query)
    recs = result.scalars().all()

    return [
        {
            "id": r.id,
            "rec_type": r.rec_type.value,
            "severity": r.severity.value,
            "target_entity_id": r.target_entity_id,
            "title": r.title,
            "description": r.description,
            "status": r.status.value,
        }
        for r in recs
    ]
