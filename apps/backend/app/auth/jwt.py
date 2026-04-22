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


def create_access_token(org_id: str, user_info: dict, expires_delta: Optional[timedelta] = None) -> str:
    """
    Create JWT access token

    Args:
        org_id: Organization ID
        user_info: User information from Salesforce (user_id, email, etc.)
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

    # Use Salesforce client secret as JWT secret (since it's already secret)
    # In production, you might want a separate JWT_SECRET env var
    secret = settings.SALESFORCE_CLIENT_SECRET or "change_me_in_production"

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
        secret = settings.SALESFORCE_CLIENT_SECRET or "change_me_in_production"
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
