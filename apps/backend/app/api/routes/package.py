"""
Salesforce Package API Routes
Handles package installation notifications and sync triggers from Salesforce
"""
import logging
from typing import Dict, Optional, Any
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, EmailStr
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.session import get_db
from app.domain.models import Organization, SalesforceConnection, AuditLog, AuditAction

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/package", tags=["package"])


class PackageInstallRequest(BaseModel):
    """Package installation notification from Salesforce"""
    organizationId: str  # Salesforce Org ID
    organizationName: str
    installationType: str  # "new" or "upgrade"
    previousVersion: Optional[str] = None
    installDate: str
    installerEmail: EmailStr


class SyncTriggerRequest(BaseModel):
    """Sync trigger request from Salesforce package"""
    organizationId: str


@router.post("/install", response_model=Dict[str, Any])
async def handle_package_installation(
    payload: PackageInstallRequest,
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    """
    Handle package installation notification from Salesforce.

    This endpoint is called by the AccessGraphPostInstall Apex class
    after the package is installed in a Salesforce org.

    The Salesforce Org ID lives on SalesforceConnection.organization_id_sf
    (not on Organization), so we look up the existing org via the
    connection. If no connection exists yet (OAuth not completed), we
    create a placeholder Organization that will be linked when OAuth
    runs in auth.py (which also queries by SalesforceConnection.organization_id_sf).

    Actions:
    1. Create or update Organization record
    2. Log installation event
    3. Return organization ID and next steps (e.g., complete OAuth)
    """
    try:
        # Look for an existing SalesforceConnection with this SF org ID
        stmt = select(SalesforceConnection).where(
            SalesforceConnection.organization_id_sf == payload.organizationId
        )
        result = await db.execute(stmt)
        existing_connection = result.scalar_one_or_none()

        if existing_connection:
            # OAuth already happened previously - reuse the existing Organization
            org = await db.get(Organization, existing_connection.organization_id)
            org.name = payload.organizationName  # Update name if changed
            installation_type = (
                "upgrade" if payload.installationType == "upgrade" else "reinstall"
            )
            logger.info(
                f"Package {installation_type} for existing org: {org.id} "
                f"(SF Org: {payload.organizationId})"
            )
        else:
            # No prior OAuth - create a placeholder Organization. The
            # SalesforceConnection record (with tokens) will be created
            # when the user completes OAuth in the web app.
            org = Organization(
                name=payload.organizationName,
            )
            db.add(org)
            await db.flush()  # populate org.id
            logger.info(
                f"New organization placeholder created via package install: {org.id} "
                f"(SF Org: {payload.organizationId}). Awaiting OAuth completion."
            )
            installation_type = "new_install"

        await db.commit()

        # Log installation event
        audit_log = AuditLog(
            organization_id=org.id,
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
                "installation_type": installation_type,
                "previous_version": payload.previousVersion,
                "install_date": payload.installDate,
            }
        )
        db.add(audit_log)
        await db.commit()

        logger.info(
            f"Package installation logged for org {org.id} "
            f"({installation_type}, installer: {payload.installerEmail})"
        )

        # Return organization details and next steps
        return {
            "success": True,
            "organization_id": org.id,
            "salesforce_org_id": payload.organizationId,
            "installation_type": installation_type,
            "message": "Package installation recorded successfully",
            "next_steps": {
                "1_oauth": "Complete OAuth setup at https://accessgraph-ai-production.up.railway.app",
                "2_sync": "Trigger initial permission sync from Salesforce or dashboard",
                "3_dashboard": f"View analytics at https://accessgraph-ai-production.up.railway.app/orgs/{org.id}/dashboard"
            }
        }

    except Exception as e:
        logger.error(
            f"Failed to process package installation for {payload.organizationId}: {e}",
            exc_info=True
        )
        raise HTTPException(
            status_code=500,
            detail=f"Failed to process installation: {str(e)}"
        )


@router.post("/sync-trigger", response_model=Dict[str, Any])
async def handle_sync_trigger(
    payload: SyncTriggerRequest,
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    """
    Handle sync trigger from Salesforce package.

    This endpoint is called by the AccessGraphConnector.triggerSync()
    Apex method to initiate a permission sync.

    This is a lightweight endpoint that delegates to the main sync endpoint.
    """
    try:
        # Find SalesforceConnection (and via it, the Organization) by Salesforce Org ID.
        # The SF Org ID lives on SalesforceConnection.organization_id_sf, not Organization.
        stmt = select(SalesforceConnection).where(
            SalesforceConnection.organization_id_sf == payload.organizationId
        )
        result = await db.execute(stmt)
        connection = result.scalar_one_or_none()

        if not connection:
            raise HTTPException(
                status_code=404,
                detail=f"Organization not found: {payload.organizationId}. "
                       "Please complete OAuth setup first at "
                       "https://accessgraph-ai-production.up.railway.app"
            )

        if not connection.access_token:
            raise HTTPException(
                status_code=403,
                detail="OAuth connection required. Please authorize at "
                       "https://accessgraph-ai-production.up.railway.app"
            )

        org = await db.get(Organization, connection.organization_id)

        # Log sync trigger
        audit_log = AuditLog(
            organization_id=org.id,
            action=AuditAction.SYNC_DATA,
            resource_type="package_sync_trigger",
            resource_id=org.id,
            ip_address=request.client.host if request.client else None,
            user_agent=request.headers.get("User-Agent"),
            request_path="/package/sync-trigger",
            request_method="POST",
            success=True,
            context_data={
                "triggered_from": "salesforce_package",
                "salesforce_org_id": payload.organizationId
            }
        )
        db.add(audit_log)
        await db.commit()

        logger.info(
            f"Sync triggered from Salesforce package for org {org.id} "
            f"(SF Org: {payload.organizationId})"
        )

        # Use the same SyncOrchestrator that /orgs/{org_id}/sync uses, so
        # the package's "Sync Now" button takes the exact same proven code
        # path as the web app's sync button. SalesforceSyncService is a
        # legacy parallel implementation that works on Pydantic objects
        # while extract_all() returns dicts - SyncOrchestrator handles dicts
        # correctly and is the path used by the working web-app sync.
        from app.domain.models import SyncJob, SyncStatus
        from app.ingestion.orchestrator import SyncOrchestrator

        sync_job = SyncJob(
            organization_id=org.id,
            status=SyncStatus.PENDING,
        )
        db.add(sync_job)
        await db.commit()
        await db.refresh(sync_job)

        orchestrator = SyncOrchestrator(db)
        await orchestrator.run_sync(org.id, sync_job.id)

        await db.refresh(sync_job)

        return {
            "success": True,
            "organization_id": org.id,
            "sync_job_id": sync_job.id,
            "status": sync_job.status.value if hasattr(sync_job.status, "value") else sync_job.status,
            "message": "Permission sync initiated successfully",
            "started_at": (
                sync_job.started_at.isoformat() if sync_job.started_at else None
            ),
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(
            f"Failed to trigger sync for {payload.organizationId}: {e}",
            exc_info=True
        )
        raise HTTPException(
            status_code=500,
            detail=f"Failed to trigger sync: {str(e)}"
        )


@router.get("/status/{salesforce_org_id}", response_model=Dict[str, Any])
async def get_package_status(
    salesforce_org_id: str,
    db: AsyncSession = Depends(get_db)
):
    """
    Get package installation and configuration status.

    Returns:
    - Installation status
    - OAuth connection status
    - Last sync information
    - Configuration completeness
    """
    try:
        # Find SalesforceConnection by SF Org ID (which is stored on the connection,
        # not on Organization). The Organization is reachable via connection.organization_id.
        stmt = select(SalesforceConnection).where(
            SalesforceConnection.organization_id_sf == salesforce_org_id
        )
        result = await db.execute(stmt)
        connection = result.scalar_one_or_none()

        if not connection:
            return {
                "installed": False,
                "message": "Package not installed or organization not found"
            }

        org = await db.get(Organization, connection.organization_id)
        oauth_connected = bool(connection.access_token)

        # Get latest sync job
        from app.domain.models import SyncJob
        stmt = (
            select(SyncJob)
            .where(SyncJob.organization_id == org.id)
            .order_by(SyncJob.started_at.desc())
            .limit(1)
        )
        result = await db.execute(stmt)
        latest_sync = result.scalar_one_or_none()

        return {
            "installed": True,
            "organization_id": org.id,
            "salesforce_org_id": salesforce_org_id,
            "organization_name": org.name,
            "oauth_connected": oauth_connected,
            "last_sync": {
                "job_id": latest_sync.id if latest_sync else None,
                "status": latest_sync.status if latest_sync else None,
                "started_at": latest_sync.started_at.isoformat() if latest_sync and latest_sync.started_at else None,
                "completed_at": latest_sync.completed_at.isoformat() if latest_sync and latest_sync.completed_at else None,
            } if latest_sync else None,
            "configuration_complete": oauth_connected,
            "next_steps": [] if oauth_connected else [
                "Complete OAuth setup at https://accessgraph-ai-production.up.railway.app"
            ]
        }

    except Exception as e:
        logger.error(
            f"Failed to get package status for {salesforce_org_id}: {e}",
            exc_info=True
        )
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get status: {str(e)}"
        )

