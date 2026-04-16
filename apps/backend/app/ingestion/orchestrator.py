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
            sync_job.sync_metadata = {"counts": counts}
            await self.db.commit()

            logger.info(f"Sync completed successfully: {counts}")
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

        # Get Salesforce connection with eager loading
        stmt = select(Organization).where(Organization.id == org_id).options(
            selectinload(Organization.salesforce_connections)
        )
        result = await self.db.execute(stmt)
        org = result.scalar_one_or_none()

        if not org:
            raise ValueError(f"Organization not found: {org_id}")

        # Get active connection
        # In production, this would handle token refresh
        # For now, simplified
        conn: Optional[SalesforceConnection] = None
        for c in org.salesforce_connections:
            if c.is_active:
                conn = c
                break

        if not conn:
            raise ValueError(f"No active Salesforce connection for org: {org_id}")

        # Create API client
        client = SalesforceAPIClient(
            instance_url=conn.instance_url,
            access_token=conn.access_token or "",
        )

        # Extract all data
        return await client.extract_all()
