"""
Data Retention Service
Handles automatic data cleanup and GDPR compliance (right to erasure).
"""
import logging
from datetime import datetime, timedelta, timezone
from typing import Dict

from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.models import (
    UserSnapshot,
    RoleSnapshot,
    ProfileSnapshot,
    PermissionSetSnapshot,
    PermissionSetAssignmentSnapshot,
    PermissionSetGroupSnapshot,
    PermissionSetGroupComponentSnapshot,
    ObjectPermissionSnapshot,
    FieldPermissionSnapshot,
    GroupSnapshot,
    GroupMemberSnapshot,
    AccountShareSnapshot,
    OpportunityShareSnapshot,
    AccountTeamMemberSnapshot,
    OrganizationWideDefaultSnapshot,
    SharingRuleSnapshot,
    SyncJob,
    AccessAnomaly,
    Recommendation,
    AuditLog,
    Organization,
    SalesforceConnection,
)

logger = logging.getLogger(__name__)


class DataRetentionService:
    """
    Manage data retention policies and GDPR compliance.

    Default retention periods:
    - Snapshots: 90 days (configurable per org)
    - Audit logs: 365 days (compliance requirement)
    - Sync jobs: 30 days
    - Anomalies/Recommendations: 180 days
    """

    DEFAULT_SNAPSHOT_RETENTION_DAYS = 90
    DEFAULT_AUDIT_LOG_RETENTION_DAYS = 365
    DEFAULT_SYNC_JOB_RETENTION_DAYS = 30
    DEFAULT_ANALYSIS_RETENTION_DAYS = 180

    def __init__(self, db: AsyncSession):
        self.db = db

    async def delete_old_snapshots(
        self,
        org_id: str,
        retention_days: int = DEFAULT_SNAPSHOT_RETENTION_DAYS
    ) -> Dict[str, int]:
        """
        Delete snapshots older than the retention period.

        Returns dict with counts of deleted records per table.
        """
        cutoff_date = datetime.now(timezone.utc) - timedelta(days=retention_days)
        deleted_counts = {}

        snapshot_models = [
            ("users", UserSnapshot),
            ("roles", RoleSnapshot),
            ("profiles", ProfileSnapshot),
            ("permission_sets", PermissionSetSnapshot),
            ("permission_set_assignments", PermissionSetAssignmentSnapshot),
            ("permission_set_groups", PermissionSetGroupSnapshot),
            ("permission_set_group_components", PermissionSetGroupComponentSnapshot),
            ("object_permissions", ObjectPermissionSnapshot),
            ("field_permissions", FieldPermissionSnapshot),
            ("groups", GroupSnapshot),
            ("group_members", GroupMemberSnapshot),
            ("account_shares", AccountShareSnapshot),
            ("opportunity_shares", OpportunityShareSnapshot),
            ("account_team_members", AccountTeamMemberSnapshot),
            ("organization_wide_defaults", OrganizationWideDefaultSnapshot),
            ("sharing_rules", SharingRuleSnapshot),
        ]

        for name, model in snapshot_models:
            try:
                stmt = delete(model).where(
                    model.organization_id == org_id,
                    model.snapshot_date < cutoff_date
                )
                result = await self.db.execute(stmt)
                deleted_counts[name] = result.rowcount
                logger.info(f"Deleted {result.rowcount} old {name} snapshots for org {org_id}")
            except Exception as e:
                logger.error(f"Failed to delete old {name} snapshots: {e}")
                deleted_counts[name] = 0

        await self.db.commit()
        return deleted_counts

    async def delete_old_audit_logs(
        self,
        org_id: str,
        retention_days: int = DEFAULT_AUDIT_LOG_RETENTION_DAYS
    ) -> int:
        """Delete audit logs older than the retention period."""
        cutoff_date = datetime.now(timezone.utc) - timedelta(days=retention_days)

        stmt = delete(AuditLog).where(
            AuditLog.organization_id == org_id,
            AuditLog.created_at < cutoff_date
        )
        result = await self.db.execute(stmt)
        await self.db.commit()

        logger.info(f"Deleted {result.rowcount} old audit logs for org {org_id}")
        return result.rowcount

    async def delete_old_sync_jobs(
        self,
        org_id: str,
        retention_days: int = DEFAULT_SYNC_JOB_RETENTION_DAYS
    ) -> int:
        """Delete sync job records older than the retention period."""
        cutoff_date = datetime.now(timezone.utc) - timedelta(days=retention_days)

        stmt = delete(SyncJob).where(
            SyncJob.organization_id == org_id,
            SyncJob.created_at < cutoff_date
        )
        result = await self.db.execute(stmt)
        await self.db.commit()

        logger.info(f"Deleted {result.rowcount} old sync jobs for org {org_id}")
        return result.rowcount

    async def delete_old_analysis_data(
        self,
        org_id: str,
        retention_days: int = DEFAULT_ANALYSIS_RETENTION_DAYS
    ) -> Dict[str, int]:
        """Delete old anomalies and recommendations."""
        cutoff_date = datetime.now(timezone.utc) - timedelta(days=retention_days)
        deleted_counts = {}

        # Delete old anomalies
        stmt = delete(AccessAnomaly).where(
            AccessAnomaly.organization_id == org_id,
            AccessAnomaly.created_at < cutoff_date
        )
        result = await self.db.execute(stmt)
        deleted_counts["anomalies"] = result.rowcount

        # Delete old recommendations
        stmt = delete(Recommendation).where(
            Recommendation.organization_id == org_id,
            Recommendation.created_at < cutoff_date
        )
        result = await self.db.execute(stmt)
        deleted_counts["recommendations"] = result.rowcount

        await self.db.commit()
        logger.info(f"Deleted {deleted_counts} old analysis data for org {org_id}")
        return deleted_counts

    async def cleanup_all_old_data(self, org_id: str) -> Dict[str, any]:
        """
        Run all cleanup tasks for an organization.
        Uses default retention periods.
        """
        results = {
            "snapshots": await self.delete_old_snapshots(org_id),
            "audit_logs": await self.delete_old_audit_logs(org_id),
            "sync_jobs": await self.delete_old_sync_jobs(org_id),
            "analysis": await self.delete_old_analysis_data(org_id),
        }

        total_deleted = sum(
            v if isinstance(v, int) else sum(v.values())
            for v in results.values()
        )

        logger.info(f"Cleanup complete for org {org_id}: {total_deleted} total records deleted")
        return results

    async def delete_all_org_data(self, org_id: str) -> Dict[str, int]:
        """
        GDPR Right to Erasure: Delete ALL data for an organization.

        WARNING: This is irreversible! Use with caution.

        Returns counts of deleted records per table.
        """
        deleted_counts = {}

        # Delete all snapshots (no date filter - delete everything)
        snapshot_models = [
            ("users", UserSnapshot),
            ("roles", RoleSnapshot),
            ("profiles", ProfileSnapshot),
            ("permission_sets", PermissionSetSnapshot),
            ("permission_set_assignments", PermissionSetAssignmentSnapshot),
            ("permission_set_groups", PermissionSetGroupSnapshot),
            ("permission_set_group_components", PermissionSetGroupComponentSnapshot),
            ("object_permissions", ObjectPermissionSnapshot),
            ("field_permissions", FieldPermissionSnapshot),
            ("groups", GroupSnapshot),
            ("group_members", GroupMemberSnapshot),
            ("account_shares", AccountShareSnapshot),
            ("opportunity_shares", OpportunityShareSnapshot),
            ("account_team_members", AccountTeamMemberSnapshot),
            ("organization_wide_defaults", OrganizationWideDefaultSnapshot),
            ("sharing_rules", SharingRuleSnapshot),
        ]

        for name, model in snapshot_models:
            stmt = delete(model).where(model.organization_id == org_id)
            result = await self.db.execute(stmt)
            deleted_counts[name] = result.rowcount

        # Delete analysis data
        stmt = delete(AccessAnomaly).where(AccessAnomaly.organization_id == org_id)
        result = await self.db.execute(stmt)
        deleted_counts["anomalies"] = result.rowcount

        stmt = delete(Recommendation).where(Recommendation.organization_id == org_id)
        result = await self.db.execute(stmt)
        deleted_counts["recommendations"] = result.rowcount

        # Delete sync jobs
        stmt = delete(SyncJob).where(SyncJob.organization_id == org_id)
        result = await self.db.execute(stmt)
        deleted_counts["sync_jobs"] = result.rowcount

        # Delete audit logs
        stmt = delete(AuditLog).where(AuditLog.organization_id == org_id)
        result = await self.db.execute(stmt)
        deleted_counts["audit_logs"] = result.rowcount

        # Delete Salesforce connection
        stmt = delete(SalesforceConnection).where(SalesforceConnection.organization_id == org_id)
        result = await self.db.execute(stmt)
        deleted_counts["salesforce_connection"] = result.rowcount

        # Finally, delete the organization itself
        stmt = delete(Organization).where(Organization.id == org_id)
        result = await self.db.execute(stmt)
        deleted_counts["organization"] = result.rowcount

        await self.db.commit()

        total_deleted = sum(deleted_counts.values())
        logger.warning(
            f"GDPR DELETION: Deleted ALL data for org {org_id}: "
            f"{total_deleted} total records deleted"
        )

        return deleted_counts

    async def get_data_inventory(self, org_id: str) -> Dict[str, any]:
        """
        Get a count of all data stored for an organization.
        Useful for privacy dashboard and GDPR compliance.
        """
        inventory = {}

        # Count snapshots
        snapshot_models = [
            ("users", UserSnapshot),
            ("roles", RoleSnapshot),
            ("profiles", ProfileSnapshot),
            ("permission_sets", PermissionSetSnapshot),
            ("groups", GroupSnapshot),
            ("group_members", GroupMemberSnapshot),
            ("account_shares", AccountShareSnapshot),
            ("opportunity_shares", OpportunityShareSnapshot),
        ]

        for name, model in snapshot_models:
            stmt = select(model).where(model.organization_id == org_id)
            result = await self.db.execute(stmt)
            inventory[name] = len(result.scalars().all())

        # Count other data
        stmt = select(SyncJob).where(SyncJob.organization_id == org_id)
        result = await self.db.execute(stmt)
        inventory["sync_jobs"] = len(result.scalars().all())

        stmt = select(AccessAnomaly).where(AccessAnomaly.organization_id == org_id)
        result = await self.db.execute(stmt)
        inventory["anomalies"] = len(result.scalars().all())

        stmt = select(Recommendation).where(Recommendation.organization_id == org_id)
        result = await self.db.execute(stmt)
        inventory["recommendations"] = len(result.scalars().all())

        stmt = select(AuditLog).where(AuditLog.organization_id == org_id)
        result = await self.db.execute(stmt)
        inventory["audit_logs"] = len(result.scalars().all())

        # Calculate total
        inventory["total_records"] = sum(inventory.values())

        return inventory
