"""
Authentication Dependencies
FastAPI dependencies for protected routes
"""
import logging
from typing import Optional

from fastapi import Cookie, HTTPException, status

from app.auth.jwt import get_org_id_from_token

logger = logging.getLogger(__name__)


async def get_current_org(access_token: Optional[str] = Cookie(None)) -> str:
    """
    Get current organization ID from JWT cookie

    This dependency can be used to protect routes that require authentication.

    Args:
        access_token: JWT token from httpOnly cookie

    Returns:
        Organization ID

    Raises:
        HTTPException: If not authenticated or token invalid
    """
    if not access_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated. Please log in.",
        )

    try:
        org_id = get_org_id_from_token(access_token)
        return org_id
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Authentication error: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication failed",
        )


async def get_current_actor_email(access_token: Optional[str] = Cookie(None)) -> str:
    """Return an actor identifier from the JWT for audit attribution.

    Used by mutating endpoints (write-back, reporting-graph apply). We
    prefer the email claim, but Salesforce's OAuth token response does
    not return an email — the `id` field is a userinfo URL we don't
    follow today — so older JWTs have email=None. To avoid bricking
    write-back for every existing session, we fall back to:
      1. `email`             (set once we wire userinfo fetch on login)
      2. `user_id`           (Salesforce user id, always present)
      3. `sf-org:<org_id>`   (last resort, never None for an auth'd req)

    The actual ORG_ADMIN authorization happens later in the service;
    this dep only feeds audit logs.
    """
    if not access_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated. Please log in.",
        )
    from app.auth.jwt import verify_token
    try:
        payload = verify_token(access_token)
        email = payload.get("email")
        if email:
            return email
        user_id = payload.get("user_id")
        if user_id:
            return f"sf-user:{user_id}"
        org_id = payload.get("org_id")
        if org_id:
            return f"sf-org:{org_id}"
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has no usable identity claim.",
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Authentication error: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication failed",
        )


async def get_current_org_optional(access_token: Optional[str] = Cookie(None)) -> Optional[str]:
    """
    Get current organization ID from JWT cookie (optional)

    This dependency allows routes to work with or without authentication.

    Args:
        access_token: JWT token from httpOnly cookie

    Returns:
        Organization ID if authenticated, None otherwise
    """
    if not access_token:
        return None

    try:
        org_id = get_org_id_from_token(access_token)
        return org_id
    except Exception:
        return None


# ----------------------------------------------------------------------
# Email/password auth path — OrgUser-based dependencies.
# ----------------------------------------------------------------------


async def get_current_org_user_id(
    access_token: Optional[str] = Cookie(None),
) -> str:
    """Return the OrgUser primary-key id from the JWT.

    Only valid for JWTs issued via the email/password login flow (which
    stamps `org_user_id` on the token). Salesforce-OAuth JWTs won't
    have this claim; use `get_current_org` for those.

    Raises 401 if the token is missing / invalid / doesn't carry an
    org_user_id (i.e., the caller isn't authenticated via email+password).
    """
    if not access_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated. Please log in.",
        )
    from app.auth.jwt import verify_token
    try:
        payload = verify_token(access_token)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Authentication error: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication failed",
        )
    org_user_id = payload.get("org_user_id")
    if not org_user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=(
                "Session is not an email/password session. Sign in "
                "with your email + password to access this endpoint."
            ),
        )
    return org_user_id


async def require_admin(
    access_token: Optional[str] = Cookie(None),
) -> str:
    """Gate a route to callers whose JWT carries `is_admin=true`.

    Returns the caller's org_user_id on success so admin-only handlers
    don't need a second dep to know who did the mutation. Raises 403
    when the token is present but not admin; 401 when the token is
    missing or invalid.

    Does NOT double-check the OrgUser row against the DB — the JWT
    was signed by us with the is_admin claim baked in at login, so
    trusting it saves a query per admin request. Revocation is handled
    by session expiry (7 days) + explicit logout.
    """
    if not access_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated. Please log in.",
        )
    from app.auth.jwt import verify_token
    try:
        payload = verify_token(access_token)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Authentication error: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication failed",
        )
    if not payload.get("is_admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privileges required for this action.",
        )
    org_user_id = payload.get("org_user_id")
    if not org_user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Admin claim present but token is missing org_user_id.",
        )
    return org_user_id
