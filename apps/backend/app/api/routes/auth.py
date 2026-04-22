"""
Salesforce OAuth Authentication Routes
Handles OAuth 2.0 web server flow for Salesforce
"""
import logging
import secrets
from typing import Optional

from fastapi import APIRouter, Cookie, Depends, HTTPException, Query, status
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_database
from app.auth.jwt import create_access_token
from app.core.config import settings
from app.domain.models import Organization, SalesforceConnection
from app.salesforce.oauth import SalesforceOAuthClient

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth")
salesforce_router = APIRouter(prefix="/salesforce")


# ============================================================================
# Request/Response Models
# ============================================================================


class OAuthCallbackResponse(BaseModel):
    """Response after successful OAuth"""
    org_id: str
    org_name: str
    instance_url: str
    message: str


class RefreshTokenRequest(BaseModel):
    """Request to refresh access token"""
    org_id: str


# ============================================================================
# OAuth Endpoints
# ============================================================================


@salesforce_router.get("/authorize")
async def authorize(
    return_url: Optional[str] = Query(None, description="URL to redirect after auth")
):
    """
    Initiate Salesforce OAuth flow

    This endpoint redirects the user to Salesforce login page.
    After successful login, Salesforce will redirect back to /callback endpoint.

    Query Parameters:
        return_url: Optional URL to redirect to after successful authentication

    Returns:
        Redirect to Salesforce authorization page
    """
    if not settings.SALESFORCE_CLIENT_ID or not settings.SALESFORCE_CLIENT_SECRET:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Salesforce OAuth not configured. Please set SALESFORCE_CLIENT_ID and SALESFORCE_CLIENT_SECRET in environment variables."
        )

    # Generate CSRF token for state parameter
    state = secrets.token_urlsafe(32)

    # Store return_url in state if provided (in production, use Redis/session)
    # For now, we'll just use the state token

    # Create OAuth client and get authorization URL
    oauth_client = SalesforceOAuthClient()
    auth_url = oauth_client.get_authorization_url(state=state)

    logger.info("Initiating OAuth flow", extra={"state": state})

    return RedirectResponse(url=auth_url)


@salesforce_router.get("/callback")
async def callback(
    code: str = Query(..., description="Authorization code from Salesforce"),
    state: Optional[str] = Query(None, description="CSRF protection state"),
    db: AsyncSession = Depends(get_database),
):
    """
    OAuth callback endpoint

    Salesforce redirects here after user authorizes the app.
    This endpoint exchanges the authorization code for access/refresh tokens
    and creates or updates the organization in the database.

    Query Parameters:
        code: Authorization code from Salesforce
        state: State parameter for CSRF protection

    Returns:
        Organization details or redirects to frontend
    """
    try:
        # Validate state parameter (in production, verify against stored value)
        if not state:
            logger.warning("OAuth callback received without state parameter")

        # Exchange code for tokens (with state for PKCE)
        oauth_client = SalesforceOAuthClient()
        token_response = await oauth_client.exchange_code_for_token(code, state)

        logger.info(
            "Successfully exchanged code for tokens",
            extra={"instance_url": token_response.instance_url}
        )

        # Extract org info from instance URL
        # Example: https://na1.salesforce.com -> na1
        instance_url = token_response.instance_url
        org_domain = instance_url.replace("https://", "").replace("http://", "").split(".")[0]

        # Get org ID from token response (if available)
        # Salesforce returns organization_id in the token response (format: 00D... ID)
        sf_org_id = getattr(token_response, 'id', '').split('/')[-2] if hasattr(token_response, 'id') else None

        # Check if connection already exists
        existing_connection = None
        is_new_org = False
        if sf_org_id:
            stmt = select(SalesforceConnection).where(SalesforceConnection.organization_id_sf == sf_org_id)
            result = await db.execute(stmt)
            existing_connection = result.scalar_one_or_none()

        if existing_connection:
            # Update existing connection with new tokens
            existing_connection.access_token = token_response.access_token
            existing_connection.refresh_token = token_response.refresh_token
            existing_connection.instance_url = instance_url
            existing_connection.is_active = True
            await db.commit()
            await db.refresh(existing_connection)

            org_id = existing_connection.organization_id
            logger.info(f"Updated existing connection for org: {org_id}")
        else:
            # Create new organization
            is_new_org = True
            org = Organization(
                name=f"Salesforce Org ({org_domain})",
                domain=org_domain,
                is_demo=False,
            )
            db.add(org)
            await db.flush()  # Get org.id

            # Create Salesforce connection
            sf_connection = SalesforceConnection(
                organization_id=org.id,
                instance_url=instance_url,
                organization_id_sf=sf_org_id,
                access_token=token_response.access_token,
                refresh_token=token_response.refresh_token,
                is_active=True,
            )
            db.add(sf_connection)
            await db.commit()
            await db.refresh(org)

            org_id = org.id
            logger.info(f"Created new org: {org_id}")

        # Extract user info from token response for JWT
        user_info = {
            "user_id": getattr(token_response, 'id', '').split('/')[-1] if hasattr(token_response, 'id') else None,
            "email": getattr(token_response, 'email', None),
            "organization_id": sf_org_id,
        }

        # Create JWT session token
        jwt_token = create_access_token(org_id=org_id, user_info=user_info)

        # Get frontend URL from CORS origins
        frontend_url = "http://localhost:3000"  # Default for local dev
        if settings.cors_origins_list:
            # Use the first CORS origin that looks like a frontend URL
            for origin in settings.cors_origins_list:
                if "gentle-love" in origin or "localhost:3000" in origin:
                    frontend_url = origin
                    break

        # Add initial_sync flag for new orgs
        redirect_url = f"{frontend_url}/orgs/{org_id}/dashboard?connected=true"
        if is_new_org:
            redirect_url += "&initial_sync=true"

        logger.info(f"Redirecting to frontend: {redirect_url}")

        # Create redirect response with JWT cookie
        response = RedirectResponse(url=redirect_url)
        response.set_cookie(
            key="access_token",
            value=jwt_token,
            httponly=True,
            secure=True,  # HTTPS only in production
            samesite="lax",
            max_age=604800,  # 7 days
        )

        return response

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"OAuth callback error: {e}", exc_info=True)

        # Redirect to frontend error page
        frontend_url = "http://localhost:3000"  # Default for local dev
        if settings.cors_origins_list:
            # Use the first CORS origin that looks like a frontend URL
            for origin in settings.cors_origins_list:
                if "gentle-love" in origin or "localhost:3000" in origin:
                    frontend_url = origin
                    break

        error_url = f"{frontend_url}/?error=oauth_failed&message={str(e)}"

        return RedirectResponse(url=error_url)


@salesforce_router.post("/refresh")
async def refresh_token(
    request: RefreshTokenRequest,
    db: AsyncSession = Depends(get_database),
):
    """
    Refresh access token using refresh token

    This endpoint is called when the access token expires (typically after 2 hours).
    It uses the refresh token to get a new access token without requiring user login.

    Request Body:
        org_id: Organization ID to refresh token for

    Returns:
        Success message
    """
    # Get organization and its active Salesforce connection
    stmt = select(SalesforceConnection).where(
        SalesforceConnection.organization_id == request.org_id,
        SalesforceConnection.is_active == True
    )
    result = await db.execute(stmt)
    sf_connection = result.scalar_one_or_none()

    if not sf_connection:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No active Salesforce connection found for organization {request.org_id}"
        )

    if not sf_connection.refresh_token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No refresh token available for this connection"
        )

    try:
        # Refresh the token
        oauth_client = SalesforceOAuthClient()
        token_response = await oauth_client.refresh_access_token(sf_connection.refresh_token)

        # Update connection with new access token
        sf_connection.access_token = token_response.access_token

        # Refresh token might be rotated
        if hasattr(token_response, 'refresh_token') and token_response.refresh_token:
            sf_connection.refresh_token = token_response.refresh_token

        await db.commit()

        logger.info(f"Refreshed access token for org: {request.org_id}")

        return {
            "message": "Access token refreshed successfully",
            "org_id": request.org_id
        }

    except Exception as e:
        logger.error(f"Token refresh error for org {request.org_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to refresh token: {str(e)}"
        )


@salesforce_router.post("/disconnect/{org_id}")
async def disconnect_org(
    org_id: str,
    db: AsyncSession = Depends(get_database),
):
    """
    Disconnect Salesforce organization

    This revokes the access token and deactivates the connection.

    Path Parameters:
        org_id: Organization ID to disconnect

    Returns:
        Success message
    """
    # Get active Salesforce connection
    stmt = select(SalesforceConnection).where(
        SalesforceConnection.organization_id == org_id,
        SalesforceConnection.is_active == True
    )
    result = await db.execute(stmt)
    sf_connection = result.scalar_one_or_none()

    if not sf_connection:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No active Salesforce connection found for organization {org_id}"
        )

    try:
        # Revoke access token
        if sf_connection.access_token:
            oauth_client = SalesforceOAuthClient()
            await oauth_client.revoke_token(sf_connection.access_token)

        # Deactivate connection and clear tokens
        sf_connection.is_active = False
        sf_connection.access_token = None
        sf_connection.refresh_token = None

        await db.commit()

        logger.info(f"Disconnected org: {org_id}")

        return {
            "message": "Organization disconnected successfully",
            "org_id": org_id
        }

    except Exception as e:
        logger.error(f"Disconnect error for org {org_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to disconnect organization: {str(e)}"
        )


@salesforce_router.get("/status/{org_id}")
async def get_auth_status(
    org_id: str,
    db: AsyncSession = Depends(get_database),
):
    """
    Get OAuth connection status for an organization

    Path Parameters:
        org_id: Organization ID

    Returns:
        Connection status
    """
    # Get organization
    stmt = select(Organization).where(Organization.id == org_id)
    result = await db.execute(stmt)
    org = result.scalar_one_or_none()

    if not org:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Organization {org_id} not found"
        )

    # Get active Salesforce connection
    stmt = select(SalesforceConnection).where(
        SalesforceConnection.organization_id == org_id,
        SalesforceConnection.is_active == True
    )
    result = await db.execute(stmt)
    sf_connection = result.scalar_one_or_none()

    is_connected = sf_connection is not None and sf_connection.access_token is not None

    return {
        "org_id": org_id,
        "org_name": org.name,
        "is_connected": is_connected,
        "is_demo": org.is_demo,
        "instance_url": sf_connection.instance_url if sf_connection else None,
        "requires_reauth": sf_connection is not None and not is_connected,
    }


# ============================================================================
# Session Management Endpoints
# ============================================================================


@router.post("/logout")
async def logout():
    """
    Logout and clear session

    This endpoint clears the JWT session cookie.

    Returns:
        Success message and response with cleared cookie
    """
    response = {"message": "Logged out successfully"}

    # Create response and clear the cookie
    from fastapi.responses import JSONResponse
    json_response = JSONResponse(content=response)
    json_response.delete_cookie(key="access_token")

    logger.info("User logged out")

    return json_response


@router.get("/verify")
async def verify_session(access_token: Optional[str] = Cookie(None)):
    """
    Verify if user has valid session

    This endpoint checks if the JWT token in the cookie is valid.

    Returns:
        Authentication status
    """
    from app.auth.jwt import verify_token

    if not access_token:
        return {
            "authenticated": False,
            "message": "No session token found"
        }

    try:
        payload = verify_token(access_token)
        return {
            "authenticated": True,
            "org_id": payload.get("org_id"),
            "user_id": payload.get("user_id"),
        }
    except HTTPException:
        return {
            "authenticated": False,
            "message": "Invalid or expired session"
        }


@router.get("/me")
async def get_current_user(
    access_token: Optional[str] = Cookie(None),
    db: AsyncSession = Depends(get_database),
):
    """
    Get current user information

    This endpoint returns information about the currently authenticated user.

    Returns:
        User and organization information

    Raises:
        HTTPException: If not authenticated
    """
    from app.auth.jwt import get_org_id_from_token

    if not access_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated"
        )

    # Get org ID from token
    org_id = get_org_id_from_token(access_token)

    # Get organization details
    stmt = select(Organization).where(Organization.id == org_id)
    result = await db.execute(stmt)
    org = result.scalar_one_or_none()

    if not org:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Organization not found"
        )

    # Get Salesforce connection
    stmt = select(SalesforceConnection).where(
        SalesforceConnection.organization_id == org_id,
        SalesforceConnection.is_active == True
    )
    result = await db.execute(stmt)
    sf_connection = result.scalar_one_or_none()

    return {
        "org_id": org.id,
        "org_name": org.name,
        "org_domain": org.domain,
        "is_demo": org.is_demo,
        "is_connected": sf_connection is not None and sf_connection.access_token is not None,
        "instance_url": sf_connection.instance_url if sf_connection else None,
    }


# Include the Salesforce router in the main router
router.include_router(salesforce_router)
