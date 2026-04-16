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
            "salesforceUserId": u.salesforce_id,  # Frontend expects camelCase
            "salesforce_id": u.salesforce_id,  # Keep for backwards compatibility
            "username": u.username,
            "name": u.name,
            "email": u.email,
            "department": u.department,
            "title": u.title,
            "isActive": u.is_active,  # Frontend expects camelCase
            "is_active": u.is_active,  # Keep for backwards compatibility
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

    # For each object, calculate actual user count
    object_list = []
    for obj in objects:
        # Get all parent_ids (profiles and permission sets) for this object
        perms_query = select(ObjectPermissionSnapshot.parent_id).where(
            ObjectPermissionSnapshot.organization_id == org_id,
            ObjectPermissionSnapshot.sobject_type == obj.sobject_type
        )
        perms_result = await db.execute(perms_query)
        parent_ids = [p[0] for p in perms_result.all()]

        # Count users with these profiles
        user_count_query = select(func.count(distinct(UserSnapshot.salesforce_id))).where(
            UserSnapshot.organization_id == org_id,
            UserSnapshot.profile_id.in_(parent_ids)
        )
        user_count_result = await db.execute(user_count_query)
        user_count_from_profiles = user_count_result.scalar() or 0

        # Count users with these permission sets
        ps_user_count_query = select(func.count(distinct(PermissionSetAssignmentSnapshot.assignee_id))).where(
            PermissionSetAssignmentSnapshot.organization_id == org_id,
            PermissionSetAssignmentSnapshot.permission_set_id.in_(parent_ids)
        )
        ps_user_count_result = await db.execute(ps_user_count_query)
        user_count_from_ps = ps_user_count_result.scalar() or 0

        # Total unique users (may have some overlap, but this is an approximation)
        total_users = user_count_from_profiles + user_count_from_ps

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
    users_with_access_set = set()

    # Users through profiles
    for profile in profiles_with_access:
        users_query = select(UserSnapshot).where(
            UserSnapshot.organization_id == org_id,
            UserSnapshot.profile_id == profile["id"]
        )
        users_result = await db.execute(users_query)
        users = users_result.scalars().all()
        for user in users:
            users_with_access_set.add((user.salesforce_id, user.name, user.email, "Profile: " + profile["name"]))

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
                users_with_access_set.add((user.salesforce_id, user.name, user.email, "Permission Set: " + ps["name"]))

    users_with_access = [
        {
            "salesforceUserId": uid,
            "name": name,
            "email": email,
            "accessVia": via
        }
        for uid, name, email, via in sorted(users_with_access_set, key=lambda x: x[1])
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
    limit: int = Query(500, le=10000),
    db: AsyncSession = Depends(get_database),
):
    """List unique Salesforce fields from permissions data"""
    from sqlalchemy import func
    from app.domain.models import FieldPermissionSnapshot

    # Get distinct fields
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

    if search:
        query = query.where(FieldPermissionSnapshot.field.ilike(f'%{search}%'))

    if object_type:
        query = query.where(FieldPermissionSnapshot.sobject_type == object_type)

    query = query.order_by(
        FieldPermissionSnapshot.sobject_type,
        FieldPermissionSnapshot.field
    ).limit(limit)

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

    return [
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
    ]
