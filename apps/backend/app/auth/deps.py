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
