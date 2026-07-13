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
    """Sync the FIRST_ADMIN_EMAIL user to ORG_ADMIN on every startup.

    Semantics per user request ("we will always have my user as the
    admin"): whenever FIRST_ADMIN_EMAIL + FIRST_ADMIN_PASSWORD are
    set, ensure a user with that email exists as an ORG_ADMIN, is
    active + verified, and whose password matches the env var. This
    is a full idempotent sync — it will UPDATE the stored password
    hash every boot to match the env var, so rotating the env var
    also rotates the admin password.

    That semantics matters for two failure modes we've seen:
      1. Env vars were set correctly but a stale admin from a prior
         deploy still exists with a different password → login fails.
      2. Admin forgot the password → operator updates the env var and
         redeploys to reset.
    """
    email = (settings.FIRST_ADMIN_EMAIL or "").strip().lower()
    password = settings.FIRST_ADMIN_PASSWORD or ""
    if not email or not password:
        logger.info(
            "bootstrap: FIRST_ADMIN_EMAIL / FIRST_ADMIN_PASSWORD not set — "
            "skipping admin provisioning."
        )
        return

    async with AsyncSessionLocal() as db:
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

        # Look up the admin user by lowercased email. Case-insensitive
        # so a mismatch between the env var (which we lowercase above)
        # and any historically-stored capitalisation doesn't leave two
        # rows in the table. We check both the system org AND all orgs
        # — if the admin was somehow created in a different org
        # historically, we adopt them into the system org too.
        from sqlalchemy import func

        existing_user = (
            await db.execute(
                select(OrgUser).where(func.lower(OrgUser.email) == email)
            )
        ).scalar_one_or_none()

        now = datetime.now(timezone.utc)
        if existing_user is not None:
            existing_user.email = email  # normalise casing
            existing_user.organization_id = SYSTEM_ORG_ID
            existing_user.role = OrgUserRole.ORG_ADMIN
            existing_user.password_hash = hash_password(password)
            existing_user.is_active = True
            existing_user.is_email_verified = True
            existing_user.last_login_at = existing_user.last_login_at or now
            logger.warning(
                "bootstrap: synced admin %s (role, password, verified all "
                "updated from env vars).",
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
