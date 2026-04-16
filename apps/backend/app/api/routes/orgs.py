"""
Organization & Sync API Routes
"""
import logging
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_database
from app.domain.models import Organization, SyncJob, SyncStatus
from app.graph.builder import GraphBuilder
from app.db.neo4j_client import get_neo4j_client
from app.ingestion.orchestrator import SyncOrchestrator
from app.services.anomaly_detection import AnomalyDetectionService
from app.services.recommendations import RecommendationEngine
from app.services.risk_scoring import RiskScoringService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/orgs")


# ============================================================================
# Request/Response Models
# ============================================================================


class CreateOrgRequest(BaseModel):
    name: str
    domain: Optional[str] = None
    is_demo: bool = True


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


@router.post("", response_model=OrgResponse, status_code=status.HTTP_201_CREATED)
async def create_organization(
    request: CreateOrgRequest,
    db: AsyncSession = Depends(get_database),
):
    """Create new organization"""
    org = Organization(
        name=request.name,
        domain=request.domain,
        is_demo=request.is_demo,
    )
    db.add(org)
    await db.commit()
    await db.refresh(org)

    logger.info(f"Created organization: {org.name} (id={org.id})")
    return org


@router.get("", response_model=List[OrgResponse])
async def list_organizations(
    db: AsyncSession = Depends(get_database),
):
    """List all organizations (excludes demo orgs when DEMO_MODE=false)"""
    from app.core.config import settings

    query = select(Organization)

    # Filter out demo orgs if not in demo mode
    if not settings.DEMO_MODE:
        query = query.where(Organization.is_demo == False)

    result = await db.execute(query)
    orgs = result.scalars().all()
    return orgs


@router.get("/{org_id}", response_model=OrgResponse)
async def get_organization(
    org_id: str,
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

    # Run sync (in background would be better, but keeping simple)
    orchestrator = SyncOrchestrator(db)
    try:
        await orchestrator.run_sync(org_id, sync_job.id)
    except Exception as e:
        logger.error(f"Sync failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

    await db.refresh(sync_job)
    return SyncJobResponse.model_validate(sync_job)


@router.post("/{org_id}/build-graph", status_code=status.HTTP_202_ACCEPTED)
async def build_graph(
    org_id: str,
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


@router.get("/{org_id}/sync-jobs", response_model=List[SyncJobResponse])
async def list_sync_jobs(
    org_id: str,
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
