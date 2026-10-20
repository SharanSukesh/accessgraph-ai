"""Versioned snapshots (item 21): copy-on-change storage, any snapshot
readable, the demo's kickoff and today, privacy rewriting, retention."""
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import func, select

from app.domain.models import AuditLog, Organization, OrgAccessGrant, OrgSnapshot, OrgUser, SnapshotItem, SyncJob, SyncStatus
from app.ingestion.orchestrator import SyncOrchestrator
from app.services import privacy_mode, snapshots
from app.services.privacy_purge import enforce_privacy_mode
from tests.test_demo_orgs import _cookie, client  # noqa: F401
from tests.test_demo_path import lumenvale  # noqa: F401

DATA = {
    "users": [{"Id": "005A", "Name": "Ada Lovelace", "Username": "ada@x.com", "ProfileId": "00eA", "IsActive": True,
               "LastLoginDate": "2026-10-01T10:00:00.000+0000"}],
    "permission_sets": [{"Id": "0PSA", "Label": "Sales", "IsOwnedByProfile": False, "PermissionsModifyAllData": False}],
    "permission_set_assignments": [{"Id": "0PaA", "AssigneeId": "005A", "PermissionSetId": "0PSA"}],
    "object_permissions": [{"ParentId": "0PSA", "SobjectType": "Account", "PermissionsRead": True}],
}


async def _org(db):
    org = Organization(name="Snapshots", is_demo=False)
    db.add(org)
    await db.flush()
    return org


async def _count(db, org_id):
    return (await db.execute(select(func.count()).select_from(SnapshotItem).where(
        SnapshotItem.organization_id == org_id))).scalar()


@pytest.mark.asyncio
async def test_copy_on_change_and_reading_any_snapshot(async_db_session):
    db = async_db_session
    org = await _org(db)
    s1 = await snapshots.take_snapshot(db, org.id, DATA, source="live")
    n1 = await _count(db, org.id)
    # The same configuration again (only the last login moved): no new versions.
    again = {**DATA, "users": [{**DATA["users"][0], "LastLoginDate": "2026-10-19T10:00:00.000+0000"}]}
    s2 = await snapshots.take_snapshot(db, org.id, again, source="live")
    assert (s2.seq, s2.changes, await _count(db, org.id)) == (2, {}, n1)
    # Modify All Data granted, the assignment removed.
    later = {**again, "permission_sets": [{**DATA["permission_sets"][0], "PermissionsModifyAllData": True}],
             "permission_set_assignments": []}
    s3 = await snapshots.take_snapshot(db, org.id, later, source="live")
    assert s3.changes == {"permission_set": {"added": 0, "removed": 0, "changed": 1},
                          "assignment": {"added": 0, "removed": 1, "changed": 0}}
    assert await _count(db, org.id) == n1 + 1  # one new version; the removal costs nothing
    old = await snapshots.load_state(db, org.id, s1)
    new = await snapshots.load_state(db, org.id, s3)
    assert "005A:0PSA" in old["assignment"] and "assignment" not in new
    assert new["permission_set"]["0PSA"]["systemPermissions"] == ["PermissionsModifyAllData"]
    rows = await snapshots.diff(db, org.id, s1, s3)
    assert [(r["entity"], r["change"], r["fields"]) for r in rows] == [
        ("assignment", "removed", []), ("permission_set", "changed", ["systemPermissions"])]


@pytest.mark.asyncio
async def test_retention_keeps_baselines_and_the_latest(async_db_session):
    db = async_db_session
    org = await _org(db)
    old = datetime.now(timezone.utc) - timedelta(days=400)
    s1 = await snapshots.take_snapshot(db, org.id, DATA, source="live", taken_at=old)
    s2 = await snapshots.take_snapshot(db, org.id, {**DATA, "permission_set_assignments": []}, source="live",
                                       taken_at=old + timedelta(days=1))
    s2.is_baseline = True
    await snapshots.take_snapshot(db, org.id, {**DATA, "object_permissions": []}, source="live",
                                  taken_at=old + timedelta(days=2))
    s4 = await snapshots.take_snapshot(db, org.id, {**DATA, "object_permissions": []}, source="live",
                                       taken_at=old + timedelta(days=3))
    pruned = await snapshots.prune(db, org.id, datetime.now(timezone.utc) - timedelta(days=90))
    assert pruned["org_snapshots"] == 2  # s1 and s3; s2 is a baseline, s4 the latest
    left = (await db.execute(select(OrgSnapshot.seq).where(OrgSnapshot.organization_id == org.id))).scalars().all()
    assert sorted(left) == [2, 4]
    # What s2 and s4 need is still there: s1's assignment version is gone, s2's state intact.
    st2 = await snapshots.load_state(db, org.id, s2)
    assert "assignment" not in st2 and "Account" in str(st2["object_permission"])
    assert "object_permission" not in await snapshots.load_state(db, org.id, s4)
    assert s1.seq == 1


@pytest.mark.asyncio
async def test_privacy_rewrites_every_snapshot(async_db_session):
    db = async_db_session
    org = await _org(db)
    await snapshots.take_snapshot(db, org.id, DATA, source="live")
    privacy_mode.set_privacy(org, privacy_mode.MASKED, False, "test")
    await enforce_privacy_mode(db, org)
    user = (await db.execute(select(SnapshotItem).where(SnapshotItem.entity == "user"))).scalar_one()
    assert user.data["Name"] == privacy_mode.user_alias(org.id, "005A") and "ada" not in str(user.data).lower()
    assert user.hash == snapshots.digest(user.data)
    privacy_mode.set_privacy(org, privacy_mode.METADATA_ONLY, False, "test")
    await enforce_privacy_mode(db, org)
    entities = set((await db.execute(select(SnapshotItem.entity).where(SnapshotItem.organization_id == org.id))).scalars())
    assert entities == {"permission_set", "object_permission"}


@pytest.mark.asyncio
async def test_lumenvale_kickoff_and_today(client, async_db_session, lumenvale):  # noqa: F811
    db = async_db_session
    org_id, cookie = lumenvale
    listed = (await client.get(f"/orgs/{org_id}/snapshots", cookies=cookie)).json()
    assert [(s["label"], s["changes"]) for s in listed["items"]] == [("Today", 14), ("Kickoff", 0)]
    today, kickoff = listed["items"]
    assert datetime.fromisoformat(today["takenAt"]) - datetime.fromisoformat(kickoff["takenAt"]) > timedelta(days=13)

    url = f"/orgs/{org_id}/snapshots/{today['id']}/changes"
    page = (await client.get(url, params={"page": 1}, cookies=cookie)).json()
    assert page["total"] == 14 and page["against"]["label"] == "Kickoff"
    assert page["summary"]["assignment"] == {"added": 3, "removed": 2, "changed": 0}
    names = {r["name"] for r in page["items"]}
    assert "Pilot Chatter Bot" in names and any(n.endswith("(profile): Invoice__c") for n in names)
    mad = (await client.get(url, params={"page": 1, "entity": "permission_set", "change": "changed"}, cookies=cookie)).json()
    assert [(r["name"], r["fields"]) for r in mad["items"]] == [("Legacy Integration Admin", ["systemPermissions"])]
    every = (await client.get(url, cookies=cookie)).json()
    assert every["total"] == 14
    # The other way round: everything flips.
    back = (await client.get(f"/orgs/{org_id}/snapshots/{kickoff['id']}/changes", params={"page": 1, "against": today["id"]},
                             cookies=cookie)).json()
    assert back["summary"]["assignment"] == {"added": 2, "removed": 3, "changed": 0}

    # A second sync of the same fixture: a snapshot with no changes and no new versions.
    before = await _count(db, org_id)
    job = SyncJob(organization_id=org_id, status=SyncStatus.PENDING)
    db.add(job)
    await db.commit()
    await SyncOrchestrator(db).run_sync(org_id, job.id)
    listed = (await client.get(f"/orgs/{org_id}/snapshots", cookies=cookie)).json()
    assert [s["changes"] for s in listed["items"]] == [0, 14, 0] and await _count(db, org_id) == before

    # Baselines: org admins only, audit-logged.
    analyst = (await db.execute(select(OrgUser).where(OrgUser.email == "analyst@firm.test"))).scalar_one()
    db.add(OrgAccessGrant(org_user_id=analyst.id, organization_id=org_id))
    await db.commit()
    put = f"/orgs/{org_id}/snapshots/{kickoff['id']}"
    assert (await client.put(put, json={"is_baseline": True}, cookies=_cookie(analyst))).status_code == 403
    r = await client.put(put, json={"is_baseline": True, "baseline_note": "Signed off at kickoff"}, cookies=cookie)
    assert r.json()["isBaseline"] is True and r.json()["baselineBy"] == "admin@firm.test"
    assert (await db.execute(select(AuditLog).where(AuditLog.resource_type == "org_snapshot"))).scalars().first()
