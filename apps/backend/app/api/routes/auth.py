"""
Salesforce connection (OAuth) and session routes.

Connecting Salesforce is an action a signed-in Newton user takes on behalf
of a client org; it never creates or replaces the user's session. The
callback stores the client org's tokens and grants the connecting user
access to that org.

CSRF/PKCE: /authorize mints a random state and PKCE verifier and keeps
both in a short-lived signed cookie scoped to /auth/salesforce. The
callback only proceeds when the returned state matches that cookie.
"""
import logging
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional
from urllib.parse import quote

from fastapi import APIRouter, Cookie, Depends, HTTPException, Query, Request, status
from fastapi.responses import JSONResponse, RedirectResponse
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_database
from app.auth.deps import (
    READ_ONLY_ROLES,
    Principal,
    get_principal,
    require_org_access,
    require_org_admin,
)
from app.auth.jwt import ALGORITHM, _jwt_secret
from app.core.config import settings
from app.domain.models import (
    AuditAction,
    AuditLog,
    OrgAccessGrant,
    Organization,
    SalesforceConnection,
)
from app.salesforce.client import SalesforceAPIClient
from app.salesforce.oauth import SalesforceOAuthClient

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth")
salesforce_router = APIRouter(prefix="/salesforce")

OAUTH_COOKIE = "sf_oauth"
OAUTH_COOKIE_PATH = "/auth/salesforce"
OAUTH_COOKIE_TTL = timedelta(minutes=10)
SANDBOX_LOGIN_URL = "https://test.salesforce.com"


def _frontend(path: str) -> str:
    return f"{settings.FRONTEND_URL.rstrip('/')}{path}"


def _error_redirect(code: str) -> RedirectResponse:
    response = RedirectResponse(url=_frontend(f"/start?error={quote(code)}"))
    response.delete_cookie(OAUTH_COOKIE, path=OAUTH_COOKIE_PATH)
    return response


@salesforce_router.get("/authorize")
async def authorize(
    env: Optional[str] = Query(
        None, description="'sandbox' for test.salesforce.com; omitted for production."
    ),
    prompt: Optional[str] = Query(
        None, description="Forwarded to Salesforce, e.g. 'login' to force the login screen."
    ),
    principal: Principal = Depends(get_principal),
):
    """Start connecting a client Salesforce org. Requires a Newton session."""
    if principal.role in READ_ONLY_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your role cannot connect Salesforce orgs.",
        )
    if not settings.SALESFORCE_CLIENT_ID or not settings.SALESFORCE_CLIENT_SECRET:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Salesforce OAuth is not configured on this server.",
        )

    is_sandbox = (env or "").lower() in ("sandbox", "scratch", "test")
    state = secrets.token_urlsafe(32)
    verifier = SalesforceOAuthClient.generate_code_verifier()
    oauth_client = SalesforceOAuthClient(login_url=SANDBOX_LOGIN_URL if is_sandbox else None)
    sf_prompt = prompt if prompt in ("login", "consent", "select_account") else None
    auth_url = oauth_client.get_authorization_url(
        state=state, code_verifier=verifier, prompt=sf_prompt
    )

    flow = jwt.encode(
        {
            "state": state,
            "verifier": verifier,
            "sandbox": is_sandbox,
            "uid": principal.user_id,
            "exp": datetime.now(timezone.utc) + OAUTH_COOKIE_TTL,
        },
        _jwt_secret(),
        algorithm=ALGORITHM,
    )
    response = RedirectResponse(url=auth_url)
    response.set_cookie(
        key=OAUTH_COOKIE,
        value=flow,
        httponly=True,
        secure=settings.FRONTEND_URL.startswith("https://"),
        samesite="lax",
        max_age=int(OAUTH_COOKIE_TTL.total_seconds()),
        path=OAUTH_COOKIE_PATH,
    )
    logger.info("salesforce connect started by %s (sandbox=%s)", principal.email, is_sandbox)
    return response


async def _fetch_org_name(instance_url: str, access_token: str) -> Optional[str]:
    try:
        info = await SalesforceAPIClient(instance_url, access_token).extract_organization()
        return (info or {}).get("Name")
    except Exception:  # noqa: BLE001 — naming is cosmetic
        logger.info("could not read Organization.Name after connect", exc_info=True)
        return None


@salesforce_router.get("/callback")
async def callback(
    request: Request,
    code: Optional[str] = Query(None),
    state: Optional[str] = Query(None),
    error: Optional[str] = Query(None),
    sf_oauth: Optional[str] = Cookie(None),
    access_token: Optional[str] = Cookie(None),
    db: AsyncSession = Depends(get_database),
):
    """Salesforce redirects here after the consultant approves access."""
    if error:
        return _error_redirect("salesforce_denied")
    if not code or not state or not sf_oauth:
        return _error_redirect("oauth_state_missing")
    try:
        flow = jwt.decode(sf_oauth, _jwt_secret(), algorithms=[ALGORITHM])
    except JWTError:
        return _error_redirect("oauth_state_expired")
    if not secrets.compare_digest(flow.get("state", ""), state):
        return _error_redirect("oauth_state_mismatch")

    # The user who started the flow must still be the one signed in.
    try:
        principal = await get_principal(request, access_token, db)
    except HTTPException:
        response = RedirectResponse(url=_frontend("/login?error=session_expired"))
        response.delete_cookie(OAUTH_COOKIE, path=OAUTH_COOKIE_PATH)
        return response
    if principal.user_id != flow.get("uid"):
        return _error_redirect("oauth_user_mismatch")

    oauth_client = SalesforceOAuthClient(
        login_url=SANDBOX_LOGIN_URL if flow.get("sandbox") else None
    )
    try:
        token = await oauth_client.exchange_code_for_token(code, flow["verifier"])
    except Exception:  # noqa: BLE001
        logger.exception("salesforce token exchange failed")
        return _error_redirect("token_exchange_failed")

    # Identity URL: https://login.salesforce.com/id/<00D org id>/<005 user id>
    id_parts = token.id.rstrip("/").split("/")
    sf_org_id = id_parts[-2] if len(id_parts) >= 2 else None
    if not sf_org_id:
        return _error_redirect("salesforce_org_unknown")

    connection = (
        await db.execute(
            select(SalesforceConnection).where(
                SalesforceConnection.organization_id_sf == sf_org_id
            )
        )
    ).scalar_one_or_none()
    org_name = await _fetch_org_name(token.instance_url, token.access_token)

    is_new_org = connection is None
    if connection is not None:
        if not principal.is_admin:
            granted = (
                await db.execute(
                    select(OrgAccessGrant.id).where(
                        OrgAccessGrant.org_user_id == principal.user_id,
                        OrgAccessGrant.organization_id == connection.organization_id,
                    )
                )
            ).scalar_one_or_none()
            if granted is None:
                # Re-connecting an org you weren't given would hijack its tokens.
                return _error_redirect("org_not_granted")
        connection.access_token = token.access_token
        if token.refresh_token:
            connection.refresh_token = token.refresh_token
        connection.instance_url = token.instance_url
        connection.is_active = True
        org_id = connection.organization_id
        existing_org = await db.get(Organization, org_id)
        existing_org.settings = {**(existing_org.settings or {}), "is_sandbox": bool(flow.get("sandbox"))}
    else:
        domain = token.instance_url.replace("https://", "").split(".")[0]
        org = Organization(
            name=org_name or f"Salesforce Org ({domain})",
            domain=domain,
            is_demo=False,
            settings={"is_sandbox": bool(flow.get("sandbox"))},
        )
        db.add(org)
        await db.flush()
        db.add(SalesforceConnection(
            organization_id=org.id,
            instance_url=token.instance_url,
            organization_id_sf=sf_org_id,
            access_token=token.access_token,
            refresh_token=token.refresh_token,
            is_active=True,
        ))
        if not principal.is_admin:
            db.add(OrgAccessGrant(
                org_user_id=principal.user_id,
                organization_id=org.id,
                granted_by=principal.user_id,
            ))
        org_id = org.id

    db.add(AuditLog(
        organization_id=org_id,
        user_email=principal.email,
        action=AuditAction.CONNECT_SALESFORCE,
        resource_type="salesforce_connection",
        resource_id=sf_org_id,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
        request_method="GET",
        request_path=str(request.url.path),
        success=True,
        context_data={"new_org": is_new_org},
    ))
    await db.commit()
    logger.info("salesforce org %s connected to %s by %s", sf_org_id, org_id, principal.email)

    redirect = f"/orgs/{org_id}/dashboard?connected=true"
    if is_new_org:
        redirect += "&initial_sync=true"
    response = RedirectResponse(url=_frontend(redirect))
    response.delete_cookie(OAUTH_COOKIE, path=OAUTH_COOKIE_PATH)
    return response


@salesforce_router.post("/disconnect/{org_id}")
async def disconnect_org(
    org_id: str,
    _admin: str = Depends(require_org_admin),
    db: AsyncSession = Depends(get_database),
):
    """Revoke Newton's Salesforce grant for this org and forget the tokens."""
    connection = (
        await db.execute(
            select(SalesforceConnection).where(
                SalesforceConnection.organization_id == org_id,
                SalesforceConnection.is_active == True,  # noqa: E712
            )
        )
    ).scalar_one_or_none()
    if connection is None:
        raise HTTPException(status_code=404, detail="No active Salesforce connection.")

    revoked = await revoke_connection(connection)
    connection.is_active = False
    connection.access_token = None
    connection.refresh_token = None
    await db.commit()
    return {"org_id": org_id, "revoked_at_salesforce": revoked}


async def revoke_connection(connection: SalesforceConnection) -> bool:
    """Revoke at Salesforce. Revoking the refresh token ends the whole
    grant, including any access tokens issued from it."""
    token = connection.refresh_token or connection.access_token
    if not token:
        return False
    oauth_client = SalesforceOAuthClient(login_url=connection.instance_url)
    return await oauth_client.revoke_token(token)


@salesforce_router.get("/status/{org_id}")
async def get_auth_status(
    org_id: str,
    _org: str = Depends(require_org_access),
    db: AsyncSession = Depends(get_database),
):
    org = await db.get(Organization, org_id)
    connection = (
        await db.execute(
            select(SalesforceConnection).where(
                SalesforceConnection.organization_id == org_id,
                SalesforceConnection.is_active == True,  # noqa: E712
            )
        )
    ).scalar_one_or_none()
    is_connected = connection is not None and connection.access_token is not None
    return {
        "org_id": org_id,
        "org_name": org.name if org else None,
        "is_connected": is_connected,
        "is_demo": org.is_demo if org else False,
        "instance_url": connection.instance_url if connection else None,
        "requires_reauth": connection is not None and not is_connected,
    }


@router.post("/logout")
async def logout():
    response = JSONResponse(content={"message": "Logged out successfully"})
    response.delete_cookie(key="access_token", path="/")
    return response


@router.get("/me")
async def get_current_user(principal: Principal = Depends(get_principal)):
    return {
        "id": principal.user_id,
        "email": principal.email,
        "name": principal.name,
        "role": principal.role.value,
        "is_admin": principal.is_admin,
    }


router.include_router(salesforce_router)
