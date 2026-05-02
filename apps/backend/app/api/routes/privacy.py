"""
Privacy & Data Management API Routes
Handles GDPR compliance, data retention, and privacy requests.
"""
import logging
from typing import Dict, Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.services.data_retention import DataRetentionService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/orgs/{org_id}/privacy", tags=["privacy"])


@router.get("/inventory", response_model=Dict[str, Any])
async def get_data_inventory(
    org_id: str,
    db: AsyncSession = Depends(get_db)
):
    """
    Get inventory of all data stored for this organization.

    Returns counts of all record types:
    - Snapshots (users, permissions, etc.)
    - Sync jobs
    - Anomalies and recommendations
    - Audit logs

    This endpoint is required for GDPR transparency.
    """
    try:
        service = DataRetentionService(db)
        inventory = await service.get_data_inventory(org_id)

        return {
            "organization_id": org_id,
            "data_inventory": inventory,
            "retention_policies": {
                "snapshots_days": DataRetentionService.DEFAULT_SNAPSHOT_RETENTION_DAYS,
                "audit_logs_days": DataRetentionService.DEFAULT_AUDIT_LOG_RETENTION_DAYS,
                "sync_jobs_days": DataRetentionService.DEFAULT_SYNC_JOB_RETENTION_DAYS,
                "analysis_days": DataRetentionService.DEFAULT_ANALYSIS_RETENTION_DAYS,
            }
        }

    except Exception as e:
        logger.error(f"Failed to get data inventory for org {org_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get data inventory: {str(e)}")


@router.delete("/snapshots", response_model=Dict[str, Any])
async def delete_old_snapshots(
    org_id: str,
    retention_days: int = DataRetentionService.DEFAULT_SNAPSHOT_RETENTION_DAYS,
    db: AsyncSession = Depends(get_db)
):
    """
    Delete snapshots older than the retention period.

    Query params:
    - retention_days: Number of days to keep (default: 90)

    Returns counts of deleted records per snapshot type.
    """
    try:
        service = DataRetentionService(db)
        deleted = await service.delete_old_snapshots(org_id, retention_days)

        total = sum(deleted.values())
        logger.info(f"Deleted {total} old snapshots for org {org_id}")

        return {
            "organization_id": org_id,
            "retention_days": retention_days,
            "deleted_counts": deleted,
            "total_deleted": total
        }

    except Exception as e:
        logger.error(f"Failed to delete old snapshots for org {org_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to delete snapshots: {str(e)}")


@router.delete("/cleanup", response_model=Dict[str, Any])
async def cleanup_all_old_data(
    org_id: str,
    db: AsyncSession = Depends(get_db)
):
    """
    Run all cleanup tasks using default retention periods.

    Deletes:
    - Snapshots older than 90 days
    - Audit logs older than 365 days
    - Sync jobs older than 30 days
    - Anomalies/recommendations older than 180 days

    This should be run periodically (e.g., weekly) to maintain data hygiene.
    """
    try:
        service = DataRetentionService(db)
        results = await service.cleanup_all_old_data(org_id)

        # Calculate totals
        total_deleted = sum(
            v if isinstance(v, int) else sum(v.values())
            for v in results.values()
        )

        logger.info(f"Cleanup complete for org {org_id}: {total_deleted} records deleted")

        return {
            "organization_id": org_id,
            "results": results,
            "total_deleted": total_deleted
        }

    except Exception as e:
        logger.error(f"Failed to cleanup data for org {org_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to cleanup data: {str(e)}")


@router.delete("/all-data", response_model=Dict[str, Any])
async def delete_all_organization_data(
    org_id: str,
    confirm: str = None,
    db: AsyncSession = Depends(get_db)
):
    """
    GDPR Right to Erasure: Delete ALL data for this organization.

    ⚠️ WARNING: This is IRREVERSIBLE!

    This endpoint implements GDPR Article 17 (Right to Erasure).
    All data including snapshots, audit logs, sync jobs, and the organization
    itself will be permanently deleted.

    Query params:
    - confirm: Must be "DELETE_ALL_DATA" to proceed

    Returns counts of deleted records.
    """
    # Safety check - require explicit confirmation
    if confirm != "DELETE_ALL_DATA":
        raise HTTPException(
            status_code=400,
            detail='Must provide confirm="DELETE_ALL_DATA" query parameter to proceed'
        )

    try:
        service = DataRetentionService(db)
        deleted = await service.delete_all_org_data(org_id)

        total = sum(deleted.values())
        logger.warning(
            f"GDPR DELETION: Organization {org_id} deleted completely. "
            f"{total} total records removed."
        )

        return {
            "organization_id": org_id,
            "status": "deleted",
            "deleted_counts": deleted,
            "total_deleted": total,
            "message": "All organization data has been permanently deleted (GDPR Right to Erasure)"
        }

    except Exception as e:
        logger.error(f"Failed to delete org data for {org_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to delete organization data: {str(e)}"
        )


@router.get("/retention-policy", response_model=Dict[str, int])
async def get_retention_policy(org_id: str):
    """
    Get current data retention policies for this organization.

    Returns retention periods in days for each data type.
    """
    return {
        "organization_id": org_id,
        "policies": {
            "snapshots_days": DataRetentionService.DEFAULT_SNAPSHOT_RETENTION_DAYS,
            "audit_logs_days": DataRetentionService.DEFAULT_AUDIT_LOG_RETENTION_DAYS,
            "sync_jobs_days": DataRetentionService.DEFAULT_SYNC_JOB_RETENTION_DAYS,
            "analysis_days": DataRetentionService.DEFAULT_ANALYSIS_RETENTION_DAYS,
        },
        "note": "Future versions will support custom retention periods per organization"
    }


@router.post("/migrate-encrypt-tokens", response_model=Dict[str, Any])
async def migrate_encrypt_tokens(
    confirm: str = None,
    db: AsyncSession = Depends(get_db)
):
    """
    One-time migration to encrypt existing plain-text OAuth tokens.

    ⚠️ WARNING: This should only be run ONCE during the encryption migration.

    This endpoint:
    1. Reads plain-text tokens from the database
    2. Re-saves them via ORM to trigger encryption
    3. Requires ENABLE_FIELD_ENCRYPTION=true to work

    Query params:
    - confirm: Must be "MIGRATE_TOKENS" to proceed

    After running this:
    1. Verify ENABLE_FIELD_ENCRYPTION=true in environment
    2. Test Salesforce sync
    3. Remove or disable this endpoint
    """
    # Safety check - require explicit confirmation
    if confirm != "MIGRATE_TOKENS":
        raise HTTPException(
            status_code=400,
            detail='Must provide confirm="MIGRATE_TOKENS" query parameter to proceed'
        )

    try:
        from app.core.config import settings
        from app.domain.models import SalesforceConnection
        from sqlalchemy import select, text

        # Check encryption is enabled
        if not settings.ENABLE_FIELD_ENCRYPTION:
            raise HTTPException(
                status_code=400,
                detail="ENABLE_FIELD_ENCRYPTION must be true to run migration. "
                       "Please enable it in environment variables first."
            )

        if not settings.DATABASE_ENCRYPTION_KEY:
            raise HTTPException(
                status_code=400,
                detail="DATABASE_ENCRYPTION_KEY must be set to run migration."
            )

        # Query all connections with tokens
        stmt = select(SalesforceConnection).where(
            (SalesforceConnection.access_token.isnot(None)) |
            (SalesforceConnection.refresh_token.isnot(None))
        )
        result = await db.execute(stmt)
        connections = result.scalars().all()

        if not connections:
            logger.info("No connections found with tokens to migrate")
            return {
                "status": "success",
                "message": "No tokens to migrate",
                "migrated_count": 0
            }

        migrated_count = 0
        for conn in connections:
            # Re-assign the token values
            # When encryption is enabled, setting these values will encrypt them
            if conn.access_token:
                # Force re-encryption by setting the value
                original_access = conn.access_token
                conn.access_token = original_access
                logger.info(f"Re-encrypted access token for connection {conn.id}")

            if conn.refresh_token:
                original_refresh = conn.refresh_token
                conn.refresh_token = original_refresh
                logger.info(f"Re-encrypted refresh token for connection {conn.id}")

            migrated_count += 1

        # Commit all changes
        await db.commit()

        logger.info(
            f"TOKEN MIGRATION COMPLETE: {migrated_count} connection(s) migrated. "
            f"Tokens are now encrypted with AES-256."
        )

        return {
            "status": "success",
            "message": f"Successfully migrated {migrated_count} connection(s)",
            "migrated_count": migrated_count,
            "next_steps": [
                "Verify ENABLE_FIELD_ENCRYPTION=true in environment",
                "Test Salesforce sync to ensure it works",
                "Tokens are now encrypted with AES-256"
            ]
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to migrate tokens: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to migrate tokens: {str(e)}"
        )
