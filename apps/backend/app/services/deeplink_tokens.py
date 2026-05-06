"""
Deep-link token service.

Issues short-lived signed JWTs that the managed-package LWC quick actions
embed in URLs to the web app, then redeems them server-side to establish a
session and resolve the canonical destination URL.

Two-stage flow (issue → redeem):
- The issued JWT travels in a URL only briefly. The redeem endpoint exchanges
  it for a session cookie, then the user is redirected to the destination.
- jti (JWT id) is recorded on redemption to prevent replay; an attacker who
  intercepts the URL can't reuse the token after first redemption.

Token claims:
    org_id          internal AccessGraph org UUID
    sf_user_id      Salesforce 18-char Id of the user who clicked the button
    resource_type   "user" | "field" | "permission_set"
    resource_id     opaque per resource_type (sf id for user/ps; "Object.Field" for field)
    iat, exp, jti   standard JWT claims
"""
import logging
import secrets
from datetime import datetime, timezone
from typing import Optional

from jose import jwt, JWTError
from pydantic import BaseModel

from app.core.config import settings

logger = logging.getLogger(__name__)

ALGORITHM = "HS256"
RESOURCE_TYPES = ("user", "field", "permission_set")


class DeepLinkPayload(BaseModel):
    org_id: str
    sf_user_id: str
    resource_type: str
    resource_id: str


class DeepLinkInvalid(Exception):
    """Raised when a deep-link token can't be redeemed (expired, malformed,
    bad signature, unknown resource_type)."""


def _signing_key() -> str:
    key = settings.DEEPLINK_SIGNING_KEY
    if not key:
        # Fail closed in production. Allow a deterministic dev fallback so
        # local testing doesn't require setting the env var.
        if settings.DEMO_MODE:
            return "dev-only-deeplink-key-not-for-production"
        raise RuntimeError(
            "DEEPLINK_SIGNING_KEY is not configured. Set the env var before "
            "issuing or redeeming deep-link tokens."
        )
    return key


def issue_token(
    org_id: str,
    sf_user_id: str,
    resource_type: str,
    resource_id: str,
) -> str:
    """Mint a signed JWT for a deep-link click."""
    if resource_type not in RESOURCE_TYPES:
        raise ValueError(f"Unknown resource_type: {resource_type}")

    now = datetime.now(timezone.utc)
    payload = {
        "org_id": org_id,
        "sf_user_id": sf_user_id,
        "resource_type": resource_type,
        "resource_id": resource_id,
        "iat": int(now.timestamp()),
        "exp": int(now.timestamp()) + settings.DEEPLINK_TTL_SECONDS,
        "jti": secrets.token_urlsafe(16),
    }
    return jwt.encode(payload, _signing_key(), algorithm=ALGORITHM)


def decode_token(token: str) -> DeepLinkPayload:
    """Verify signature + expiry and return the payload. Does NOT check replay
    — that's the redemption layer's job (it needs DB access)."""
    try:
        claims = jwt.decode(token, _signing_key(), algorithms=[ALGORITHM])
    except JWTError as exc:
        raise DeepLinkInvalid(f"Invalid token: {exc}") from exc

    if claims.get("resource_type") not in RESOURCE_TYPES:
        raise DeepLinkInvalid("Unknown resource_type in token")

    return DeepLinkPayload(
        org_id=claims["org_id"],
        sf_user_id=claims["sf_user_id"],
        resource_type=claims["resource_type"],
        resource_id=claims["resource_id"],
    )


def get_jti(token: str) -> Optional[str]:
    """Return the jti claim without full validation (used to record redemption
    even on best-effort idempotency cases). Returns None if the token is
    malformed."""
    try:
        # Decode without verifying signature to grab jti.
        # NB: any logic that *acts* on the token must use decode_token().
        claims = jwt.get_unverified_claims(token)
        return claims.get("jti")
    except JWTError:
        return None


def destination_url(payload: DeepLinkPayload) -> str:
    """Build the canonical front-end URL the redeem endpoint redirects to.

    All routes are org-scoped (`/orgs/{org_id}/...`) — existing web app
    structure. We hit pages that already exist where possible:
      - user            -> /orgs/{org}/users/{sf_user_id}    (existing)
      - field           -> /orgs/{org}/fields/{Object.Field} (existing)
      - permission_set  -> /orgs/{org}/graph?focus=ps:{sf_id}
                           (no dedicated PS detail page yet; the graph view
                           accepts a focus query param. Adding a real
                           /permission-sets/{id} page is a v1.2 task.)
    """
    from urllib.parse import quote

    base = settings.FRONTEND_URL.rstrip("/")
    org = payload.org_id
    if payload.resource_type == "user":
        return f"{base}/orgs/{org}/users/{payload.resource_id}"
    if payload.resource_type == "field":
        # resource_id is typically "Object.Field" — keep it as one path
        # segment. The existing /fields/[fieldId] route handles this.
        return f"{base}/orgs/{org}/fields/{quote(payload.resource_id, safe='')}"
    if payload.resource_type == "permission_set":
        return f"{base}/orgs/{org}/permission-sets/{payload.resource_id}"
    # Unreachable — decode_token() already validated.
    raise DeepLinkInvalid(f"Unknown resource_type: {payload.resource_type}")
