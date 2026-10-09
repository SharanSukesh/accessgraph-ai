"""Per-client privacy level: what Newton may pull from a Salesforce org
and what it may keep.

  full           everything Newton reads today.
  masked         Salesforce users are pulled, but personal fields are
                 replaced with a stable alias ("User 4F2A") before anything
                 is stored. The Salesforce user id is kept so the client can
                 look the person up in their own org; Newton never holds
                 names, emails or usernames. Login history keeps country
                 only; Setup Audit Trail keeps who (as an alias) and what
                 section, never the description text.
  metadata_only  no user records, login history or audit trail at all;
                 configuration only. Aggregate record statistics (counts,
                 fill rates, duplicate cluster sizes) are a separate opt-in.

Stored on Organization.settings["privacy"]. Every pull site asks
`allows(org, CAPABILITY)` rather than comparing mode strings, so a new
mode only changes the table below.
"""
from __future__ import annotations

import hashlib
import hmac
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, Optional

from fastapi import HTTPException, status

from app.core.config import settings

FULL = "full"
MASKED = "masked"
METADATA_ONLY = "metadata_only"
MODES = (FULL, MASKED, METADATA_ONLY)
STRICTNESS = {FULL: 0, MASKED: 1, METADATA_ONLY: 2}

USER_RECORDS = "user_records"          # pull User rows at all
USER_IDENTITY = "user_identity"        # keep real names / emails / usernames
LOGIN_HISTORY = "login_history"
LOGIN_DETAIL = "login_detail"          # city, IP-derived, browser, platform
AUDIT_TRAIL = "audit_trail"
AUDIT_TEXT = "audit_text"              # SetupAuditTrail.Display free text
RECORD_SHARES = "record_shares"        # account/opportunity share + team rows
RECORD_AGGREGATES = "record_aggregates"

_CAPABILITIES = {
    FULL: {USER_RECORDS, USER_IDENTITY, LOGIN_HISTORY, LOGIN_DETAIL, AUDIT_TRAIL,
           AUDIT_TEXT, RECORD_SHARES, RECORD_AGGREGATES},
    MASKED: {USER_RECORDS, LOGIN_HISTORY, AUDIT_TRAIL, RECORD_SHARES, RECORD_AGGREGATES},
    METADATA_ONLY: set(),
}

# Human-readable reasons, shown when a feature is unavailable.
FEATURE_REQUIREMENTS = {
    "users": USER_RECORDS,
    "risk": USER_RECORDS,
    "anomalies": USER_RECORDS,
    "license_fit": USER_RECORDS,
    "equity": USER_RECORDS,
    "restructure": USER_RECORDS,
    "reporting_graph": USER_RECORDS,
    "change_risk": AUDIT_TRAIL,
    "data_quality": RECORD_AGGREGATES,
}

MODE_LABELS = {
    FULL: "Full",
    MASKED: "Masked users",
    METADATA_ONLY: "Metadata only",
}


def privacy_settings(org: Any) -> Dict[str, Any]:
    stored = ((getattr(org, "settings", None) or {}).get("privacy") or {})
    mode = stored.get("mode") if stored.get("mode") in MODES else FULL
    return {**stored, "mode": mode, "allow_record_aggregates": bool(stored.get("allow_record_aggregates"))}


def mode_of(org: Any) -> str:
    return privacy_settings(org)["mode"]


def allows(org: Any, capability: str) -> bool:
    p = privacy_settings(org)
    if capability == RECORD_AGGREGATES and p["mode"] == METADATA_ONLY:
        return p["allow_record_aggregates"]
    return capability in _CAPABILITIES[p["mode"]]


def require(org: Any, feature: str) -> None:
    """Raise 409 when the org's privacy level switches a feature off."""
    capability = FEATURE_REQUIREMENTS[feature]
    if not allows(org, capability):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "privacy_mode",
                "message": (
                    f"Not available: this client org uses the "
                    f"'{MODE_LABELS[mode_of(org)]}' privacy level."
                ),
            },
        )


def set_privacy(org: Any, mode: str, allow_record_aggregates: bool, actor_email: str) -> Dict[str, Any]:
    if mode not in MODES:
        raise ValueError(f"unknown privacy mode {mode!r}")
    record = {
        "mode": mode,
        "allow_record_aggregates": bool(allow_record_aggregates) if mode == METADATA_ONLY else True,
        "changed_by": actor_email,
        "changed_at": datetime.now(timezone.utc).isoformat(),
    }
    org.settings = {**(org.settings or {}), "privacy": record}
    return record


# ------------------------------------------------------------------ masking


def _key(org_id: str) -> bytes:
    secret = (settings.JWT_SECRET_KEY or "local-dev-only-jwt-secret").encode()
    return hashlib.sha256(b"newton-user-alias:" + secret + b":" + org_id.encode()).digest()


def user_alias(org_id: str, sf_user_id: Optional[str]) -> str:
    """Stable per-org alias for a Salesforce user, e.g. "User 4F2A9C"."""
    if not sf_user_id:
        return "User (unknown)"
    digest = hmac.new(_key(org_id), sf_user_id[:15].encode(), hashlib.sha256).hexdigest()
    return f"User {digest[:6].upper()}"


# Fields from a Salesforce User row that analyses need and that don't
# identify a person. Everything else is dropped before storage.
USER_FIELDS_KEPT_WHEN_MASKED = {
    "Id", "IsActive", "UserType", "ProfileId", "UserRoleId", "ManagerId",
    "DelegatedApproverId", "Department", "LastLoginDate", "CreatedDate",
}

SENIOR_TITLE_TERMS = ("chief", "president", "vp", "vice president", "director", "head of", "ceo", "cfo", "cto", "coo")


def mask_user_record(org_id: str, user: Dict[str, Any]) -> Dict[str, Any]:
    """Return a copy of a Salesforce User dict with identity removed.

    Seniority is derived from the title before it is dropped, because
    the equity analysis uses it to find senior staff.
    """
    title = (user.get("Title") or "").lower()
    masked = {k: v for k, v in user.items() if k in USER_FIELDS_KEPT_WHEN_MASKED}
    alias = user_alias(org_id, user.get("Id"))
    masked["Name"] = alias
    masked["Username"] = f"{alias.split()[-1].lower()}@masked.newton"
    masked["Email"] = None
    masked["Title"] = "Senior leader" if any(t in title for t in SENIOR_TITLE_TERMS) else None
    return masked


def mask_posture(org: Any, posture: Dict[str, Any]) -> Dict[str, Any]:
    """The connecting Salesforce user's identity, masked when the org's
    level doesn't allow storing names."""
    if allows(org, USER_IDENTITY):
        return posture
    return {**posture, "name": user_alias(org.id, posture.get("user_id")), "username": None}


def mask_users(org_id: str, users: Iterable[Dict[str, Any]]) -> list:
    return [mask_user_record(org_id, u) for u in users]


async def require_feature(db: Any, org_id: str, feature: str) -> Any:
    """Load the client org and raise 409 when its privacy level switches
    `feature` off. Returns the org."""
    from app.domain.models import Organization

    org = await db.get(Organization, org_id)
    require(org, feature)
    return org


async def load_org(db: Any, org_id: str) -> Any:
    from app.domain.models import Organization

    return await db.get(Organization, org_id)


def alias_user_names(org_id: str, users_by_id: Dict[str, Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    """Replace Name on looked-up User rows with the org's alias."""
    return {
        uid: {**row, "Name": user_alias(org_id, uid)}
        for uid, row in users_by_id.items()
    }
