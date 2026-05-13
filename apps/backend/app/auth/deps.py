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
