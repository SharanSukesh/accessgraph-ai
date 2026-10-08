"""Every route must reject anonymous callers, and org access must follow grants."""
import re

import httpx
import pytest
import pytest_asyncio
from fastapi.routing import APIRoute

from app.api.deps import get_database
from app.auth.deps import PACKAGE_KEY_HEADER, hash_package_key
from app.auth.jwt import create_access_token
from app.auth.passwords import hash_password
from app.db.session import get_db
from app.domain.models import OrgAccessGrant, Organization, OrgUser, OrgUserRole
from app.main import app

# Routes that are deliberately reachable without a session.
PUBLIC = {
    ("GET", "/"),
    ("GET", "/health"),
    ("GET", "/health/ready"),
    ("POST", "/auth/login-password"),
    ("POST", "/auth/activate"),
    ("POST", "/auth/logout"),
    ("GET", "/auth/salesforce/callback"),
    ("POST", "/auth/deeplink/redeem"),
    ("POST", "/package/install"),
}


def _flatten(routes, prefix=""):
    for route in routes:
        if isinstance(route, APIRoute):
            yield prefix + route.path, route
        elif hasattr(route, "original_router"):
            yield from _flatten(
                route.original_router.routes, prefix + route.include_context.prefix
            )


def _all_routes():
    out = []
    for path, route in _flatten(app.routes):
        for method in route.methods - {"HEAD", "OPTIONS"}:
            out.append((method, path))
    return sorted(set(out))


@pytest_asyncio.fixture
async def client(async_db_session):
    async def _db():
        yield async_db_session

    app.dependency_overrides[get_database] = _db
    app.dependency_overrides[get_db] = _db
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()


def test_route_inventory_is_not_empty():
    assert len(_all_routes()) > 100


@pytest.mark.asyncio
@pytest.mark.parametrize("method,path", _all_routes())
async def test_anonymous_requests_are_rejected(client, method, path):
    if (method, path) in PUBLIC:
        pytest.skip("public by design")
    url = re.sub(r"\{[^}]+\}", "x", path)
    resp = await client.request(method, url)
    assert resp.status_code == 401, f"{method} {path} -> {resp.status_code}"


async def _setup(db):
    home = Organization(id="system-org", name="Firm", is_demo=False)
    client_a = Organization(name="Client A", is_demo=False)
    client_b = Organization(name="Client B", is_demo=False)
    db.add_all([home, client_a, client_b])
    await db.flush()

    def user(email, role, active=True):
        u = OrgUser(
            organization_id=home.id, email=email, role=role,
            password_hash=hash_password("pw-123456"), is_active=active,
            is_email_verified=True,
        )
        db.add(u)
        return u

    admin = user("admin@firm.test", OrgUserRole.ORG_ADMIN)
    analyst = user("analyst@firm.test", OrgUserRole.ANALYST)
    viewer = user("viewer@firm.test", OrgUserRole.VIEWER)
    gone = user("gone@firm.test", OrgUserRole.ORG_ADMIN, active=False)
    await db.flush()
    db.add_all([
        OrgAccessGrant(org_user_id=analyst.id, organization_id=client_a.id),
        OrgAccessGrant(org_user_id=viewer.id, organization_id=client_a.id),
    ])
    await db.commit()
    return home, client_a, client_b, admin, analyst, viewer, gone


def _cookie(u):
    token = create_access_token(
        org_id=u.organization_id,
        user_info={"user_id": u.id, "org_user_id": u.id, "email": u.email},
    )
    return {"access_token": token}


@pytest.mark.asyncio
async def test_grants_scope_org_access(client, async_db_session):
    _, a, b, admin, analyst, viewer, gone = await _setup(async_db_session)

    r = await client.get(f"/orgs/{a.id}/sync-jobs", cookies=_cookie(analyst))
    assert r.status_code == 200
    r = await client.get(f"/orgs/{b.id}/sync-jobs", cookies=_cookie(analyst))
    assert r.status_code == 404
    r = await client.get(f"/orgs/{b.id}/sync-jobs", cookies=_cookie(admin))
    assert r.status_code == 200
    r = await client.get(f"/orgs/{a.id}/sync-jobs", cookies=_cookie(gone))
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_org_list_follows_grants(client, async_db_session):
    _, a, b, admin, analyst, *_ = await _setup(async_db_session)

    r = await client.get("/orgs", cookies=_cookie(analyst))
    assert [o["id"] for o in r.json()] == [a.id]
    r = await client.get("/orgs", cookies=_cookie(admin))
    assert {o["id"] for o in r.json()} == {a.id, b.id}


@pytest.mark.asyncio
async def test_viewer_is_read_only_and_only_admin_deletes(client, async_db_session):
    _, a, _, admin, analyst, viewer, _ = await _setup(async_db_session)

    r = await client.post(f"/orgs/{a.id}/analyze", cookies=_cookie(viewer))
    assert r.status_code == 403
    r = await client.delete(
        f"/orgs/{a.id}/privacy/all-data?confirm=DELETE_ALL_DATA", cookies=_cookie(analyst)
    )
    assert r.status_code == 403


@pytest.mark.asyncio
async def test_legacy_salesforce_session_is_rejected(client, async_db_session):
    _, a, *_ = await _setup(async_db_session)
    legacy = create_access_token(org_id=a.id, user_info={"user_id": "005xx"})
    r = await client.get(f"/orgs/{a.id}/sync-jobs", cookies={"access_token": legacy})
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_package_key_only_opens_its_own_org(client, async_db_session):
    _, a, b, *_ = await _setup(async_db_session)
    a.package_key_hash = hash_package_key("key-for-a")
    await async_db_session.commit()

    r = await client.get(f"/orgs/{a.id}/sync-jobs", headers={PACKAGE_KEY_HEADER: "key-for-a"})
    assert r.status_code == 200
    r = await client.get(f"/orgs/{b.id}/sync-jobs", headers={PACKAGE_KEY_HEADER: "key-for-a"})
    assert r.status_code == 401
    r = await client.delete(
        f"/orgs/{a.id}/privacy/all-data?confirm=DELETE_ALL_DATA",
        headers={PACKAGE_KEY_HEADER: "key-for-a"},
    )
    assert r.status_code == 401
