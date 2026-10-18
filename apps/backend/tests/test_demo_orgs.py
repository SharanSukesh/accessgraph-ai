"""Admin-only demo orgs: created from a fixture, never connected to Salesforce."""
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace as NS

import httpx
import pytest
import pytest_asyncio
from jose import jwt
from sqlalchemy import select

import app.api.routes.auth as auth_routes
from app.api.deps import get_database
from app.auth.jwt import ALGORITHM, _jwt_secret, create_access_token
from app.auth.passwords import hash_password
from app.core.config import settings
from app.db.session import get_db
from app.domain.models import (
    Organization,
    OrgUser,
    OrgUserRole,
    SalesforceConnection,
    SyncJob,
    SyncStatus,
    UserSnapshot,
)
from app.ingestion.demo_orgs import DemoOrgUnsupported
from app.ingestion.orchestrator import SyncOrchestrator
from app.main import app
from app.salesforce.demo_client import DemoSalesforceClient
from app.services.data_quality import DataQualityService
from app.services.license_fit import LicenseFitService
from app.services.salesforce_sync import SalesforceSyncService


@pytest_asyncio.fixture
async def client(async_db_session, monkeypatch):
    async def _db():
        yield async_db_session
    app.dependency_overrides[get_database] = _db
    app.dependency_overrides[get_db] = _db
    # Creating a demo org schedules a background sync; tests run it inline.
    monkeypatch.setattr("app.api.routes.demo_orgs.schedule_background_sync", lambda *a: None)
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()


async def _users(db):
    db.add(Organization(id="system-org", name="Firm", is_demo=False))
    await db.flush()
    admin = OrgUser(organization_id="system-org", email="admin@firm.test", role=OrgUserRole.ORG_ADMIN,
                    password_hash=hash_password("pw-123456"), is_active=True, is_email_verified=True)
    analyst = OrgUser(organization_id="system-org", email="analyst@firm.test", role=OrgUserRole.ANALYST,
                      password_hash=hash_password("pw-123456"), is_active=True, is_email_verified=True)
    db.add_all([admin, analyst])
    await db.commit()
    return admin, analyst


def _cookie(u):
    return {"access_token": create_access_token(
        org_id=u.organization_id, user_info={"user_id": u.id, "org_user_id": u.id, "email": u.email},
    )}


async def _demo_org(db, fixture="acme"):
    org = Organization(name="Demo", is_demo=True, settings={"demo_fixture": fixture})
    db.add(org)
    await db.commit()
    return org


@pytest.mark.asyncio
async def test_only_admins_create_demo_orgs(client, async_db_session):
    admin, analyst = await _users(async_db_session)

    r = await client.post("/admin/demo-orgs", json={"fixture": "acme"}, cookies=_cookie(analyst))
    assert r.status_code == 403

    r = await client.post("/admin/demo-orgs", json={"fixture": "nope"}, cookies=_cookie(admin))
    assert r.status_code == 400

    r = await client.post("/admin/demo-orgs", json={"fixture": "acme"}, cookies=_cookie(admin))
    assert r.status_code == 201
    org = await async_db_session.get(Organization, r.json()["id"])
    assert org.is_demo and org.settings["demo_fixture"] == "acme"
    job = await async_db_session.get(SyncJob, r.json()["sync_job_id"])
    assert job.status == SyncStatus.PENDING

    r = await client.post("/admin/demo-orgs", json={"fixture": "acme"}, cookies=_cookie(admin))
    assert r.status_code == 409

    listing = (await client.get("/admin/demo-orgs", cookies=_cookie(admin))).json()
    assert [o["id"] for o in listing["orgs"]] == [org.id]
    assert {f["key"] for f in listing["fixtures"]} == {"synthetic_mid_market", "acme"}


@pytest.mark.asyncio
async def test_delete_removes_demo_orgs_and_refuses_real_ones(client, async_db_session):
    admin, analyst = await _users(async_db_session)
    demo = await _demo_org(async_db_session)
    real = Organization(name="Client", is_demo=False)
    async_db_session.add(real)
    await async_db_session.commit()
    demo_id, real_id = demo.id, real.id

    assert (await client.delete(f"/admin/demo-orgs/{demo_id}", cookies=_cookie(analyst))).status_code == 403
    assert (await client.delete(f"/admin/demo-orgs/{real_id}", cookies=_cookie(admin))).status_code == 400
    assert (await client.delete(f"/admin/demo-orgs/{demo_id}", cookies=_cookie(admin))).status_code == 200

    async_db_session.expire_all()
    ids = set((await async_db_session.execute(select(Organization.id))).scalars())
    assert demo_id not in ids and real_id in ids


@pytest.mark.asyncio
async def test_demo_org_sync_loads_its_fixture_without_demo_mode(async_db_session, monkeypatch):
    monkeypatch.setattr(settings, "DEMO_MODE", False)

    async def no_live(*_a, **_k):
        raise AssertionError("a demo org must never reach Salesforce")
    monkeypatch.setattr(SyncOrchestrator, "_extract_live_data", no_live)

    org = await _demo_org(async_db_session, "acme")
    job = SyncJob(organization_id=org.id, status=SyncStatus.PENDING)
    async_db_session.add(job)
    await async_db_session.commit()

    await SyncOrchestrator(async_db_session).run_sync(org.id, job.id)

    users = (await async_db_session.execute(
        select(UserSnapshot).where(UserSnapshot.organization_id == org.id)
    )).scalars().all()
    assert len(users) == 8


@pytest.mark.asyncio
async def test_demo_orgs_get_the_fixture_client_or_a_clear_refusal(async_db_session):
    org = await _demo_org(async_db_session, "synthetic_mid_market")

    sync_client = await SalesforceSyncService(async_db_session, org.id)._refresh_access_token()
    assert isinstance(sync_client, DemoSalesforceClient)
    assert await sync_client.get_user_licenses()
    assert isinstance(await LicenseFitService(async_db_session, org.id)._client(), DemoSalesforceClient)

    # Data Quality runs on demo orgs from the fixture (roadmap item 2).
    from app.salesforce.demo_client import DemoDataQualityClient
    assert isinstance(await DataQualityService(async_db_session, org.id)._client(), DemoDataQualityClient)
    with pytest.raises(DemoOrgUnsupported):
        await sync_client.update_user_with_retry("005x", {"ManagerId": "005y"})


@pytest.mark.asyncio
async def test_oauth_callback_refuses_a_connection_linked_to_a_demo_org(client, async_db_session, monkeypatch):
    admin, _ = await _users(async_db_session)
    org = await _demo_org(async_db_session)
    async_db_session.add(SalesforceConnection(
        organization_id=org.id, instance_url="https://x.my.salesforce.com", organization_id_sf="00Ddemo",
        access_token=None, is_active=False,
    ))
    await async_db_session.commit()

    async def exchange(self, code, verifier):
        return NS(id="https://login.salesforce.com/id/00Ddemo/005u", instance_url="https://x.my.salesforce.com",
                  access_token="real-token", refresh_token="real-refresh")

    async def posture(*_a):
        return {}

    async def no_name(*_a):
        return None

    monkeypatch.setattr(auth_routes.SalesforceOAuthClient, "exchange_code_for_token", exchange)
    monkeypatch.setattr(auth_routes, "assess_connected_user", posture)
    monkeypatch.setattr(auth_routes, "_fetch_org_name", no_name)
    flow = jwt.encode({"state": "s", "verifier": "v", "uid": admin.id,
                       "exp": datetime.now(timezone.utc) + timedelta(minutes=5)}, _jwt_secret(), algorithm=ALGORITHM)

    r = await client.get("/auth/salesforce/callback", params={"code": "c", "state": "s"},
                         cookies={**_cookie(admin), auth_routes.OAUTH_COOKIE: flow})

    assert r.status_code in (302, 307)
    assert "error=demo_org_cannot_connect" in r.headers["location"]
    conn = (await async_db_session.execute(select(SalesforceConnection))).scalar_one()
    await async_db_session.refresh(conn)
    assert conn.access_token is None and conn.is_active is False
