"""
Privacy and data management for a client org: inventory (right of
access), retention cleanup, and erasure. main.py guards the whole router
with require_org_access; destructive routes additionally need ORG_ADMIN.
"""
import logging
from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import require_org_admin
from app.db.session import get_db
from app.domain.models import AuditAction, AuditLog, Organization
from app.services import privacy_mode
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


class PrivacyModeUpdate(BaseModel):
    mode: str
    allow_record_aggregates: bool = False


@router.get("/mode", response_model=Dict[str, Any])
async def get_privacy_mode(org_id: str, db: AsyncSession = Depends(get_db)):
    org = await db.get(Organization, org_id)
    return {
        **privacy_mode.privacy_settings(org),
        "label": privacy_mode.MODE_LABELS[privacy_mode.mode_of(org)],
    }


@router.put("/mode", response_model=Dict[str, Any])
async def update_privacy_mode(
    org_id: str,
    body: PrivacyModeUpdate,
    request: Request,
    _admin: str = Depends(require_org_admin),
    db: AsyncSession = Depends(get_db),
):
    """Change what Newton may pull and keep for this client. Tightening the
    level masks or deletes already-stored data immediately; loosening it
    takes effect from the next sync."""
    from app.services.privacy_purge import enforce_privacy_mode

    if body.mode not in privacy_mode.MODES:
        raise HTTPException(status_code=400, detail=f"mode must be one of {list(privacy_mode.MODES)}")
    org = await db.get(Organization, org_id)
    actor = request.state.principal.email
    previous = privacy_mode.privacy_settings(org)
    record = privacy_mode.set_privacy(org, body.mode, body.allow_record_aggregates, actor)
    purged = await enforce_privacy_mode(db, org)
    db.add(AuditLog(
        organization_id=org_id,
        user_email=actor,
        action=AuditAction.UPDATE_SETTINGS,
        resource_type="privacy_mode",
        resource_id=org_id,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
        request_method="PUT",
        request_path=str(request.url.path),
        success=True,
        context_data={"from": previous, "to": record, "purged": purged},
    ))
    await db.commit()
    return {**record, "label": privacy_mode.MODE_LABELS[body.mode], "purged": purged}

