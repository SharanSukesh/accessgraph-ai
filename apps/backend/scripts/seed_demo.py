#!/usr/bin/env python3
"""
Seed Demo Data Script
Loads demo organization and runs full pipeline
"""
import asyncio
import logging
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import select

from app.core.config import settings
from app.core.logging import setup_logging
from app.db.session import AsyncSessionLocal
from app.domain.models import Organization, SyncJob, SyncStatus
from app.graph.builder import GraphBuilder
from app.db.neo4j_client import Neo4jClient
from app.ingestion.orchestrator import SyncOrchestrator
from app.services.anomaly_detection import AnomalyDetectionService
from app.services.recommendations import RecommendationEngine
from app.services.risk_scoring import RiskScoringService

setup_logging()
logger = logging.getLogger(__name__)


async def main():
    """Seed demo data"""
    logger.info("Starting demo data seed")

    async with AsyncSessionLocal() as db:
        # Check if demo org exists
        result = await db.execute(
            select(Organization).where(Organization.is_demo == True)
        )
        org = result.scalar_one_or_none()

        if org:
            logger.info(f"Demo org already exists: {org.name} (id={org.id})")
            org_id = org.id
        else:
            # Create demo org
            org = Organization(
                name="Acme Corp Demo",
                domain="acme-demo.com",
                is_demo=True,
            )
            db.add(org)
            await db.commit()
            await db.refresh(org)
            logger.info(f"Created demo org: {org.name} (id={org.id})")
            org_id = org.id

        # Create sync job
        sync_job = SyncJob(
            organization_id=org_id,
            status=SyncStatus.PENDING,
        )
        db.add(sync_job)
        await db.commit()
        await db.refresh(sync_job)

        # Run sync (loads from fixtures)
        logger.info("Running sync (loading from fixtures)...")
        orchestrator = SyncOrchestrator(db)
        await orchestrator.run_sync(org_id, sync_job.id)

        # Build graph (skip if Neo4j not available)
        try:
            logger.info("Building Neo4j graph...")
            neo4j_client = Neo4jClient(
                uri=settings.NEO4J_URI,
                user=settings.NEO4J_USER,
                password=settings.NEO4J_PASSWORD,
            )
            builder = GraphBuilder(db, neo4j_client)
            await builder.build_org_graph(org_id, rebuild=True)
            neo4j_client.close()
            logger.info("Neo4j graph built successfully")
        except Exception as e:
            logger.warning(f"Skipping Neo4j graph build (not available): {e}")

        # Run analysis (these don't require Neo4j)
        logger.info("Running anomaly detection...")
        anomaly_service = AnomalyDetectionService(db)
        anomalies = await anomaly_service.detect_anomalies(org_id)
        logger.info(f"Detected {len(anomalies)} anomalies")

        logger.info("Running risk scoring...")
        risk_service = RiskScoringService(db)
        risk_scores = await risk_service.score_all_users(org_id)
        logger.info(f"Scored {len(risk_scores)} users")

        logger.info("Generating recommendations...")
        rec_engine = RecommendationEngine(db)
        recommendations = await rec_engine.generate_recommendations(org_id)
        logger.info(f"Generated {len(recommendations)} recommendations")

    logger.info("Demo data seed complete!")
    logger.info(f"Organization ID: {org_id}")
    logger.info(f"View at: http://localhost:8000/docs")


if __name__ == "__main__":
    asyncio.run(main())
