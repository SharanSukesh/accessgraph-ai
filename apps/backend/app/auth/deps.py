"""
Authentication and authorization dependencies.

Every session is a Newton user (OrgUser) signed in with email + password.
The JWT only identifies the user; role, active status and org access are
re-read from the database on every request, so deactivating or demoting
someone takes effect immediately rather than when their 7-day token ends.

Org access:
  - ORG_ADMIN users can open every client org.
  - Everyone else needs an OrgAccessGrant for that org.
  - VIEWER / AUDITOR are read-only (GET/HEAD/OPTIONS).
  - Destructive actions (Salesforce write-back, data deletion) need
    ORG_ADMIN via `require_org_admin`.

The Salesforce managed package authenticates with a per-org key in the
X-Newton-Package-Key header instead of a cookie; it is accepted only on
the org it was issued for.
"""
import hashlib
import hmac
import logging
from dataclasses import dataclass
from typing import Optional

from fastapi import Cookie, Depends, Header, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_database
from app.auth.jwt import verify_token
from app.domain.models import (
    OrgAccessGrant,
    Organization,
    OrgUser,
    OrgUserRole,
    SalesforceConnection,
)

logger = logging.getLogger(__name__)

PACKAGE_KEY_HEADER = "X-Newton-Package-Key"
READ_METHODS = {"GET", "HEAD", "OPTIONS"}
READ_ONLY_ROLES = {OrgUserRole.VIEWER, OrgUserRole.AUDITOR}


@dataclass(frozen=True)
class Principal:
    user_id: str
    email: str
    name: Optional[str]
    role: OrgUserRole
    home_org_id: str
    via_package: bool = False

    @property
    def is_admin(self) -> bool:
        return self.role == OrgUserRole.ORG_ADMIN


def _unauthorized(detail: str = "Not authenticated. Please log in.") -> HTTPException:
    return HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=detail)


def hash_package_key(key: str) -> str:
    return hashlib.sha256(key.encode("utf-8")).hexdigest()


async def _load_user(db: AsyncSession, access_token: Optional[str]) -> OrgUser:
    if not access_token:
        raise _unauthorized()
    try:
        payload = verify_token(access_token)
    except HTTPException:
        raise _unauthorized("Session expired or invalid. Please log in again.")
    org_user_id = payload.get("org_user_id")
    if not org_user_id:
        # Pre-2026-10 Salesforce-OAuth sessions carried no user identity.
        raise _unauthorized("Please sign in with your email and password.")
    user = (
        await db.execute(select(OrgUser).where(OrgUser.id == org_user_id))
    ).scalar_one_or_none()
    if user is None or not user.is_active or not user.password_hash:
        raise _unauthorized("This account is no longer active.")
    return user


async def get_principal(
    request: Request,
    access_token: Optional[str] = Cookie(None),
    db: AsyncSession = Depends(get_database),
) -> Principal:
    user = await _load_user(db, access_token)
    principal = Principal(
        user_id=user.id,
        email=user.email,
        name=user.name,
        role=user.role,
        home_org_id=user.organization_id,
    )
    request.state.principal = principal
    return principal


async def user_can_access_org(db: AsyncSession, principal: Principal, org_id: str) -> bool:
    if principal.is_admin:
        return True
    grant = (
        await db.execute(
            select(OrgAccessGrant.id).where(
                OrgAccessGrant.org_user_id == principal.user_id,
                OrgAccessGrant.organization_id == org_id,
            )
        )
    ).scalar_one_or_none()
    return grant is not None


async def package_org_for_salesforce_id(
    db: AsyncSession, salesforce_org_id: str, package_key: Optional[str]
) -> Organization:
    """Resolve the org a package callout is for, keyed by its 00D id, and
    verify the package key. Same 401 for unknown org and wrong key."""
    if not package_key:
        raise _unauthorized("Missing package key.")
    connection = (
        await db.execute(
            select(SalesforceConnection).where(
                SalesforceConnection.organization_id_sf == salesforce_org_id
            )
        )
    ).scalar_one_or_none()
    org = await db.get(Organization, connection.organization_id) if connection else None
    if (
        org is None
        or not org.package_key_hash
        or not hmac.compare_digest(org.package_key_hash, hash_package_key(package_key))
    ):
        raise _unauthorized("Invalid package key.")
    return org


async def _package_principal(
    db: AsyncSession, org_id: str, package_key: str
) -> Optional[Principal]:
    org = (
        await db.execute(select(Organization).where(Organization.id == org_id))
    ).scalar_one_or_none()
    if org is None or not org.package_key_hash:
        return None
    if not hmac.compare_digest(org.package_key_hash, hash_package_key(package_key)):
        return None
    return Principal(
        user_id=f"package:{org_id}",
        email=f"salesforce-package@{org_id}",
        name="Salesforce package",
        role=OrgUserRole.ANALYST,
        home_org_id=org_id,
        via_package=True,
    )


async def authorize_org(
    request: Request,
    org_id: str,
    db: AsyncSession,
    access_token: Optional[str],
    package_key: Optional[str],
) -> Principal:
    if package_key and not access_token:
        principal = await _package_principal(db, org_id, package_key)
        if principal is None:
            raise _unauthorized("Invalid package key for this org.")
        request.state.principal = principal
        return principal

    user = await _load_user(db, access_token)
    principal = Principal(
        user_id=user.id,
        email=user.email,
        name=user.name,
        role=user.role,
        home_org_id=user.organization_id,
    )
    request.state.principal = principal

    org_exists = (
        await db.execute(select(Organization.id).where(Organization.id == org_id))
    ).scalar_one_or_none()
    # Same 404 whether the org is missing or not granted, so org ids
    # can't be probed.
    if (
        org_exists is None
        or org_id == principal.home_org_id
        or not await user_can_access_org(db, principal, org_id)
    ):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")

    if request.method not in READ_METHODS and principal.role in READ_ONLY_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your role is read-only for this org.",
        )
    return principal


async def require_org_access(
    org_id: str,
    request: Request,
    access_token: Optional[str] = Cookie(None),
    package_key: Optional[str] = Header(None, alias=PACKAGE_KEY_HEADER),
    db: AsyncSession = Depends(get_database),
) -> str:
    """Path-param `org_id` must be an org the caller may open. Returns org_id."""
    await authorize_org(request, org_id, db, access_token, package_key)
    return org_id


async def require_org_admin(
    org_id: str,
    request: Request,
    access_token: Optional[str] = Cookie(None),
    db: AsyncSession = Depends(get_database),
) -> str:
    """Org access plus ORG_ADMIN. Package keys are never enough here."""
    principal = await authorize_org(request, org_id, db, access_token, None)
    if not principal.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privileges required for this action.",
        )
    return org_id


async def get_current_actor_email(
    request: Request,
    access_token: Optional[str] = Cookie(None),
    db: AsyncSession = Depends(get_database),
) -> str:
    """Audit identity of the caller. Identifies only; pair with an org dependency."""
    principal: Optional[Principal] = getattr(request.state, "principal", None)
    if principal is None:
        principal = await get_principal(request, access_token, db)
    return principal.email


async def require_credentials(
    access_token: Optional[str] = Cookie(None),
    package_key: Optional[str] = Header(None, alias=PACKAGE_KEY_HEADER),
) -> None:
    """Cheap pre-check for routes that authorize in the handler: rejects
    anonymous callers before body validation or any lookup."""
    if not access_token and not package_key:
        raise _unauthorized()


async def require_admin(principal: Principal = Depends(get_principal)) -> str:
    """Newton-wide admin (user management). Returns the admin's user id."""
    if not principal.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privileges required for this action.",
        )
    return principal.user_id
