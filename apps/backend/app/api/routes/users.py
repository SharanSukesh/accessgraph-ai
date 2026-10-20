"""
User Access API Routes
"""
import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Cookie, Depends, Header, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_database
from app.api.pagination import PageParams, page_params, paged
from app.auth.deps import PACKAGE_KEY_HEADER, authorize_org, require_credentials
from app.services.grant_sources import resolve_grant_sources
from app.services.schema_metadata import field as schema_field
from app.services.schema_metadata import field_details, field_payload, latest_schema
from app.services import privacy_mode
from app.services.risk_scoring import base_risk, classify_sensitive_field, classify_sensitive_object, latest_user_risks
from app.domain.models import AccessAnomaly, Recommendation, RiskScore, UserSnapshot
from app.services.effective_access import EffectiveAccessService

logger = logging.getLogger(__name__)

def _object_sensitivity(object_name: str) -> Dict[str, object]:
    """Same definition of sensitive as the risk score, so the Schema pages
    and user risk drivers never disagree."""
    match = classify_sensitive_object(object_name)
    return {"isSensitive": match is not None, "sensitivity": match[0] if match else None}


def _field_sensitivity(field_name: str) -> Dict[str, object]:
    match = classify_sensitive_field(field_name.split(".")[-1])
    return {"isSensitive": match is not None, "sensitivity": match[0] if match else None}


# Every route on `router` is under /orgs/{org_id}; main.py guards it with
# require_org_access. Routes without an org in the path go on
# `recommendations_router` and authorize themselves.
router = APIRouter()
recommendations_router = APIRouter()


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
    userId: Optional[str] = None
    user_id: Optional[str] = None
    userName: Optional[str] = None
    user_name: Optional[str] = None
    score: Optional[float] = None
    anomaly_score: Optional[float] = None
    # Session anomalies only: access anomalies are described by rank,
    # strongest reason and the user's risk level instead.
    severity: Optional[str] = None
    reasons: List[str]
    detectedAt: Optional[str] = None
    detected_at: Optional[str] = None

    class Config:
        from_attributes = True
        extra = "allow"  # Allow extra fields


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
    track: str  # 'security' or 'equity' — drives UI grouping
    severity: str
    target_entity_id: str
    title: str
    description: str
    rationale: Optional[str] = None
    status: str
    affected_access: Optional[dict] = None  # carries ps_id / user_id for SF deep-link

    class Config:
        from_attributes = True


class RecommendationStatusUpdate(BaseModel):
    """PATCH body for updating a recommendation's status."""
    status: str  # must be one of RecommendationStatus enum values


# ============================================================================
# Endpoints
# ============================================================================


RISK_LEVEL_ORDER = {"critical": 0, "high": 1, "medium": 2, "low": 3}


@router.get("/orgs/{org_id}/users")
async def list_users(
    org_id: str,
    is_active: Optional[bool] = None,
    department: Optional[str] = None,
    search: Optional[str] = None,
    riskLevel: Optional[str] = Query(None, description="critical | high | medium | low"),
    status: Optional[str] = Query(None, pattern="^(active|inactive)$"),
    limit: Optional[int] = Query(None, ge=1, description="without `page`: at most this many rows (default every row)"),
    params: PageParams = Depends(page_params),
    db: AsyncSession = Depends(get_database),
):
    """Users, highest risk first by default (`sort`: risk, name, profile,
    role, status, last_login; `dir`). With `page`: one page, search (`q` or
    `search`) and filters over every user, and `summary` counts for the whole
    org. Without it: every matching user (exports), as before.

    Profiles, roles and each user's latest risk score are loaded in bulk
    rather than per user.
    """
    from app.domain.models import ProfileSnapshot, RoleSnapshot, RiskScore

    query = select(UserSnapshot).where(UserSnapshot.organization_id == org_id)
    if is_active is not None:
        query = query.where(UserSnapshot.is_active == is_active)
    if department:
        query = query.where(UserSnapshot.department == department)
    search = search or params.q
    if status:
        query = query.where(UserSnapshot.is_active == (status == "active"))
    if search and search.strip():
        needle = f"%{search.strip().lower()}%"
        query = query.where(or_(
            func.lower(UserSnapshot.name).like(needle),
            func.lower(UserSnapshot.username).like(needle),
            func.lower(UserSnapshot.email).like(needle),
        ))
    users = (await db.execute(query)).scalars().all()

    profiles = dict((await db.execute(
        select(ProfileSnapshot.salesforce_id, ProfileSnapshot.name)
        .where(ProfileSnapshot.organization_id == org_id)
    )).all())
    roles = dict((await db.execute(
        select(RoleSnapshot.salesforce_id, RoleSnapshot.name)
        .where(RoleSnapshot.organization_id == org_id)
    )).all())
    latest = (
        select(RiskScore.entity_id, func.max(RiskScore.calculated_at).label("at"))
        .where(RiskScore.organization_id == org_id, RiskScore.entity_type == "user")
        .group_by(RiskScore.entity_id)
        .subquery()
    )
    risks = {
        r.entity_id: r
        for r in (await db.execute(
            select(RiskScore).join(
                latest,
                (RiskScore.entity_id == latest.c.entity_id) & (RiskScore.calculated_at == latest.c.at),
            ).where(RiskScore.organization_id == org_id, RiskScore.entity_type == "user")
        )).scalars().all()
    }

    user_list = []
    for u in users:
        risk = risks.get(u.salesforce_id)
        risk_level = risk.risk_level.value if risk else None
        if riskLevel and risk_level != riskLevel.lower():
            continue
        user_list.append({
            "id": u.id,
            "salesforceUserId": u.salesforce_id,
            "salesforce_id": u.salesforce_id,
            "username": u.username,
            "name": u.name,
            "email": u.email,
            "department": u.department,
            "title": u.title,
            "isActive": u.is_active,
            "is_active": u.is_active,
            "role": roles.get(u.user_role_id) if u.user_role_id else None,
            "profile": profiles.get(u.profile_id) if u.profile_id else None,
            "risk": risk_level,
            "riskLevel": risk_level,
            "riskScore": round(risk.risk_score, 1) if risk else None,
            "lastLoginDate": u.last_login_at.isoformat() if u.last_login_at else None,
        })

    def by_risk(rows: List[Dict]) -> List[Dict]:
        # Highest risk first; unscored users last; ties by name.
        return sorted(rows, key=lambda r: (r["riskScore"] is None, -(r["riskScore"] or 0), (r["name"] or "").lower()))

    if not params.paged:
        rows = sorted(user_list, key=lambda r: (r["name"] or "").lower()) if params.sort == "name" else by_risk(user_list)
        return rows[:limit] if limit else rows

    # Counts for the whole org (not just this page or filter): the dashboard and the cards use them.
    everyone = (await db.execute(select(UserSnapshot.salesforce_id, UserSnapshot.is_active).where(
        UserSnapshot.organization_id == org_id))).all()
    levels: Dict[str, int] = {}
    for sid, _active in everyone:
        lvl = risks[sid].risk_level.value if sid in risks else "unscored"
        levels[lvl] = levels.get(lvl, 0) + 1
    summary = {"users": len(everyone), "active": sum(1 for _, a in everyone if a), "byRisk": levels}
    if params.sort in (None, "risk"):
        rows = by_risk(user_list)
        if params.dir == "asc" and params.sort == "risk":
            rows = list(reversed(rows))
        from app.api.pagination import envelope
        total = len(rows)
        pages = max(1, -(-total // params.page_size))
        page = min(params.page or 1, pages)
        start = (page - 1) * params.page_size
        return envelope(rows[start:start + params.page_size], total, params, "risk", summary=summary)
    return paged(user_list, params,
                 sorts={"name": lambda r: r["name"], "profile": lambda r: r["profile"], "role": lambda r: r["role"],
                        "status": lambda r: r["isActive"], "last_login": lambda r: r["lastLoginDate"],
                        "department": lambda r: r["department"]},
                 default_sort="name", summary=summary)


@router.get("/orgs/{org_id}/users/{user_sf_id}")
async def get_user(
    org_id: str,
    user_sf_id: str,
    db: AsyncSession = Depends(get_database),
):
    """Get user details"""
    from app.domain.models import ProfileSnapshot, RoleSnapshot, RiskScore

    result = await db.execute(
        select(UserSnapshot).where(
            UserSnapshot.organization_id == org_id,
            UserSnapshot.salesforce_id == user_sf_id,
        )
    )
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Get profile name
    profile_name = None
    if user.profile_id:
        profile_query = select(ProfileSnapshot).where(
            ProfileSnapshot.organization_id == org_id,
            ProfileSnapshot.salesforce_id == user.profile_id
        )
        profile_result = await db.execute(profile_query)
        profile = profile_result.scalar_one_or_none()
        if profile:
            profile_name = profile.name

    # Get role name
    role_name = None
    if user.user_role_id:
        role_query = select(RoleSnapshot).where(
            RoleSnapshot.organization_id == org_id,
            RoleSnapshot.salesforce_id == user.user_role_id
        )
        role_result = await db.execute(role_query)
        role = role_result.scalar_one_or_none()
        if role:
            role_name = role.name

    # Get risk level
    risk_level = None
    risk_query = select(RiskScore).where(
        RiskScore.organization_id == org_id,
        RiskScore.entity_type == "user",
        RiskScore.entity_id == user.salesforce_id
    ).order_by(RiskScore.calculated_at.desc()).limit(1)
    risk_result = await db.execute(risk_query)
    risk = risk_result.scalar_one_or_none()
    if risk:
        risk_level = risk.risk_level.value

    return {
        "id": user.id,
        "salesforceUserId": user.salesforce_id,
        "salesforce_id": user.salesforce_id,
        "username": user.username,
        "name": user.name,
        "email": user.email,
        "department": user.department,
        "title": user.title,
        "isActive": user.is_active,
        "is_active": user.is_active,
        "role": role_name,
        "profile": profile_name,
        "profileId": user.profile_id,
        "riskLevel": risk_level,
        "lastLoginDate": user.last_login_at.isoformat() if user.last_login_at else None,
    }


def _object_access_rows(access: Dict) -> List[Dict]:
    return [{**o, **_object_sensitivity(o["objectName"])} for o in access.get("objects", [])]


def _field_access_rows(access: Dict) -> List[Dict]:
    return [{**f, **_field_sensitivity(f["fieldName"])} for f in access.get("fields", [])]


def _paged_access(rows: List[Dict], params: PageParams, kind: str, sensitive: Optional[bool]) -> Dict:
    if sensitive is not None:
        rows = [r for r in rows if bool(r.get("isSensitive")) == sensitive]
    if kind == "objects":
        sorts = {"object": lambda r: r["objectName"], "read": lambda r: r["access"]["read"],
                 "create": lambda r: r["access"]["create"], "edit": lambda r: r["access"]["edit"],
                 "delete": lambda r: r["access"]["delete"], "sensitivity": lambda r: r.get("sensitivity")}
        text = lambda r: f"{r['objectName']} {r.get('sensitivity') or ''}"  # noqa: E731
        default = "object"
    else:
        sorts = {"object": lambda r: r["objectName"], "field": lambda r: r["fieldName"],
                 "read": lambda r: r["access"]["read"], "edit": lambda r: r["access"]["edit"],
                 "sensitivity": lambda r: r.get("sensitivity")}
        text = lambda r: f"{r['objectName']} {r['fieldName']} {r.get('sensitivity') or ''}"  # noqa: E731
        default = "object"
    return paged(rows, params, text=text, sorts=sorts, default_sort=default)


async def _user_access(db: AsyncSession, org_id: str, user_sf_id: str, kind: str, params: PageParams,
                       sensitive: Optional[bool]):
    """Effective object or field access for a user. With `page`: one page,
    search (`q`), sensitive filter and sort over every row; without it,
    every row in the old shape."""
    service = EffectiveAccessService(db)
    try:
        if kind == "objects":
            access = await service.get_user_object_access(org_id, user_sf_id)
            rows = _object_access_rows(access)
        else:
            access = await service.get_user_field_access(org_id, user_sf_id)
            rows = _field_access_rows(access)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    if not params.paged:
        return {kind: rows}
    return _paged_access(rows, params, kind, sensitive)


@router.get("/orgs/{org_id}/users/{user_sf_id}/access/objects")
async def get_user_object_access(org_id: str, user_sf_id: str, sensitive: Optional[bool] = None,
                                 params: PageParams = Depends(page_params), db: AsyncSession = Depends(get_database)):
    """Effective object access for a user."""
    return await _user_access(db, org_id, user_sf_id, "objects", params, sensitive)


@router.get("/orgs/{org_id}/users/{user_sf_id}/access/fields")
async def get_user_field_access(org_id: str, user_sf_id: str, sensitive: Optional[bool] = None,
                                params: PageParams = Depends(page_params), db: AsyncSession = Depends(get_database)):
    """Effective field access for a user."""
    return await _user_access(db, org_id, user_sf_id, "fields", params, sensitive)


# Alias endpoints for backwards compatibility with frontend
@router.get("/orgs/{org_id}/users/{user_sf_id}/effective-access/objects")
async def get_user_effective_object_access(org_id: str, user_sf_id: str, sensitive: Optional[bool] = None,
                                           params: PageParams = Depends(page_params),
                                           db: AsyncSession = Depends(get_database)):
    """Effective object access for a user (alias for /access/objects)."""
    return await _user_access(db, org_id, user_sf_id, "objects", params, sensitive)


@router.get("/orgs/{org_id}/users/{user_sf_id}/effective-access/fields")
async def get_user_effective_field_access(org_id: str, user_sf_id: str, sensitive: Optional[bool] = None,
                                          params: PageParams = Depends(page_params),
                                          db: AsyncSession = Depends(get_database)):
    """Effective field access for a user (alias for /access/fields)."""
    return await _user_access(db, org_id, user_sf_id, "fields", params, sensitive)


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


@router.get("/orgs/{org_id}/users/{user_sf_id}/risk")
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
        return {
            "userId": user_sf_id,
            "score": 0,
            "level": "low",
            "factors": [],
            "explanation": "No risk assessment available yet. Run AI analysis to generate risk scores.",
            "calculatedAt": None,
        }

    return {
        "id": risk.id,
        "userId": risk.entity_id,
        "entity_id": risk.entity_id,
        "score": round(risk.risk_score, 2),
        "risk_score": round(risk.risk_score, 2),
        "level": risk.risk_level.value,
        "risk_level": risk.risk_level.value,
        "factors": risk.factors or [],
        "explanation": risk.reason_text,
        "reason_text": risk.reason_text,
        "calculatedAt": risk.calculated_at.isoformat() if risk.calculated_at else None,
    }


def _anomaly_fields(a: AccessAnomaly, risk: Optional[RiskScore]) -> Dict:
    """What every anomaly view shows. Access anomalies: rank, strongest
    reason (type) and the user's base risk (risk without the anomaly flag,
    so it doesn't restate the flag); severity is withheld because it
    implies impact, which is the risk level's job. Session anomalies
    keep their rule-based severity."""
    stats = a.peer_stats or {}
    session = a.category == "session"
    base_score, base_level = base_risk(risk.factors) if risk else (None, None)
    return {
        "category": a.category or "access",
        "severity": a.severity.value if session else None,
        "type": "session_anomaly" if session else stats.get("anomaly_type") or "excessive_permissions",
        "rank": None if session else stats.get("rank"),
        "usersScored": None if session else stats.get("users_scored"),
        "riskLevel": risk.risk_level.value if risk else None,
        "riskScore": round(risk.risk_score, 1) if risk else None,
        # Shown next to an anomaly rank: risk without the anomaly flag.
        "baseRiskLevel": base_level.value if base_level else None,
        "baseRiskScore": base_score,
    }


def _anomaly_sort_key(row: Dict):
    """Access anomalies by rank first, then session anomalies by score."""
    return (row["category"] == "session", row.get("rank") or 10**9, -(row.get("score") or 0), row.get("userId") or "")


@router.get("/orgs/{org_id}/users/{user_sf_id}/anomalies", response_model=List[AnomalyResponse])
async def get_user_anomalies(
    org_id: str,
    user_sf_id: str,
    db: AsyncSession = Depends(get_database),
):
    """Get anomalies for user"""
    result = await db.execute(
        select(AccessAnomaly).where(
            AccessAnomaly.organization_id == org_id,
            AccessAnomaly.user_id == user_sf_id,
        ).order_by(AccessAnomaly.anomaly_score.desc())
    )
    anomalies = result.scalars().all()
    risk = (await latest_user_risks(db, org_id, [user_sf_id])).get(user_sf_id)

    return [
        {
            "id": a.id,
            "user_id": a.user_id,
            "anomaly_score": round(a.anomaly_score, 2),
            "reasons": a.reasons,
            "detected_at": a.detected_at.isoformat(),
            **_anomaly_fields(a, risk),
        }
        for a in anomalies
    ]


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


@router.get("/orgs/{org_id}/anomalies")
async def list_anomalies(
    org_id: str,
    severity: Optional[str] = None,
    category: Optional[str] = None,
    type: Optional[str] = None,
    search: Optional[str] = None,
    limit: Optional[int] = Query(None, ge=1, description="without `page`: at most this many (default every anomaly)"),
    params: PageParams = Depends(page_params),
    db: AsyncSession = Depends(get_database),
):
    """List anomalies for organization.

    `category` filter accepts "access" (ML permission-based detector) or
    "session" (LoginHistory rule-based detector). Omit to see both.
    `type` matches the anomaly type shown on each card; `search` matches
    the user's name and the reason text.
    """
    query = (
        select(AccessAnomaly, UserSnapshot.name)
        .join(UserSnapshot, AccessAnomaly.user_id == UserSnapshot.salesforce_id)
        .where(
            AccessAnomaly.organization_id == org_id,
            UserSnapshot.organization_id == org_id,
        )
    )

    # Filters apply in Python after the summary is counted over every anomaly.
    query = query.order_by(AccessAnomaly.anomaly_score.desc(), AccessAnomaly.user_id)

    result = await db.execute(query)
    anomaly_user_pairs = result.all()
    risks = await latest_user_risks(db, org_id, list({a.user_id for a, _ in anomaly_user_pairs}))

    def _display_title(cat: str, user_name: str) -> str:
        if cat == "session":
            return f"Session anomaly detected for {user_name}"
        return f"Anomalous access pattern detected for {user_name}"

    rows = [
        {
            "id": a.id,
            "userId": a.user_id,  # Frontend expects camelCase
            "user_id": a.user_id,  # Keep for backwards compatibility
            "userName": user_name,  # Frontend expects camelCase
            "user_name": user_name,  # Keep for backwards compatibility
            "score": a.anomaly_score,  # Frontend expects 'score'
            "anomaly_score": a.anomaly_score,  # Keep for backwards compatibility
            "reasons": a.reasons,
            "detectedAt": a.detected_at.isoformat(),  # Frontend expects camelCase
            "detected_at": a.detected_at.isoformat(),  # Keep for backwards compatibility
            # Category, type, rank, risk level (and severity for session
            # anomalies); rows from before typing fall back to the old type.
            **_anomaly_fields(a, risks.get(a.user_id)),
            "title": _display_title(a.category, user_name),
            "description": a.reasons[0] if a.reasons else "Access pattern deviates from peer baseline",
        }
        for a, user_name in anomaly_user_pairs
    ]
    rows.sort(key=_anomaly_sort_key)
    access_rows = [r for r in rows if (r.get("category") or "access") == "access"]
    summary = {
        "all": len(rows),
        "access": len(access_rows),
        "session": sum(1 for r in rows if r.get("category") == "session"),
        "highBaseRisk": sum(1 for r in access_rows if r.get("baseRiskLevel") in ("high", "critical")),
        "usersScored": next((r["usersScored"] for r in access_rows if r.get("usersScored")), None),
        "usersAffected": len({r["userId"] for r in rows}),
    }
    if severity:
        # Severity exists for session anomalies only.
        rows = [r for r in rows if r.get("category") == "session" and r.get("severity") == severity]
    if category:
        rows = [r for r in rows if (r.get("category") or "access") == category]
    if type:
        rows = [r for r in rows if r["type"] == type]
    search = search or params.q
    if search and search.strip():
        needle = search.strip().lower()
        rows = [r for r in rows if needle in (r["userName"] or "").lower()
                or any(needle in reason.lower() for reason in r["reasons"] or [])]
    if not params.paged:
        return rows[:limit] if limit else rows
    keep_q = PageParams(params.page, params.page_size, params.sort, params.dir, None)  # search done above
    return paged(rows, keep_q,
                 sorts={"rank": lambda r: (r.get("rank") is None, r.get("rank") or 0),
                        "score": lambda r: r.get("score"), "user": lambda r: r.get("userName"),
                        "detected": lambda r: r.get("detectedAt"), "base_risk": lambda r: r.get("baseRiskScore")},
                 default_sort=None, summary=summary) if params.sort else {
        **paged(rows, keep_q), "sort": "rank", "summary": summary}


class TopAnomalousUserResponse(BaseModel):
    userId: str
    userName: str
    userEmail: str
    anomalyScore: float
    severity: Optional[str] = None
    topReasons: List[str]
    riskScore: Optional[float] = None
    riskLevel: Optional[str] = None
    baseRiskLevel: Optional[str] = None
    baseRiskScore: Optional[float] = None
    category: Optional[str] = None
    anomalyType: Optional[str] = None
    rank: Optional[int] = None
    usersScored: Optional[int] = None

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
    )

    result = await db.execute(query)
    rows = result.all()
    risks = await latest_user_risks(db, org_id, list({a.user_id for a, _ in rows}))

    out = []
    for anomaly, user in rows:
        fields = _anomaly_fields(anomaly, risks.get(anomaly.user_id))
        out.append({
            "userId": user.salesforce_id,
            "userName": user.name,
            "userEmail": user.email or "",
            "anomalyScore": anomaly.anomaly_score,
            "score": anomaly.anomaly_score,
            "severity": fields["severity"],
            "category": fields["category"],
            "topReasons": anomaly.reasons[:3] if anomaly.reasons else [],
            "riskScore": fields["riskScore"],
            "riskLevel": fields["riskLevel"],
            "baseRiskLevel": fields["baseRiskLevel"],
            "baseRiskScore": fields["baseRiskScore"],
            "anomalyType": fields["type"],
            "rank": fields["rank"],
            "usersScored": fields["usersScored"],
        })
    out.sort(key=_anomaly_sort_key)
    return out[:limit]


SEVERITY_RANK = {"critical": 0, "high": 1, "medium": 2, "low": 3, "info": 4}


@router.get("/orgs/{org_id}/recommendations")
async def list_recommendations(
    org_id: str,
    rec_type: Optional[str] = None,
    status: Optional[str] = None,
    track: Optional[str] = None,
    severity: Optional[str] = None,
    search: Optional[str] = None,
    limit: Optional[int] = Query(None, ge=1, description="without `page`: at most this many (default every one)"),
    params: PageParams = Depends(page_params),
    db: AsyncSession = Depends(get_database),
):
    """Recommendations (Priority Actions), newest first.

    Filters: rec_type (enum value), status (enum value), track ('security'
    or 'equity'), severity, and search (`q` or `search`, over title and
    description). Track is the high-level UI grouping introduced for the
    GAEA equity recommendations track — see RecommendationTrack. With
    `page`: one page (sort: generated, severity, title, status) and
    `summary` counts by status and severity for the track; without it,
    every matching recommendation.
    """
    query = select(Recommendation).where(Recommendation.organization_id == org_id)
    if track:
        query = query.where(Recommendation.track == track)
    query = query.order_by(Recommendation.generated_at.desc())
    recs = (await db.execute(query)).scalars().all()

    def val(x):
        return x.value if hasattr(x, "value") else x

    rows = [
        {
            "id": r.id,
            "rec_type": val(r.rec_type),
            "track": val(r.track) or "security",
            "severity": val(r.severity),
            "target_entity_id": r.target_entity_id,
            "title": r.title,
            "description": r.description,
            "rationale": r.rationale,
            "status": val(r.status),
            "affected_access": r.affected_access,
            "generated_at": r.generated_at.isoformat() if r.generated_at else None,
        }
        for r in recs
    ]
    by_status: Dict[str, int] = {}
    by_severity: Dict[str, int] = {}
    for r in rows:
        by_status[r["status"]] = by_status.get(r["status"], 0) + 1
        by_severity[r["severity"]] = by_severity.get(r["severity"], 0) + 1
    summary = {"all": len(rows), "byStatus": by_status, "bySeverity": by_severity}
    if rec_type:
        rows = [r for r in rows if r["rec_type"] == rec_type]
    if status:
        rows = [r for r in rows if r["status"] == status]
    if severity:
        rows = [r for r in rows if r["severity"] == severity]
    needle = (search or params.q or "").strip().lower()
    if needle:
        rows = [r for r in rows if all(w in f"{r['title']} {r['description'] or ''}".lower() for w in needle.split())]
    if not params.paged:
        return rows[:limit] if limit else rows
    return paged(rows, PageParams(params.page, params.page_size, params.sort, params.dir, None),
                 sorts={"generated": lambda r: r["generated_at"], "severity": lambda r: SEVERITY_RANK.get(r["severity"], 9),
                        "title": lambda r: r["title"], "status": lambda r: r["status"]},
                 default_sort=None, summary=summary)


@recommendations_router.patch(
    "/recommendations/{rec_id}",
    response_model=RecommendationResponse,
    dependencies=[Depends(require_credentials)],
)
async def update_recommendation_status(
    rec_id: str,
    payload: RecommendationStatusUpdate,
    request: Request,
    access_token: Optional[str] = Cookie(None),
    package_key: Optional[str] = Header(None, alias=PACKAGE_KEY_HEADER),
    db: AsyncSession = Depends(get_database),
):
    """Update a recommendation's status (apply / dismiss / etc).

    Used by both the equity track (Apply / Dismiss buttons on
    suggested grants) and the security track (existing recs page).
    Accepts any value from RecommendationStatus — pending / accepted /
    rejected / applied. Returns the updated row.
    """
    from app.domain.models import Recommendation, RecommendationStatus
    valid = {s.value for s in RecommendationStatus}
    if payload.status not in valid:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid status. Must be one of: {sorted(valid)}",
        )
    rec = await db.get(Recommendation, rec_id)
    if rec is None:
        raise HTTPException(status_code=404, detail="Recommendation not found")
    await authorize_org(request, rec.organization_id, db, access_token, package_key)
    rec.status = RecommendationStatus(payload.status)
    await db.commit()
    await db.refresh(rec)
    return {
        "id": rec.id,
        "rec_type": rec.rec_type.value if hasattr(rec.rec_type, "value") else rec.rec_type,
        "track": rec.track.value if hasattr(rec.track, "value") else (rec.track or "security"),
        "severity": rec.severity.value if hasattr(rec.severity, "value") else rec.severity,
        "target_entity_id": rec.target_entity_id,
        "title": rec.title,
        "description": rec.description,
        "rationale": rec.rationale,
        "status": rec.status.value if hasattr(rec.status, "value") else rec.status,
        "affected_access": rec.affected_access,
    }


RECORD_SECTIONS: Dict[str, Dict] = {
    "manualShares": {"text": lambda r: f"{r.get('record_type')} {r.get('record_id')} {r.get('access_level')} {r.get('row_cause')}",
                     "sorts": {"record_type": lambda r: r.get("record_type"), "access": lambda r: r.get("access_level"),
                               "record": lambda r: r.get("record_id")}, "default": "record_type"},
    "apexShares": {"text": lambda r: f"{r.get('record_type')} {r.get('record_id')} {r.get('sharing_reason') or ''} {r.get('access_level')}",
                   "sorts": {"record_type": lambda r: r.get("record_type"), "reason": lambda r: r.get("sharing_reason"),
                             "access": lambda r: r.get("access_level")}, "default": "record_type"},
    "teamAccess": {"text": lambda r: f"{r.get('team_type')} {r.get('record_id')} {r.get('role') or ''}",
                   "sorts": {"team": lambda r: r.get("team_type"), "role": lambda r: r.get("role")}, "default": "team"},
    "sharingRules": {"text": lambda r: f"{r.get('record_type')} {r.get('record_id')} {r.get('row_cause')} {r.get('shared_to')}",
                     "sorts": {"record_type": lambda r: r.get("record_type"), "access": lambda r: r.get("access_level")},
                     "default": "record_type"},
    "subordinateRoles": {"text": lambda r: r.get("role_name") or "",
                         "sorts": {"name": lambda r: r.get("role_name")}, "default": "name"},
}


@router.get("/orgs/{org_id}/users/{user_sf_id}/record-access")
async def get_user_record_access(
    org_id: str,
    user_sf_id: str,
    object_name: Optional[str] = None,
    section: Optional[str] = None,
    preview: Optional[int] = Query(None, ge=1, le=50),
    params: PageParams = Depends(page_params),
    db: AsyncSession = Depends(get_database),
):
    """
    Get record-level access information for a user

    This endpoint provides information about which specific records a user can access
    based on:
    - Record ownership
    - Role hierarchy
    - Sharing rules (criteria-based and owner-based)
    - Manual shares
    - Team access (Account Teams, Opportunity Teams)
    """
    from app.ingestion.demo_orgs import refuse_demo_org
    from app.services.record_access import RecordAccessService
    from app.services.record_coverage import latest_record_coverage

    await refuse_demo_org(db, org_id, "Record Access")
    # Create service instance
    service = RecordAccessService(db)

    # Get record access information
    access_info = await service.get_user_record_access(org_id, user_sf_id)

    # Convert to camelCase for frontend
    out = {
        "userId": access_info["user_id"],
        "userName": access_info.get("user_name", "Unknown"),
        "ownedRecords": access_info["owned_records"],
        "roleHierarchy": access_info["role_hierarchy"],
        "manualShares": access_info["manual_shares"],
        # Shares with an Apex sharing reason (roadmap item 1), and what can't be told apart.
        "apexShares": access_info.get("apex_shares", []),
        "shareNotes": access_info.get("share_notes", {}),
        "teamAccess": access_info["team_access"],
        "sharingRules": access_info["sharing_rules"],
        "organizationWideDefaults": access_info.get("organization_wide_defaults", []),
        "summary": access_info["summary"],
        # Whether share rows cover every record; label shown when not.
        "coverage": await latest_record_coverage(db, org_id),
    }
    lists = {k: out[k] for k in ("manualShares", "apexShares", "teamAccess", "sharingRules")}
    lists["subordinateRoles"] = (out["roleHierarchy"] or {}).get("subordinate_roles") or []
    if section:
        if section not in RECORD_SECTIONS:
            raise HTTPException(status_code=400, detail=f"section must be one of {', '.join(RECORD_SECTIONS)}")
        rows = lists[section]
        if not params.paged:
            return {"items": rows, "total": len(rows)}
        spec = RECORD_SECTIONS[section]
        return paged(rows, params, text=spec["text"], sorts=spec["sorts"], default_sort=spec["default"], section=section)
    if preview:
        out["counts"] = {k: len(v) for k, v in lists.items()}
        for k in ("manualShares", "apexShares", "teamAccess", "sharingRules"):
            out[k] = out[k][:preview]
        if out["roleHierarchy"]:
            out["roleHierarchy"] = {**out["roleHierarchy"], "subordinate_roles": lists["subordinateRoles"][:preview]}
    return out


@router.get("/orgs/{org_id}/objects")
async def list_objects(
    org_id: str,
    search: Optional[str] = None,
    limit: int = Query(500, le=10000),
    kind: Optional[str] = Query(None, pattern="^(sensitive|standard|custom)$"),
    params: PageParams = Depends(page_params),
    db: AsyncSession = Depends(get_database),
):
    """Objects with permission grants. Users with access are active users who
    can read the object, by the same rules as the user pages (profile, sets,
    groups with muting; services/access_index.py); null at Metadata only.
    With `page`: one page (search, kind filter and sort over every object)
    and totals for the summary cards. Without it: every object, as before."""
    import re
    from sqlalchemy import func, distinct
    from app.domain.models import ObjectPermissionSnapshot
    from app.services.access_index import access_index

    rows_q = select(
        ObjectPermissionSnapshot.sobject_type,
        func.count(distinct(ObjectPermissionSnapshot.parent_id)).label('permission_set_count')
    ).where(ObjectPermissionSnapshot.organization_id == org_id).group_by(ObjectPermissionSnapshot.sobject_type)
    objects = (await db.execute(rows_q)).all()
    described = ((await latest_schema(db, org_id)) or {}).get("objects") or {}
    org = await privacy_mode.load_org(db, org_id)
    users_allowed = privacy_mode.allows(org, privacy_mode.USER_RECORDS)
    counts = (await access_index(db, org_id)).counts("objects") if users_allowed else {}

    def create_label(api_name: str) -> str:
        """Create a human-readable label from API name"""
        if api_name.endswith('__c'):
            api_name = api_name[:-3]
        label = re.sub(r'([a-z])([A-Z])', r'\1 \2', api_name)
        return label.replace('_', ' ')

    object_list = [{
        "id": o.sobject_type,
        "name": o.sobject_type,
        "apiName": o.sobject_type,
        "label": (described.get(o.sobject_type) or {}).get("label") or create_label(o.sobject_type),
        "isCustom": o.sobject_type.endswith('__c'),
        **_object_sensitivity(o.sobject_type),
        # From the synced describe; null when field metadata isn't synced.
        "fieldCount": len(described[o.sobject_type]["fields"]) if o.sobject_type in described else None,
        "userCount": (counts.get(o.sobject_type) or {}).get("read", 0) if users_allowed else None,
        "permissionSetCount": o.permission_set_count,
    } for o in objects]

    def keep(o: Dict) -> bool:
        return (kind is None or (kind == "sensitive" and o["isSensitive"]) or (kind == "custom" and o["isCustom"])
                or (kind == "standard" and not o["isCustom"]))

    if not params.paged:
        rows = [o for o in object_list if keep(o) and (not search or search.lower() in o["apiName"].lower())]
        return sorted(rows, key=lambda o: o["apiName"])[:limit]
    summary = {"objects": len(object_list), "sensitive": sum(o["isSensitive"] for o in object_list),
               "custom": sum(o["isCustom"] for o in object_list), "usersAvailable": users_allowed}
    return paged([o for o in object_list if keep(o)], params,
                 text=lambda o: f"{o['apiName']} {o['label']} {o.get('sensitivity') or ''}",
                 sorts={"label": lambda o: o["label"], "apiName": lambda o: o["apiName"],
                        "type": lambda o: o["isCustom"], "sensitivity": lambda o: o.get("sensitivity"),
                        "users": lambda o: o["userCount"], "fields": lambda o: o["fieldCount"]},
                 default_sort="label", summary=summary)


@router.get("/orgs/{org_id}/objects/{object_name}")
async def get_object_details(
    org_id: str,
    object_name: str,
    db: AsyncSession = Depends(get_database),
):
    """An object: label, field metadata, and who can access it. Access is a
    summary (count and first rows per kind); the full lists are paged at
    /objects/{name}/access (routes/access_lists.py)."""
    import re
    from app.api.routes.access_lists import access_summary, target_for_object

    def create_label(api_name: str) -> str:
        """Create a human-readable label from API name"""
        if api_name.endswith('__c'):
            api_name = api_name[:-3]
        label = re.sub(r'([a-z])([A-Z])', r'\1 \2', api_name)
        return label.replace('_', ' ')

    from app.api.routes.schema_lists import summary as schema_summary

    schema = await latest_schema(db, org_id)
    described = ((schema or {}).get("objects") or {}).get(object_name)
    access = await access_summary(db, org_id, target_for_object(object_name))
    kinds = access["kinds"]

    return {
        "name": object_name,
        "apiName": object_name,
        "label": (described or {}).get("label") or create_label(object_name),
        "isCustom": object_name.endswith('__c'),
        **_object_sensitivity(object_name),
        # Field metadata from the synced describe (roadmap item 8); null
        # when it isn't synced.
        "schemaSynced": described is not None,
        # Counts and first rows; full lists at /objects/{name}/schema (routes/schema_lists.py).
        "schema": schema_summary(schema, object_name),
        "fieldsFromFieldDefinition": (described or {}).get("fields_from_field_definition", 0),
        "describeFailed": bool((described or {}).get("describe_failed")),
        "access": access,
        "totalUsers": kinds["users"]["count"],
        "totalProfiles": kinds["profiles"]["count"],
        "totalPermissionSets": kinds["permission_sets"]["count"],
        "totalGroups": kinds["groups"]["count"],
    }


@router.get("/orgs/{org_id}/fields")
async def list_fields(
    org_id: str,
    object_type: Optional[str] = None,
    starts_with: Optional[str] = Query(None, max_length=1),
    params: PageParams = Depends(page_params),
    db: AsyncSession = Depends(get_database),
):
    """Fields that field-level security names, with type and encryption from
    the synced describe, and the active users who can read each (same rules
    as the user pages; null at Metadata only). Search (q), object and first
    letter filter every field before the page is cut; without `page`, every
    field comes back."""
    from sqlalchemy import func
    from app.domain.models import FieldPermissionSnapshot
    from app.services.access_index import access_index

    stmt = select(
        FieldPermissionSnapshot.sobject_type,
        FieldPermissionSnapshot.field,
        func.count(FieldPermissionSnapshot.id).label('permission_count'),
    ).where(FieldPermissionSnapshot.organization_id == org_id).group_by(
        FieldPermissionSnapshot.sobject_type, FieldPermissionSnapshot.field)
    if object_type:
        stmt = stmt.where(FieldPermissionSnapshot.sobject_type.ilike(f"%{object_type.strip()}%"))
    rows = (await db.execute(stmt)).all()
    schema = await latest_schema(db, org_id)
    org = await privacy_mode.load_org(db, org_id)
    users_allowed = privacy_mode.allows(org, privacy_mode.USER_RECORDS)
    counts = (await access_index(db, org_id)).counts("fields") if users_allowed else {}

    def create_label(api_name: str) -> str:
        """Create a human-readable label from API name"""
        api_name = api_name.split('.')[-1]
        if api_name.endswith('__c'):
            api_name = api_name[:-3]
        return ' '.join(word.capitalize() for word in api_name.replace('_', ' ').split())

    items = []
    for r in rows:
        bare = r.field.split('.')[-1]
        if starts_with and starts_with.isalpha() and not bare.upper().startswith(starts_with.upper()):
            continue
        described = schema_field(schema, r.sobject_type, bare)
        key = r.field if '.' in r.field else f"{r.sobject_type}.{r.field}"
        items.append({
            "id": f"{r.sobject_type}.{r.field}",
            "objectName": r.sobject_type,
            "apiName": r.field,
            "label": (described or {}).get("label") or create_label(r.field),
            **_field_sensitivity(r.field),
            # Type and encryption from the synced describe; null when not synced.
            **field_payload(described),
            "isCustom": r.field.endswith('__c'),
            "userCount": (counts.get(key) or {}).get("read", 0) if users_allowed else None,
            "permissionCount": r.permission_count,
        })
    return paged(items, params if params.paged else PageParams(1, 10**9, params.sort, params.dir, params.q),
                 text=lambda f: f"{f['apiName']} {f['label']} {f['objectName']} {f.get('typeLabel') or ''}",
                 sorts={"label": lambda f: f["label"], "object": lambda f: f["objectName"],
                        "apiName": lambda f: f["apiName"], "type": lambda f: f.get("typeLabel"),
                        "users": lambda f: f["userCount"], "grants": lambda f: f["permissionCount"]},
                 default_sort="apiName", schemaNotes=(schema or {}).get("notes") or [],
                 usersAvailable=users_allowed)


@router.get("/orgs/{org_id}/fields/{field_id}")
async def get_field_details(
    org_id: str,
    field_id: str,
    db: AsyncSession = Depends(get_database),
):
    """A field: what it is (synced describe) and who can access it, as a
    summary (count and first rows per kind); full lists are paged at
    /fields/{id}/access. A field without field-level security rows follows
    its object's access."""
    from app.api.routes.access_lists import access_summary, target_for_field

    if '.' not in field_id:
        raise HTTPException(status_code=400, detail="Invalid field_id format. Expected 'ObjectName.FieldName'")
    object_name, field_name = field_id.split('.', 1)
    # FieldPermissions name a field "Object.Field"; the describe, just "Field".
    bare_name = field_name.split('.')[-1]

    target = await target_for_field(db, org_id, field_id)
    access = await access_summary(db, org_id, target)
    kinds = access["kinds"]
    described = schema_field(await latest_schema(db, org_id), object_name, bare_name)
    if described is None and not any(k["count"] for k in kinds.values()):
        raise HTTPException(status_code=404, detail="Field not found")

    def create_label(api_name: str) -> str:
        """Create a human-readable label from API name"""
        if '.' in api_name:
            api_name = api_name.split('.')[-1]
        if api_name.endswith('__c'):
            api_name = api_name[:-3]
        return ' '.join(word.capitalize() for word in api_name.replace('_', ' ').split())

    return {
        "id": field_id,
        "objectName": object_name,
        "fieldName": field_name,
        "label": (described or {}).get("label") or create_label(field_name),
        "isCustom": field_name.endswith('__c'),
        **_field_sensitivity(field_name),
        # Type, encryption and the rest from the synced describe; null when not synced.
        **field_payload(described),
        "attributes": field_details(described),
        "access": access,
        "totalUsers": kinds["users"]["count"],
        "totalProfiles": kinds["profiles"]["count"],
        "totalPermissionSets": kinds["permission_sets"]["count"],
        "totalGroups": kinds["groups"]["count"],
        # True when access follows the object (no field-level security rows
        # name this field), so the UI says so instead of implying field grants.
        "inheritedFromObject": target.follows_object,
    }


PS_PREVIEW = 10


def _ps_field_access_rows(detail: Dict) -> List[Dict]:
    """One row per object the set grants: its object flags and its explicit
    field-level security rows (explicit first, then by name)."""
    fls = {g["objectName"]: g for g in detail["fieldPermissions"]}
    rows = [{"objectName": op["objectName"], "objectPerm": op, "fieldCount": (fls.get(op["objectName"]) or {}).get("fieldCount", 0),
             "fields": (fls.get(op["objectName"]) or {}).get("fields", [])} for op in detail["objectPermissions"]]
    return sorted(rows, key=lambda r: (r["fieldCount"] == 0, r["objectName"].lower()))


@router.get("/orgs/{org_id}/permission-sets/{ps_sf_id}")
async def get_permission_set_detail(
    org_id: str,
    ps_sf_id: str,
    preview: Optional[int] = Query(None, ge=1, le=50),
    db: AsyncSession = Depends(get_database),
):
    """Permission Set detail: basic info, assigned users, object and field
    permissions. With `preview`, each list is cut to its first rows (totals
    stay whole) and `fieldAccess` gives one row per object; the full lists
    are paged at /permission-sets/{id}/list/{kind}. Powers the deep-link
    landing page from the AccessGraph Explorer tab in the Salesforce package."""
    detail = await _permission_set_detail(org_id, ps_sf_id, db)
    if not preview:
        return detail
    rows = _ps_field_access_rows(detail)
    return {**detail,
            "users": detail["users"][:preview],
            "objectPermissions": detail["objectPermissions"][:preview],
            "fieldPermissions": [],
            "fieldAccess": [{**r, "fields": r["fields"][:preview]} for r in rows[:preview]],
            "totalFieldAccessObjects": len(rows),
            "totalExplicitFieldObjects": sum(1 for r in rows if r["fieldCount"])}


@router.get("/orgs/{org_id}/permission-sets/{ps_sf_id}/list/{kind}")
async def permission_set_list(
    org_id: str,
    ps_sf_id: str,
    kind: str,
    assignment: Optional[str] = Query(None, pattern="^(direct|via_psg)$"),
    object_name: Optional[str] = Query(None, alias="object"),
    params: PageParams = Depends(page_params),
    db: AsyncSession = Depends(get_database),
):
    """A set's users, object permissions or field permissions (one row per
    field), paged with search, filters and sort (the standing pagination
    rule). Without `page`, every row."""
    if kind not in ("users", "objects", "fields"):
        raise HTTPException(status_code=400, detail="kind must be users, objects or fields")
    detail = await _permission_set_detail(org_id, ps_sf_id, db)
    sorts: Dict[str, Any]
    if kind == "users":
        rows = [u for u in detail["users"] if not assignment or u["assignmentType"] == assignment]
        text = lambda r: f"{r['name']} {r.get('username') or ''} {r.get('email') or ''}"  # noqa: E731
        sorts = {"name": lambda r: r["name"], "assignment": lambda r: r["assignmentType"], "status": lambda r: r["isActive"]}
        default = "name"
    elif kind == "objects":
        rows = detail["objectPermissions"]
        text = lambda r: r["objectName"]  # noqa: E731
        sorts = {"object": lambda r: r["objectName"]}
        for flag in ("read", "create", "edit", "delete", "viewAll", "modifyAll"):
            sorts[flag] = (lambda f: (lambda r: r[f]))(flag)
        default = "object"
    else:
        rows = [{"objectName": g["objectName"], **f} for g in detail["fieldPermissions"] for f in g["fields"]
                if not object_name or g["objectName"].lower() == object_name.lower()]
        text = lambda r: f"{r['objectName']} {r['fieldName']}"  # noqa: E731
        sorts = {"object": lambda r: (r["objectName"], r["fieldName"]), "field": lambda r: r["fieldName"],
                 "read": lambda r: r["read"], "edit": lambda r: r["edit"]}
        default = "object"
    if not params.paged:
        return {"items": rows, "total": len(rows)}
    return paged(rows, params, text=text, sorts=sorts, default_sort=default, kind=kind, label=detail["label"])


async def _permission_set_detail(org_id: str, ps_sf_id: str, db: AsyncSession) -> Dict:
    """Every user, object permission and field permission of a set."""
    from app.domain.models import (
        PermissionSetSnapshot,
        PermissionSetAssignmentSnapshot,
        PermissionSetGroupSnapshot,
        PermissionSetGroupComponentSnapshot,
        ObjectPermissionSnapshot,
        UserSnapshot,
        ProfileSnapshot,
    )

    # 1. Look up the PS itself.
    ps_query = select(PermissionSetSnapshot).where(
        PermissionSetSnapshot.organization_id == org_id,
        PermissionSetSnapshot.salesforce_id == ps_sf_id,
    )
    ps = (await db.execute(ps_query)).scalar_one_or_none()
    if ps is None:
        raise HTTPException(status_code=404, detail="Permission Set not found")

    # 2. If profile-owned, surface the underlying profile too.
    profile = None
    if ps.is_owned_by_profile and ps.profile_id:
        prof_q = select(ProfileSnapshot).where(
            ProfileSnapshot.organization_id == org_id,
            ProfileSnapshot.salesforce_id == ps.profile_id,
        )
        profile = (await db.execute(prof_q)).scalar_one_or_none()

    # 3. Direct assignments to this PS.
    assignment_q = select(PermissionSetAssignmentSnapshot).where(
        PermissionSetAssignmentSnapshot.organization_id == org_id,
        PermissionSetAssignmentSnapshot.permission_set_id == ps_sf_id,
    )
    direct_assignments = (await db.execute(assignment_q)).scalars().all()
    direct_user_ids = {a.assignee_id for a in direct_assignments}

    # 4. PSGs that include this PS as a component → users with those PSGs
    #    inherit this PS's permissions.
    psg_component_q = select(PermissionSetGroupComponentSnapshot).where(
        PermissionSetGroupComponentSnapshot.organization_id == org_id,
        PermissionSetGroupComponentSnapshot.permission_set_id == ps_sf_id,
    )
    psg_components = (await db.execute(psg_component_q)).scalars().all()
    psg_ids = {c.permission_set_group_id for c in psg_components}

    psgs = []
    indirect_user_ids: set[str] = set()
    if psg_ids:
        psg_q = select(PermissionSetGroupSnapshot).where(
            PermissionSetGroupSnapshot.organization_id == org_id,
            PermissionSetGroupSnapshot.salesforce_id.in_(psg_ids),
        )
        psgs = (await db.execute(psg_q)).scalars().all()

        # PSG assignments are stored on PermissionSetAssignmentSnapshot with
        # permission_set_id = psg_id (Salesforce treats PSGs polymorphically).
        psg_assignment_q = select(PermissionSetAssignmentSnapshot).where(
            PermissionSetAssignmentSnapshot.organization_id == org_id,
            PermissionSetAssignmentSnapshot.permission_set_id.in_(psg_ids),
        )
        for a in (await db.execute(psg_assignment_q)).scalars().all():
            indirect_user_ids.add(a.assignee_id)

    all_user_ids = direct_user_ids | indirect_user_ids

    # 5. Resolve user details for the union of direct + indirect.
    users = []
    if all_user_ids:
        user_q = select(UserSnapshot).where(
            UserSnapshot.organization_id == org_id,
            UserSnapshot.salesforce_id.in_(all_user_ids),
        )
        for u in (await db.execute(user_q)).scalars().all():
            users.append({
                "id": u.salesforce_id,
                "name": u.name,
                "username": u.username,
                "email": u.email,
                "isActive": u.is_active,
                "assignmentType": "direct" if u.salesforce_id in direct_user_ids else "via_psg",
            })
        # Sort by assignment type (direct first), then name.
        users.sort(key=lambda x: (x["assignmentType"] != "direct", (x["name"] or "").lower()))

    # 6. Object permissions granted by this PS.
    obj_perm_q = select(ObjectPermissionSnapshot).where(
        ObjectPermissionSnapshot.organization_id == org_id,
        ObjectPermissionSnapshot.parent_id == ps_sf_id,
    )
    object_permissions = []
    for op in (await db.execute(obj_perm_q)).scalars().all():
        object_permissions.append({
            "objectName": op.sobject_type,
            "read": op.permissions_read,
            "create": op.permissions_create,
            "edit": op.permissions_edit,
            "delete": op.permissions_delete,
            "viewAll": op.permissions_view_all_records,
            "modifyAll": op.permissions_modify_all_records,
        })
    object_permissions.sort(key=lambda x: x["objectName"])

    # 7. Field permissions granted by this PS, grouped by object.
    from app.domain.models import FieldPermissionSnapshot
    fp_query = select(FieldPermissionSnapshot).where(
        FieldPermissionSnapshot.organization_id == org_id,
        FieldPermissionSnapshot.parent_id == ps_sf_id,
    )
    field_perms_by_object: dict[str, list[dict]] = {}
    total_fields_granted = 0
    for fp in (await db.execute(fp_query)).scalars().all():
        # Field column on FieldPermissionSnapshot is "Object.Field"; split.
        if "." in fp.field:
            _, field_name = fp.field.split(".", 1)
        else:
            field_name = fp.field
        if not (fp.permissions_read or fp.permissions_edit):
            continue
        field_perms_by_object.setdefault(fp.sobject_type, []).append({
            "fieldName": field_name,
            "qualifiedId": f"{fp.sobject_type}.{field_name}",
            "read": fp.permissions_read,
            "edit": fp.permissions_edit,
        })
        total_fields_granted += 1
    field_permissions = [
        {
            "objectName": obj,
            "fields": sorted(fields, key=lambda f: f["fieldName"]),
            "fieldCount": len(fields),
        }
        for obj, fields in sorted(field_perms_by_object.items())
    ]

    # 8. System permissions extracted from raw_data. Salesforce surfaces ~250
    # Permissions* booleans on the PermissionSet object; we pulled a curated
    # ~30 in the SOQL. Group them so the UI can render meaningfully.
    system_permissions_by_category = _extract_system_permissions(ps.raw_data or {})
    total_system_perms_granted = sum(
        len(perms) for perms in system_permissions_by_category.values()
    )

    detail_source = (await resolve_grant_sources(db, org_id, [ps.salesforce_id])).get(ps.salesforce_id)
    return {
        "id": ps.salesforce_id,
        "name": ps.name,
        "label": detail_source.display if detail_source else ps.label,
        "type": ps.ps_type or "Regular",
        "isMuting": (ps.ps_type == "Muting"),
        "isOwnedByProfile": ps.is_owned_by_profile,
        "profile": {
            "id": profile.salesforce_id,
            "name": profile.name,
        } if profile else None,
        "permissionSetGroups": [
            {"id": g.salesforce_id, "name": g.developer_name, "label": g.master_label}
            for g in psgs
        ],
        "users": users,
        "totalUsers": len(users),
        "totalDirectAssignments": len(direct_user_ids),
        "totalViaPsgAssignments": len(indirect_user_ids - direct_user_ids),
        "objectPermissions": object_permissions,
        "totalObjectsGranted": len(object_permissions),
        "fieldPermissions": field_permissions,
        "totalFieldsGranted": total_fields_granted,
        "systemPermissions": system_permissions_by_category,
        "totalSystemPermissionsGranted": total_system_perms_granted,
    }


# Permissions* fields we pull from PermissionSet, grouped into UI categories.
# Each entry: (api_field_on_PermissionSet, display_label).
_SYSTEM_PERMISSION_CATEGORIES: dict[str, list[tuple[str, str]]] = {
    "Data Access": [
        ("PermissionsViewAllData", "View All Data"),
        ("PermissionsModifyAllData", "Modify All Data"),
        ("PermissionsViewEncryptedData", "View Encrypted Data"),
        ("PermissionsBulkApiHardDelete", "Bulk API Hard Delete"),
    ],
    "User Management": [
        ("PermissionsViewAllUsers", "View All Users"),
        ("PermissionsManageUsers", "Manage Users"),
        ("PermissionsResetPasswords", "Reset User Passwords and Unlock Users"),
        ("PermissionsManageRoles", "Manage Roles"),
        ("PermissionsManageProfilesPermissionsets", "Manage Profiles and Permission Sets"),
        ("PermissionsAssignPermissionSets", "Assign Permission Sets"),
    ],
    "Setup & Customization": [
        ("PermissionsCustomizeApplication", "Customize Application"),
        ("PermissionsManageSharing", "Manage Sharing"),
        ("PermissionsViewSetup", "View Setup and Configuration"),
        ("PermissionsManageDataIntegrations", "Manage Data Integrations"),
        ("PermissionsManageMobile", "Manage Mobile Configurations"),
        ("PermissionsManageContentPermissions", "Manage Content Permissions"),
    ],
    "Development & API": [
        ("PermissionsApiEnabled", "API Enabled"),
        ("PermissionsApiUserOnly", "API Only User"),
        ("PermissionsAuthorApex", "Author Apex"),
    ],
    "Reports & Dashboards": [
        ("PermissionsRunReports", "Run Reports"),
        ("PermissionsExportReport", "Export Reports"),
        ("PermissionsScheduleReports", "Schedule Reports"),
        ("PermissionsViewAllForecasts", "View All Forecasts"),
        ("PermissionsManageDashbds", "Manage Dashboards"),
        ("PermissionsCreateDashFolders", "Create Dashboard Folders"),
    ],
    "Security": [
        ("PermissionsManageEncryptionKeys", "Manage Encryption Keys"),
        ("PermissionsTwoFactorApi", "Multi-Factor Authentication for API Logins"),
        ("PermissionsTwoFactorMfa", "Multi-Factor Authentication for User Interface Logins"),
        ("PermissionsPasswordNeverExpires", "Password Never Expires"),
    ],
    "Record Transfers": [
        ("PermissionsTransferAnyCase", "Transfer Cases"),
        ("PermissionsTransferAnyEntity", "Transfer Record"),
        ("PermissionsTransferAnyLead", "Transfer Leads"),
    ],
}


def _extract_system_permissions(raw_data: dict) -> dict[str, list[dict]]:
    """Walk our curated category list and return only the permissions that
    are set to True in raw_data. Old PS rows synced before the SOQL was
    expanded simply won't have these keys, and the function returns an
    empty dict for those — which the UI surfaces as "re-sync to populate"."""
    result: dict[str, list[dict]] = {}
    for category, perms in _SYSTEM_PERMISSION_CATEGORIES.items():
        granted = []
        for api_name, label in perms:
            if raw_data.get(api_name) is True:
                granted.append({"apiName": api_name, "label": label})
        if granted:
            result[category] = granted
    return result


# Permission sets and groups drawn per user before "+N more" kicks in.
GRAPH_MAX_ASSIGNMENTS = 50


@router.get("/orgs/{org_id}/graph/user/{user_sf_id}")
async def get_user_graph(
    org_id: str,
    user_sf_id: str,
    include: Optional[str] = Query(None, description="'pages_and_automation' adds layouts, record pages, Apex and flows"),
    db: AsyncSession = Depends(get_database),
):
    """Get graph data for a user showing their access relationships"""
    from datetime import datetime
    from app.domain.models import (
        UserSnapshot,
        ProfileSnapshot,
        RoleSnapshot,
        PermissionSetAssignmentSnapshot,
        PermissionSetSnapshot,
        ObjectPermissionSnapshot,
    )

    # Get user
    user_query = select(UserSnapshot).where(
        UserSnapshot.organization_id == org_id,
        UserSnapshot.salesforce_id == user_sf_id
    )
    user_result = await db.execute(user_query)
    user = user_result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    nodes = []
    edges = []

    # Add user node
    nodes.append({
        "id": user_sf_id,
        "type": "user",
        "label": user.name,
        "properties": {
            "username": user.username,
            "email": user.email,
            "isActive": user.is_active,
        }
    })

    # Add profile node and edge
    if user.profile_id:
        profile_query = select(ProfileSnapshot).where(
            ProfileSnapshot.organization_id == org_id,
            ProfileSnapshot.salesforce_id == user.profile_id
        )
        profile_result = await db.execute(profile_query)
        profile = profile_result.scalar_one_or_none()
        if profile:
            nodes.append({
                "id": profile.salesforce_id,
                "type": "profile",
                "label": profile.name,
                "properties": {}
            })
            edges.append({
                "id": f"user_profile_{user_sf_id}_{profile.salesforce_id}",
                "source": user_sf_id,
                "target": profile.salesforce_id,
                "type": "HAS_PROFILE",
                "label": "has profile"
            })

    # Add role node and edge
    if user.user_role_id:
        role_query = select(RoleSnapshot).where(
            RoleSnapshot.organization_id == org_id,
            RoleSnapshot.salesforce_id == user.user_role_id
        )
        role_result = await db.execute(role_query)
        role = role_result.scalar_one_or_none()
        if role:
            nodes.append({
                "id": role.salesforce_id,
                "type": "role",
                "label": role.name,
                "properties": {}
            })
            edges.append({
                "id": f"user_role_{user_sf_id}_{role.salesforce_id}",
                "source": user_sf_id,
                "target": role.salesforce_id,
                "type": "HAS_ROLE",
                "label": "has role"
            })

    # Permission sets and permission set groups. A group assignment comes in
    # one of two shapes: Salesforce assigns the group's aggregate permission
    # set (Type = Group, with PermissionSetGroupId on the assignment), while
    # the demo fixtures assign the group id (0PG) directly. Either way the
    # group node carries the group's net access, and its component
    # permission sets and muting set hang off it for display only.
    from collections import defaultdict
    from types import SimpleNamespace
    from app.domain.models import PermissionSetGroupComponentSnapshot, PermissionSetGroupSnapshot
    from app.services.effective_access import (
        FIELD_FLAGS, OBJECT_FLAGS, EffectiveAccessService, _Component, _Source, _evaluate,
    )

    ps_assignments_query = select(PermissionSetAssignmentSnapshot).where(
        PermissionSetAssignmentSnapshot.organization_id == org_id,
        PermissionSetAssignmentSnapshot.assignee_id == user_sf_id
    ).order_by(PermissionSetAssignmentSnapshot.permission_set_id)
    all_assignments = (await db.execute(ps_assignments_query)).scalars().all()

    async def _ps_rows(ids):
        if not ids:
            return {}
        rows = (await db.execute(select(PermissionSetSnapshot).where(
            PermissionSetSnapshot.organization_id == org_id,
            PermissionSetSnapshot.salesforce_id.in_(list(ids)),
        ))).scalars().all()
        return {ps.salesforce_id: ps for ps in rows}

    ps_rows = await _ps_rows([a.permission_set_id for a in all_assignments])
    # Draw at most GRAPH_MAX_ASSIGNMENTS sets and groups; the metadata says
    # how many were left out so the UI can show "+N more". Object cards'
    # permissions come from effective access, which always uses them all.
    profile_owned = [a for a in all_assignments
                     if a.permission_set_id in ps_rows and ps_rows[a.permission_set_id].is_owned_by_profile]
    others = [a for a in all_assignments if a not in profile_owned]
    ps_assignments = profile_owned + others[:GRAPH_MAX_ASSIGNMENTS]
    hidden_assignments = max(0, len(others) - GRAPH_MAX_ASSIGNMENTS)

    # Group node id -> PermissionSetGroup id (None if not synced yet).
    group_of_node: Dict[str, Optional[str]] = {}
    for a in ps_assignments:
        ps = ps_rows.get(a.permission_set_id)
        if ps is not None and ps.ps_type == "Group":
            group_of_node[a.permission_set_id] = (
                (a.raw_data or {}).get("PermissionSetGroupId")
                or (ps.raw_data or {}).get("PermissionSetGroupId")
            )
        elif ps is None:
            group_of_node[a.permission_set_id] = a.permission_set_id  # 0PG id, fixture shape
    candidate_group_ids = {g for g in group_of_node.values() if g}
    groups = {
        g.salesforce_id: g
        for g in (await db.execute(select(PermissionSetGroupSnapshot).where(
            PermissionSetGroupSnapshot.organization_id == org_id,
            PermissionSetGroupSnapshot.salesforce_id.in_(list(candidate_group_ids)),
        ))).scalars().all()
    } if candidate_group_ids else {}
    # An unknown id that isn't a synced group is neither a set nor a group.
    group_of_node = {
        node: gid for node, gid in group_of_node.items()
        if node in ps_rows or gid in groups
    }
    components_of_group: Dict[str, List[str]] = defaultdict(list)
    if groups:
        for gid, comp_id in (await db.execute(select(
            PermissionSetGroupComponentSnapshot.permission_set_group_id,
            PermissionSetGroupComponentSnapshot.permission_set_id,
        ).where(
            PermissionSetGroupComponentSnapshot.organization_id == org_id,
            PermissionSetGroupComponentSnapshot.permission_set_group_id.in_(list(groups)),
        ))).all():
            components_of_group[gid].append(comp_id)
    component_rows = await _ps_rows({c for ids in components_of_group.values() for c in ids})

    def _is_muting(ps_id: str) -> bool:
        comp = component_rows.get(ps_id)
        # Salesforce may report a muting set only as a MutingPermissionSet (0QM).
        return comp.is_muting if comp is not None else ps_id.startswith("0QM")

    def _add_node(node: Dict) -> None:
        if not any(n["id"] == node["id"] for n in nodes):
            nodes.append(node)

    permission_set_ids = []  # Collect non-profile permission set IDs
    profile_owned_ps_id = None  # The profile-owned permission set ID
    fixture_groups: List[_Source] = []  # groups whose net access we compute here

    for assignment in ps_assignments:
        pid = assignment.permission_set_id
        ps = ps_rows.get(pid)
        if ps is not None and ps.is_owned_by_profile:
            # Profile permissions are attributed to the profile node.
            profile_owned_ps_id = ps.salesforce_id
            continue

        if pid in group_of_node:
            gid = group_of_node[pid]
            group = groups.get(gid) if gid else None
            label = (group.master_label or group.developer_name) if group else (ps.label or ps.name)
            comp_ids = components_of_group.get(gid, []) if gid else []
            _add_node({
                "id": pid,
                "type": "permission_set_group",
                "label": label,
                "properties": {
                    "group_id": gid,
                    "component_count": sum(1 for c in comp_ids if not _is_muting(c)),
                    "muting_set_count": sum(1 for c in comp_ids if _is_muting(c)),
                },
            })
            edges.append({
                "id": f"user_psg_{user_sf_id}_{pid}",
                "source": user_sf_id,
                "target": pid,
                "type": "ASSIGNED_PERMISSION_SET_GROUP",
                "label": "assigned",
            })
            for comp_id in comp_ids:
                comp = component_rows.get(comp_id)
                muting = _is_muting(comp_id)
                _add_node({
                    "id": comp_id,
                    "type": "muting_permission_set" if muting else "permission_set",
                    "label": (comp.label or comp.name) if comp else (
                        "Muting permission set" if muting else comp_id),
                    "properties": {
                        "ps_type": (comp.ps_type if comp else None) or ("Muting" if muting else "Regular"),
                        "is_muting": muting,
                        "in_group": label,
                    },
                })
                edges.append({
                    "id": f"psg_{'mutes' if muting else 'includes'}_{pid}_{comp_id}",
                    "source": pid,
                    "target": comp_id,
                    "type": "MUTES" if muting else "INCLUDES_PERMISSION_SET",
                    "label": "mutes" if muting else "includes",
                })
            if ps is not None:
                # Aggregate permission set: Salesforce's own post-muting result.
                permission_set_ids.append(pid)
            else:
                fixture_groups.append(_Source(
                    "permission_set_group", label,
                    [_Component(c, c, _is_muting(c)) for c in comp_ids], group_id=pid,
                ))
            continue

        if ps is None:
            continue

        # Regular permission set (not owned by profile).
        # Surface ps_type / is_muting so the frontend can render muting
        # permission sets distinctly (red border, dashed edges, etc).
        permission_set_ids.append(ps.salesforce_id)
        is_muting = ps.ps_type == "Muting"
        _add_node({
            "id": ps.salesforce_id,
            "type": "muting_permission_set" if is_muting else "permission_set",
            "label": ps.label or ps.name,
            "properties": {
                "ps_type": ps.ps_type or "Regular",
                "is_muting": is_muting,
            },
        })
        edges.append({
            "id": f"user_ps_{user_sf_id}_{ps.salesforce_id}",
            "source": user_sf_id,
            "target": ps.salesforce_id,
            "type": "ASSIGNED_MUTING_PERMISSION_SET" if is_muting else "ASSIGNED_PERMISSION_SET",
            "label": "mutes via" if is_muting else "assigned",
        })

    # Fixture-shaped groups have no aggregate permission set, so their net
    # access is the same per-group evaluation effective access uses (union
    # of components minus the muting set), fed in as synthetic rows.
    extra_obj_perms: List[SimpleNamespace] = []
    extra_field_perms: List[SimpleNamespace] = []
    if fixture_groups:
        access_service = EffectiveAccessService(db)
        comp_ids = {c.ps_id for g in fixture_groups for c in g.components}
        obj_by_parent = await access_service._object_perms(org_id, comp_ids)
        field_by_parent = await access_service._field_perms(org_id, comp_ids)
        for source in fixture_groups:
            for obj, p in _evaluate(source, obj_by_parent, OBJECT_FLAGS).granted.items():
                if any(p.values()):
                    extra_obj_perms.append(SimpleNamespace(
                        parent_id=source.group_id, sobject_type=obj,
                        permissions_read=p["read"], permissions_create=p["create"],
                        permissions_edit=p["edit"], permissions_delete=p["delete"],
                    ))
            for fld, p in _evaluate(source, field_by_parent, FIELD_FLAGS).granted.items():
                if any(p.values()):
                    extra_field_perms.append(SimpleNamespace(
                        sobject_type=fld.split(".", 1)[0], field=fld,
                        permissions_read=p["read"], permissions_edit=p["edit"],
                    ))
            permission_set_ids.append(source.group_id)

    # Build permission source IDs for querying
    # For profile: use the profile-owned permission set ID (where permissions are actually stored)
    # For permission sets: use their IDs directly
    permission_source_ids = []
    permission_source_mapping = {}  # Maps permission set ID -> node ID to use for edges

    if profile_owned_ps_id:
        # Profile permissions are stored in the profile-owned permission set
        # But we want edges to come from the profile node, not a separate PS node
        permission_source_ids.append(profile_owned_ps_id)
        permission_source_mapping[profile_owned_ps_id] = user.profile_id  # Map to profile node

    for ps_id in permission_set_ids:
        permission_source_ids.append(ps_id)
        permission_source_mapping[ps_id] = ps_id  # Map to itself

    # Get all field permissions first to group them under objects
    from app.domain.models import FieldPermissionSnapshot
    object_fields = {}  # Map object name to list of fields with permissions

    if permission_source_ids:
        field_perms_query = select(FieldPermissionSnapshot).where(
            FieldPermissionSnapshot.organization_id == org_id,
            FieldPermissionSnapshot.parent_id.in_(permission_source_ids)
        )
        field_perms_result = await db.execute(field_perms_query)
        field_perms = list(field_perms_result.scalars().all()) + extra_field_perms

        # Group fields by object
        for field_perm in field_perms:
            # Use sobject_type directly instead of parsing from field name
            obj_name = field_perm.sobject_type

            # Extract field name from the Field value
            # Field can be in format "Account.Name" or just "Name"
            if '.' in field_perm.field:
                _, field_name = field_perm.field.split('.', 1)
            else:
                field_name = field_perm.field

            # Only include fields user has access to
            if field_perm.permissions_read or field_perm.permissions_edit:
                if obj_name not in object_fields:
                    object_fields[obj_name] = []

                # Check if this field is already in the list
                existing_field = next((f for f in object_fields[obj_name] if f["name"] == field_name), None)
                if not existing_field:
                    object_fields[obj_name].append({
                        "name": field_name,
                        "fullName": field_perm.field,
                        "canRead": field_perm.permissions_read,
                        "canEdit": field_perm.permissions_edit,
                    })
                else:
                    # Merge permissions if same field from multiple sources
                    existing_field["canRead"] = existing_field["canRead"] or field_perm.permissions_read
                    existing_field["canEdit"] = existing_field["canEdit"] or field_perm.permissions_edit

    # Get all object permissions from all sources
    if permission_source_ids:
        obj_perms_query = select(ObjectPermissionSnapshot).where(
            ObjectPermissionSnapshot.organization_id == org_id,
            ObjectPermissionSnapshot.parent_id.in_(permission_source_ids)
        )
        obj_perms_result = await db.execute(obj_perms_query)
        obj_perms = list(obj_perms_result.scalars().all()) + extra_obj_perms

        # System-required fields that are always accessible
        # These are the same across all Salesforce orgs
        SYSTEM_REQUIRED_FIELDS = {
            "Id": {"name": "Id", "fullName": "{object}.Id", "canRead": True, "canEdit": False, "isSystem": True},
            "Name": {"name": "Name", "fullName": "{object}.Name", "canRead": True, "canEdit": True, "isSystem": True},
            "OwnerId": {"name": "OwnerId", "fullName": "{object}.OwnerId", "canRead": True, "canEdit": True, "isSystem": True},
            "CreatedById": {"name": "CreatedById", "fullName": "{object}.CreatedById", "canRead": True, "canEdit": False, "isSystem": True},
            "CreatedDate": {"name": "CreatedDate", "fullName": "{object}.CreatedDate", "canRead": True, "canEdit": False, "isSystem": True},
            "LastModifiedById": {"name": "LastModifiedById", "fullName": "{object}.LastModifiedById", "canRead": True, "canEdit": False, "isSystem": True},
            "LastModifiedDate": {"name": "LastModifiedDate", "fullName": "{object}.LastModifiedDate", "canRead": True, "canEdit": False, "isSystem": True},
            "SystemModstamp": {"name": "SystemModstamp", "fullName": "{object}.SystemModstamp", "canRead": True, "canEdit": False, "isSystem": True},
        }

        # Group by object and source
        for obj_perm in obj_perms:
            object_id = f"object_{obj_perm.sobject_type}"
            # Check if object node already exists
            if not any(n["id"] == object_id for n in nodes):
                fields_list = object_fields.get(obj_perm.sobject_type, []).copy()

                # Add system-required fields if object has Read permission
                # These are fields like Id, Name, OwnerId that are always accessible
                # Only add if not already present in the explicit fields list
                if obj_perm.permissions_read:
                    for field_name, field_template in SYSTEM_REQUIRED_FIELDS.items():
                        # Check if this system field is already in the list
                        if not any(f.get("name") == field_name for f in fields_list):
                            field_data = field_template.copy()
                            field_data["fullName"] = field_template["fullName"].replace("{object}", obj_perm.sobject_type)
                            fields_list.append(field_data)

                nodes.append({
                    "id": object_id,
                    "type": "object",
                    "label": obj_perm.sobject_type,
                    "properties": {
                        "objectName": obj_perm.sobject_type,
                        "canRead": obj_perm.permissions_read,
                        "canCreate": obj_perm.permissions_create,
                        "canEdit": obj_perm.permissions_edit,
                        "canDelete": obj_perm.permissions_delete,
                        # Include explicit fields + system fields
                        "fields": fields_list,
                    }
                })

            # Create edge from permission source to object
            # obj_perm.parent_id is the actual permission set ID (could be profile-owned)
            # We need to map it to the correct node ID (profile node if profile-owned)
            actual_parent_id = obj_perm.parent_id
            node_id_for_edge = permission_source_mapping.get(actual_parent_id, actual_parent_id)

            edge_id = f"ps_obj_{node_id_for_edge}_{obj_perm.sobject_type}"
            if not any(e["id"] == edge_id for e in edges):
                # Build permission label
                perms = []
                if obj_perm.permissions_read:
                    perms.append("R")
                if obj_perm.permissions_create:
                    perms.append("C")
                if obj_perm.permissions_edit:
                    perms.append("E")
                if obj_perm.permissions_delete:
                    perms.append("D")
                perm_label = ",".join(perms) if perms else "access"

                edges.append({
                    "id": edge_id,
                    "source": node_id_for_edge,  # Use mapped node ID (profile if profile-owned)
                    "target": object_id,
                    "type": "GRANTS_ACCESS",
                    "label": perm_label,
                    "properties": {
                        "read": obj_perm.permissions_read,
                        "create": obj_perm.permissions_create,
                        "edit": obj_perm.permissions_edit,
                        "delete": obj_perm.permissions_delete,
                    }
                })

    # Handle objects that have field-level permissions but NO object-level permissions
    # This is common for Standard Profiles that only define field permissions in Profile metadata
    # For example: Analytics Cloud Integration User may have field permissions on Account
    # but no explicit object-level permissions
    for obj_name, fields in object_fields.items():
        object_id = f"object_{obj_name}"
        # Check if this object node was already created above
        if not any(n["id"] == object_id for n in nodes):
            # This object has field permissions but no object permission
            # Create the object node with field permissions + system fields
            fields_list = fields.copy()

            # Add system-required fields
            # When you have field-level permissions, you implicitly have read access to system fields
            for field_name, field_template in SYSTEM_REQUIRED_FIELDS.items():
                # Check if this system field is already in the list
                if not any(f.get("name") == field_name for f in fields_list):
                    field_data = field_template.copy()
                    field_data["fullName"] = field_template["fullName"].replace("{object}", obj_name)
                    fields_list.append(field_data)

            nodes.append({
                "id": object_id,
                "type": "object",
                "label": obj_name,
                "properties": {
                    "objectName": obj_name,
                    # No object-level permissions, only field-level
                    "canRead": False,
                    "canCreate": False,
                    "canEdit": False,
                    "canDelete": False,
                    # But we have field permissions
                    "fields": fields_list,
                }
            })

            # Create edge from profile to this object
            # Field permissions come from profile-owned permission set
            if profile_owned_ps_id:
                node_id_for_edge = permission_source_mapping.get(profile_owned_ps_id, profile_owned_ps_id)
                edge_id = f"ps_obj_{node_id_for_edge}_{obj_name}"
                if not any(e["id"] == edge_id for e in edges):
                    edges.append({
                        "id": edge_id,
                        "source": node_id_for_edge,  # Usually the profile node
                        "target": object_id,
                        "type": "GRANTS_FIELD_ACCESS",
                        "label": "field access",
                        "properties": {
                            "read": False,
                            "create": False,
                            "edit": False,
                            "delete": False,
                            "field_level_only": True,
                        }
                    })

    # Add object-to-object relationships (common Salesforce relationships)
    # This makes the graph look like an ER diagram
    object_relationships = {
        "Account": ["Contact", "Opportunity", "Case"],
        "Opportunity": ["OpportunityLineItem", "OpportunityContactRole"],
        "Case": ["CaseComment"],
        "Lead": ["LeadHistory"],
        "Campaign": ["CampaignMember"],
    }

    for parent_obj, child_objs in object_relationships.items():
        parent_id = f"object_{parent_obj}"
        # Check if parent object exists in the graph
        if any(n["id"] == parent_id for n in nodes):
            for child_obj in child_objs:
                child_id = f"object_{child_obj}"
                # Check if child object exists in the graph
                if any(n["id"] == child_id for n in nodes):
                    # Add relationship edge
                    edge_id = f"rel_{parent_obj}_{child_obj}"
                    if not any(e["id"] == edge_id for e in edges):
                        edges.append({
                            "id": edge_id,
                            "source": parent_id,
                            "target": child_id,
                            "type": "OBJECT_RELATIONSHIP",
                            "label": "related to",
                            "properties": {
                                "relationshipType": "parent-child"
                            }
                        })

    # Object cards show the user's effective object access (every source,
    # after muting), not whichever source's row happened to come first.
    effective = {
        o["object"]: o["access"]
        for o in (await EffectiveAccessService(db).get_user_object_access(org_id, user_sf_id))["objects"]
    }
    for node in nodes:
        if node["type"] == "object" and node["label"] in effective:
            a = effective[node["label"]]
            node["properties"].update(
                canRead=a["read"], canCreate=a["create"], canEdit=a["edit"], canDelete=a["delete"],
            )

    # Optional layer (roadmap item 1): layouts, record pages, Apex and flows.
    extras_meta = None
    if include == "pages_and_automation":
        from app.api.routes.ui_access import latest_ui_access, user_context
        from app.services.ui_access import VISIBILITY_NOTE, graph_extras
        _, profiles, all_ps, assignments, components, group_names = await user_context(db, org_id, user_sf_id)
        extra = graph_extras(
            await latest_ui_access(db, org_id), user, profiles, all_ps, assignments, components, group_names,
            [n["label"] for n in nodes if n["type"] == "object"],
        )
        ids = {n["id"] for n in nodes} | {n["id"] for n in extra["nodes"]}
        nodes.extend(extra["nodes"])
        edges.extend(e for e in extra["edges"] if e["source"] in ids and e["target"] in ids)
        extras_meta = {"available": extra["available"], "hidden": extra["hidden"], "note": VISIBILITY_NOTE}

    return {
        "nodes": nodes,
        "edges": edges,
        "metadata": {
            "nodeCount": len(nodes),
            "edgeCount": len(edges),
            "centerNodeId": user_sf_id,
            "assignmentsShown": len(ps_assignments) - len(profile_owned),
            "assignmentsHidden": hidden_assignments,
            "pagesAndAutomation": extras_meta,
            "generatedAt": datetime.utcnow().isoformat()
        }
    }


@router.get("/orgs/{org_id}/graph/node/{node_id}/details")
async def get_node_details(
    org_id: str,
    node_id: str,
    preview: Optional[int] = Query(None, ge=1, le=50),
    db: AsyncSession = Depends(get_database),
):
    """Get detailed breakdown of what a specific node (permission set, profile) grants access to"""
    try:
        from app.domain.models import (
            PermissionSetSnapshot,
            ProfileSnapshot,
            ObjectPermissionSnapshot,
            FieldPermissionSnapshot,
        )

        # Determine node type and get basic info
        node_info = {}

        # Try to find it as a permission set
        ps_query = select(PermissionSetSnapshot).where(
            PermissionSetSnapshot.organization_id == org_id,
            PermissionSetSnapshot.salesforce_id == node_id
        )
        ps_result = await db.execute(ps_query)
        ps = ps_result.scalar_one_or_none()

        if ps:
            node_sources = await resolve_grant_sources(db, org_id, [ps.salesforce_id])
            node_source = node_sources.get(ps.salesforce_id)
            node_info = {
                "id": ps.salesforce_id,
                "type": "permission_set",
                "name": ps.name,
                "label": node_source.display if node_source else ps.label,
                "description": getattr(ps, 'description', None),
            }
        else:
            # Try as a profile
            profile_query = select(ProfileSnapshot).where(
                ProfileSnapshot.organization_id == org_id,
                ProfileSnapshot.salesforce_id == node_id
            )
            profile_result = await db.execute(profile_query)
            profile = profile_result.scalar_one_or_none()

            if profile:
                node_info = {
                    "id": profile.salesforce_id,
                    "type": "profile",
                    "name": profile.name,
                    "description": getattr(profile, 'description', None),
                }
            else:
                raise HTTPException(status_code=404, detail="Node not found")

        # Get object permissions
        obj_perms_query = select(ObjectPermissionSnapshot).where(
            ObjectPermissionSnapshot.organization_id == org_id,
            ObjectPermissionSnapshot.parent_id == node_id
        )
        obj_perms_result = await db.execute(obj_perms_query)
        obj_perms = obj_perms_result.scalars().all()

        objects_granted = []
        for obj_perm in obj_perms:
            permissions = []
            if obj_perm.permissions_read:
                permissions.append("Read")
            if obj_perm.permissions_create:
                permissions.append("Create")
            if obj_perm.permissions_edit:
                permissions.append("Edit")
            if obj_perm.permissions_delete:
                permissions.append("Delete")
            if obj_perm.permissions_view_all_records:
                permissions.append("View All")
            if obj_perm.permissions_modify_all_records:
                permissions.append("Modify All")

            objects_granted.append({
                "objectName": obj_perm.sobject_type,
                "permissions": permissions,
                "canRead": obj_perm.permissions_read,
                "canCreate": obj_perm.permissions_create,
                "canEdit": obj_perm.permissions_edit,
                "canDelete": obj_perm.permissions_delete,
                "viewAll": obj_perm.permissions_view_all_records,
                "modifyAll": obj_perm.permissions_modify_all_records,
            })

        # Get field permissions
        field_perms_query = select(FieldPermissionSnapshot).where(
            FieldPermissionSnapshot.organization_id == org_id,
            FieldPermissionSnapshot.parent_id == node_id
        )
        field_perms_result = await db.execute(field_perms_query)
        field_perms = field_perms_result.scalars().all()

        fields_granted = []
        for field_perm in field_perms:
            # Parse object.field format
            if '.' in field_perm.field:
                obj_name, field_name = field_perm.field.split('.', 1)
            else:
                obj_name = "Unknown"
                field_name = field_perm.field

            permissions = []
            if field_perm.permissions_read:
                permissions.append("Read")
            if field_perm.permissions_edit:
                permissions.append("Edit")

            fields_granted.append({
                "fieldName": field_perm.field,
                "objectName": obj_name,
                "displayName": field_name,
                "permissions": permissions,
                "canRead": field_perm.permissions_read,
                "canEdit": field_perm.permissions_edit,
            })

        # Record-level access is a placeholder for now
        records_info = {
            "note": "Record-level access analysis requires additional Salesforce data sync",
            "potentialSources": [
                "Sharing Rules (criteria-based and owner-based)",
                "Manual Shares",
                "Role Hierarchy access",
                "Territory Rules",
                "Account/Opportunity/Case Teams",
            ],
            "implementationRequired": True,
        }

        # Other access aspects
        other_access = {
            "systemPermissions": [],  # Would need SystemPermissionSnapshot
            "customPermissions": [],  # Would need CustomPermissionSnapshot
            "tabVisibility": [],      # Would need TabVisibilitySnapshot
            "apexClasses": [],        # Would need SetupEntityAccessSnapshot
        }

        return {
            "node": node_info,
            # With `preview`, the first rows; totals are in summary, full lists on the set's page.
            "objectsGranted": objects_granted[:preview] if preview else objects_granted,
            "fieldsGranted": fields_granted[:preview] if preview else fields_granted,
            "recordsInfo": records_info,
            "otherAccess": other_access,
            "summary": {
                "totalObjects": len(objects_granted),
                "totalFields": len(fields_granted),
                "objectsWithFullAccess": sum(1 for obj in objects_granted if
                    obj["canRead"] and obj["canCreate"] and obj["canEdit"] and obj["canDelete"]),
                "objectsWithModifyAll": sum(1 for obj in objects_granted if obj["modifyAll"]),
            }
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get node details: {str(e)}"
        )
