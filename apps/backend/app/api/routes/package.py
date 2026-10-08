"""
Salesforce managed package callouts.

The package authenticates with a per-org key (X-Newton-Package-Key)
that an admin generates in the web app (POST /orgs/{id}/package-key) and
pastes into the package's settings. /install is the one public endpoint:
the post-install handler has no key yet, so it may only log, never
create or modify orgs.
"""
import logging
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, Header, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import PACKAGE_KEY_HEADER, package_org_for_salesforce_id, require_credentials, require_credentials
from app.db.session import get_db
from app.domain.models import (
    AuditAction,
    AuditLog,
    SalesforceConnection,
    SyncJob,
    SyncStatus,
)
from app.ingestion.orchestrator import schedule_background_sync

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/package", tags=["package"])


class PackageInstallRequest(BaseModel):
    organizationId: str
    organizationName: Optional[str] = None
    installationType: Optional[str] = None
    previousVersion: Optional[str] = None
    installDate: Optional[str] = None
    installerEmail: Optional[str] = None


class SyncTriggerRequest(BaseModel):
    organizationId: str


@router.post("/install", response_model=Dict[str, Any])
async def handle_package_installation(
    payload: PackageInstallRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Install notification from AccessGraphPostInstall. Audit-only."""
    connection = (
        await db.execute(
            select(SalesforceConnection).where(
                SalesforceConnection.organization_id_sf == payload.organizationId
            )
        )
    ).scalar_one_or_none()
    if connection is not None:
        db.add(AuditLog(
            organization_id=connection.organization_id,
            user_email=payload.installerEmail,
            action=AuditAction.CONNECT_SALESFORCE,
            resource_type="package_installation",
            resource_id=payload.organizationId,
            ip_address=request.client.host if request.client else None,
            user_agent=request.headers.get("User-Agent"),
            request_path="/package/install",
            request_method="POST",
            success=True,
            context_data={
                "installation_type": payload.installationType,
                "previous_version": payload.previousVersion,
            },
        ))
        await db.commit()
    logger.info(
        "package install notice for SF org %s (known=%s)",
        payload.organizationId, connection is not None,
    )
    return {"success": True}


@router.post("/sync-trigger", response_model=Dict[str, Any], dependencies=[Depends(require_credentials)])
async def handle_sync_trigger(
    payload: SyncTriggerRequest,
    request: Request,
    package_key: Optional[str] = Header(None, alias=PACKAGE_KEY_HEADER),
    db: AsyncSession = Depends(get_db),
):
    org = await package_org_for_salesforce_id(db, payload.organizationId, package_key)
    db.add(AuditLog(
        organization_id=org.id,
        action=AuditAction.SYNC_DATA,
        resource_type="package_sync_trigger",
        resource_id=org.id,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("User-Agent"),
        request_path="/package/sync-trigger",
        request_method="POST",
        success=True,
        context_data={"triggered_from": "salesforce_package"},
    ))
    sync_job = SyncJob(organization_id=org.id, status=SyncStatus.PENDING)
    db.add(sync_job)
    await db.commit()
    await db.refresh(sync_job)
    schedule_background_sync(org.id, sync_job.id)
    return {
        "success": True,
        "organization_id": org.id,
        "sync_job_id": sync_job.id,
        "status": sync_job.status.value,
    }


@router.get("/status/{salesforce_org_id}", response_model=Dict[str, Any], dependencies=[Depends(require_credentials)])
async def get_package_status(
    salesforce_org_id: str,
    package_key: Optional[str] = Header(None, alias=PACKAGE_KEY_HEADER),
    db: AsyncSession = Depends(get_db),
):
    org = await package_org_for_salesforce_id(db, salesforce_org_id, package_key)
    connection = (
        await db.execute(
            select(SalesforceConnection).where(
                SalesforceConnection.organization_id_sf == salesforce_org_id
            )
        )
    ).scalar_one_or_none()
    latest_sync = (
        await db.execute(
            select(SyncJob)
            .where(SyncJob.organization_id == org.id)
            .order_by(SyncJob.created_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    oauth_connected = bool(connection and connection.access_token)
    return {
        "installed": True,
        "organization_id": org.id,
        "salesforce_org_id": salesforce_org_id,
        "organization_name": org.name,
        "oauth_connected": oauth_connected,
        "last_sync": {
            "job_id": latest_sync.id,
            "status": latest_sync.status.value,
            "started_at": latest_sync.started_at.isoformat() if latest_sync.started_at else None,
            "completed_at": latest_sync.completed_at.isoformat() if latest_sync.completed_at else None,
        } if latest_sync else None,
        "configuration_complete": oauth_connected,
    }
