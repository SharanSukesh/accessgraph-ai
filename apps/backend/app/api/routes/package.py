"""
Salesforce Package API Routes
Handles package installation notifications and sync triggers from Salesforce
"""
import logging
from typing import Dict, Optional
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


@router.post("/install", response_model=Dict[str, any])
async def handle_package_installation(
    payload: PackageInstallRequest,
    request: Request,
    db: AsyncSession = Depends(get_db)
):
    """
    Handle package installation notification from Salesforce.

    This endpoint is called by the AccessGraphPostInstall Apex class
    after the package is installed in a Salesforce org.

    Actions:
    1. Create or update Organization record
    2. Log installation event
    3. Send welcome email (TODO: integrate with email service)
    4. Return organization ID and next steps
    """
    try:
        # Check if organization already exists
        stmt = select(Organization).where(
            Organization.salesforce_org_id == payload.organizationId
        )
        result = await db.execute(stmt)
        org = result.scalar_one_or_none()

        if org:
            # Existing org - this is a reinstall or upgrade
            logger.info(
                f"Package {payload.installationType} for existing org: {org.id}"
            )
            org.name = payload.organizationName  # Update name if changed
            installation_type = "upgrade" if payload.installationType == "upgrade" else "reinstall"
        else:
            # New organization - create record
            org = Organization(
                salesforce_org_id=payload.organizationId,
                name=payload.organizationName,
                status="active"
            )
            db.add(org)
            await db.flush()  # Get org.id
            logger.info(f"New organization created via package install: {org.id}")
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


@router.post("/sync-trigger", response_model=Dict[str, any])
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
        # Find organization by Salesforce Org ID
        stmt = select(Organization).where(
            Organization.salesforce_org_id == payload.organizationId
        )
        result = await db.execute(stmt)
        org = result.scalar_one_or_none()

        if not org:
            raise HTTPException(
                status_code=404,
                detail=f"Organization not found: {payload.organizationId}. "
                       "Please complete OAuth setup first."
            )

        # Check if org has OAuth connection
        stmt = select(SalesforceConnection).where(
            SalesforceConnection.organization_id == org.id
        )
        result = await db.execute(stmt)
        connection = result.scalar_one_or_none()

        if not connection or not connection.access_token:
            raise HTTPException(
                status_code=403,
                detail="OAuth connection required. Please authorize at "
                       "https://accessgraph-ai-production.up.railway.app"
            )

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

        # Import sync service here to avoid circular imports
        from app.services.salesforce_sync import SalesforceSyncService

        # Trigger sync
        sync_service = SalesforceSyncService(db)
        sync_job = await sync_service.trigger_sync(org.id)

        return {
            "success": True,
            "organization_id": org.id,
            "sync_job_id": sync_job.id,
            "status": sync_job.status,
            "message": "Permission sync initiated successfully",
            "started_at": sync_job.started_at.isoformat() if sync_job.started_at else None
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


@router.get("/status/{salesforce_org_id}", response_model=Dict[str, any])
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
        # Find organization
        stmt = select(Organization).where(
            Organization.salesforce_org_id == salesforce_org_id
        )
        result = await db.execute(stmt)
        org = result.scalar_one_or_none()

        if not org:
            return {
                "installed": False,
                "message": "Package not installed or organization not found"
            }

        # Check OAuth connection
        stmt = select(SalesforceConnection).where(
            SalesforceConnection.organization_id == org.id
        )
        result = await db.execute(stmt)
        connection = result.scalar_one_or_none()

        oauth_connected = bool(connection and connection.access_token)

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
