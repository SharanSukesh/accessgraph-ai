import pytest

from app.domain.models import (
    ObjectPermissionSnapshot,
    Organization,
    PermissionSetAssignmentSnapshot,
    PermissionSetSnapshot,
    ProfileSnapshot,
    UserSnapshot,
)
from app.services.grant_sources import KIND_PROFILE, resolve_grant_sources
from tests.test_route_auth import _cookie, _setup, client  # noqa: F401


async def _seed(db, org_id):
    db.add_all([
        ProfileSnapshot(organization_id=org_id, salesforce_id="00eSALES", name="Sales User"),
        PermissionSetSnapshot(
            organization_id=org_id, salesforce_id="0PSprof", name="X00eSALES", label="00eSALES",
            is_owned_by_profile=True, profile_id="00eSALES",
        ),
        PermissionSetSnapshot(
            organization_id=org_id, salesforce_id="0PSops", name="Sales_Ops", label="Sales Ops",
        ),
        ObjectPermissionSnapshot(
            organization_id=org_id, salesforce_id="110a", parent_id="0PSprof", sobject_type="Account",
            permissions_read=True,
        ),
        ObjectPermissionSnapshot(
            organization_id=org_id, salesforce_id="110b", parent_id="0PSops", sobject_type="Account",
            permissions_read=True, permissions_edit=True,
        ),
        UserSnapshot(
            organization_id=org_id, salesforce_id="005rep", username="rep@x", name="Rep",
            is_active=True, profile_id="00eSALES",
        ),
        PermissionSetAssignmentSnapshot(
            organization_id=org_id, salesforce_id="0Pa1", assignee_id="005rep", permission_set_id="0PSops",
        ),
    ])
    await db.commit()


@pytest.mark.asyncio
async def test_profile_owned_permission_set_resolves_to_profile(async_db_session):
    db = async_db_session
    org = Organization(name="C", is_demo=False)
    db.add(org)
    await db.flush()
    await _seed(db, org.id)

    sources = await resolve_grant_sources(db, org.id, ["0PSprof", "0PSops"])

    assert sources["0PSprof"].kind == KIND_PROFILE
    assert sources["0PSprof"].id == "00eSALES"
    assert sources["0PSprof"].display == "Sales User (Profile)"
    assert sources["0PSops"].label == "Sales Ops"


@pytest.mark.asyncio
async def test_object_detail_lists_profiles_by_name(client, async_db_session):  # noqa: F811
    _, a, _, admin, *_ = await _setup(async_db_session)
    await _seed(async_db_session, a.id)

    r = await client.get(f"/orgs/{a.id}/objects/Account", cookies=_cookie(admin))
    body = r.json()

    assert r.status_code == 200
    assert [p["name"] for p in body["profilesWithAccess"]] == ["Sales User"]
    assert [p["label"] for p in body["permissionSetsWithAccess"]] == ["Sales Ops"]
    via = {u["name"]: u["accessVia"] for u in body["usersWithAccess"]}
    assert "Profile: Sales User" in via["Rep"]
