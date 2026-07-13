"""Email + password authentication routes.

Runs alongside the existing Salesforce OAuth flow (auth.py). The two
paths issue the same JWT shape but stamp different claims:

  - Salesforce OAuth → org_id + user_id (SF user id) + email
  - Email/password   → org_id + org_user_id + email + is_admin + role

Endpoints (all under /auth prefix):
  - POST /auth/login-password  — email + password → JWT cookie
  - POST /auth/activate        — token + password → JWT cookie
  - GET  /auth/me-user         — returns OrgUser + is_admin
  - POST /auth/users           — (admin) create OrgUser + send email
  - GET  /auth/users           — (admin) list OrgUsers
  - POST /auth/users/{id}/resend-activation — (admin) regenerate token

The activation flow:
  1. Admin creates a user via POST /auth/users
  2. Backend generates an activation token (24h TTL) + inserts into
     auth_tokens table with purpose='activate'
  3. Backend fires activation email via app.auth.email (Resend or
     log-to-console)
  4. User clicks link at FRONTEND_URL/activate?token=xxx
  5. Frontend collects a password, POSTs to /auth/activate
  6. Backend validates token, hashes password, marks user verified,
     marks token used, issues JWT
"""
from __future__ import annotations

import logging
import secrets
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from fastapi import APIRouter, Cookie, Depends, HTTPException, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_database
from app.auth.deps import require_admin
from app.auth.email import send_activation_email
from app.auth.jwt import create_access_token, verify_token
from app.auth.passwords import hash_password, verify_password
from app.core.config import settings
from app.domain.models import AuthToken, OrgUser, OrgUserRole


logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["accounts"])


# ---------------------------------------------------------------- constants

ACTIVATION_TOKEN_TTL_HOURS = 24


# ---------------------------------------------------------------- schemas


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=1, max_length=200)


class LoginResponse(BaseModel):
    org_user_id: str
    email: str
    name: Optional[str]
    role: str
    is_admin: bool
    organization_id: str


class ActivateRequest(BaseModel):
    token: str = Field(..., min_length=8, max_length=128)
    password: str = Field(
        ...,
        min_length=8,
        max_length=200,
        description="At least 8 characters.",
    )


class CreateUserRequest(BaseModel):
    email: EmailStr
    name: Optional[str] = Field(default=None, max_length=255)
    role: str = Field(
        default="viewer",
        pattern="^(org_admin|analyst|viewer|auditor)$",
        description="OrgUserRole enum value (lowercase).",
    )


class UserResponse(BaseModel):
    id: str
    email: str
    name: Optional[str]
    role: str
    is_active: bool
    is_email_verified: bool
    invited_at: Optional[str]
    last_login_at: Optional[str]


class CreateUserResponse(BaseModel):
    user: UserResponse
    # Included when RESEND_API_KEY is unset so the admin can copy
    # the activation URL manually.
    activation_url_for_admin: Optional[str] = None


class MeUserResponse(BaseModel):
    id: str
    email: str
    name: Optional[str]
    role: str
    is_admin: bool
    is_email_verified: bool
    organization_id: str


# ---------------------------------------------------------------- helpers


def _issue_jwt_cookie(
    *,
    user: OrgUser,
    frontend_url: str,
) -> JSONResponse:
    """Build a JWT + attach it as an httpOnly cookie to the response.
    Mirrors the cookie config used by the Salesforce OAuth callback:
    secure=True for HTTPS frontends, samesite=lax, 7-day expiry."""
    is_admin = user.role == OrgUserRole.ORG_ADMIN
    token = create_access_token(
        org_id=user.organization_id,
        user_info={
            "user_id": user.id,
            "org_user_id": user.id,
            "email": user.email,
            "name": user.name,
            "organization_id": user.organization_id,
            "role": user.role.value if hasattr(user.role, "value") else str(user.role),
            "is_admin": is_admin,
        },
    )
    body = LoginResponse(
        org_user_id=user.id,
        email=user.email,
        name=user.name,
        role=user.role.value if hasattr(user.role, "value") else str(user.role),
        is_admin=is_admin,
        organization_id=user.organization_id,
    )
    is_secure = frontend_url.startswith("https://")
    resp = JSONResponse(content=body.model_dump())
    resp.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        secure=is_secure,
        samesite="lax",
        max_age=60 * 60 * 24 * 7,  # 7 days
        path="/",
    )
    return resp


def _generate_activation_token() -> str:
    """URL-safe 32-byte token. Base64-ish, ~43 chars, uniqueness good
    enough for a per-user activation flow with a 24h TTL."""
    return secrets.token_urlsafe(32)


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _serialize_user(u: OrgUser) -> UserResponse:
    return UserResponse(
        id=u.id,
        email=u.email,
        name=u.name,
        role=u.role.value if hasattr(u.role, "value") else str(u.role),
        is_active=bool(u.is_active),
        is_email_verified=bool(u.is_email_verified),
        invited_at=u.invited_at.isoformat() if u.invited_at else None,
        last_login_at=(
            u.last_login_at.isoformat() if u.last_login_at else None
        ),
    )


# ---------------------------------------------------------------- endpoints


@router.post("/login-password")
async def login_with_password(
    body: LoginRequest,
    db: AsyncSession = Depends(get_database),
):
    """Authenticate via email + password. Rejects unverified accounts
    (activation link not clicked yet) with a distinct message so the
    UI can prompt for a resend."""
    # Case-insensitive email lookup — the bootstrap flow lowercases
    # incoming emails, but historically we've had rows stored with
    # mixed case. Lower both sides so a user typing "Foo@bar.com"
    # into the login form still finds a row stored as "foo@bar.com".
    from sqlalchemy import func

    row = await db.execute(
        select(OrgUser).where(
            func.lower(OrgUser.email) == body.email.strip().lower()
        )
    )
    user = row.scalar_one_or_none()
    if user is None:
        # Same message + same latency for user-not-found vs. wrong-password
        # so a caller can't enumerate accounts by response time. bcrypt
        # verify against a known hash to consume the same CPU budget.
        verify_password(body.password, "$2b$12$" + "x" * 53)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This account has been disabled.",
        )
    if not user.password_hash:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Account not yet activated. Check your inbox for the "
                "activation email or ask an admin to resend it."
            ),
        )
    if not verify_password(body.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
        )
    if not user.is_email_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Please activate your account via the email link "
                "before signing in."
            ),
        )
    user.last_login_at = _now_utc()
    await db.commit()
    logger.info("auth.login: %s (admin=%s)", user.email, user.role)
    return _issue_jwt_cookie(user=user, frontend_url=settings.FRONTEND_URL)


@router.post("/activate")
async def activate_account(
    body: ActivateRequest,
    db: AsyncSession = Depends(get_database),
):
    """Consume an activation token: set the user's password, mark them
    verified, mark the token used, and log them in."""
    row = await db.execute(
        select(AuthToken).where(AuthToken.token == body.token)
    )
    token = row.scalar_one_or_none()
    if token is None or token.purpose != "activate":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This activation link is invalid.",
        )
    if token.used_at is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "This activation link has already been used. Sign in "
                "with your email + password, or ask an admin for a "
                "new invite."
            ),
        )
    if token.expires_at < _now_utc():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "This activation link has expired. Ask an admin to "
                "resend the invite."
            ),
        )

    user_row = await db.execute(
        select(OrgUser).where(OrgUser.id == token.user_id)
    )
    user = user_row.scalar_one_or_none()
    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This account is no longer available.",
        )
    user.password_hash = hash_password(body.password)
    user.is_email_verified = True
    user.last_login_at = _now_utc()
    token.used_at = _now_utc()
    await db.commit()
    logger.info("auth.activate: %s", user.email)
    return _issue_jwt_cookie(user=user, frontend_url=settings.FRONTEND_URL)


@router.get("/me-user", response_model=MeUserResponse)
async def get_me_user(
    access_token: Optional[str] = Cookie(None),
    db: AsyncSession = Depends(get_database),
):
    """Return the current OrgUser + is_admin flag. Used by the
    frontend AuthContext to decide whether to render admin UI. Returns
    401 if the JWT is missing / invalid / doesn't carry an
    org_user_id (i.e., session is Salesforce-OAuth-only)."""
    if not access_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated.",
        )
    try:
        payload = verify_token(access_token)
    except HTTPException:
        raise
    org_user_id = payload.get("org_user_id")
    if not org_user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session is not an email/password session.",
        )
    row = await db.execute(
        select(OrgUser).where(OrgUser.id == org_user_id)
    )
    user = row.scalar_one_or_none()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User no longer exists.",
        )
    return MeUserResponse(
        id=user.id,
        email=user.email,
        name=user.name,
        role=user.role.value if hasattr(user.role, "value") else str(user.role),
        is_admin=user.role == OrgUserRole.ORG_ADMIN,
        is_email_verified=bool(user.is_email_verified),
        organization_id=user.organization_id,
    )


# ---------------------------- admin-only endpoints -------------------


@router.post("/users", response_model=CreateUserResponse)
async def admin_create_user(
    body: CreateUserRequest,
    admin_id: str = Depends(require_admin),
    db: AsyncSession = Depends(get_database),
):
    """Create a new OrgUser + issue an activation token + email the link.

    Idempotent-ish: if a user already exists with the same email in
    the same organization, we regenerate the activation token
    (assuming they never completed activation) rather than 409'ing.
    That way an admin can safely re-invite someone whose token expired.
    """
    admin_row = await db.execute(
        select(OrgUser).where(OrgUser.id == admin_id)
    )
    admin = admin_row.scalar_one_or_none()
    if admin is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Admin user no longer exists.",
        )

    # Look up any existing user in this org with the same email.
    existing_row = await db.execute(
        select(OrgUser).where(
            OrgUser.organization_id == admin.organization_id,
            OrgUser.email == body.email,
        )
    )
    existing = existing_row.scalar_one_or_none()

    role_enum = OrgUserRole(body.role)
    if existing is not None:
        if existing.is_email_verified:
            # Real, activated user — don't clobber. Admin should use
            # a role-edit endpoint instead once we build one.
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    "A user with this email already exists and has "
                    "activated their account."
                ),
            )
        user = existing
        user.name = body.name or user.name
        user.role = role_enum
        user.invited_by = admin.id
        user.invited_at = _now_utc()
    else:
        user = OrgUser(
            organization_id=admin.organization_id,
            email=body.email,
            name=body.name,
            role=role_enum,
            is_active=True,
            is_email_verified=False,
            invited_by=admin.id,
            invited_at=_now_utc(),
        )
        db.add(user)
        await db.flush()

    # Fresh activation token (invalidate any prior unused tokens by
    # marking them used — belt-and-braces so a leaked stale token
    # can't beat the new one).
    prior = await db.execute(
        select(AuthToken).where(
            AuthToken.user_id == user.id,
            AuthToken.purpose == "activate",
            AuthToken.used_at.is_(None),
        )
    )
    for old in prior.scalars().all():
        old.used_at = _now_utc()

    token_value = _generate_activation_token()
    token = AuthToken(
        user_id=user.id,
        token=token_value,
        purpose="activate",
        expires_at=_now_utc() + timedelta(hours=ACTIVATION_TOKEN_TTL_HOURS),
    )
    db.add(token)
    await db.commit()

    activation_url = (
        f"{settings.FRONTEND_URL.rstrip('/')}/activate?token={token_value}"
    )
    try:
        await send_activation_email(
            to_email=user.email,
            to_name=user.name,
            activation_url=activation_url,
            invited_by_email=admin.email,
        )
    except Exception:  # noqa: BLE001
        logger.exception(
            "auth.email: activation send failed for %s (token saved anyway)",
            user.email,
        )

    logger.info(
        "auth.admin: %s invited %s (role=%s)",
        admin.email, user.email, user.role,
    )

    return CreateUserResponse(
        user=_serialize_user(user),
        # Only expose the URL to the admin if we're in log-to-console
        # mode (no Resend key configured). Prevents accidental exposure
        # in production API responses.
        activation_url_for_admin=(
            activation_url if not (settings.RESEND_API_KEY or "").strip() else None
        ),
    )


@router.get("/users", response_model=List[UserResponse])
async def admin_list_users(
    admin_id: str = Depends(require_admin),
    db: AsyncSession = Depends(get_database),
):
    """List every OrgUser in the admin's organization. Sorted by
    creation time (newest first) so a fresh invite lands at the top."""
    admin_row = await db.execute(
        select(OrgUser).where(OrgUser.id == admin_id)
    )
    admin = admin_row.scalar_one_or_none()
    if admin is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Admin user no longer exists.",
        )
    rows = await db.execute(
        select(OrgUser)
        .where(OrgUser.organization_id == admin.organization_id)
        .order_by(OrgUser.created_at.desc())
    )
    return [_serialize_user(u) for u in rows.scalars().all()]


@router.post(
    "/users/{user_id}/resend-activation",
    response_model=CreateUserResponse,
)
async def admin_resend_activation(
    user_id: str,
    admin_id: str = Depends(require_admin),
    db: AsyncSession = Depends(get_database),
):
    """Regenerate an activation token + resend the email. Only valid
    on users who haven't verified yet — activated users use the
    password-reset flow (not built yet)."""
    admin_row = await db.execute(
        select(OrgUser).where(OrgUser.id == admin_id)
    )
    admin = admin_row.scalar_one_or_none()
    if admin is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Admin user no longer exists.",
        )
    row = await db.execute(
        select(OrgUser).where(
            OrgUser.id == user_id,
            OrgUser.organization_id == admin.organization_id,
        )
    )
    user = row.scalar_one_or_none()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found.",
        )
    if user.is_email_verified:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This user has already activated their account.",
        )

    prior = await db.execute(
        select(AuthToken).where(
            AuthToken.user_id == user.id,
            AuthToken.purpose == "activate",
            AuthToken.used_at.is_(None),
        )
    )
    for old in prior.scalars().all():
        old.used_at = _now_utc()

    token_value = _generate_activation_token()
    token = AuthToken(
        user_id=user.id,
        token=token_value,
        purpose="activate",
        expires_at=_now_utc() + timedelta(hours=ACTIVATION_TOKEN_TTL_HOURS),
    )
    db.add(token)
    await db.commit()

    activation_url = (
        f"{settings.FRONTEND_URL.rstrip('/')}/activate?token={token_value}"
    )
    try:
        await send_activation_email(
            to_email=user.email,
            to_name=user.name,
            activation_url=activation_url,
            invited_by_email=admin.email,
        )
    except Exception:  # noqa: BLE001
        logger.exception(
            "auth.email: resend failed for %s (token saved anyway)",
            user.email,
        )

    return CreateUserResponse(
        user=_serialize_user(user),
        activation_url_for_admin=(
            activation_url if not (settings.RESEND_API_KEY or "").strip() else None
        ),
    )
