"""
Sync Orchestrator
Coordinates data extraction, normalization, and persistence
"""
import asyncio
import logging
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.domain.models import Organization, SalesforceConnection, SyncJob, SyncStatus
from app.ingestion.fixture_loader import FixtureLoader
from app.ingestion.snapshot import SnapshotPersister
from app.salesforce.client import SalesforceAPIClient

logger = logging.getLogger(__name__)


async def _run_sync_with_new_session(org_id: str, sync_job_id: str) -> None:
    """
    Run a sync job with a fresh DB session. Used when scheduling sync
    as a fire-and-forget background task - the original HTTP request's
    DB session would be closed by the time the sync completes.

    Errors are logged but not raised - they're already recorded on the
    SyncJob row by the orchestrator's own error handling.
    """
    # Local import to avoid circular dependency at module load time
    from app.db.session import AsyncSessionLocal

    async with AsyncSessionLocal() as session:
        try:
            await SyncOrchestrator(session).run_sync(org_id, sync_job_id)
        except Exception as e:
            logger.error(
                f"Background sync {sync_job_id} for org {org_id} failed: {e}",
                exc_info=True,
            )
            # Best-effort: mark the job as failed so the UI doesn't show
            # a forever-pending state. If this also fails, at least we logged it.
            try:
                async with AsyncSessionLocal() as cleanup_session:
                    job = await cleanup_session.get(SyncJob, sync_job_id)
                    if job and job.status not in (SyncStatus.COMPLETED, SyncStatus.FAILED):
                        job.status = SyncStatus.FAILED
                        job.error_message = str(e)[:500]
                        job.completed_at = datetime.now(timezone.utc)
                        await cleanup_session.commit()
            except Exception:
                logger.exception("Failed to mark sync job as FAILED after background error")


def schedule_background_sync(org_id: str, sync_job_id: str) -> None:
    """
    Fire-and-forget scheduling of a sync job. Returns immediately;
    the sync runs in the asyncio event loop with its own DB session.

    Use from HTTP routes that should respond fast (so the client can
    poll for status updates) instead of blocking until sync finishes.
    """
    asyncio.create_task(_run_sync_with_new_session(org_id, sync_job_id))


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
            # Extract data. A demo org always loads its fixture, whatever
            # DEMO_MODE says; it has no Salesforce connection to read.
            org = await self.db.get(Organization, org_id)
            if org is not None and org.is_demo:
                from app.ingestion.demo_orgs import fixture_key, load_demo_data
                logger.info("Demo org: loading fixture %s", fixture_key(org))
                data = load_demo_data(fixture_key(org))
                # Ownership is read live on a real org; the fixture carries it.
                owners = data.get("demo_live", {}).get("owner_counts", {})
                data["record_owner_counts"] = {obj: owners.get(obj) for obj in ("Account", "Opportunity")}
                # Layouts, record pages, Apex and flows (services/ui_access.py).
                ui = data.get("demo_live", {}).get("ui_access")
                if ui:
                    data["ui_access"] = {**ui, "collected_at": datetime.now(timezone.utc).isoformat()}
                # Field metadata (services/schema_metadata.py), describe-shaped.
                described = data.get("demo_live", {}).get("schema")
                if described:
                    from app.services.schema_metadata import from_describes, notes_for
                    objects = from_describes(described, data["demo_live"].get("field_definitions"))
                    data["schema"] = {"objects": objects, "failed": [], "skipped": [], "notes": notes_for(objects, [], []),
                                      "collected_at": datetime.now(timezone.utc).isoformat()}
                # Documentation reads (services/org_docs.py).
                docs = data.get("demo_live", {}).get("org_docs")
                if docs:
                    data["org_docs"] = {**docs, "collected_at": datetime.now(timezone.utc).isoformat()}
                    # Custom metadata records only of the types turned on, as on a live org.
                    from app.services import custom_metadata as cmdt
                    data["org_docs"]["custom_metadata_records"] = cmdt.keep_enabled(
                        data["demo_live"].get("custom_metadata_records"), cmdt.enabled_types(org))
                # What the integration user could see, as a live sync records it.
                data["record_coverage"] = data.get("demo_live", {}).get("record_coverage", {"checked": False})
                # The org's privacy level applies to demo data exactly as to a
                # live pull, so Masked and Metadata only can be shown on it.
                data = apply_privacy_to_demo_data(org, data)
            elif settings.DEMO_MODE:
                logger.info("Running in DEMO mode")
                data = await self._extract_demo_data(org_id)
            else:
                logger.info("Running in LIVE mode")
                data = await self._extract_live_data(org_id)

            # Persist snapshots
            persister = SnapshotPersister(self.db)
            counts = await persister.persist_all(org_id, data, sync_job_id)

            # Initialize metadata if it doesn't exist
            if not sync_job.sync_metadata:
                sync_job.sync_metadata = {}

            # Merge counts into existing metadata
            sync_job.sync_metadata["counts"] = counts
            # Whether share rows cover every record (see services/record_coverage.py).
            if "record_coverage" in data:
                sync_job.sync_metadata["record_coverage"] = data["record_coverage"]
            # Layouts, record pages, Apex and flows: configuration only.
            if data.get("ui_access"):
                sync_job.sync_metadata["ui_access"] = data["ui_access"]
            # Field metadata: configuration only.
            if data.get("schema"):
                sync_job.sync_metadata["schema"] = data["schema"]
            # Validation rules, tabs, Visualforce and the rest: configuration only.
            if data.get("org_docs"):
                sync_job.sync_metadata["org_docs"] = data["org_docs"]

            # Mark as modified so SQLAlchemy knows to update the JSON column
            from sqlalchemy.orm import attributes
            attributes.flag_modified(sync_job, 'sync_metadata')

            await self.db.commit()

            logger.info(f"Sync completed successfully: {counts}")

            # Run AI analysis after successful sync
            await self._run_ai_analysis(org_id, sync_job)

            # Completed only once the analysis has run: until then the org
            # must not look idle, or an "Analyze" click starts a second,
            # overlapping run and the UI refreshes before risk scores exist.
            sync_job.status = SyncStatus.COMPLETED
            sync_job.completed_at = datetime.now(timezone.utc)
            await self.db.commit()

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
        from app.services import privacy_mode as privacy
        from app.services.org_naming import apply_salesforce_name

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
                # The org's own My Domain token endpoint serves production,
                # sandbox and scratch orgs alike; login.salesforce.com
                # rejects sandbox refresh tokens.
                oauth = SalesforceOAuthClient(login_url=conn.instance_url)
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

        info = await client.extract_organization()
        apply_salesforce_name(org, (info or {}).get("Name"))

        data: Dict[str, Any] = await client.extract_all(
            include_users=privacy.allows(org, privacy.USER_RECORDS),
            include_record_shares=privacy.allows(org, privacy.RECORD_SHARES),
        )
        if privacy.allows(org, privacy.RECORD_SHARES):
            from app.services.record_coverage import check_record_visibility
            data["record_coverage"] = await check_record_visibility(
                client, (conn.connected_as or {}).get("user_id"))
        if not privacy.allows(org, privacy.USER_IDENTITY):
            data["users"] = privacy.mask_users(org.id, data.get("users", []))
        # Layouts, record pages, Apex and flows (roadmap item 1): configuration,
        # read-only; a failure here never fails the sync.
        try:
            data["ui_access"] = {
                **await client.get_ui_access(include_users=privacy.allows(org, privacy.USER_RECORDS)),
                "collected_at": datetime.now(timezone.utc).isoformat(),
            }
        except Exception as e:  # noqa: BLE001
            logger.warning("Layouts, pages, Apex and flows couldn't be read: %s", e)
        # Field metadata (roadmap item 8): a describe per object the
        # permissions mention; configuration, read-only, never fails the sync.
        try:
            from app.services.schema_metadata import collect_live, objects_in
            data["schema"] = {
                **await collect_live(client, objects_in(data)),
                "collected_at": datetime.now(timezone.utc).isoformat(),
            }
        except Exception as e:  # noqa: BLE001
            logger.warning("Field metadata couldn't be read: %s", e)
        # Documentation reads (roadmap item 11): configuration, read-only;
        # a failure never fails the sync.
        try:
            from app.services import org_docs
            rt_objects = {r["object"] for r in (data.get("ui_access") or {}).get("record_types", []) if r.get("object")}
            data["org_docs"] = {
                **await org_docs.collect_live(client, rt_objects),
                "collected_at": datetime.now(timezone.utc).isoformat(),
            }
        except Exception as e:  # noqa: BLE001
            logger.warning("Documentation reads failed: %s", e)
        # Custom metadata (item 11 part c2): the types always, records only of
        # the types an engagement admin turned on for this org.
        try:
            from app.services import custom_metadata as cmdt
            found = await cmdt.collect_live(client, cmdt.enabled_types(org))
            docs = data.setdefault("org_docs", {"collected_at": datetime.now(timezone.utc).isoformat()})
            if "types" in found:
                docs["custom_metadata_types"] = found["types"]
                docs["custom_metadata_records"] = found.get("records", {})
            docs["notes"] = (docs.get("notes") or []) + found["notes"]
        except Exception as e:  # noqa: BLE001
            logger.warning("Custom metadata reads failed: %s", e)
        return data

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


def apply_privacy_to_demo_data(org: Any, data: Dict) -> Dict:
    """What a live sync at this privacy level would have pulled and kept:
    no users without user records, no share or team rows (or owner counts)
    without record shares, and aliases instead of names when names aren't
    kept. See _extract_live_data and services/privacy_mode.py."""
    from app.services import privacy_mode as privacy

    data = dict(data)
    if not privacy.allows(org, privacy.USER_RECORDS):
        data["users"] = []
    if not privacy.allows(org, privacy.RECORD_SHARES):
        for key in ("account_shares", "opportunity_shares", "account_team_members", "opportunity_team_members"):
            data[key] = []
        data["record_owner_counts"] = {}
    if not privacy.allows(org, privacy.USER_IDENTITY):
        data["users"] = privacy.mask_users(org.id, data.get("users", []))
    return data
