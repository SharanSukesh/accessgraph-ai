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


@router.post("/reset-tokens/{salesforce_org_id}", response_model=Dict[str, Any])
async def reset_connection_tokens(
    salesforce_org_id: str,
    confirm: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    """
    Clear the access_token and refresh_token for a connection so a fresh
    re-OAuth populates them cleanly. Use this when stored tokens are
    corrupted (e.g., bytea-hex from an older sqlalchemy_utils version,
    or plain text that was never properly encrypted).

    This does NOT delete the SalesforceConnection or Organization records -
    it just nulls out the token fields. The user then re-OAuths via the
    web app, and auth.py's UPDATE path fills in fresh, properly-encrypted
    tokens.

    Requires confirm=RESET.
    """
    if confirm != "RESET":
        raise HTTPException(
            status_code=400,
            detail="Pass ?confirm=RESET to clear the tokens"
        )

    from sqlalchemy import text as sa_text

    # Use raw UPDATE so we bypass any ORM read-then-decrypt step that
    # might fail on corrupted existing data
    result = await db.execute(sa_text(
        """
        UPDATE salesforce_connections
        SET access_token = NULL,
            refresh_token = NULL,
            is_active = false
        WHERE organization_id_sf = :sf_org_id
        RETURNING id
        """
    ), {"sf_org_id": salesforce_org_id})
    rows = result.fetchall()
    await db.commit()

    return {
        "success": True,
        "message": f"Cleared tokens for {len(rows)} connection(s)",
        "connection_ids": [r[0] for r in rows],
        "next_step": (
            "Re-authenticate at https://gentle-love-production-1eba.up.railway.app "
            "to populate fresh, properly-encrypted tokens."
        ),
    }


@router.get("/diagnose-encryption", response_model=Dict[str, Any])
async def diagnose_encryption(
    confirm: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    """
    Diagnose the encryption pipeline. Reports:
    - sqlalchemy-utils version installed
    - The actual PostgreSQL column type for access_token
    - The raw stored value (truncated, hex-decoded if bytea)
    - Manual round-trip test of AesEngine encrypt -> decrypt
    - Whether ORM-loaded value matches manually-decrypted value

    Requires confirm=DIAGNOSE.
    """
    if confirm != "DIAGNOSE":
        raise HTTPException(
            status_code=400,
            detail="Pass ?confirm=DIAGNOSE to run this diagnostic"
        )

    from app.core.config import settings as cfg
    from sqlalchemy import text as sa_text

    diagnostic: Dict[str, Any] = {
        "encryption_settings": {
            "ENABLE_FIELD_ENCRYPTION": cfg.ENABLE_FIELD_ENCRYPTION,
            "DATABASE_ENCRYPTION_KEY_set": bool(cfg.DATABASE_ENCRYPTION_KEY),
            "DATABASE_ENCRYPTION_KEY_length": (
                len(cfg.DATABASE_ENCRYPTION_KEY) if cfg.DATABASE_ENCRYPTION_KEY else 0
            ),
        }
    }

    # 1. sqlalchemy_utils version
    try:
        import sqlalchemy_utils
        diagnostic["sqlalchemy_utils_version"] = sqlalchemy_utils.__version__
    except Exception as e:
        diagnostic["sqlalchemy_utils_version"] = f"error: {e}"

    # 2. Actual PostgreSQL column type
    try:
        result = await db.execute(sa_text(
            """
            SELECT column_name, data_type, udt_name, character_maximum_length
            FROM information_schema.columns
            WHERE table_name = 'salesforce_connections'
              AND column_name IN ('access_token', 'refresh_token')
            """
        ))
        rows = result.fetchall()
        diagnostic["pg_columns"] = [
            {
                "column": r[0],
                "data_type": r[1],
                "udt_name": r[2],
                "max_length": r[3],
            }
            for r in rows
        ]
    except Exception as e:
        diagnostic["pg_columns_error"] = str(e)

    # 3. Raw stored value (bypass ORM/EncryptedType to see underlying bytes)
    try:
        result = await db.execute(sa_text(
            """
            SELECT id, length(access_token::text) as text_len,
                   substring(access_token::text from 1 for 30) as raw_first_30,
                   octet_length(access_token::bytea) as byte_len
            FROM salesforce_connections
            WHERE access_token IS NOT NULL
            LIMIT 1
            """
        ))
        row = result.fetchone()
        if row:
            diagnostic["raw_storage"] = {
                "connection_id": row[0],
                "text_length": row[1],
                "raw_first_30_chars": row[2],
                "byte_length": row[3],
            }
    except Exception as e:
        diagnostic["raw_storage_error"] = str(e)

    # 4. Manual encrypt -> decrypt round-trip with AesEngine - properly initialized
    try:
        from sqlalchemy_utils.types.encrypted.encrypted_type import AesEngine
        engine = AesEngine()
        engine._set_padding_mechanism("pkcs5")
        engine._update_key(cfg.DATABASE_ENCRYPTION_KEY)

        plaintext = "00D9H000002jioXUAQ!AQEAQTokenValuetest12345"  # SF-token-shaped
        encrypted = engine.encrypt(plaintext)
        decrypted = engine.decrypt(encrypted)

        diagnostic["round_trip"] = {
            "plaintext": plaintext,
            "plaintext_length": len(plaintext),
            "encrypted_type": type(encrypted).__name__,
            "encrypted_length": len(encrypted) if hasattr(encrypted, "__len__") else None,
            "encrypted_first_30": (
                encrypted.decode() if isinstance(encrypted, bytes) else str(encrypted)
            )[:30],
            "decrypted_type": type(decrypted).__name__,
            "decrypted": decrypted if isinstance(decrypted, str) else (
                decrypted.decode("utf-8", errors="replace") if isinstance(decrypted, bytes) else str(decrypted)
            ),
            "decrypted_matches": (
                decrypted == plaintext or
                (isinstance(decrypted, bytes) and decrypted.decode() == plaintext)
            ),
        }
    except Exception as e:
        diagnostic["round_trip_error"] = f"{type(e).__name__}: {e}"

    # 4b. Test the EXACT EncryptedType code path the ORM uses on save
    try:
        from sqlalchemy_utils.types.encrypted.encrypted_type import StringEncryptedType, AesEngine
        from sqlalchemy import Text

        # Recreate the exact EncryptedType used in models.py
        et = StringEncryptedType(Text, cfg.DATABASE_ENCRYPTION_KEY, AesEngine, "pkcs5")

        plaintext = "00D9H000002jioXUAQ!AQEAQTokenValuetest12345"
        # process_bind_param is what SQLAlchemy calls when saving via ORM
        bind_result = et.process_bind_param(plaintext, None)

        diagnostic["encrypted_type_bind_param"] = {
            "input": plaintext,
            "output_type": type(bind_result).__name__,
            "output_length": len(bind_result) if hasattr(bind_result, "__len__") else None,
            "output_first_30_repr": repr(bind_result)[:60] if bind_result else None,
            "is_bytes": isinstance(bind_result, bytes),
            "is_str": isinstance(bind_result, str),
        }

        # Test round-trip through process_result_value
        result_value = et.process_result_value(bind_result, None)
        diagnostic["encrypted_type_result_value"] = {
            "decrypted_type": type(result_value).__name__,
            "decrypted_value": result_value if isinstance(result_value, str) else repr(result_value),
            "matches_input": result_value == plaintext,
        }
    except Exception as e:
        import traceback
        diagnostic["encrypted_type_error"] = f"{type(e).__name__}: {e}\n{traceback.format_exc()[:500]}"

    # 5. Per-connection scan: classify every stored token
    try:
        from sqlalchemy_utils.types.encrypted.encrypted_type import AesEngine
        engine = AesEngine()
        engine._set_padding_mechanism("pkcs5")
        engine._update_key(cfg.DATABASE_ENCRYPTION_KEY)

        result = await db.execute(sa_text(
            """
            SELECT id, organization_id, organization_id_sf,
                   length(access_token) as at_len,
                   substring(access_token from 1 for 30) as at_first_30,
                   length(refresh_token) as rt_len,
                   substring(refresh_token from 1 for 30) as rt_first_30,
                   is_active
            FROM salesforce_connections
            ORDER BY created_at DESC
            """
        ))
        rows = result.fetchall()
        connections_info = []
        for r in rows:
            (cid, org_id, sf_org_id, at_len, at_first, rt_len, rt_first, is_active) = r

            def classify(value: Optional[str]) -> str:
                if not value:
                    return "null"
                if value.startswith("00D") or value.startswith("eyJ"):
                    return "plain_sf_token"
                if value.startswith("\\x"):
                    return "bytea_hex_string"
                # Try to decrypt - if it works, it's a properly-stored encrypted token
                try:
                    engine.decrypt(value)
                    return "properly_encrypted_base64"
                except Exception:
                    return "unknown_format"

            # Get full token value for accurate classification
            full_q = await db.execute(sa_text(
                "SELECT access_token, refresh_token FROM salesforce_connections WHERE id = :id"
            ), {"id": cid})
            full = full_q.fetchone()
            full_at, full_rt = (full[0], full[1]) if full else (None, None)

            connections_info.append({
                "connection_id": cid,
                "org_id": org_id,
                "sf_org_id": sf_org_id,
                "is_active": is_active,
                "access_token": {
                    "length": at_len or 0,
                    "first_30": at_first,
                    "classification": classify(full_at),
                },
                "refresh_token": {
                    "length": rt_len or 0,
                    "first_30": rt_first,
                    "classification": classify(full_rt),
                },
            })

        diagnostic["connections"] = connections_info
    except Exception as e:
        import traceback
        diagnostic["connections_error"] = f"{type(e).__name__}: {e}\n{traceback.format_exc()}"

    return diagnostic


@router.get("/diagnose/{salesforce_org_id}", response_model=Dict[str, Any])
async def diagnose_oauth_state(
    salesforce_org_id: str,
    confirm: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    """
    Diagnostic endpoint for OAuth token state. Reports:
    - Whether the SalesforceConnection record exists
    - Whether access_token / refresh_token decrypt to non-null values
    - Whether token-shape looks like a Salesforce session token
    - Whether the access_token actually works against Salesforce (live test)
    - Whether refresh_token can mint a new access_token

    Does NOT return the raw token values, only structural info.
    Requires confirm=DIAGNOSE to run (defense against accidental probing).
    """
    if confirm != "DIAGNOSE":
        raise HTTPException(
            status_code=400,
            detail="Pass ?confirm=DIAGNOSE to run this diagnostic"
        )

    from app.core.config import settings as cfg
    import httpx

    stmt = select(SalesforceConnection).where(
        SalesforceConnection.organization_id_sf == salesforce_org_id
    )
    result = await db.execute(stmt)
    connection = result.scalar_one_or_none()

    if not connection:
        return {"connection_found": False}

    access_token = connection.access_token
    refresh_token = connection.refresh_token

    def shape_info(token: Optional[str]) -> Dict[str, Any]:
        if not token:
            return {"present": False, "length": 0}
        looks_like_sf = (
            token.startswith("00D")
            or token.startswith("00!")
            or token.startswith("eyJ")
            or "!" in token[:50]
        )
        return {
            "present": True,
            "length": len(token),
            "looks_like_sf_token": looks_like_sf,
            "first_10": token[:10] if len(token) >= 10 else token,
        }

    diagnosis: Dict[str, Any] = {
        "connection_found": True,
        "connection_id": connection.id,
        "is_active": connection.is_active,
        "instance_url": connection.instance_url,
        "encryption_settings": {
            "ENABLE_FIELD_ENCRYPTION": cfg.ENABLE_FIELD_ENCRYPTION,
            "DATABASE_ENCRYPTION_KEY_set": bool(cfg.DATABASE_ENCRYPTION_KEY),
        },
        "access_token": shape_info(access_token),
        "refresh_token": shape_info(refresh_token),
    }

    # Live test: hit Salesforce /services/oauth2/userinfo with the access token
    if access_token and connection.instance_url:
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                userinfo_url = f"{connection.instance_url}/services/oauth2/userinfo"
                r = await client.get(
                    userinfo_url,
                    headers={"Authorization": f"Bearer {access_token}"},
                )
                diagnosis["access_token_test"] = {
                    "endpoint": "/services/oauth2/userinfo",
                    "status_code": r.status_code,
                    "ok": r.status_code == 200,
                    "body_preview": r.text[:200],
                }
        except Exception as e:
            diagnosis["access_token_test"] = {"error": str(e)}

    # Live test: try refreshing the token
    if refresh_token:
        try:
            from app.salesforce.oauth import SalesforceOAuthClient
            oauth = SalesforceOAuthClient()
            new_token = await oauth.refresh_access_token(refresh_token)
            diagnosis["refresh_test"] = {
                "ok": True,
                "new_access_token_length": len(new_token.access_token) if new_token.access_token else 0,
                "new_instance_url": new_token.instance_url,
                "matches_stored_instance_url": new_token.instance_url == connection.instance_url,
            }
        except Exception as e:
            diagnosis["refresh_test"] = {"ok": False, "error": str(e)}

    return diagnosis
