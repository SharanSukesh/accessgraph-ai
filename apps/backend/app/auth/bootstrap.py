"""First-admin bootstrap.

Runs on backend startup. If `FIRST_ADMIN_EMAIL` + `FIRST_ADMIN_PASSWORD`
env vars are set AND no ORG_ADMIN OrgUser exists yet in the database,
provisions one. Idempotent: after an admin exists, this is a no-op even
if the env vars remain set.

The admin is scoped to a "system" Organization row (created here if
none exists) so the existing OrgUser.organization_id FK stays
satisfied. That system org is the default landing container for
email/password sessions — actual Salesforce orgs get connected as a
separate post-login step and coexist alongside it.

Logs are the source of truth for what happened: an admin operator can
confirm from Railway that bootstrap ran + committed.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from sqlalchemy import select

from app.auth.passwords import hash_password
from app.core.config import settings
from app.db.session import AsyncSessionLocal
from app.domain.models import Organization, OrgUser, OrgUserRole


logger = logging.getLogger(__name__)

# Fixed identifiers so the bootstrap is reproducible across restarts +
# so any UI that hard-codes "the system org" (none does yet, but future
# admin surfaces might) has a stable id to key off.
SYSTEM_ORG_ID = "system-org"
SYSTEM_ORG_DOMAIN = "system.local"
SYSTEM_ORG_NAME = "AccessGraph System"


async def bootstrap_first_admin() -> None:
    """Provision the first ORG_ADMIN if none exists yet."""
    email = (settings.FIRST_ADMIN_EMAIL or "").strip().lower()
    password = settings.FIRST_ADMIN_PASSWORD or ""
    if not email or not password:
        logger.info(
            "bootstrap: FIRST_ADMIN_EMAIL / FIRST_ADMIN_PASSWORD not set — "
            "skipping first-admin provisioning."
        )
        return

    async with AsyncSessionLocal() as db:
        existing_admin = (
            await db.execute(
                select(OrgUser).where(OrgUser.role == OrgUserRole.ORG_ADMIN)
            )
        ).scalar_one_or_none()
        if existing_admin is not None:
            logger.info(
                "bootstrap: ORG_ADMIN already exists (%s) — no-op.",
                existing_admin.email,
            )
            return

        # Make sure the system org exists. Idempotent upsert-by-id.
        system_org = (
            await db.execute(
                select(Organization).where(Organization.id == SYSTEM_ORG_ID)
            )
        ).scalar_one_or_none()
        if system_org is None:
            system_org = Organization(
                id=SYSTEM_ORG_ID,
                name=SYSTEM_ORG_NAME,
                domain=SYSTEM_ORG_DOMAIN,
                is_demo=False,
            )
            db.add(system_org)
            await db.flush()
            logger.warning(
                "bootstrap: created system org id=%s domain=%s",
                SYSTEM_ORG_ID, SYSTEM_ORG_DOMAIN,
            )

        # If a user with this email already exists (e.g., created as a
        # non-admin previously), promote them rather than creating a
        # duplicate.
        existing_user = (
            await db.execute(
                select(OrgUser).where(
                    OrgUser.organization_id == SYSTEM_ORG_ID,
                    OrgUser.email == email,
                )
            )
        ).scalar_one_or_none()
        now = datetime.now(timezone.utc)
        if existing_user is not None:
            existing_user.role = OrgUserRole.ORG_ADMIN
            existing_user.password_hash = hash_password(password)
            existing_user.is_active = True
            existing_user.is_email_verified = True
            existing_user.last_login_at = existing_user.last_login_at or now
            logger.warning(
                "bootstrap: promoted existing user %s to ORG_ADMIN.",
                email,
            )
        else:
            admin = OrgUser(
                organization_id=SYSTEM_ORG_ID,
                email=email,
                name="System Admin",
                password_hash=hash_password(password),
                role=OrgUserRole.ORG_ADMIN,
                is_active=True,
                # Skip the activation email — bootstrap seeds a fully
                # ready-to-use admin so an operator can log in
                # immediately after first deploy.
                is_email_verified=True,
                invited_at=now,
            )
            db.add(admin)
            logger.warning(
                "bootstrap: created first ORG_ADMIN %s in system org.",
                email,
            )

        await db.commit()
