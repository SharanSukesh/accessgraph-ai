"""Org comparison (item 9 v1): matching by API name across orgs, mappings
for renames and namespaces, approvals, access and dependency consequences,
the stricter privacy level, and one org against itself over time."""
import pytest
from sqlalchemy import select

from app.domain.models import Organization, OrgAccessGrant, OrgUser, SyncJob, SyncStatus
from app.ingestion.orchestrator import SyncOrchestrator
from app.services import org_compare as oc
from app.services import privacy_mode
from tests.test_demo_orgs import _cookie, _users, client  # noqa: F401

STATE = {
    "user": {"005A": {"Username": "ada@x.com", "Name": "Ada", "ProfileId": "00eA", "IsActive": True},
             "005B": {"Username": "bo@x.com", "Name": "Bo", "ProfileId": "00eA", "IsActive": True}},
    "profile": {"00eA": {"Name": "Sales Rep"}},
    "permission_set": {"0PSP": {"Name": "X00ex", "IsOwnedByProfile": True, "ProfileId": "00eA"},
                       "0PS1": {"Name": "lvx__Integration", "Label": "Integration", "IsOwnedByProfile": False},
                       "0PSM": {"Name": "Mute", "Type": "Muting", "IsOwnedByProfile": False}},
    "permission_set_group": {"0PG1": {"DeveloperName": "Bundle"}},
    "group_component": {"a": {"PermissionSetGroupId": "0PG1", "PermissionSetId": "0PS1"},
                        "b": {"PermissionSetGroupId": "0PG1", "PermissionSetId": "0PSM"}},
    "assignment": {"005B:0PG1": {"AssigneeId": "005B", "PermissionSetId": "0PG1"}},
    "object_permission": {
        "0PSP:Account": {"ParentId": "0PSP", "SobjectType": "Account", "PermissionsRead": True},
        "0PS1:Invoice__c": {"ParentId": "0PS1", "SobjectType": "Invoice__c", "PermissionsRead": True, "PermissionsDelete": True},
        "0PSM:Invoice__c": {"ParentId": "0PSM", "SobjectType": "Invoice__c", "PermissionsDelete": True}},
    "field_permission": {"0PSP:Account.Region__c": {"ParentId": "0PSP", "Field": "Account.Region__c", "PermissionsRead": True}},
    "schema_object": {"Account": {"label": "Account", "fields": {"Region__c": {"type": "picklist"}}}},
}


def _right():
    import copy
    s = copy.deepcopy(STATE)
    for u in s["user"].values():
        u["Username"] += ".uat"
    s["permission_set"]["0PS9"] = s["permission_set"].pop("0PS1")
    s["permission_set"]["0PS9"]["Name"] = "lvxdev__Integration"
    s["group_component"]["a"]["PermissionSetId"] = "0PS9"
    s["object_permission"]["0PS9:Invoice__c"] = {**s["object_permission"].pop("0PS1:Invoice__c"), "ParentId": "0PS9"}
    s["schema_object"]["Account"]["fields"] = {"Sales_Region__c": {"type": "picklist"}}
    s["field_permission"] = {"0PSP:Account.Sales_Region__c": {"ParentId": "0PSP", "Field": "Account.Sales_Region__c",
                                                              "PermissionsRead": True}}
    return s


def test_matching_by_api_name_with_mappings():
    right = _right()
    names = [u["Username"] for u in STATE["user"].values()]
    rnames = [u["Username"] for u in right["user"].values()]
    assert (oc.sandbox_suffix(names, rnames), oc.sandbox_suffix(rnames, names)) == (None, ".uat")
    left_f = oc.facets(STATE)
    assert "Profile: Sales Rep · Account" in left_f["Object permissions"]
    assert "Group: Bundle ⊃ lvx__Integration" in left_f["Group components"]
    raw = oc.compare(left_f, oc.facets(right, ".uat"))
    keys = {(r["category"], r["key"], r["status"]) for r in raw}
    assert ("Users", "ada@x.com", "only_left") not in keys  # the sandbox suffix is removed before matching
    assert ("Permission sets", "lvxdev__Integration", "only_right") in keys and ("Fields", "Account.Region__c", "only_left") in keys
    mapped = oc.apply_renames(oc.facets(right, ".uat", {"lvxdev": "lvx"}), {"Fields": {"Account.Region__c": "Account.Sales_Region__c"}})
    assert oc.compare(left_f, mapped) == []  # the rename reaches field permissions too
    approved = oc.compare(left_f, oc.facets(right, ".uat", {"lvxdev": "lvx"}), {"Fields|Account.Region__c": {"note": "renamed"}})
    assert {r["key"]: r["approved"] for r in approved if r["category"] == "Fields"} == {
        "Account.Region__c": True, "Account.Sales_Region__c": False}


def test_effective_access_from_a_snapshot_mutes_through_groups():
    acc = oc.effective_access(STATE)
    assert acc["005A"]["objects"] == {"Account": {"Read": True, "Create": False, "Edit": False, "Delete": False,
                                                  "View All": False, "Modify All": False}}
    inv = acc["005B"]["objects"]["Invoice__c"]
    assert inv["Read"] is True and inv["Delete"] is False  # the group's muting set removes Delete
    right = _right()
    right["group_component"].pop("b")  # no muting set on the other side
    rows = oc.access_changes(STATE, right, None, ".uat", {"lvxdev": "lvx"}, {"Account.Region__c": "Account.Sales_Region__c"})
    assert rows == [{"user": "bo@x.com", "name": "Bo", "kind": "Object", "item": "Invoice__c", "gains": ["Delete"], "loses": []}]


async def _demo(db, key, name):
    org = Organization(name=name, is_demo=True, settings={"demo_fixture": key})
    db.add(org)
    await db.flush()
    job = SyncJob(organization_id=org.id, status=SyncStatus.PENDING)
    db.add(job)
    await db.commit()
    await SyncOrchestrator(db).run_sync(org.id, job.id)
    return org


@pytest.mark.asyncio
async def test_lumenvale_against_its_uat_sandbox(client, async_db_session):  # noqa: F811
    db = async_db_session
    admin, analyst = await _users(db)
    prod = await _demo(db, "synthetic_mid_market", "Lumenvale Systems (Demo)")
    uat = await _demo(db, "lumenvale_uat", "Lumenvale UAT (Demo sandbox)")
    cookie = _cookie(admin)
    url = f"/orgs/{prod.id}/compare"
    first = (await client.get(url, params={"right_org": uat.id, "page": 1, "page_size": 100}, cookies=cookie)).json()
    assert first["totals"]["differences"] == 27 and first["right"]["org"]["name"] == "Lumenvale UAT (Demo sandbox)"
    by = {(r["category"], r["key"]): r for r in first["items"]}
    assert by[("Packages", "APXTConga4")]["fields"] == ["Version"]
    assert by[("Object permissions", "Profile: Sales Rep · Opportunity")]["fields"] == ["Delete"]
    assert ("Fields", "Account.Region__c") in by and ("Packages", "lvx") in by

    deps = (await client.get(f"{url}/dependencies", params={"right_org": uat.id, "page": 1}, cookies=cookie)).json()
    region = next(r for r in deps["items"] if r["field"] == "Account.Region__c")
    assert any("Update Territory" in w for w in region["where"])

    # Map the renamed field and the namespace: two pairs become one item each.
    put = f"/orgs/{prod.id}/compare/mapping"
    assert (await client.put(put, json={"right_org": uat.id, "namespace_right": "lvxdev", "namespace_left": "lvx"},
                             cookies=cookie)).status_code == 200
    await client.put(put, json={"right_org": uat.id, "category": "Fields", "left_key": "Account.Region__c",
                                "right_key": "Account.Sales_Region__c"}, cookies=cookie)
    mapped = (await client.get(url, params={"right_org": uat.id, "page": 1}, cookies=cookie)).json()
    assert mapped["totals"]["differences"] == 23 and mapped["mapping"]["namespaces"] == {"lvxdev": "lvx"}
    # Approve one: it stops counting as drift.
    await client.put(f"/orgs/{prod.id}/compare/approval", json={"right_org": uat.id, "id": "Custom permissions|UAT_Bypass",
                                                               "note": "Sandbox only"}, cookies=cookie)
    after = (await client.get(url, params={"right_org": uat.id, "page": 1, "unexpected": "true"}, cookies=cookie)).json()
    assert after["totals"] == {"differences": 23, "approved": 1, "unexpected": 22} and after["total"] == 22

    acc = (await client.get(f"{url}/access", params={"right_org": uat.id, "page": 1, "q": "Opportunity"}, cookies=cookie)).json()
    assert acc["summary"]["users"] > 0 and all(r["item"] == "Opportunity" or "Opportunity" in r["name"] for r in acc["items"])

    # Only orgs the caller can open, and only admins change mappings.
    assert (await client.put(put, json={"right_org": uat.id, "namespace_right": "a", "namespace_left": "b"},
                             cookies=_cookie(analyst))).status_code in (403, 404)
    db.add(OrgAccessGrant(org_user_id=analyst.id, organization_id=prod.id))
    await db.commit()
    assert (await client.get(url, params={"right_org": uat.id}, cookies=_cookie(analyst))).status_code == 404

    # The stricter privacy level applies to the whole comparison.
    privacy_mode.set_privacy(uat, privacy_mode.METADATA_ONLY, False, "test")
    await db.commit()
    strict = (await client.get(url, params={"right_org": uat.id, "page": 1, "page_size": 100}, cookies=cookie)).json()
    assert strict["note"] and not {"Users", "Assignments"} & {r["category"] for r in strict["items"]}
    assert (await client.get(f"{url}/access", params={"right_org": uat.id}, cookies=cookie)).status_code == 409


@pytest.mark.asyncio
async def test_one_org_against_itself_over_time(client, async_db_session):  # noqa: F811
    db = async_db_session
    admin, _ = await _users(db)
    org = await _demo(db, "synthetic_mid_market", "Lumenvale Systems (Demo)")
    r = (await client.get(f"/orgs/{org.id}/compare", params={"page": 1, "page_size": 100}, cookies=_cookie(admin))).json()
    assert r["sameOrg"] and r["right"]["snapshot"]["label"] == "Kickoff"
    counts = {c: s["only_left"] + s["only_right"] + s["different"] for c, s in r["summary"].items()}
    # Object permissions: Standard User's Invoice read, and what the new muting set mutes.
    assert counts == {"Users": 3, "Permission sets": 3, "Group components": 1, "Assignments": 5, "Object permissions": 2,
                      "Field permissions": 1}
    targets = (await client.get(f"/orgs/{org.id}/compare/targets", cookies=_cookie(admin))).json()
    assert targets["orgs"][0]["self"] and len(targets["orgs"][0]["snapshots"]) == 2
