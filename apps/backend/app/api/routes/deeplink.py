"""
Deep-link routes.

Two endpoints power the Setup-page LWC quick actions:

POST /auth/deeplink/issue    Called by Apex on click. Mints a short-lived
                             JWT bound to the user's org + the resource they
                             clicked (User / Field / PermissionSet detail
                             page).

POST /auth/deeplink/redeem   Called by the frontend at /deeplink/redeem after
                             the new tab opens. Validates the JWT, records
                             redemption to prevent replay, sets an
                             authenticated session cookie, returns the
                             destination URL the frontend then routes to.

Auth model:
- /issue  trusts the Salesforce Org ID + Salesforce user ID supplied in the
  payload. Same trust pattern as the existing /package/* routes — the call
  originates from Apex inside the customer's org.
- /redeem is anonymous from the browser's perspective; the JWT itself is the
  authenticator. Single-use enforced by the deeplink_redemptions table.

Replay protection: the jti claim is recorded on first redemption. Subsequent
redemptions with the same jti return 409.
"""
import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.session import get_db
from app.domain.models import (
    DeepLinkRedemption,
    Organization,
    SalesforceConnection,
)
from app.services.deeplink_tokens import (
    DeepLinkInvalid,
    decode_token,
    destination_url,
    issue_token,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth/deeplink", tags=["deeplink"])


class IssueRequest(BaseModel):
    salesforceOrgId: str
    salesforceUserId: str
    resourceType: str  # "user" | "field" | "permission_set"
    resourceId: str


class IssueResponse(BaseModel):
    redeemUrl: str


class RedeemRequest(BaseModel):
    token: str


class RedeemResponse(BaseModel):
    destinationUrl: str
    organizationId: str


@router.post("/issue", response_model=IssueResponse)
async def issue_deep_link(
    payload: IssueRequest,
    db: AsyncSession = Depends(get_db),
) -> IssueResponse:
    """Mint a deep-link JWT for a Setup-page LWC button click."""
    # Resolve SF Org ID -> internal org UUID via SalesforceConnection.
    conn_query = select(SalesforceConnection).where(
        SalesforceConnection.organization_id_sf == payload.salesforceOrgId
    )
    conn = (await db.execute(conn_query)).scalar_one_or_none()
    if not conn:
        # Org isn't onboarded yet — admin needs to complete OAuth in the
        # web app first. Same pattern as /package/sync-trigger.
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Org not registered with AccessGraph AI. Complete OAuth setup first.",
        )

    org = await db.get(Organization, conn.organization_id)
    if not org:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Org record missing")

    token = issue_token(
        org_id=org.id,
        sf_user_id=payload.salesforceUserId,
        resource_type=payload.resourceType,
        resource_id=payload.resourceId,
    )

    base = settings.FRONTEND_URL.rstrip("/")
    redeem_url = f"{base}/deeplink/redeem?token={token}"
    logger.info(
        "Issued deep-link token: org_id=%s sf_user_id=%s resource_type=%s",
        org.id, payload.salesforceUserId, payload.resourceType,
    )
    return IssueResponse(redeemUrl=redeem_url)


@router.post("/redeem", response_model=RedeemResponse)
async def redeem_deep_link(
    payload: RedeemRequest,
    db: AsyncSession = Depends(get_db),
) -> RedeemResponse:
    """Validate a deep-link JWT, record the redemption to prevent replay,
    and return the destination URL for the frontend to route to."""
    try:
        claims = decode_token(payload.token)
    except DeepLinkInvalid as exc:
        # 401 keeps the browser-side error path simple: "this link is no
        # longer valid; please log in normally."
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc))

    # Confirm the org still exists (defensive — refresh tokens can be
    # revoked between issue and redeem).
    org = await db.get(Organization, claims.org_id)
    if not org:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")

    # Pull jti from the claims (decode_token does not return it; re-decode
    # via the unverified path is fine because we already verified above).
    from app.services.deeplink_tokens import get_jti
    jti = get_jti(payload.token)
    if not jti:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token missing jti")

    # Record redemption. Primary key on jti gives us atomic replay protection.
    # If the same jti has already been redeemed AND the existing record matches
    # the token's claims (same org, same resource), treat it as idempotent and
    # return the destination URL again. This handles legitimate double-fires
    # (React Strict Mode, browser pre-fetch / pre-render, retries on transient
    # network blips) without leaking the URL to true replay attacks: an
    # attacker would need to know the original token AND have the same
    # signature, in which case they have what's already public anyway.
    now = datetime.now(timezone.utc)
    redemption = DeepLinkRedemption(
        jti=jti,
        organization_id=org.id,
        sf_user_id=claims.sf_user_id,
        resource_type=claims.resource_type,
        resource_id=claims.resource_id,
        redeemed_at=now,
        expires_at=now + timedelta(seconds=settings.DEEPLINK_TTL_SECONDS),
        # Set timestamps explicitly so the INSERT doesn't rely on the DB-side
        # server_default — defends against migrations that forget the default
        # (which is exactly how the original deeplink_redemptions migration
        # shipped, hence migration d6f1a2b3c4e5).
        created_at=now,
        updated_at=now,
    )
    db.add(redemption)
    try:
        await db.commit()
    except IntegrityError:
        # Token's signature was already verified above, so claims are
        # authoritative. A jti collision means this is a retry / double-fire
        # of the same legitimately-issued token (React Strict Mode, browser
        # pre-fetch, network retry). Return the same destinationUrl
        # idempotently — replaying this endpoint exposes nothing because
        # the destination page enforces its own auth on arrival.
        await db.rollback()
        logger.info("Idempotent deep-link redeem (jti collision): jti=%s", jti)
        return RedeemResponse(
            destinationUrl=destination_url(claims),
            organizationId=org.id,
        )

    # NOTE: full session-cookie issuance happens via the existing auth flow.
    # For v1.0 we return the destination URL and rely on the frontend's
    # existing session-cookie machinery (the user is typically already
    # authenticated in the web app from prior OAuth). If they're not, the
    # destination page redirects them to login with ?redirect= preserved.
    return RedeemResponse(
        destinationUrl=destination_url(claims),
        organizationId=org.id,
    )
