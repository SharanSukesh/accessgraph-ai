"""
Privacy and data management for a client org: inventory (right of
access), retention cleanup, and erasure. main.py guards the whole router
with require_org_access; destructive routes additionally need ORG_ADMIN.
"""
import logging
from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import require_org_admin
from app.db.session import get_db
from app.services.data_retention import DataRetentionService, ErasureRefused

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/orgs/{org_id}/privacy", tags=["privacy"])

ERASURE_CONFIRMATION = "DELETE_ALL_DATA"


@router.get("/inventory", response_model=Dict[str, Any])
async def get_data_inventory(org_id: str, db: AsyncSession = Depends(get_db)):
    inventory = await DataRetentionService(db).get_data_inventory(org_id)
    return {
        "organization_id": org_id,
        "data_inventory": inventory,
        "retention_policies": DataRetentionService.retention_policy(),
    }


@router.delete("/snapshots", response_model=Dict[str, Any])
async def delete_old_snapshots(
    org_id: str,
    _admin: str = Depends(require_org_admin),
    retention_days: int = DataRetentionService.DEFAULT_SNAPSHOT_RETENTION_DAYS,
    db: AsyncSession = Depends(get_db),
):
    deleted = await DataRetentionService(db).delete_old_snapshots(org_id, retention_days)
    return {
        "organization_id": org_id,
        "retention_days": retention_days,
        "deleted_counts": deleted,
        "total_deleted": sum(deleted.values()),
    }


@router.delete("/cleanup", response_model=Dict[str, Any])
async def cleanup_all_old_data(
    org_id: str,
    _admin: str = Depends(require_org_admin),
    db: AsyncSession = Depends(get_db),
):
    results = await DataRetentionService(db).cleanup_all_old_data(org_id)
    total = sum(v if isinstance(v, int) else sum(v.values()) for v in results.values())
    return {"organization_id": org_id, "results": results, "total_deleted": total}


@router.delete("/all-data", response_model=Dict[str, Any])
async def delete_all_organization_data(
    org_id: str,
    _admin: str = Depends(require_org_admin),
    confirm: str = "",
    db: AsyncSession = Depends(get_db),
):
    """Erase everything Newton holds for this client org and revoke its
    Salesforce access. Irreversible."""
    if confirm != ERASURE_CONFIRMATION:
        raise HTTPException(
            status_code=400,
            detail=f'Pass confirm="{ERASURE_CONFIRMATION}" to proceed.',
        )
    try:
        result = await DataRetentionService(db).delete_all_org_data(org_id)
    except ErasureRefused as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    total = sum(result["deleted_counts"].values())
    return {
        "organization_id": org_id,
        "status": "deleted",
        "total_deleted": total,
        **result,
    }


@router.get("/retention-policy", response_model=Dict[str, Any])
async def get_retention_policy(org_id: str):
    return {
        "organization_id": org_id,
        "policies": DataRetentionService.retention_policy(),
    }
