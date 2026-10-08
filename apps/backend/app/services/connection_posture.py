"""Assess the Salesforce user a client org was connected as.

Newton only needs to read configuration. The recommended setup is a
dedicated integration user (Salesforce Integration license, API only)
with a read-only permission set; see docs/CLIENT_ONBOARDING_SECURITY.md.
Connecting as a System Administrator works, but the stored refresh token
then carries that administrator's full power, so the UI flags it.
"""
import logging
import re
from typing import Any, Dict, List

from app.salesforce.client import SalesforceAPIClient

logger = logging.getLogger(__name__)

ELEVATED_PERMISSIONS = {
    "PermissionsModifyAllData": "Modify All Data",
    "PermissionsManageUsers": "Manage Users",
    "PermissionsCustomizeApplication": "Customize Application",
    "PermissionsAuthorApex": "Author Apex",
    "PermissionsManageProfilesPermissionsets": "Manage Profiles and Permission Sets",
}

INTEGRATION_LICENSES = {"Salesforce Integration", "Salesforce API Only System Integrations"}


async def assess_connected_user(
    instance_url: str, access_token: str, sf_user_id: str
) -> Dict[str, Any]:
    posture: Dict[str, Any] = {"user_id": sf_user_id}
    if not re.fullmatch(r"005[A-Za-z0-9]{12}(?:[A-Za-z0-9]{3})?", sf_user_id or ""):
        posture["assessment_failed"] = True
        return posture
    client = SalesforceAPIClient(instance_url, access_token)
    try:
        user = (await client.query(
            "SELECT Username, Name, UserType, Profile.Name, Profile.UserLicense.Name "
            f"FROM User WHERE Id = '{sf_user_id}'"
        )).records
        if user:
            row = user[0]
            profile = row.get("Profile") or {}
            posture.update({
                "username": row.get("Username"),
                "name": row.get("Name"),
                "profile": profile.get("Name"),
                "license": (profile.get("UserLicense") or {}).get("Name"),
            })
        fields = ", ".join(f"PermissionSet.{f}" for f in ELEVATED_PERMISSIONS)
        grants = (await client.query(
            f"SELECT {fields} FROM PermissionSetAssignment WHERE AssigneeId = '{sf_user_id}'"
        )).records
        elevated: List[str] = sorted({
            label
            for row in grants
            for field, label in ELEVATED_PERMISSIONS.items()
            if (row.get("PermissionSet") or {}).get(field)
        })
        posture["elevated_permissions"] = elevated
    except Exception:  # noqa: BLE001 — posture is advisory; never block a connect
        logger.info("connection posture check failed", exc_info=True)
        posture["assessment_failed"] = True
        return posture

    is_integration = posture.get("license") in INTEGRATION_LICENSES
    posture["is_integration_user"] = is_integration
    posture["recommended"] = is_integration and not elevated
    return posture
