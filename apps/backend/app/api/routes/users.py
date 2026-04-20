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
    userId: Optional[str] = None
    user_id: Optional[str] = None
    userName: Optional[str] = None
    user_name: Optional[str] = None
    score: Optional[float] = None
    anomaly_score: Optional[float] = None
    severity: str
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


@router.get("/orgs/{org_id}/users")
async def list_users(
    org_id: str,
    is_active: Optional[bool] = None,
    department: Optional[str] = None,
    limit: int = Query(100, le=1000),
    db: AsyncSession = Depends(get_database),
):
    """List users in organization"""
    from app.domain.models import ProfileSnapshot, RoleSnapshot, RiskScore

    query = select(UserSnapshot).where(UserSnapshot.organization_id == org_id)

    if is_active is not None:
        query = query.where(UserSnapshot.is_active == is_active)
    if department:
        query = query.where(UserSnapshot.department == department)

    query = query.limit(limit)

    result = await db.execute(query)
    users = result.scalars().all()

    # Build response with role, profile, and risk data
    user_list = []
    for u in users:
        # Get profile name
        profile_name = None
        if u.profile_id:
            profile_query = select(ProfileSnapshot).where(
                ProfileSnapshot.organization_id == org_id,
                ProfileSnapshot.salesforce_id == u.profile_id
            )
            profile_result = await db.execute(profile_query)
            profile = profile_result.scalar_one_or_none()
            if profile:
                profile_name = profile.name

        # Get role name
        role_name = None
        if u.user_role_id:
            role_query = select(RoleSnapshot).where(
                RoleSnapshot.organization_id == org_id,
                RoleSnapshot.salesforce_id == u.user_role_id
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
            RiskScore.entity_id == u.salesforce_id
        ).order_by(RiskScore.calculated_at.desc()).limit(1)
        risk_result = await db.execute(risk_query)
        risk = risk_result.scalar_one_or_none()
        if risk:
            risk_level = risk.risk_level.value

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
            "role": role_name,
            "profile": profile_name,
            "risk": risk_level,
        })

    return user_list


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
        "riskLevel": risk_level,
        "lastLoginDate": None,  # We don't have this data yet
    }


@router.get("/orgs/{org_id}/users/{user_sf_id}/access/objects")
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


@router.get("/orgs/{org_id}/users/{user_sf_id}/access/fields")
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


# Alias endpoints for backwards compatibility with frontend
@router.get("/orgs/{org_id}/users/{user_sf_id}/effective-access/objects")
async def get_user_effective_object_access(
    org_id: str,
    user_sf_id: str,
    db: AsyncSession = Depends(get_database),
):
    """Get effective object access for user (alias for /access/objects)"""
    service = EffectiveAccessService(db)
    try:
        access = await service.get_user_object_access(org_id, user_sf_id)
        return access
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/orgs/{org_id}/users/{user_sf_id}/effective-access/fields")
async def get_user_effective_field_access(
    org_id: str,
    user_sf_id: str,
    db: AsyncSession = Depends(get_database),
):
    """Get effective field access for user (alias for /access/fields)"""
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

    return [
        {
            "id": a.id,
            "user_id": a.user_id,
            "anomaly_score": round(a.anomaly_score, 2),
            "severity": a.severity.value,
            "reasons": a.reasons,
            "detected_at": a.detected_at.isoformat(),
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


@router.get("/orgs/{org_id}/anomalies", response_model=List[AnomalyResponse])
async def list_anomalies(
    org_id: str,
    severity: Optional[str] = None,
    limit: int = Query(100, le=1000),
    db: AsyncSession = Depends(get_database),
):
    """List anomalies for organization"""
    # Join with UserSnapshot to get user names
    query = (
        select(AccessAnomaly, UserSnapshot.name)
        .join(UserSnapshot, AccessAnomaly.user_id == UserSnapshot.salesforce_id)
        .where(
            AccessAnomaly.organization_id == org_id,
            UserSnapshot.organization_id == org_id,
        )
    )

    if severity:
        query = query.where(AccessAnomaly.severity == severity)

    query = query.order_by(AccessAnomaly.anomaly_score.desc()).limit(limit)

    result = await db.execute(query)
    anomaly_user_pairs = result.all()

    return [
        {
            "id": a.id,
            "userId": a.user_id,  # Frontend expects camelCase
            "user_id": a.user_id,  # Keep for backwards compatibility
            "userName": user_name,  # Frontend expects camelCase
            "user_name": user_name,  # Keep for backwards compatibility
            "score": a.anomaly_score,  # Frontend expects 'score'
            "anomaly_score": a.anomaly_score,  # Keep for backwards compatibility
            "severity": a.severity.value,
            "reasons": a.reasons,
            "detectedAt": a.detected_at.isoformat(),  # Frontend expects camelCase
            "detected_at": a.detected_at.isoformat(),  # Keep for backwards compatibility
        }
        for a, user_name in anomaly_user_pairs
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


@router.get("/orgs/{org_id}/users/{user_sf_id}/record-access")
async def get_user_record_access(
    org_id: str,
    user_sf_id: str,
    object_name: Optional[str] = None,
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
    from app.services.record_access import RecordAccessService

    # Create service instance
    service = RecordAccessService(db)

    # Get record access information
    access_info = await service.get_user_record_access(org_id, user_sf_id)

    # Convert to camelCase for frontend
    return {
        "userId": access_info["user_id"],
        "userName": access_info.get("user_name", "Unknown"),
        "ownedRecords": access_info["owned_records"],
        "roleHierarchy": access_info["role_hierarchy"],
        "manualShares": access_info["manual_shares"],
        "teamAccess": access_info["team_access"],
        "sharingRules": access_info["sharing_rules"],
        "summary": access_info["summary"],
    }


@router.get("/orgs/{org_id}/objects")
async def list_objects(
    org_id: str,
    search: Optional[str] = None,
    limit: int = Query(500, le=10000),
    db: AsyncSession = Depends(get_database),
):
    """List unique Salesforce objects from permissions data"""
    from sqlalchemy import func, distinct
    from app.domain.models import (
        ObjectPermissionSnapshot,
        UserSnapshot,
        PermissionSetAssignmentSnapshot
    )

    # Get distinct object types with permission count
    query = select(
        ObjectPermissionSnapshot.sobject_type,
        func.count(distinct(ObjectPermissionSnapshot.parent_id)).label('permission_set_count')
    ).where(
        ObjectPermissionSnapshot.organization_id == org_id
    ).group_by(
        ObjectPermissionSnapshot.sobject_type
    )

    if search:
        query = query.where(ObjectPermissionSnapshot.sobject_type.ilike(f'%{search}%'))

    query = query.order_by(ObjectPermissionSnapshot.sobject_type).limit(limit)

    result = await db.execute(query)
    objects = result.all()

    def create_label(api_name: str) -> str:
        """Create a human-readable label from API name"""
        if api_name.endswith('__c'):
            api_name = api_name[:-3]
        import re
        label = re.sub(r'([a-z])([A-Z])', r'\1 \2', api_name)
        label = label.replace('_', ' ')
        return label

    # For each object, calculate actual user count with proper deduplication
    object_list = []
    for obj in objects:
        # Get all parent_ids (profiles and permission sets) for this object
        perms_query = select(ObjectPermissionSnapshot.parent_id).where(
            ObjectPermissionSnapshot.organization_id == org_id,
            ObjectPermissionSnapshot.sobject_type == obj.sobject_type
        )
        perms_result = await db.execute(perms_query)
        parent_ids = [p[0] for p in perms_result.all()]

        # Get unique user IDs through profiles
        users_from_profiles_query = select(distinct(UserSnapshot.salesforce_id)).where(
            UserSnapshot.organization_id == org_id,
            UserSnapshot.profile_id.in_(parent_ids)
        )
        users_from_profiles_result = await db.execute(users_from_profiles_query)
        users_from_profiles = set(row[0] for row in users_from_profiles_result.all())

        # Get unique user IDs through permission sets
        users_from_ps_query = select(distinct(PermissionSetAssignmentSnapshot.assignee_id)).where(
            PermissionSetAssignmentSnapshot.organization_id == org_id,
            PermissionSetAssignmentSnapshot.permission_set_id.in_(parent_ids)
        )
        users_from_ps_result = await db.execute(users_from_ps_query)
        users_from_ps = set(row[0] for row in users_from_ps_result.all())

        # Union the sets to get truly unique user count
        all_users = users_from_profiles.union(users_from_ps)
        total_users = len(all_users)

        object_list.append({
            "id": obj.sobject_type,
            "name": obj.sobject_type,
            "apiName": obj.sobject_type,
            "label": create_label(obj.sobject_type),
            "isCustom": obj.sobject_type.endswith('__c'),
            "fieldCount": 0,
            "userCount": total_users,
            "permissionSetCount": obj.permission_set_count,
        })

    return object_list


@router.get("/orgs/{org_id}/objects/{object_name}")
async def get_object_details(
    org_id: str,
    object_name: str,
    db: AsyncSession = Depends(get_database),
):
    """Get detailed information about a Salesforce object"""
    from sqlalchemy import func
    from app.domain.models import (
        ObjectPermissionSnapshot,
        PermissionSetSnapshot,
        ProfileSnapshot,
        PermissionSetAssignmentSnapshot,
        UserSnapshot
    )

    # Get all permissions for this object
    perms_query = select(ObjectPermissionSnapshot).where(
        ObjectPermissionSnapshot.organization_id == org_id,
        ObjectPermissionSnapshot.sobject_type == object_name
    )
    perms_result = await db.execute(perms_query)
    permissions = perms_result.scalars().all()

    # Get profiles and permission sets that grant access (deduplicate by ID)
    profiles_dict = {}
    permission_sets_dict = {}

    for perm in permissions:
        # Check if it's a profile or permission set
        profile_query = select(ProfileSnapshot).where(
            ProfileSnapshot.organization_id == org_id,
            ProfileSnapshot.salesforce_id == perm.parent_id
        )
        profile_result = await db.execute(profile_query)
        profile = profile_result.scalar_one_or_none()

        if profile:
            profiles_dict[profile.salesforce_id] = {
                "id": profile.salesforce_id,
                "name": profile.name,
                "read": perm.permissions_read,
                "create": perm.permissions_create,
                "edit": perm.permissions_edit,
                "delete": perm.permissions_delete,
                "viewAll": perm.permissions_view_all_records,
                "modifyAll": perm.permissions_modify_all_records,
            }
        else:
            # It's a permission set
            ps_query = select(PermissionSetSnapshot).where(
                PermissionSetSnapshot.organization_id == org_id,
                PermissionSetSnapshot.salesforce_id == perm.parent_id
            )
            ps_result = await db.execute(ps_query)
            ps = ps_result.scalar_one_or_none()

            if ps:
                permission_sets_dict[ps.salesforce_id] = {
                    "id": ps.salesforce_id,
                    "name": ps.name,
                    "label": ps.label,
                    "read": perm.permissions_read,
                    "create": perm.permissions_create,
                    "edit": perm.permissions_edit,
                    "delete": perm.permissions_delete,
                    "viewAll": perm.permissions_view_all_records,
                    "modifyAll": perm.permissions_modify_all_records,
                }

    profiles_with_access = list(profiles_dict.values())
    permission_sets_with_access = list(permission_sets_dict.values())

    # Get users with access (through profiles or permission sets)
    # Use a dict to group access methods by user to avoid double-counting
    users_dict = {}

    # Users through profiles
    for profile in profiles_with_access:
        users_query = select(UserSnapshot).where(
            UserSnapshot.organization_id == org_id,
            UserSnapshot.profile_id == profile["id"]
        )
        users_result = await db.execute(users_query)
        users = users_result.scalars().all()
        for user in users:
            if user.salesforce_id not in users_dict:
                users_dict[user.salesforce_id] = {
                    "id": user.salesforce_id,
                    "name": user.name,
                    "email": user.email,
                    "access_methods": []
                }
            users_dict[user.salesforce_id]["access_methods"].append("Profile: " + profile["name"])

    # Users through permission sets
    for ps in permission_sets_with_access:
        assignments_query = select(PermissionSetAssignmentSnapshot).where(
            PermissionSetAssignmentSnapshot.organization_id == org_id,
            PermissionSetAssignmentSnapshot.permission_set_id == ps["id"]
        )
        assignments_result = await db.execute(assignments_query)
        assignments = assignments_result.scalars().all()

        for assignment in assignments:
            user_query = select(UserSnapshot).where(
                UserSnapshot.organization_id == org_id,
                UserSnapshot.salesforce_id == assignment.assignee_id
            )
            user_result = await db.execute(user_query)
            user = user_result.scalar_one_or_none()
            if user:
                if user.salesforce_id not in users_dict:
                    users_dict[user.salesforce_id] = {
                        "id": user.salesforce_id,
                        "name": user.name,
                        "email": user.email,
                        "access_methods": []
                    }
                users_dict[user.salesforce_id]["access_methods"].append("Permission Set: " + ps["name"])

    # Convert to list and format access via
    users_with_access = [
        {
            "salesforceUserId": user_info["id"],
            "name": user_info["name"],
            "email": user_info["email"],
            "accessVia": ", ".join(user_info["access_methods"][:2]) + (" and more..." if len(user_info["access_methods"]) > 2 else "")
        }
        for user_info in sorted(users_dict.values(), key=lambda x: x["name"])
    ]

    def create_label(api_name: str) -> str:
        """Create a human-readable label from API name"""
        if api_name.endswith('__c'):
            api_name = api_name[:-3]
        import re
        label = re.sub(r'([a-z])([A-Z])', r'\1 \2', api_name)
        label = label.replace('_', ' ')
        return label

    return {
        "name": object_name,
        "apiName": object_name,
        "label": create_label(object_name),
        "isCustom": object_name.endswith('__c'),
        "profilesWithAccess": profiles_with_access,
        "permissionSetsWithAccess": permission_sets_with_access,
        "usersWithAccess": users_with_access,
        "totalUsers": len(users_with_access),
        "totalProfiles": len(profiles_with_access),
        "totalPermissionSets": len(permission_sets_with_access),
    }


@router.get("/orgs/{org_id}/fields")
async def list_fields(
    org_id: str,
    search: Optional[str] = None,
    object_type: Optional[str] = None,
    starts_with: Optional[str] = None,  # Letter filter (A-Z)
    page: int = Query(1, ge=1),
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_database),
):
    """
    List unique Salesforce fields from permissions data

    Supports alphabetical filtering and pagination:
    - starts_with: Filter fields starting with a specific letter (A-Z)
    - page: Page number (1-indexed)
    - limit: Items per page (default 100, max 500)
    """
    from sqlalchemy import func
    from app.domain.models import FieldPermissionSnapshot

    # Get distinct fields with counts
    query = select(
        FieldPermissionSnapshot.sobject_type,
        FieldPermissionSnapshot.field,
        func.count(FieldPermissionSnapshot.id).label('permission_count')
    ).where(
        FieldPermissionSnapshot.organization_id == org_id
    ).group_by(
        FieldPermissionSnapshot.sobject_type,
        FieldPermissionSnapshot.field
    )

    # Apply filters
    if search:
        query = query.where(FieldPermissionSnapshot.field.ilike(f'%{search}%'))

    if object_type:
        query = query.where(FieldPermissionSnapshot.sobject_type == object_type)

    # Alphabetical filter - match fields starting with the specified letter
    if starts_with:
        letter = starts_with.upper()
        if letter.isalpha() and len(letter) == 1:
            # Match fields starting with the letter (case-insensitive)
            query = query.where(FieldPermissionSnapshot.field.ilike(f'{letter}%'))

    # Order by field name alphabetically
    query = query.order_by(
        FieldPermissionSnapshot.field,
        FieldPermissionSnapshot.sobject_type
    )

    # Get total count for pagination
    count_query = select(func.count()).select_from(
        query.alias('subquery')
    )
    count_result = await db.execute(count_query)
    total_count = count_result.scalar() or 0

    # Apply pagination
    offset = (page - 1) * limit
    query = query.offset(offset).limit(limit)

    result = await db.execute(query)
    fields = result.all()

    def create_label(api_name: str) -> str:
        """Create a human-readable label from API name"""
        # Remove object prefix (e.g., Account.Name -> Name)
        if '.' in api_name:
            api_name = api_name.split('.')[-1]
        # Remove __c suffix for custom fields
        if api_name.endswith('__c'):
            api_name = api_name[:-3]
        # Replace underscores with spaces and title case
        return ' '.join(word.capitalize() for word in api_name.replace('_', ' ').split())

    # Calculate pagination metadata
    total_pages = (total_count + limit - 1) // limit if total_count > 0 else 1

    return {
        "fields": [
            {
                "id": f"{field.sobject_type}.{field.field}",
                "objectName": field.sobject_type,
                "apiName": field.field,
                "label": create_label(field.field),
                "dataType": "String",  # We don't have this info yet
                "isSensitive": False,  # Would need field metadata to determine
                "isEncrypted": False,  # Would need field metadata to determine
                "isCustom": field.field.endswith('__c'),
                "userCount": field.permission_count,
                "permissionCount": field.permission_count,
            }
            for field in fields
        ],
        "pagination": {
            "page": page,
            "limit": limit,
            "total": total_count,
            "totalPages": total_pages,
            "hasMore": page < total_pages,
        }
    }


@router.get("/orgs/{org_id}/fields/{field_id}")
async def get_field_details(
    org_id: str,
    field_id: str,
    db: AsyncSession = Depends(get_database),
):
    """Get detailed information about a Salesforce field"""
    from sqlalchemy import func
    from app.domain.models import (
        FieldPermissionSnapshot,
        PermissionSetSnapshot,
        ProfileSnapshot,
        PermissionSetAssignmentSnapshot,
        UserSnapshot
    )

    # Parse field_id format "ObjectName.FieldName"
    if '.' not in field_id:
        raise HTTPException(status_code=400, detail="Invalid field_id format. Expected 'ObjectName.FieldName'")

    object_name, field_name = field_id.split('.', 1)

    # Get all permissions for this field
    perms_query = select(FieldPermissionSnapshot).where(
        FieldPermissionSnapshot.organization_id == org_id,
        FieldPermissionSnapshot.sobject_type == object_name,
        FieldPermissionSnapshot.field == field_name
    )
    perms_result = await db.execute(perms_query)
    permissions = perms_result.scalars().all()

    if not permissions:
        raise HTTPException(status_code=404, detail="Field not found")

    # Get profiles and permission sets that grant access (deduplicate by ID)
    profiles_dict = {}
    permission_sets_dict = {}

    for perm in permissions:
        # Check if it's a profile or permission set
        profile_query = select(ProfileSnapshot).where(
            ProfileSnapshot.organization_id == org_id,
            ProfileSnapshot.salesforce_id == perm.parent_id
        )
        profile_result = await db.execute(profile_query)
        profile = profile_result.scalar_one_or_none()

        if profile:
            profiles_dict[profile.salesforce_id] = {
                "id": profile.salesforce_id,
                "name": profile.name,
                "read": perm.permissions_read,
                "edit": perm.permissions_edit,
            }
        else:
            # It's a permission set
            ps_query = select(PermissionSetSnapshot).where(
                PermissionSetSnapshot.organization_id == org_id,
                PermissionSetSnapshot.salesforce_id == perm.parent_id
            )
            ps_result = await db.execute(ps_query)
            ps = ps_result.scalar_one_or_none()

            if ps:
                # For profile-owned permission sets, use the profile name instead
                display_name = ps.label or ps.name
                if ps.is_owned_by_profile and ps.profile_id:
                    # Get the profile name
                    prof_query = select(ProfileSnapshot).where(
                        ProfileSnapshot.organization_id == org_id,
                        ProfileSnapshot.salesforce_id == ps.profile_id
                    )
                    prof_result = await db.execute(prof_query)
                    prof = prof_result.scalar_one_or_none()
                    if prof:
                        display_name = f"{prof.name} (Profile)"

                permission_sets_dict[ps.salesforce_id] = {
                    "id": ps.salesforce_id,
                    "name": display_name,
                    "label": display_name,
                    "read": perm.permissions_read,
                    "edit": perm.permissions_edit,
                }

    profiles_with_access = list(profiles_dict.values())
    permission_sets_with_access = list(permission_sets_dict.values())

    # Get users with access (through profiles or permission sets)
    # Use a dict to group access methods by user to avoid double-counting
    users_dict = {}

    # Users through profiles
    for profile in profiles_with_access:
        users_query = select(UserSnapshot).where(
            UserSnapshot.organization_id == org_id,
            UserSnapshot.profile_id == profile["id"]
        )
        users_result = await db.execute(users_query)
        users = users_result.scalars().all()
        for user in users:
            if user.salesforce_id not in users_dict:
                users_dict[user.salesforce_id] = {
                    "id": user.salesforce_id,
                    "name": user.name,
                    "email": user.email,
                    "access_methods": []
                }
            users_dict[user.salesforce_id]["access_methods"].append("Profile: " + profile["name"])

    # Users through permission sets
    for ps in permission_sets_with_access:
        assignments_query = select(PermissionSetAssignmentSnapshot).where(
            PermissionSetAssignmentSnapshot.organization_id == org_id,
            PermissionSetAssignmentSnapshot.permission_set_id == ps["id"]
        )
        assignments_result = await db.execute(assignments_query)
        assignments = assignments_result.scalars().all()

        for assignment in assignments:
            user_query = select(UserSnapshot).where(
                UserSnapshot.organization_id == org_id,
                UserSnapshot.salesforce_id == assignment.assignee_id
            )
            user_result = await db.execute(user_query)
            user = user_result.scalar_one_or_none()
            if user:
                if user.salesforce_id not in users_dict:
                    users_dict[user.salesforce_id] = {
                        "id": user.salesforce_id,
                        "name": user.name,
                        "email": user.email,
                        "access_methods": []
                    }
                users_dict[user.salesforce_id]["access_methods"].append("Permission Set: " + ps["name"])

    # Convert to list and format access via
    users_with_access = [
        {
            "salesforceUserId": user_info["id"],
            "name": user_info["name"],
            "email": user_info["email"],
            "accessVia": ", ".join(user_info["access_methods"][:2]) + (" and more..." if len(user_info["access_methods"]) > 2 else "")
        }
        for user_info in sorted(users_dict.values(), key=lambda x: x["name"])
    ]

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
        "label": create_label(field_name),
        "isCustom": field_name.endswith('__c'),
        "dataType": "String",  # We don't have this metadata yet
        "isSensitive": False,  # Would need field metadata
        "isEncrypted": False,  # Would need field metadata
        "profilesWithAccess": profiles_with_access,
        "permissionSetsWithAccess": permission_sets_with_access,
        "usersWithAccess": users_with_access,
        "totalUsers": len(users_with_access),
        "totalProfiles": len(profiles_with_access),
        "totalPermissionSets": len(permission_sets_with_access),
    }


@router.get("/orgs/{org_id}/graph/user/{user_sf_id}")
async def get_user_graph(
    org_id: str,
    user_sf_id: str,
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

    # Add permission set nodes and edges
    ps_assignments_query = select(PermissionSetAssignmentSnapshot).where(
        PermissionSetAssignmentSnapshot.organization_id == org_id,
        PermissionSetAssignmentSnapshot.assignee_id == user_sf_id
    ).limit(10)  # Limit to avoid overwhelming the graph
    ps_assignments_result = await db.execute(ps_assignments_query)
    ps_assignments = ps_assignments_result.scalars().all()

    permission_set_ids = []  # Collect non-profile permission set IDs
    profile_owned_ps_id = None  # The profile-owned permission set ID

    for assignment in ps_assignments:
        ps_query = select(PermissionSetSnapshot).where(
            PermissionSetSnapshot.organization_id == org_id,
            PermissionSetSnapshot.salesforce_id == assignment.permission_set_id
        )
        ps_result = await db.execute(ps_query)
        ps = ps_result.scalar_one_or_none()
        if ps:
            if ps.is_owned_by_profile:
                # This is the profile-owned permission set
                # Store its ID to use for querying permissions, but don't create a node
                # The permissions will be attributed to the profile node instead
                profile_owned_ps_id = ps.salesforce_id
                continue

            # Regular permission set (not owned by profile)
            permission_set_ids.append(ps.salesforce_id)
            nodes.append({
                "id": ps.salesforce_id,
                "type": "permission_set",
                "label": ps.label or ps.name,
                "properties": {}
            })
            edges.append({
                "id": f"user_ps_{user_sf_id}_{ps.salesforce_id}",
                "source": user_sf_id,
                "target": ps.salesforce_id,
                "type": "ASSIGNED_PERMISSION_SET",
                "label": "assigned"
            })

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
        field_perms = field_perms_result.scalars().all()

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
        obj_perms = obj_perms_result.scalars().all()

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
                if obj_perm.permissions_read: perms.append("R")
                if obj_perm.permissions_create: perms.append("C")
                if obj_perm.permissions_edit: perms.append("E")
                if obj_perm.permissions_delete: perms.append("D")
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

    return {
        "nodes": nodes,
        "edges": edges,
        "metadata": {
            "nodeCount": len(nodes),
            "edgeCount": len(edges),
            "centerNodeId": user_sf_id,
            "generatedAt": datetime.utcnow().isoformat()
        }
    }


@router.get("/orgs/{org_id}/graph/node/{node_id}/details")
async def get_node_details(
    org_id: str,
    node_id: str,
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
            node_info = {
                "id": ps.salesforce_id,
                "type": "permission_set",
                "name": ps.name,
                "label": ps.label,
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
            if obj_perm.permissions_read: permissions.append("Read")
            if obj_perm.permissions_create: permissions.append("Create")
            if obj_perm.permissions_edit: permissions.append("Edit")
            if obj_perm.permissions_delete: permissions.append("Delete")
            if obj_perm.permissions_view_all_records: permissions.append("View All")
            if obj_perm.permissions_modify_all_records: permissions.append("Modify All")

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
            if field_perm.permissions_read: permissions.append("Read")
            if field_perm.permissions_edit: permissions.append("Edit")

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
            "objectsGranted": objects_granted,
            "fieldsGranted": fields_granted,
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


@router.get("/orgs/{org_id}/debug/field-permissions")
async def debug_field_permissions(
    org_id: str,
    profile_id: str = Query(..., description="Profile ID to check"),
    db: AsyncSession = Depends(get_database),
):
    """Debug endpoint to check field permissions in database"""
    from app.domain.models import FieldPermissionSnapshot, PermissionSetSnapshot

    # Find profile-owned permission set
    ps_query = select(PermissionSetSnapshot).where(
        PermissionSetSnapshot.organization_id == org_id,
        PermissionSetSnapshot.profile_id == profile_id,
        PermissionSetSnapshot.is_owned_by_profile == True
    )
    ps_result = await db.execute(ps_query)
    ps = ps_result.scalar_one_or_none()

    if not ps:
        return {
            "error": "No profile-owned permission set found",
            "profile_id": profile_id
        }

    # Get ALL field permissions for this permission set (no object filter)
    field_perms_all_query = select(FieldPermissionSnapshot).where(
        FieldPermissionSnapshot.organization_id == org_id,
        FieldPermissionSnapshot.parent_id == ps.salesforce_id
    ).limit(50)
    field_perms_all_result = await db.execute(field_perms_all_query)
    field_perms_all = field_perms_all_result.scalars().all()

    # Get Account field permissions specifically
    field_perms_account_query = select(FieldPermissionSnapshot).where(
        FieldPermissionSnapshot.organization_id == org_id,
        FieldPermissionSnapshot.parent_id == ps.salesforce_id,
        FieldPermissionSnapshot.sobject_type == "Account"
    ).limit(20)
    field_perms_account_result = await db.execute(field_perms_account_query)
    field_perms_account = field_perms_account_result.scalars().all()

    return {
        "profile_id": profile_id,
        "profile_owned_ps_id": ps.salesforce_id,
        "profile_owned_ps_name": ps.name,
        "total_field_permissions_all_objects": len(field_perms_all),
        "total_account_field_permissions": len(field_perms_account),
        "sample_field_permissions_all": [
            {
                "id": fp.salesforce_id,
                "parent_id": fp.parent_id,
                "sobject_type": fp.sobject_type,
                "field": fp.field,
                "permissions_read": fp.permissions_read,
                "permissions_edit": fp.permissions_edit,
            }
            for fp in field_perms_all
        ],
        "sample_account_field_permissions": [
            {
                "id": fp.salesforce_id,
                "parent_id": fp.parent_id,
                "sobject_type": fp.sobject_type,
                "field": fp.field,
                "permissions_read": fp.permissions_read,
                "permissions_edit": fp.permissions_edit,
            }
            for fp in field_perms_account
        ]
    }


@router.get("/orgs/{org_id}/debug/query-salesforce")
async def debug_query_salesforce(
    org_id: str,
    parent_id: str = Query(..., description="Permission Set ID (ParentId)"),
    db: AsyncSession = Depends(get_database),
):
    """Debug endpoint to query Salesforce directly for field permissions"""
    from app.domain.models import Organization, SalesforceConnection
    from app.salesforce.client import SalesforceAPIClient

    # Get org and connection
    org_query = select(Organization).where(Organization.id == org_id)
    org_result = await db.execute(org_query)
    org = org_result.scalar_one_or_none()

    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    conn_query = select(SalesforceConnection).where(
        SalesforceConnection.organization_id == org_id
    )
    conn_result = await db.execute(conn_query)
    conn = conn_result.scalar_one_or_none()

    if not conn:
        raise HTTPException(status_code=404, detail="No Salesforce connection found")

    # Query Salesforce directly
    client = SalesforceAPIClient(
        instance_url=conn.instance_url,
        access_token=conn.access_token or "",
    )

    # Query for Account field permissions for this permission set
    soql = f"""
        SELECT Id, ParentId, SobjectType, Field, PermissionsRead, PermissionsEdit
        FROM FieldPermissions
        WHERE ParentId = '{parent_id}' AND SobjectType = 'Account'
        LIMIT 50
    """

    try:
        records = await client.query_all(soql)
        return {
            "parent_id": parent_id,
            "soql_query": soql,
            "total_account_field_permissions": len(records),
            "sample_field_permissions": records[:20]
        }
    except Exception as e:
        return {
            "error": str(e),
            "parent_id": parent_id,
            "soql_query": soql
        }




@router.get("/orgs/{org_id}/debug/profile-metadata")
async def debug_profile_metadata(
    org_id: str,
    profile_name: str = Query(..., description="Profile name"),
    db: AsyncSession = Depends(get_database),
):
    """Debug endpoint to test reading Profile metadata via SOAP"""
    from app.domain.models import Organization, SalesforceConnection
    from app.salesforce.metadata_client import SalesforceMetadataClient

    # Get org and connection
    org_query = select(Organization).where(Organization.id == org_id)
    org_result = await db.execute(org_query)
    org = org_result.scalar_one_or_none()

    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    conn_query = select(SalesforceConnection).where(
        SalesforceConnection.organization_id == org_id
    )
    conn_result = await db.execute(conn_query)
    conn = conn_result.scalar_one_or_none()

    if not conn:
        raise HTTPException(status_code=404, detail="No Salesforce connection found")

    # Create metadata client
    metadata_client = SalesforceMetadataClient(
        instance_url=conn.instance_url,
        access_token=conn.access_token or "",
    )

    # Try to read profile metadata
    profile_info = await metadata_client.read_profile_metadata(profile_name)

    if not profile_info:
        return {"error": f"Profile not found: {profile_name}"}

    # Try SOAP API to get field permissions
    full_name = profile_info.get("fullName", profile_name)
    field_permissions = await metadata_client.get_profile_field_permissions_soap(full_name)

    # Filter Account permissions
    account_perms = [fp for fp in field_permissions if fp.get("SobjectType") == "Account"]
    account_readable = [fp for fp in account_perms if fp.get("PermissionsRead")]

    return {
        "profile_name": profile_name,
        "profile_info": profile_info,
        "total_field_permissions": len(field_permissions),
        "total_account_field_permissions": len(account_perms),
        "account_readable_count": len(account_readable),
        "account_readable_fields": account_readable,
        "sample_account_all": account_perms[:20],
        "sample_other_permissions": [
            fp for fp in field_permissions if fp.get("SobjectType") != "Account"
        ][:10]
    }



@router.get("/orgs/{org_id}/debug/system-fields")
async def debug_system_fields(
    org_id: str,
    object_name: str = Query(default="Account", description="Object name"),
    db: AsyncSession = Depends(get_database),
):
    """Debug endpoint to get system-required fields for an object"""
    from app.domain.models import Organization, SalesforceConnection
    from app.salesforce.client import SalesforceAPIClient

    # Get org and connection
    org_query = select(Organization).where(Organization.id == org_id)
    org_result = await db.execute(org_query)
    org = org_result.scalar_one_or_none()

    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    conn_query = select(SalesforceConnection).where(
        SalesforceConnection.organization_id == org_id
    )
    conn_result = await db.execute(conn_query)
    conn = conn_result.scalar_one_or_none()

    if not conn:
        raise HTTPException(status_code=404, detail="No Salesforce connection found")

    # Create API client
    client = SalesforceAPIClient(
        instance_url=conn.instance_url,
        access_token=conn.access_token or "",
    )

    # Get system-required fields
    system_fields = await client.get_system_required_fields(object_name)

    return {
        "object_name": object_name,
        "total_system_fields": len(system_fields),
        "system_fields": system_fields
    }
