"""What-if simulator (item 15): staged changes against a snapshot, who
gains, loses and keeps access, remaining paths, what can't be predicted,
roles, privacy and retention."""
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select

from app.domain.models import (AccessDraft, Organization, OrgAccessGrant, OrgSnapshot, OrgUser, OrgUserRole,
                               RestructureMove, RestructureRun)
from app.services import access_sim, privacy_mode, snapshots
from app.services.privacy_purge import enforce_privacy_mode
from tests.test_demo_orgs import _cookie, client  # noqa: F401
from tests.test_demo_path import lumenvale  # noqa: F401
from tests.test_snapshots import DATA


async def _new(client, org_id, cookie, **body):  # noqa: F811
    r = await client.post(f"/orgs/{org_id}/what-if/drafts", json=body, cookies=cookie)
    assert r.status_code == 200, r.text
    return r.json()


async def _impact(client, org_id, draft_id, cookie, view="users", **params):  # noqa: F811
    q = "&".join(f"{k}={v}" for k, v in {"view": view, "page": 1, **params}.items())
    return await client.get(f"/orgs/{org_id}/what-if/drafts/{draft_id}/impact?{q}", cookies=cookie)


@pytest.mark.asyncio
async def test_remove_legacy_integration_admin(client, lumenvale):  # noqa: F811
    org_id, cookie = lumenvale
    d = await _new(client, org_id, cookie, preset="remove_legacy_integration_admin")
    assert d["name"] == "Remove Legacy Integration Admin" and d["operations"] == 1 and d["base"]["label"]
    got = (await client.get(f"/orgs/{org_id}/what-if/drafts/{d['id']}", cookies=cookie)).json()
    assert got["changes"][0]["text"].startswith("Delete permission set Legacy Integration Admin")
    r = (await _impact(client, org_id, d["id"], cookie)).json()
    assert r["summary"]["usersAffected"] == 2 and r["total"] == 2 and r["usersAllowed"] is True
    assert all(u["reasons"] for u in r["items"])
    assert any("system context" in u for u in r["unpredictable"])
    # The restriction is undone for one of them: Modify All Data stays through the profile.
    paths = (await _impact(client, org_id, d["id"], cookie, view="paths")).json()["items"]
    mad = [p for p in paths if p["object"] == "System permissions" and "ModifyAllData" in p["still"]]
    assert len(mad) == 1 and "Profile: System Administrator" in mad[0]["via"]
    assert len({p["user"] for p in paths if p["object"] == "System permissions"}) == 2  # both keep API access
    sources = (await _impact(client, org_id, d["id"], cookie, view="sources")).json()["items"]
    assert sources and all(s["removed"] and s["loses"] and s["source"] == "Permission set: Legacy Integration Admin"
                           for s in sources)


@pytest.mark.asyncio
async def test_split_bundle_shows_the_lost_muting(client, lumenvale):  # noqa: F811
    org_id, cookie = lumenvale
    d = await _new(client, org_id, cookie, preset="split_sales_manager_bundle")
    r = (await _impact(client, org_id, d["id"], cookie, page_size=25)).json()
    assert r["summary"]["usersAffected"] == 103 and r["total"] == 103 and len(r["items"]) == 25
    assert r["pages"] == 5 and r["items"][0]["losses"] >= r["items"][-1]["losses"]  # most losses first
    items = {(i["kind"], i["item"]): i for i in (await _impact(client, org_id, d["id"], cookie, view="items",
                                                                page_size=100)).json()["items"]}
    assert items[("Object", "Account")]["usersLosing"] == 53
    # The bundle muted Opportunity; the new groups have no muting set, so access widens.
    assert items[("Object", "Opportunity")]["usersGaining"] == 49
    assert r["summary"]["remainingPaths"] == 412
    # Search and paging cover every row.
    found = (await _impact(client, org_id, d["id"], cookie, q="Sales Manager")).json()
    assert 0 < found["total"] <= 103


@pytest.mark.asyncio
async def test_editing_roles_and_bad_changes(client, async_db_session, lumenvale):  # noqa: F811
    db = async_db_session
    org_id, cookie = lumenvale
    d = await _new(client, org_id, cookie)
    assert d["name"] == "New scenario" and d["operations"] == 0
    empty = (await _impact(client, org_id, d["id"], cookie)).json()
    assert empty["total"] == 0 and empty["summary"]["usersAffected"] == 0
    users = (await client.get(f"/orgs/{org_id}/what-if/catalog?kind=users&page_size=25", cookies=cookie)).json()
    sets = (await client.get(f"/orgs/{org_id}/what-if/catalog?kind=sets&q=Legacy%20Integration", cookies=cookie)).json()
    assert users["total"] > 300 and users["page"] == 1 and sets["items"][0]["name"] == "Legacy Integration Admin"
    uid, sid = users["items"][0]["id"], sets["items"][0]["id"]
    ops = [{"op": "assign", "user": uid, "set": sid}, {"op": "set_role", "user": uid, "role": None}]
    r = await client.put(f"/orgs/{org_id}/what-if/drafts/{d['id']}", json={"name": "Grant LIA", "operations": ops},
                         cookies=cookie)
    assert r.status_code == 200 and r.json()["operations"] == 2 and r.json()["name"] == "Grant LIA"
    imp = (await _impact(client, org_id, d["id"], cookie)).json()
    assert imp["summary"]["usersGaining"] == 1 and imp["unpredictable"][0].startswith("1 role changes")
    bad = await client.put(f"/orgs/{org_id}/what-if/drafts/{d['id']}", json={"operations": [{"op": "deploy"}]},
                           cookies=cookie)
    assert bad.status_code == 400
    assert (await _impact(client, org_id, d["id"], cookie, view="nope")).status_code == 400

    viewer = OrgUser(organization_id="system-org", email="viewer@firm.test", role=OrgUserRole.VIEWER, password_hash="x",
                     is_active=True, is_email_verified=True)
    db.add(viewer)
    await db.flush()
    db.add(OrgAccessGrant(org_user_id=viewer.id, organization_id=org_id))
    await db.commit()
    vc = _cookie(viewer)
    assert (await client.get(f"/orgs/{org_id}/what-if/drafts", cookies=vc)).json()["drafts"][0]["name"] == "Grant LIA"
    assert (await _impact(client, org_id, d["id"], vc)).status_code == 200
    assert (await client.post(f"/orgs/{org_id}/what-if/drafts", json={}, cookies=vc)).status_code == 403
    assert (await client.delete(f"/orgs/{org_id}/what-if/drafts/{d['id']}", cookies=vc)).status_code == 403
    assert (await client.delete(f"/orgs/{org_id}/what-if/drafts/{d['id']}", cookies=cookie)).status_code == 200
    assert (await client.get(f"/orgs/{org_id}/what-if/drafts/{d['id']}", cookies=cookie)).status_code == 404


@pytest.mark.asyncio
async def test_restructure_moves_become_changes(client, async_db_session, lumenvale):  # noqa: F811
    db = async_db_session
    org_id, cookie = lumenvale
    sets = (await client.get(f"/orgs/{org_id}/what-if/catalog?kind=sets&page_size=100", cookies=cookie)).json()["items"]
    a, b = sets[0]["id"], sets[1]["id"]
    run = RestructureRun(organization_id=org_id, snapshot_at=datetime.now(timezone.utc))
    db.add(run)
    await db.flush()
    merge = RestructureMove(run_id=run.id, organization_id=org_id, move_type="MERGE_PERMISSION_SETS",
                            primary_component_id=a, affected_component_ids=[a, b], move_status="accepted")
    share = RestructureMove(run_id=run.id, organization_id=org_id, move_type="CONSOLIDATE_SHARING_RULES",
                            primary_component_name="Account rules", move_status="accepted")
    db.add_all([merge, share])
    await db.commit()
    d = await _new(client, org_id, cookie, restructure_moves=[merge.id, share.id])
    assert d["name"] == "Restructure: 2 moves" and d["source"] == "restructure"
    changes = (await client.get(f"/orgs/{org_id}/what-if/drafts/{d['id']}", cookies=cookie)).json()["changes"]
    assert [c["op"] for c in changes] == ["merge_into", "sharing_rule"]
    assert changes[0]["set"] == b and changes[0]["into"] == a
    imp = (await _impact(client, org_id, d["id"], cookie)).json()
    assert imp["unpredictable"][0].startswith("Sharing rule changes")
    # The move drawer's preview: the same simulation, nothing saved.
    before = (await client.get(f"/orgs/{org_id}/what-if/drafts", cookies=cookie)).json()["drafts"]
    pv = (await client.post(f"/orgs/{org_id}/what-if/preview", json={"restructure_moves": [merge.id]}, cookies=cookie)).json()
    assert pv["computed"] is True and pv["usersAllowed"] is True and len(pv["items"]) <= 10
    assert pv["summary"]["usersLosing"] == 0 and pv["summary"]["operations"] == 1
    assert (await client.get(f"/orgs/{org_id}/what-if/drafts", cookies=cookie)).json()["drafts"] == before
    roles_only = (await client.post(f"/orgs/{org_id}/what-if/preview", json={"restructure_moves": [share.id]},
                                    cookies=cookie)).json()
    assert roles_only["computed"] is False and roles_only["summary"]["usersAffected"] == 0
    # Merging adds b's access to a's holders but nobody who held b loses anything.
    lost = (await _impact(client, org_id, d["id"], cookie, view="changes", page_size=100)).json()["items"]
    assert not any(r["loses"] for r in lost if r["kind"] == "Object")


def test_mute_and_merge_unit():
    state = {
        "user": {"005A": {"Name": "Ada", "IsActive": True}},
        "permission_set": {"0PSA": {"Label": "Sales"}, "0PSB": {"Label": "Ops", "systemPermissions": ["PermissionsExportReport"]}},
        "permission_set_group": {"0PGA": {"MasterLabel": "Bundle"}},
        "group_component": {"0PGA:0PSA": {"PermissionSetGroupId": "0PGA", "PermissionSetId": "0PSA"}},
        "assignment": {"005A:0PGA": {"AssigneeId": "005A", "PermissionSetId": "0PGA"}},
        "object_permission": {"0PSA:Account": {"ParentId": "0PSA", "SobjectType": "Account", "PermissionsRead": True,
                                               "PermissionsEdit": True}},
    }
    muted = access_sim.simulate(state, [{"op": "mute", "group": "0PGA", "object": "Account", "flags": ["Edit"]}])
    assert [(r["item"], r["loses"], r["keeps"]) for r in muted["changes"]] == [("Account", ["Edit"], ["Read"])]
    assert muted["summary"]["usersLosing"] == 1 and muted["summary"]["kept"] == 1
    merged = access_sim.apply(state, [{"op": "merge_into", "set": "0PSB", "into": "0PSA"}])
    assert "0PSB" not in merged["permission_set"] and merged["permission_set"]["0PSA"]["systemPermissions"] == [
        "PermissionsExportReport"]
    # Set-only changes work without any users (the Metadata-only view).
    by_source = {r["source"]: r for r in access_sim.source_changes(state, access_sim.apply(state, [
        {"op": "remove_set", "set": "0PSA"}]))}
    assert by_source["Permission set: Sales"]["removed"] and by_source["Group: Bundle"]["loses"] == ["Edit", "Read"]
    assert not by_source["Group: Bundle"]["removed"]


@pytest.mark.asyncio
async def test_privacy_and_retention(client, async_db_session, lumenvale):  # noqa: F811
    db = async_db_session
    org_id, cookie = lumenvale
    d = await _new(client, org_id, cookie, preset="split_sales_manager_bundle")
    org = await db.get(Organization, org_id)
    privacy_mode.set_privacy(org, privacy_mode.METADATA_ONLY, False, "test")
    await enforce_privacy_mode(db, org)
    await db.commit()
    assert (await _impact(client, org_id, d["id"], cookie)).status_code == 409
    pv = (await client.post(f"/orgs/{org_id}/what-if/preview", json={"restructure_moves": []}, cookies=cookie)).json()
    assert pv["usersAllowed"] is False and pv["items"] == [] and set(pv["summary"]) == {"operations"}
    src = (await _impact(client, org_id, d["id"], cookie, view="sources")).json()
    assert src["usersAllowed"] is False and "usersAffected" not in src["summary"]
    assert src["note"].startswith("User and role counts need a privacy level that keeps users")
    assert src["total"] > 0  # the new groups still gain what their sets grant
    row = await db.get(AccessDraft, d["id"])
    await db.refresh(row)
    assert row.operations and not any(op.get("user") for op in row.operations)

    # A snapshot a draft starts from survives retention.
    other = Organization(name="Retention", is_demo=False)
    db.add(other)
    await db.flush()
    old = datetime.now(timezone.utc) - timedelta(days=400)
    s1 = await snapshots.take_snapshot(db, other.id, DATA, source="live", taken_at=old)
    await snapshots.take_snapshot(db, other.id, {**DATA, "permission_set_assignments": []}, source="live",
                                  taken_at=old + timedelta(days=1))
    await snapshots.take_snapshot(db, other.id, {**DATA, "object_permissions": []}, source="live",
                                  taken_at=old + timedelta(days=2))
    db.add(AccessDraft(organization_id=other.id, name="Kept", base_snapshot_id=s1.id, operations=[]))
    await db.commit()
    assert (await snapshots.prune(db, other.id, datetime.now(timezone.utc) - timedelta(days=90)))["org_snapshots"] == 1
    left = (await db.execute(select(OrgSnapshot.seq).where(OrgSnapshot.organization_id == other.id))).scalars().all()
    assert sorted(left) == [1, 3]
    assert "assignment" in await snapshots.load_state(db, other.id, s1)


def test_merging_profile_sets_moves_the_profile_users():
    state = {
        "user": {"005A": {"Name": "Ada", "IsActive": True, "ProfileId": "00eRep"},
                 "005B": {"Name": "Bo", "IsActive": True, "ProfileId": "00eStd"}},
        "profile": {"00eRep": {"Name": "Sales Rep"}, "00eStd": {"Name": "Standard User"}},
        "permission_set": {"0PSrep": {"IsOwnedByProfile": True, "ProfileId": "00eRep"},
                           "0PSstd": {"IsOwnedByProfile": True, "ProfileId": "00eStd"}},
        "object_permission": {"0PSrep:Lead": {"ParentId": "0PSrep", "SobjectType": "Lead", "PermissionsRead": True},
                              "0PSstd:Task": {"ParentId": "0PSstd", "SobjectType": "Task", "PermissionsRead": True}},
    }
    out = access_sim.simulate(state, [{"op": "merge_into", "set": "0PSrep", "into": "0PSstd"}])
    # A merge is a superset: nobody loses; each profile's users gain the other's access.
    assert out["summary"]["usersLosing"] == 0
    assert [(r["user"], r["item"], r["gains"]) for r in out["changes"]] == [("005A", "Task", ["Read"]), ("005B", "Lead", ["Read"])]
    assert out["profileMoves"] == [{"from": "Sales Rep", "to": "Standard User", "users": 1}]
