"""Role design mode v1 (roadmap 35b): drafts that replay and validate,
staleness against the last sync, the Account and Opportunity impact
preview, references, the export ZIP, the routes and privacy."""
import io
import zipfile
from types import SimpleNamespace as NS

import pytest
from sqlalchemy import select

from app.domain.models import Organization, RoleDesignDraft, RoleSnapshot, UserSnapshot
from app.services import privacy_mode
from app.services import role_design as rd
from tests.test_demo_orgs import client  # noqa: F401
from tests.test_demo_path import lumenvale  # noqa: F401

BASE = {
    "roles": [
        {"id": "R1", "name": "CEO", "developer_name": "CEO", "parent_id": None, "access": {}},
        {"id": "R2", "name": "VP Sales", "developer_name": "VP_Sales", "parent_id": "R1",
         "access": {"OpportunityAccessForAccountOwner": "Edit", "CaseAccessForAccountOwner": "Read"}},
        {"id": "R3", "name": "Sales Rep", "developer_name": "Sales_Rep", "parent_id": "R2", "access": {}},
        {"id": "R4", "name": "VP Finance", "developer_name": "VP_Finance", "parent_id": "R1", "access": {}},
    ],
    "users": {"u1": "R2", "u2": "R3", "u3": "R4", "u4": "R1"},
    "synced_at": "2026-10-14T09:00:00+00:00",
}


def _err(ops):
    with pytest.raises(rd.DesignError) as e:
        rd.apply_operations(BASE, ops)
    return str(e.value), e.value.index


def test_operations_replay_and_are_validated():
    s = rd.apply_operations(BASE, [
        {"op": "create_role", "role_id": "new:1", "name": "Sales Ops", "developer_name": "Sales_Ops", "parent_id": "R2"},
        {"op": "move_user", "user_id": "u2", "role_id": "new:1"},
        {"op": "move_role", "role_id": "R3", "parent_id": "R4"},
        {"op": "rename_role", "role_id": "R4", "name": "CFO"},
    ])
    assert s["roles"]["R3"]["parent_id"] == "R4" and s["users"]["u2"] == "new:1" and s["roles"]["R4"]["name"] == "CFO"
    # A role can't move under itself or below itself.
    assert _err([{"op": "move_role", "role_id": "R1", "parent_id": "R3"}])[0].startswith("A role can't move under itself")
    assert _err([{"op": "move_role", "role_id": "R2", "parent_id": "R2"}])[1] == 0
    assert "Move its users" in _err([{"op": "delete_role", "role_id": "R3"}])[0]
    assert "roles below it" in _err([{"op": "delete_role", "role_id": "R2"}])[0]
    assert "API name" in _err([{"op": "create_role", "role_id": "new:2", "name": "X", "developer_name": "Bad__Name"}])[0]
    assert "API name" in _err([{"op": "create_role", "role_id": "new:2", "name": "X", "developer_name": "Trailing_"}])[0]
    assert "already uses" in _err([{"op": "create_role", "role_id": "new:2", "name": "X", "developer_name": "vp_sales"}])[0]
    assert "can't change" in _err([{"op": "rename_role", "role_id": "R2", "name": "VP", "developer_name": "VP"}])[0]
    assert _err([{"op": "move_user", "user_id": "u9", "role_id": "R1"}])[0] == "User not found in this draft."
    assert "Unknown change" in _err([{"op": "nope"}])[0]
    # Deleting works once the role is empty and has nothing below it.
    s = rd.apply_operations(BASE, [{"op": "move_user", "user_id": "u3", "role_id": "R1"}, {"op": "delete_role", "role_id": "R4"}])
    assert "R4" not in s["roles"]


def test_diff_and_staleness():
    s = rd.apply_operations(BASE, [{"op": "move_role", "role_id": "R3", "parent_id": "R4"},
                                   {"op": "move_user", "user_id": "u1", "role_id": "R4"}])
    d = rd.diff(BASE, s)
    assert d["count"] == 2 and d["reparented"] == [{"id": "R3", "from": "R2", "to": "R4"}]
    assert rd.stale_changes(BASE, BASE) == []
    current = {**BASE, "roles": BASE["roles"][:3] + [{**BASE["roles"][3], "name": "Finance VP"}],
               "users": {**BASE["users"], "u2": "R1"}}
    assert rd.stale_changes(BASE, current) == ["Role renamed in Salesforce: VP Finance is now Finance VP",
                                               "1 user changed role in Salesforce"]
    assert rd.stale_changes(rd.empty_base(), current) == []


def _users():
    owned = {"u1": {"Account": 5, "Opportunity": 7}, "u2": {"Account": 3, "Opportunity": 10},
             "u3": {"Account": 1, "Opportunity": 1}, "u4": {"Account": 0, "Opportunity": 0}}
    return [NS(salesforce_id=u, is_active=True, raw_data={"NewtonOwnedRecords": o}) for u, o in owned.items()]


def test_impact_counts_who_gains_and_loses():
    s = rd.apply_operations(BASE, [{"op": "move_role", "role_id": "R3", "parent_id": "R4"}])
    names = {"u1": "Ana", "u3": "Ben"}
    out = rd.impact(BASE, s, _users(), {"Account": "Private", "Opportunity": "Read"},
                    {"Account": {"u2": 2}}, names, "Based on records the integration user can see")
    acc, opp = out["objects"]["Account"], out["objects"]["Opportunity"]
    # u2 (Sales Rep) now sits under VP Finance (u3) instead of VP Sales (u1); the CEO (u4) sees both before and after.
    assert (acc["owners_affected"], acc["records_owned"], acc["records_shared"]) == (1, 3, 2)
    assert acc["gaining"] == [{"user_id": "u3", "name": "Ben", "records": 5, "at_least": False}]
    assert acc["losing"] == [{"user_id": "u1", "name": "Ana", "records": 5, "at_least": False}]
    assert acc["effect"] == "view_and_edit" and opp["effect"] == "edit_only"
    assert out["users_affected"] == 1 and "upper bound" in out["upper_bound_note"]
    rw = rd.impact(BASE, s, _users(), {"Account": "ReadWrite"}, {}, {}, None)["objects"]
    assert rw["Account"]["effect"] == "none" and rw["Account"]["users_gaining"] == 0
    assert rw["Opportunity"]["effect"] == "view_and_edit" and "not synced" in rw["Opportunity"]["explanation"]
    # Moving a user changes who sits above their records; peers in the same
    # role gain nothing (the hierarchy only opens records to roles above).
    s = rd.apply_operations(BASE, [{"op": "move_user", "user_id": "u2", "role_id": "R4"}])
    acc = rd.impact(BASE, s, _users(), {}, {}, {}, None)["objects"]["Account"]
    assert acc["gaining"] == [] and {g["user_id"] for g in acc["losing"]} == {"u1"}
    s = rd.apply_operations(BASE, [
        {"op": "create_role", "role_id": "new:1", "name": "FP&A", "developer_name": "FPA", "parent_id": "R4"},
        {"op": "move_user", "user_id": "u2", "role_id": "new:1"}])
    acc = rd.impact(BASE, s, _users(), {}, {}, {}, None)["objects"]["Account"]
    assert {g["user_id"] for g in acc["gaining"]} == {"u3"}
    # A count the sync didn't take is flagged, not treated as zero silently.
    users = _users()
    users[1].raw_data = {}
    acc = rd.impact(BASE, rd.apply_operations(BASE, [{"op": "move_role", "role_id": "R3", "parent_id": "R4"}]),
                    users, {}, {}, {}, None)["objects"]["Account"]
    # ...and its viewers still count as gaining and losing; the record total is unknown, not 0.
    assert acc["some_counts_unknown"] and acc["records_owned"] is None
    assert (acc["users_gaining"], acc["users_losing"]) == (1, 1) and acc["gaining"][0]["at_least"]


def test_references_through_role_groups():
    groups = [NS(salesforce_id="G1", name="Role group", group_type="RoleAndSubordinatesInternal", related_id="R3"),
              NS(salesforce_id="G2", name="EMEA Deal Desk", group_type="Regular", related_id=None),
              NS(salesforce_id="G3", name="Other", group_type="Regular", related_id=None),
              NS(salesforce_id="G4", name="Ops role", group_type="Role", related_id="R4")]
    members = [NS(group_id="G2", user_or_group_id="G1"), NS(group_id="G3", user_or_group_id="005x")]
    rules = [NS(rule_name="Share to sales", sobject_type="Account", shared_to_type="Group", shared_to_id="G1", criteria=None),
             NS(rule_name="From ops", sobject_type="Opportunity", shared_to_type="Group", shared_to_id="G9",
                criteria={"source_group_id": "G4"}),
             NS(rule_name="Target unknown", sobject_type="Account", shared_to_type="RoleAndSubordinates", shared_to_id=None),
             NS(rule_name="Group rule", sobject_type="Account", shared_to_type="Group", shared_to_id="G9", criteria=None),
             NS(rule_name="Case rule", sobject_type="Case", shared_to_type="Role", shared_to_id="G1", criteria=None)]
    out = rd.references({"R3", "R4"}, rules, groups, members,
                        {"Account": {"G1": 7, "G9": 3}, "Opportunity": {"G4": 2}})
    assert out["public_groups"] == ["EMEA Deal Desk"]
    # Named through the role group's RelatedId, as target or as source.
    assert out["named_rules"] == ["From ops (Opportunity): shares records owned in a changed role",
                                  "Share to sales (Account): shares to a changed role"]
    assert out["role_sharing_rules"] == ["Target unknown (Account)"] and "Support enables" in out["sharing_rules_note"]
    assert out["rule_shares"] == {"Account": 7, "Opportunity": 2} and out["rule_shares_note"]


def test_export_zip():
    s = rd.apply_operations(BASE, [
        {"op": "create_role", "role_id": "new:1", "name": "Sales & Ops", "developer_name": "Sales_Ops", "parent_id": "R2"},
        {"op": "move_role", "role_id": "R3", "parent_id": "R4"},
        {"op": "move_user", "user_id": "u2", "role_id": "new:1"},
        {"op": "move_user", "user_id": "u1", "role_id": "R4"},
    ])
    z = zipfile.ZipFile(io.BytesIO(rd.build_export("Q4 redesign", "Lumenvale", BASE, s, {"u1": "Ana", "u2": "Bo"}, True, [])))
    names = set(z.namelist())
    assert {"after/roles/Sales_Ops.role", "after/roles/Sales_Rep.role", "after/package.xml",
            "after/user-role-assignments.csv", "before/package.xml", "before/user-role-assignments.csv",
            "README.md", "DEMO-DATA.txt"} <= names
    assert len([n for n in names if n.startswith("before/roles/")]) == 4
    rep = z.read("after/roles/Sales_Rep.role").decode()
    assert "<parentRole>VP_Finance</parentRole>" in rep and "<name>Sales Rep</name>" in rep
    assert "<name>Sales &amp; Ops</name>" in z.read("after/roles/Sales_Ops.role").decode()
    vp = z.read("before/roles/VP_Sales.role").decode()
    assert "<caseAccessLevel>Read</caseAccessLevel>" in vp and "<opportunityAccessLevel>Edit</opportunityAccessLevel>" in vp
    pkg = z.read("after/package.xml").decode()
    assert "<members>Sales_Ops</members>" in pkg and "<members>Sales_Rep</members>" in pkg and "<version>68.0</version>" in pkg
    csv = z.read("after/user-role-assignments.csv").decode().splitlines()
    assert csv[0] == "Id,UserRoleId,RoleApiName,Name"
    assert "u1,R4,VP_Finance,Ana" in csv and "u2,,Sales_Ops,Bo" in csv  # new role: Id filled in after deploying
    readme = z.read("README.md").decode()
    assert "**Demo data.**" in readme and "Unconfirmed:" in readme and "Newton never deploys anything" in readme
    assert "New roles carry no access levels" in readme


@pytest.mark.asyncio
async def test_lumenvale_draft_routes(client, async_db_session, lumenvale):  # noqa: F811
    org_id, cookie = lumenvale
    db = async_db_session
    roles = {r.name: r.salesforce_id for r in (await db.execute(
        select(RoleSnapshot).where(RoleSnapshot.organization_id == org_id))).scalars().all()}
    r = await client.post(f"/orgs/{org_id}/role-designs", json={"name": "Move Sales Ops"}, cookies=cookie)
    assert r.status_code == 201
    did = r.json()["id"]
    draft = (await client.get(f"/orgs/{org_id}/role-designs/{did}", cookies=cookie)).json()
    assert len(draft["base"]["roles"]) == 30  # portal roles left out
    assert len(draft["users"]) == 400 and draft["stale"] == []

    bad = [{"op": "move_role", "role_id": roles["CEO"], "parent_id": roles["Sales Operations"]}]
    r = await client.put(f"/orgs/{org_id}/role-designs/{did}", json={"operations": bad, "position": 1}, cookies=cookie)
    assert r.status_code == 400 and r.json()["detail"]["index"] == 0

    ops = [{"op": "move_role", "role_id": roles["Sales Operations"], "parent_id": roles["VP Finance"]}]
    r = await client.put(f"/orgs/{org_id}/role-designs/{did}", json={"operations": ops, "position": 1}, cookies=cookie)
    assert r.status_code == 200 and r.json()["diff_count"] == 1
    impact = (await client.get(f"/orgs/{org_id}/role-designs/{did}/impact", cookies=cookie)).json()
    opp = impact["objects"]["Opportunity"]
    tobias = (await db.execute(select(UserSnapshot).where(UserSnapshot.organization_id == org_id,
                                                          UserSnapshot.name == "Tobias Lindqvist"))).scalar_one()
    assert opp["owners_affected"] == 1 and opp["records_owned"] == tobias.raw_data["NewtonOwnedRecords"]["Opportunity"]
    assert opp["users_gaining"] == 1 and opp["users_losing"] == 1
    # The 35b fixture part: Account owner counts and Private org-wide defaults.
    acc = impact["objects"]["Account"]
    assert not acc["some_counts_unknown"] and acc["records_owned"] == tobias.raw_data["NewtonOwnedRecords"]["Account"]
    assert acc["users_gaining"] == 1 and acc["effect"] == opp["effect"] == "view_and_edit"
    assert opp["org_wide_default"] == "Private" and opp["explanation"].startswith("Private:")
    assert impact["references"]["named_rules"] == [
        "EMEA opportunities to Sales Operations (Opportunity): shares to a changed role"]
    assert impact["coverage_label"] and impact["recalculation_warning"]

    r = await client.post(f"/orgs/{org_id}/role-designs/{did}/export", json={}, cookies=cookie)
    assert r.status_code == 200 and 'filename="demo-role-design-move-sales-ops.zip"' in r.headers["content-disposition"]
    assert "after/roles/Sales_Operations.role" in zipfile.ZipFile(io.BytesIO(r.content)).namelist()

    # Salesforce changes after the draft started: the export waits for an acknowledgement.
    ceo = (await db.execute(select(RoleSnapshot).where(RoleSnapshot.organization_id == org_id,
                                                       RoleSnapshot.name == "CEO"))).scalar_one()
    ceo.name = "Chief Executive"
    await db.commit()
    r = await client.post(f"/orgs/{org_id}/role-designs/{did}/export", json={}, cookies=cookie)
    assert r.status_code == 409 and r.json()["detail"]["stale"] == ["Role renamed in Salesforce: CEO is now Chief Executive"]
    r = await client.post(f"/orgs/{org_id}/role-designs/{did}/export", json={"acknowledge_stale": True}, cookies=cookie)
    readme = zipfile.ZipFile(io.BytesIO(r.content)).read("README.md").decode()
    assert "Changed in Salesforce since this draft started" in readme

    listing = (await client.get(f"/orgs/{org_id}/role-designs", cookies=cookie)).json()
    assert [d["name"] for d in listing] == ["Move Sales Ops"] and listing[0]["changes"] == 1
    assert (await client.get(f"/orgs/{org_id}/role-designs")).status_code in (401, 403)
    assert (await client.delete(f"/orgs/{org_id}/role-designs/{did}", cookies=cookie)).json() == {"deleted": did}
    assert (await client.get(f"/orgs/{org_id}/role-designs/{did}", cookies=cookie)).status_code == 404


@pytest.mark.asyncio
async def test_blank_design_export(client, lumenvale):  # noqa: F811
    _, cookie = lumenvale
    ops = [{"op": "create_role", "role_id": "new:a", "name": "CEO", "developer_name": "CEO", "parent_id": None},
           {"op": "create_role", "role_id": "new:b", "name": "Sales", "developer_name": "Sales", "parent_id": "new:a"}]
    r = await client.post("/role-designs/export", json={"name": "New client", "operations": ops}, cookies=cookie)
    z = zipfile.ZipFile(io.BytesIO(r.content))
    assert "<parentRole>CEO</parentRole>" in z.read("after/roles/Sales.role").decode()
    assert "not connected (designed from scratch)" in z.read("README.md").decode()
    assert (await client.post("/role-designs/export", json={"name": "x", "operations": ops})).status_code == 401


@pytest.mark.asyncio
async def test_metadata_only_strips_users_from_drafts(async_db_session, lumenvale):  # noqa: F811
    from app.services.privacy_purge import enforce_privacy_mode
    db = async_db_session
    org_id, _ = lumenvale
    d = RoleDesignDraft(organization_id=org_id, name="d", base={**BASE, "users": {"u1": "R2"}},
                        operations=[{"op": "move_user", "user_id": "u1", "role_id": "R1"},
                                    {"op": "move_role", "role_id": "R3", "parent_id": "R4"}], position=2)
    db.add(d)
    await db.flush()
    org = await db.get(Organization, org_id)
    privacy_mode.set_privacy(org, privacy_mode.METADATA_ONLY, False, "test")
    await enforce_privacy_mode(db, org)
    await db.flush()
    d = await db.get(RoleDesignDraft, d.id)
    assert d.base["users"] == {} and d.operations == [{"op": "move_role", "role_id": "R3", "parent_id": "R4"}]
    assert d.position == 1


@pytest.mark.asyncio
async def test_lumenvale_runbook_numbers_hold_with_the_35b_part(async_db_session, lumenvale):  # noqa: F811
    """Health 41, 18 findings, $183,180; License Fit $116,220."""
    from app.domain.models import OrgFinding
    from app.services.data_quality import DataQualityService
    from app.services.license_fit import LicenseFitService
    from app.services.org_analyzer import OrgAnalyzerService

    db = async_db_session
    org_id, _ = lumenvale
    await DataQualityService(db, org_id).run(actor_email="test")
    snap = await OrgAnalyzerService(db, org_id).run(actor_email="test")
    rows = (await db.execute(select(OrgFinding).where(OrgFinding.snapshot_id == snap.id))).scalars().all()
    assert (snap.metrics["org_health_score"], len(rows)) == (41, 18)
    assert sum(f.estimated_annual_savings_cents or 0 for f in rows) == 18_318_000
    lf = await LicenseFitService(db, org_id).run(actor_email="test")
    assert lf.total_annual_savings_cents == 11_622_000


@pytest.mark.asyncio
async def test_owner_sharing_rules_are_read_with_their_groups(monkeypatch):
    """No network: Tooling is refused, the owner-rule objects answer for
    Opportunity and are refused for Account (Support hasn't enabled them)."""
    import httpx
    from app.salesforce import client as sf

    real = httpx.AsyncClient
    monkeypatch.setattr(sf.httpx, "AsyncClient",
                        lambda **kw: real(transport=httpx.MockTransport(lambda req: httpx.Response(400, json=[])), **kw))
    c = sf.SalesforceAPIClient("https://example.invalid", "token")

    async def query_all(soql):
        if "FROM OpportunityOwnerSharingRule" in soql:
            return [{"Id": "02c1", "Name": "EMEA to Ops", "DeveloperName": "EMEA_to_Ops", "GroupId": "00GSRC",
                     "UserOrGroupId": "00GDST", "OpportunityAccessLevel": "Read"}]
        raise httpx.HTTPStatusError("400", request=httpx.Request("GET", "https://x"), response=httpx.Response(400))
    monkeypatch.setattr(c, "query_all", query_all)
    rules = await c.extract_sharing_rules()
    assert [(r.Name, r.SobjectType, r.SharedToId, r.Criteria) for r in rules] == [
        ("EMEA to Ops", "Opportunity", "00GDST", {"source_group_id": "00GSRC"})]
