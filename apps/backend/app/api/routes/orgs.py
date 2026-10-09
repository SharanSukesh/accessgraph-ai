"""
Organization & Sync API Routes
"""
import logging
import secrets
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_database
from app.auth.deps import (
    Principal,
    get_principal,
    hash_package_key,
    require_org_access,
    require_org_admin,
)
from app.domain.models import (
    AuditAction,
    AuditLog,
    OrgAccessGrant,
    Organization,
    SalesforceConnection,
    SyncJob,
    SyncStatus,
)
from app.graph.builder import GraphBuilder
from app.db.neo4j_client import get_neo4j_client
from app.ingestion.orchestrator import schedule_background_sync
from app.services import privacy_mode
from app.services.org_naming import rename_manually
from app.services.write_back import set_write_back, write_back_enabled
from app.services.anomaly_detection import AnomalyDetectionService
from app.services.recommendations import RecommendationEngine
from app.services.risk_scoring import RiskScoringService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/orgs")


# ============================================================================
# Request/Response Models
# ============================================================================


class OrgResponse(BaseModel):
    id: str
    name: str
    domain: Optional[str]
    is_demo: bool
    created_at: datetime

    class Config:
        from_attributes = True


class SyncJobResponse(BaseModel):
    id: str
    organization_id: str
    status: str
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    error_message: Optional[str]
    metadata: dict = {}

    class Config:
        from_attributes = True
        # Map sync_metadata from DB model to metadata in response
        populate_by_name = True

    @classmethod
    def model_validate(cls, obj):
        """Custom validation to handle sync_metadata -> metadata mapping"""
        if hasattr(obj, 'sync_metadata'):
            data = {
                'id': obj.id,
                'organization_id': obj.organization_id,
                'status': obj.status.value if hasattr(obj.status, 'value') else obj.status,
                'started_at': obj.started_at,
                'completed_at': obj.completed_at,
                'error_message': obj.error_message,
                'metadata': obj.sync_metadata if obj.sync_metadata else {}
            }
            return super().model_validate(data)
        return super().model_validate(obj)


# ============================================================================
# Endpoints
# ============================================================================


class AccessibleOrgResponse(BaseModel):
    id: str
    name: str
    domain: Optional[str]
    is_demo: bool
    created_at: datetime
    is_connected: bool
    instance_url: Optional[str]
    is_sandbox: Optional[bool]
    last_sync_at: Optional[datetime]
    last_sync_status: Optional[str]
    connected_as: Optional[dict] = None
    write_back_enabled: bool = False
    privacy_mode: str = "full"
    allow_record_aggregates: bool = True


def _is_sandbox(org: Organization, conn: Optional[SalesforceConnection]) -> Optional[bool]:
    recorded = (org.settings or {}).get("is_sandbox")
    if recorded is not None:
        return bool(recorded)
    # Orgs connected before the flag was recorded: infer from My Domain.
    if conn and conn.instance_url:
        return ".sandbox." in conn.instance_url or "--" in conn.instance_url
    return None


@router.get("", response_model=List[AccessibleOrgResponse])
async def list_organizations(
    principal: Principal = Depends(get_principal),
    db: AsyncSession = Depends(get_database),
):
    """Client orgs the signed-in user may open (admins: all)."""
    query = select(Organization).where(Organization.id != principal.home_org_id)
    if not principal.is_admin:
        query = query.join(
            OrgAccessGrant, OrgAccessGrant.organization_id == Organization.id
        ).where(OrgAccessGrant.org_user_id == principal.user_id)
    orgs = (await db.execute(query.order_by(Organization.name))).scalars().all()
    org_ids = [o.id for o in orgs]
    if not org_ids:
        return []

    connections = {
        c.organization_id: c
        for c in (
            await db.execute(
                select(SalesforceConnection).where(
                    SalesforceConnection.organization_id.in_(org_ids),
                    SalesforceConnection.is_active == True,  # noqa: E712
                )
            )
        ).scalars().all()
    }
    latest_jobs: dict = {}
    for job in (
        await db.execute(
            select(SyncJob)
            .where(SyncJob.organization_id.in_(org_ids))
            .order_by(SyncJob.created_at.desc())
        )
    ).scalars().all():
        latest_jobs.setdefault(job.organization_id, job)

    out = []
    for o in orgs:
        conn = connections.get(o.id)
        job = latest_jobs.get(o.id)
        out.append(AccessibleOrgResponse(
            id=o.id,
            name=o.name,
            domain=o.domain,
            is_demo=o.is_demo,
            created_at=o.created_at,
            is_connected=bool(conn and conn.access_token),
            instance_url=conn.instance_url if conn else None,
            is_sandbox=_is_sandbox(o, conn),
            last_sync_at=(job.completed_at or job.started_at) if job else None,
            last_sync_status=(job.status.value if hasattr(job.status, "value") else job.status) if job else None,
            connected_as=conn.connected_as if conn else None,
            write_back_enabled=write_back_enabled(o),
            privacy_mode=privacy_mode.mode_of(o),
            allow_record_aggregates=privacy_mode.allows(o, privacy_mode.RECORD_AGGREGATES),
        ))
    return out


@router.get("/{org_id}", response_model=OrgResponse)
async def get_organization(
    org_id: str,
    _org: str = Depends(require_org_access),
    db: AsyncSession = Depends(get_database),
):
    """Get organization by ID"""
    org = await db.get(Organization, org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    return org


@router.post("/{org_id}/sync", response_model=SyncJobResponse, status_code=status.HTTP_202_ACCEPTED)
async def trigger_sync(
    org_id: str,
    _org: str = Depends(require_org_access),
    db: AsyncSession = Depends(get_database),
):
    """
    Trigger sync job for organization
    Runs extraction, normalization, and persistence
    """
    org = await db.get(Organization, org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    # Create sync job
    sync_job = SyncJob(
        organization_id=org_id,
        status=SyncStatus.PENDING,
    )
    db.add(sync_job)
    await db.commit()
    await db.refresh(sync_job)

    # Schedule sync as a background task and return 202 immediately so the
    # client can poll for status updates. The sync itself takes 1-2 minutes;
    # blocking the HTTP request that long means the UI never shows
    # 'pending'/'running' - it only sees 'completed' when the response lands.
    schedule_background_sync(org_id, sync_job.id)

    return SyncJobResponse.model_validate(sync_job)


@router.post("/{org_id}/build-graph", status_code=status.HTTP_202_ACCEPTED)
async def build_graph(
    org_id: str,
    _org: str = Depends(require_org_access),
    rebuild: bool = False,
    db: AsyncSession = Depends(get_database),
):
    """Build Neo4j graph from snapshots"""
    org = await db.get(Organization, org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    neo4j_client = get_neo4j_client()
    builder = GraphBuilder(db, neo4j_client)

    try:
        await builder.build_org_graph(org_id, rebuild=rebuild)
        return {"status": "success", "message": "Graph built successfully"}
    except Exception as e:
        logger.error(f"Graph build failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{org_id}/analyze", status_code=status.HTTP_202_ACCEPTED)
async def run_analysis(
    org_id: str,
    _org: str = Depends(require_org_access),
    db: AsyncSession = Depends(get_database),
):
    """
    Run full analysis pipeline
    - Anomaly detection
    - Risk scoring
    - Recommendations
    """
    org = await db.get(Organization, org_id)
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    results = {}

    try:
        # Anomaly detection
        anomaly_service = AnomalyDetectionService(db)
        anomalies = await anomaly_service.detect_anomalies(org_id)
        results["anomalies_detected"] = len(anomalies)

        # Session anomalies — LoginHistory-based rule detector. Runs a
        # separate live SF pull inside the service; degrades to [] if the
        # org has no OAuth connection or if LoginHistory is empty.
        session_anomalies = await anomaly_service.detect_session_anomalies_for_org(
            org_id,
        )
        results["session_anomalies_detected"] = len(session_anomalies)

        # Risk scoring
        risk_service = RiskScoringService(db)
        risk_scores = await risk_service.score_all_users(org_id)
        results["users_scored"] = len(risk_scores)

        # Recommendations
        rec_engine = RecommendationEngine(db)
        recommendations = await rec_engine.generate_recommendations(org_id)
        results["recommendations_generated"] = len(recommendations)

        return {"status": "success", "results": results}

    except Exception as e:
        logger.error(f"Analysis failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{org_id}/diagnostic")
async def diagnostic_permissions(
    org_id: str,
    _org: str = Depends(require_org_access),
    db: AsyncSession = Depends(get_database),
):
    """Diagnostic endpoint to check if permissions are in database"""
    from app.domain.models import (
        UserSnapshot,
        PermissionSetSnapshot,
        ObjectPermissionSnapshot,
        FieldPermissionSnapshot,
        PermissionSetAssignmentSnapshot,
    )

    # Count snapshots
    users_count = await db.execute(
        select(UserSnapshot).where(UserSnapshot.organization_id == org_id)
    )
    users = users_count.scalars().all()

    ps_count = await db.execute(
        select(PermissionSetSnapshot).where(PermissionSetSnapshot.organization_id == org_id)
    )
    permission_sets = ps_count.scalars().all()

    obj_perm_count = await db.execute(
        select(ObjectPermissionSnapshot).where(ObjectPermissionSnapshot.organization_id == org_id)
    )
    object_permissions = obj_perm_count.scalars().all()

    field_perm_count = await db.execute(
        select(FieldPermissionSnapshot).where(FieldPermissionSnapshot.organization_id == org_id)
    )
    field_permissions = field_perm_count.scalars().all()

    psa_count = await db.execute(
        select(PermissionSetAssignmentSnapshot).where(PermissionSetAssignmentSnapshot.organization_id == org_id)
    )
    ps_assignments = psa_count.scalars().all()

    # Check for profile_id issues
    users_without_profile_id = [u for u in users if not u.profile_id]
    profile_backed_ps = [ps for ps in permission_sets if ps.is_owned_by_profile and ps.profile_id]

    return {
        "organization_id": org_id,
        "snapshots": {
            "users": len(users),
            "permission_sets": len(permission_sets),
            "permission_set_assignments": len(ps_assignments),
            "object_permissions": len(object_permissions),
            "field_permissions": len(field_permissions),
        },
        "diagnosis": {
            "has_users": len(users) > 0,
            "has_permission_sets": len(permission_sets) > 0,
            "has_object_permissions": len(object_permissions) > 0,
            "has_field_permissions": len(field_permissions) > 0,
            "users_without_profile_id": len(users_without_profile_id),
            "profile_backed_permission_sets": len(profile_backed_ps),
            "issue": "NO_PERMISSIONS_SYNCED" if len(object_permissions) == 0 else "OK",
        },
        "sample_user": {
            "name": users[0].name if users else None,
            "profile_id": users[0].profile_id if users else None,
            "has_profile_id": bool(users[0].profile_id) if users else False,
        } if users else None,
    }


@router.get("/{org_id}/sync-jobs", response_model=List[SyncJobResponse])
async def list_sync_jobs(
    org_id: str,
    _org: str = Depends(require_org_access),
    limit: int = 10,
    db: AsyncSession = Depends(get_database),
):
    """List sync jobs for organization"""
    result = await db.execute(
        select(SyncJob)
        .where(SyncJob.organization_id == org_id)
        .order_by(SyncJob.created_at.desc())
        .limit(limit)
    )
    jobs = result.scalars().all()
    return [SyncJobResponse.model_validate(job) for job in jobs]


@router.post("/{org_id}/package-key")
async def rotate_package_key(
    org_id: str,
    _admin: str = Depends(require_org_admin),
    db: AsyncSession = Depends(get_database),
):
    """Issue a new key for the Salesforce managed package. Shown once;
    any previously issued key stops working immediately."""
    org = await db.get(Organization, org_id)
    key = f"nwk_{secrets.token_urlsafe(32)}"
    org.package_key_hash = hash_package_key(key)
    await db.commit()
    logger.info("package key rotated for org %s", org_id)
    return {"package_key": key}


class WriteBackUpdate(BaseModel):
    enabled: bool
    note: Optional[str] = None


@router.get("/{org_id}/write-back")
async def get_write_back(
    org_id: str,
    _org: str = Depends(require_org_access),
    db: AsyncSession = Depends(get_database),
):
    org = await db.get(Organization, org_id)
    record = (org.settings or {}).get("write_back") or {"enabled": False}
    return record


@router.put("/{org_id}/write-back")
async def update_write_back(
    org_id: str,
    body: WriteBackUpdate,
    request: Request,
    _admin: str = Depends(require_org_admin),
    db: AsyncSession = Depends(get_database),
):
    """Turn Salesforce write-back on or off for this client org. Should
    reflect the client's written agreement; the note records where."""
    if body.enabled and not (body.note or "").strip():
        raise HTTPException(
            status_code=400,
            detail="Record where the client approved write-back (e.g. the SOW clause).",
        )
    org = await db.get(Organization, org_id)
    actor = request.state.principal.email
    record = set_write_back(org, body.enabled, actor, body.note)
    db.add(AuditLog(
        organization_id=org_id,
        user_email=actor,
        action=AuditAction.UPDATE_SETTINGS,
        resource_type="write_back_consent",
        resource_id=org_id,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
        request_method="PUT",
        request_path=str(request.url.path),
        success=True,
        context_data=record,
    ))
    await db.commit()
    logger.warning("write-back %s for org %s by %s", "ENABLED" if body.enabled else "disabled", org_id, actor)
    return record


class RenameRequest(BaseModel):
    name: str


@router.patch("/{org_id}", response_model=OrgResponse)
async def rename_organization(
    org_id: str,
    body: RenameRequest,
    _org: str = Depends(require_org_access),
    db: AsyncSession = Depends(get_database),
):
    """Give a client org a display name; it then stops following
    Salesforce's Organization.Name."""
    if not body.name.strip():
        raise HTTPException(status_code=400, detail="Name can't be empty.")
    org = await db.get(Organization, org_id)
    rename_manually(org, body.name)
    await db.commit()
    await db.refresh(org)
    return org

