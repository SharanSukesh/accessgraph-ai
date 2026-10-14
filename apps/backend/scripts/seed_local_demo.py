#!/usr/bin/env python3
"""LOCAL-ONLY demo seed: an admin login plus a demo org built from the
fixture (apps/backend/fixtures/demo_org.json), fully analysed.

Refuses to run unless:
  - NEWTON_LOCAL_SEED=1,
  - DEMO_MODE=true (so sync reads the fixture, never Salesforce), and
  - DATABASE_URL points at SQLite or a localhost database.

Usage (from apps/backend):
  NEWTON_LOCAL_SEED=1 DEMO_MODE=true JWT_SECRET_KEY=local \
  DATABASE_URL=postgresql://postgres:pw@localhost:55439/newton \
  .venv/bin/python scripts/seed_local_demo.py

Optional: SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD.
"""
import asyncio
import os
import sys
from pathlib import Path
from urllib.parse import urlparse

sys.path.insert(0, str(Path(__file__).parent.parent))

LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1"}


def _refuse(reason: str) -> None:
    print(f"Refusing to seed: {reason}")
    sys.exit(2)


def _guard() -> None:
    if os.environ.get("NEWTON_LOCAL_SEED") != "1":
        _refuse("set NEWTON_LOCAL_SEED=1 to confirm this is a local database")
    if os.environ.get("DEMO_MODE", "").lower() != "true":
        _refuse("DEMO_MODE=true is required so sync uses the fixture, not Salesforce")
    url = os.environ.get("DATABASE_URL", "")
    if not url.startswith("sqlite") and urlparse(url.replace("+psycopg", "")).hostname not in LOCAL_HOSTS:
        _refuse(f"DATABASE_URL host is not local ({urlparse(url).hostname!r})")


_guard()

from sqlalchemy import select  # noqa: E402

from app.auth.bootstrap import SYSTEM_ORG_DOMAIN, SYSTEM_ORG_ID, SYSTEM_ORG_NAME  # noqa: E402
from app.auth.passwords import hash_password  # noqa: E402
from app.db.session import AsyncSessionLocal  # noqa: E402
from app.domain.models import Organization, OrgUser, OrgUserRole, SyncJob, SyncStatus  # noqa: E402
from app.ingestion.orchestrator import SyncOrchestrator  # noqa: E402
from app.services.org_analyzer import OrgAnalyzerService  # noqa: E402

ADMIN_EMAIL = os.environ.get("SEED_ADMIN_EMAIL", "admin@newton-demo.com")
ADMIN_PASSWORD = os.environ.get("SEED_ADMIN_PASSWORD", "Local-demo-only-1")
DEMO_ORG_NAME = "Acme Corp (demo fixture)"


async def main() -> None:
    async with AsyncSessionLocal() as db:
        if await db.get(Organization, SYSTEM_ORG_ID) is None:
            db.add(Organization(id=SYSTEM_ORG_ID, name=SYSTEM_ORG_NAME, domain=SYSTEM_ORG_DOMAIN, is_demo=False))
            await db.flush()
        admin = (await db.execute(select(OrgUser).where(OrgUser.email == ADMIN_EMAIL))).scalar_one_or_none()
        if admin is None:
            admin = OrgUser(organization_id=SYSTEM_ORG_ID, email=ADMIN_EMAIL, name="Local Admin",
                            role=OrgUserRole.ORG_ADMIN)
            db.add(admin)
        admin.password_hash = hash_password(ADMIN_PASSWORD)
        admin.is_active = True
        admin.is_email_verified = True

        org = (await db.execute(
            select(Organization).where(Organization.name == DEMO_ORG_NAME)
        )).scalar_one_or_none()
        if org is None:
            org = Organization(name=DEMO_ORG_NAME, domain="acme-demo.example", is_demo=True,
                               settings={"name_source": "manual"})
            db.add(org)
        await db.flush()
        job = SyncJob(organization_id=org.id, status=SyncStatus.PENDING)
        db.add(job)
        await db.commit()
        org_id, job_id = org.id, job.id

    async with AsyncSessionLocal() as db:
        counts = await SyncOrchestrator(db).run_sync(org_id, job_id)
        print("Fixture sync:", counts)
    async with AsyncSessionLocal() as db:
        snapshot = await OrgAnalyzerService(db, org_id).run(actor_email=ADMIN_EMAIL)
        print(f"Health Report: score {(snapshot.metrics or {}).get('org_health_score')}, "
              f"{snapshot.findings_count} findings")

    print(f"\nLog in at http://localhost:3000/login as {ADMIN_EMAIL} / {ADMIN_PASSWORD}")
    print(f"Demo org: /orgs/{org_id}/dashboard")


if __name__ == "__main__":
    asyncio.run(main())
