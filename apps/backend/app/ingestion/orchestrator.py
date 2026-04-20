"""
Sync Orchestrator
Coordinates data extraction, normalization, and persistence
"""
import logging
from datetime import datetime, timezone
from typing import Dict, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.domain.models import Organization, SalesforceConnection, SyncJob, SyncStatus
from app.ingestion.fixture_loader import FixtureLoader
from app.ingestion.snapshot import SnapshotPersister
from app.salesforce.client import SalesforceAPIClient

logger = logging.getLogger(__name__)


class SyncOrchestrator:
    """
    Orchestrates full sync pipeline
    Supports both live and demo modes
    """

    def __init__(self, db: AsyncSession):
        self.db = db

    async def run_sync(self, org_id: str, sync_job_id: str) -> Dict[str, int]:
        """
        Run full sync for organization

        Args:
            org_id: Organization ID
            sync_job_id: Sync job ID

        Returns:
            Dict with entity counts
        """
        sync_job = await self.db.get(SyncJob, sync_job_id)
        if not sync_job:
            raise ValueError(f"Sync job not found: {sync_job_id}")

        # Update status
        sync_job.status = SyncStatus.RUNNING
        sync_job.started_at = datetime.now(timezone.utc)
        await self.db.commit()

        try:
            # Extract data
            if settings.DEMO_MODE:
                logger.info("Running in DEMO mode")
                data = await self._extract_demo_data(org_id)
            else:
                logger.info("Running in LIVE mode")
                data = await self._extract_live_data(org_id)

            # Persist snapshots
            persister = SnapshotPersister(self.db)
            counts = await persister.persist_all(org_id, data, sync_job_id)

            # Update job
            sync_job.status = SyncStatus.COMPLETED
            sync_job.completed_at = datetime.now(timezone.utc)

            # Initialize metadata if it doesn't exist
            if not sync_job.sync_metadata:
                sync_job.sync_metadata = {}

            # Merge counts into existing metadata
            sync_job.sync_metadata["counts"] = counts

            # Mark as modified so SQLAlchemy knows to update the JSON column
            from sqlalchemy.orm import attributes
            attributes.flag_modified(sync_job, 'sync_metadata')

            await self.db.commit()

            logger.info(f"Sync completed successfully: {counts}")

            # Run AI analysis after successful sync
            await self._run_ai_analysis(org_id, sync_job)

            return counts

        except Exception as e:
            logger.error(f"Sync failed: {e}", exc_info=True)
            sync_job.status = SyncStatus.FAILED
            sync_job.error_message = str(e)
            sync_job.completed_at = datetime.now(timezone.utc)
            await self.db.commit()
            raise

    async def _extract_demo_data(self, org_id: str) -> Dict:
        """Extract data from demo fixtures"""
        loader = FixtureLoader()
        return loader.load()

    async def _extract_live_data(self, org_id: str) -> Dict:
        """Extract data from live Salesforce org"""
        from sqlalchemy.orm import selectinload
        from app.salesforce.oauth import SalesforceOAuthClient

        # Get Salesforce connection with eager loading
        stmt = select(Organization).where(Organization.id == org_id).options(
            selectinload(Organization.salesforce_connections)
        )
        result = await self.db.execute(stmt)
        org = result.scalar_one_or_none()

        if not org:
            raise ValueError(f"Organization not found: {org_id}")

        # Get active connection
        conn: Optional[SalesforceConnection] = None
        for c in org.salesforce_connections:
            if c.is_active:
                conn = c
                break

        if not conn:
            raise ValueError(f"No active Salesforce connection for org: {org_id}")

        # Refresh access token if we have a refresh token
        access_token = conn.access_token or ""
        if conn.refresh_token:
            try:
                logger.info("Refreshing Salesforce access token")
                oauth = SalesforceOAuthClient()
                token_response = await oauth.refresh_access_token(conn.refresh_token)

                # Update connection with new access token
                conn.access_token = token_response.access_token
                await self.db.commit()
                access_token = token_response.access_token
                logger.info("Successfully refreshed access token")
            except Exception as e:
                logger.warning(f"Token refresh failed, using existing token: {e}")
                # Continue with existing token - it might still work

        # Create API client
        client = SalesforceAPIClient(
            instance_url=conn.instance_url,
            access_token=access_token,
        )

        # Extract all data
        return await client.extract_all()

    async def _run_ai_analysis(self, org_id: str, sync_job: SyncJob) -> None:
        """
        Run AI analysis after successful sync

        This includes:
        - Anomaly detection (ML-based)
        - Risk scoring
        - Recommendations generation

        Errors are logged but don't fail the sync.
        """
        analysis_results = {
            "anomalies_detected": 0,
            "users_scored": 0,
            "recommendations_generated": 0,
            "analysis_timestamp": datetime.now(timezone.utc).isoformat(),
        }

        try:
            logger.info(f"Starting AI analysis for org {org_id}")

            # Import services here to avoid circular dependencies
            from app.services.anomaly_detection import AnomalyDetectionService
            from app.services.risk_scoring import RiskScoringService
            from app.services.recommendations import RecommendationEngine

            # Run anomaly detection
            try:
                logger.info("Running anomaly detection...")
                anomaly_service = AnomalyDetectionService(self.db)
                anomalies = await anomaly_service.detect_anomalies(org_id)
                analysis_results["anomalies_detected"] = len(anomalies)
                logger.info(f"Detected {len(anomalies)} anomalies")
            except Exception as e:
                logger.error(f"Anomaly detection failed: {e}", exc_info=True)
                analysis_results["anomaly_error"] = str(e)

            # Run risk scoring
            try:
                logger.info("Running risk scoring...")
                risk_service = RiskScoringService(self.db)
                risk_scores = await risk_service.score_all_users(org_id)
                analysis_results["users_scored"] = len(risk_scores)
                logger.info(f"Scored {len(risk_scores)} users")
            except Exception as e:
                logger.error(f"Risk scoring failed: {e}", exc_info=True)
                analysis_results["risk_error"] = str(e)

            # Generate recommendations
            try:
                logger.info("Generating recommendations...")
                rec_engine = RecommendationEngine(self.db)
                recommendations = await rec_engine.generate_recommendations(org_id)
                analysis_results["recommendations_generated"] = len(recommendations)
                logger.info(f"Generated {len(recommendations)} recommendations")
            except Exception as e:
                logger.error(f"Recommendation generation failed: {e}", exc_info=True)
                analysis_results["recommendation_error"] = str(e)

            # Refresh sync_job to get latest state and update metadata
            await self.db.refresh(sync_job)

            # Update sync job metadata with analysis results
            if not sync_job.sync_metadata:
                sync_job.sync_metadata = {}

            sync_job.sync_metadata["ai_analysis"] = analysis_results

            # Mark as modified so SQLAlchemy knows to update the JSON column
            from sqlalchemy.orm import attributes
            attributes.flag_modified(sync_job, 'sync_metadata')

            await self.db.commit()
            logger.info(f"AI analysis completed: {analysis_results}")

        except Exception as e:
            logger.error(f"AI analysis failed unexpectedly: {e}", exc_info=True)
            # Don't raise - we don't want to fail the sync if AI analysis fails
