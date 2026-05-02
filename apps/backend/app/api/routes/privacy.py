"""
Privacy & Data Management API Routes
Handles GDPR compliance, data retention, and privacy requests.
"""
import logging
from typing import Dict

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.services.data_retention import DataRetentionService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/orgs/{org_id}/privacy", tags=["privacy"])


@router.get("/inventory", response_model=Dict[str, any])
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


@router.delete("/snapshots", response_model=Dict[str, any])
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


@router.delete("/cleanup", response_model=Dict[str, any])
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


@router.delete("/all-data", response_model=Dict[str, any])
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
