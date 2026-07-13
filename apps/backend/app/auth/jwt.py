"""
JWT Authentication Service
Handles token generation and verification for user sessions
"""
import logging
from datetime import datetime, timedelta
from typing import Optional

from jose import jwt, JWTError
from fastapi import HTTPException, status

from app.core.config import settings

logger = logging.getLogger(__name__)

# JWT Configuration
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_DAYS = 7  # 7 days


def _jwt_secret() -> str:
    """Choose the JWT signing secret. Prefers the dedicated
    JWT_SECRET_KEY setting; falls back to SALESFORCE_CLIENT_SECRET so
    sessions issued before that setting was added remain verifiable.
    Last-resort fallback is a hardcoded string (dev only) so a
    zero-config local run doesn't crash."""
    return (
        (settings.JWT_SECRET_KEY or "").strip()
        or (settings.SALESFORCE_CLIENT_SECRET or "").strip()
        or "change_me_in_production"
    )


def create_access_token(org_id: str, user_info: dict, expires_delta: Optional[timedelta] = None) -> str:
    """
    Create JWT access token

    Args:
        org_id: Organization ID
        user_info: User information from Salesforce (user_id, email, etc.).
                   Extra keys `org_user_id`, `is_admin`, `name`, `role` are
                   also honoured for the email/password auth path.
        expires_delta: Optional custom expiration time

    Returns:
        JWT token string
    """
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(days=ACCESS_TOKEN_EXPIRE_DAYS)

    to_encode = {
        "org_id": org_id,
        "user_id": user_info.get("user_id"),
        "email": user_info.get("email"),
        "organization_id": user_info.get("organization_id"),
        "exp": expire,
        "iat": datetime.utcnow(),
    }
    # Email/password auth path adds these claims so the frontend and
    # authorization deps can short-circuit on identity without a DB
    # roundtrip. Omitted (undefined) for the legacy SF-OAuth path.
    if user_info.get("org_user_id") is not None:
        to_encode["org_user_id"] = user_info["org_user_id"]
    if user_info.get("is_admin") is not None:
        to_encode["is_admin"] = bool(user_info["is_admin"])
    if user_info.get("role") is not None:
        to_encode["role"] = str(user_info["role"])
    if user_info.get("name") is not None:
        to_encode["name"] = user_info["name"]

    secret = _jwt_secret()
    encoded_jwt = jwt.encode(to_encode, secret, algorithm=ALGORITHM)

    logger.info(f"Created JWT token for org: {org_id}")

    return encoded_jwt


def verify_token(token: str) -> dict:
    """
    Verify JWT token and return payload

    Args:
        token: JWT token string

    Returns:
        Token payload dict

    Raises:
        HTTPException: If token is invalid or expired
    """
    try:
        secret = _jwt_secret()
        payload = jwt.decode(token, secret, algorithms=[ALGORITHM])

        # Check expiration
        exp = payload.get("exp")
        if exp is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token missing expiration",
            )

        if datetime.utcnow() > datetime.fromtimestamp(exp):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token expired",
            )

        return payload

    except JWTError as e:
        logger.warning(f"JWT error: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        )


def get_org_id_from_token(token: str) -> str:
    """
    Extract organization ID from JWT token

    Args:
        token: JWT token string

    Returns:
        Organization ID

    Raises:
        HTTPException: If token is invalid or missing org_id
    """
    payload = verify_token(token)

    org_id = payload.get("org_id")
    if not org_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token missing organization ID",
        )

    return org_id
