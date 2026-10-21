"""Pagination part 3: permission sets, groups, graph node details, profiles."""
import pytest

from app.domain.models import Organization
from tests.test_demo_orgs import _cookie, _users, client  # noqa: F401
from tests.test_demo_path import lumenvale  # noqa: F401


async def _scale_org(db):
    from tests import list_scale
    admin, _ = await _users(db)
    org = Organization(name="List scale", is_demo=False)
    db.add(org)
    await db.flush()
    data = await list_scale.seed(db, org.id)
    await db.commit()
    return org.id, _cookie(admin), data


@pytest.mark.asyncio
async def test_permission_set_preview_and_lists(client, async_db_session):  # noqa: F811
    org_id, cookie, data = await _scale_org(async_db_session)
    # The profile-owned set of "Standard User" grants every object; plenty of users and fields.
    ps = next(s for s in data["permission_sets"] if s["ps_type"] == "Profile")["salesforce_id"]
    full = (await client.get(f"/orgs/{org_id}/permission-sets/{ps}", cookies=cookie)).json()
    prev = (await client.get(f"/orgs/{org_id}/permission-sets/{ps}", params={"preview": 10}, cookies=cookie)).json()
    assert prev["totalObjectsGranted"] == len(full["objectPermissions"]) == 60 and len(prev["objectPermissions"]) == 10
    assert prev["totalFieldAccessObjects"] == 60 and len(prev["fieldAccess"]) == 10
    assert all(len(r["fields"]) <= 10 for r in prev["fieldAccess"])
    fields = (await client.get(f"/orgs/{org_id}/permission-sets/{ps}/list/fields",
                               params={"page": 2, "page_size": 50, "sort": "field"}, cookies=cookie)).json()
    assert fields["total"] == full["totalFieldsGranted"] and fields["page"] == 2 and len(fields["items"]) == 50
    one = (await client.get(f"/orgs/{org_id}/permission-sets/{ps}/list/fields",
                            params={"page": 1, "object": "Scale_Object_03__c"}, cookies=cookie)).json()
    assert one["total"] == next(g["fieldCount"] for g in full["fieldPermissions"] if g["objectName"] == "Scale_Object_03__c")
    assert all(r["objectName"] == "Scale_Object_03__c" for r in one["items"])
    regular = next(s for s in data["permission_sets"] if s["ps_type"] == "Regular")["salesforce_id"]
    users = (await client.get(f"/orgs/{org_id}/permission-sets/{regular}/list/users",
                              params={"page": 1, "assignment": "direct"}, cookies=cookie)).json()
    every = (await client.get(f"/orgs/{org_id}/permission-sets/{regular}", cookies=cookie)).json()["users"]
    assert users["total"] == sum(1 for u in every if u["assignmentType"] == "direct")


@pytest.mark.asyncio
async def test_set_and_group_automation_preview(client, lumenvale):  # noqa: F811
    org_id, cookie = lumenvale
    admin_ps = "0PS000000000011DMO"  # System Administrator's own set: 20 classes, 14 flows
    full = (await client.get(f"/orgs/{org_id}/permission-sets/{admin_ps}/automation", cookies=cookie)).json()
    prev = (await client.get(f"/orgs/{org_id}/permission-sets/{admin_ps}/automation", params={"preview": 10}, cookies=cookie)).json()
    assert prev["counts"] == {"apex": len(full["apex"]), "flows": len(full["flows"])} and len(prev["apex"]) == 10
    page = (await client.get(f"/orgs/{org_id}/permission-sets/{admin_ps}/automation",
                             params={"section": "apex", "page": 2, "page_size": 25, "q": "invoice"}, cookies=cookie)).json()
    assert page["total"] == 4 and page["page"] == 1
    group = (await client.get(f"/orgs/{org_id}/permission-set-groups/0PG000000000001DMO", cookies=cookie)).json()
    assert "counts" in group["automation"] and len(group["automation"]["apex"]) <= 10


@pytest.mark.asyncio
async def test_node_details_preview_and_profiles_paging(client, lumenvale):  # noqa: F811
    org_id, cookie = lumenvale
    node = (await client.get(f"/orgs/{org_id}/graph/node/0PS000000000011DMO/details", params={"preview": 10},
                             cookies=cookie)).json()
    assert len(node["objectsGranted"]) <= 10 and node["summary"]["totalObjects"] >= len(node["objectsGranted"])
    profiles = (await client.get(f"/orgs/{org_id}/profiles", params={"page": 1, "page_size": 25, "sort": "users", "dir": "desc"},
                                 cookies=cookie)).json()
    assert profiles["total"] == 11 and profiles["users_allowed"]
    counts = [p["active_users"] for p in profiles["items"]]
    assert counts == sorted(counts, reverse=True)
    found = (await client.get(f"/orgs/{org_id}/profiles", params={"page": 1, "q": "sales"}, cookies=cookie)).json()
    assert {p["name"] for p in found["items"]} == {"Sales Director", "Sales Manager", "Sales Rep"}
    legacy = (await client.get(f"/orgs/{org_id}/profiles", cookies=cookie)).json()
    assert len(legacy["profiles"]) == 11
