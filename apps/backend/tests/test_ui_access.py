"""Roadmap item 1, phase 1: page layouts, Lightning record pages, and the
Apex classes and flows a user can run, with the path that grants each."""
from types import SimpleNamespace as NS

import pytest

from app.domain.models import Organization
from app.services import privacy_mode
from app.services import ui_access as ua
from tests.test_demo_orgs import client  # noqa: F401
from tests.test_demo_path import lumenvale  # noqa: F401

JUN = "005000000000005DMO"  # Sales Manager profile, Sales Manager Bundle


def _ps(pid, name, profile=None, ps_type="Regular"):
    return NS(salesforce_id=pid, name=name, label=name, is_owned_by_profile=bool(profile), profile_id=profile,
              ps_type=ps_type, raw_data={})


UI = {
    "record_types": [{"id": "RT1", "object": "Opportunity", "developer_name": "Renewal", "name": "Renewal", "active": True}],
    "layouts": [{"id": "L1", "object": "Opportunity", "name": "Opp Layout"}, {"id": "L2", "object": "Opportunity", "name": "Renewal Layout"}],
    "profile_layouts": [{"profile_id": "P1", "object": "Opportunity", "record_type_id": None, "layout_id": "L1"},
                        {"profile_id": "P1", "object": "Opportunity", "record_type_id": "RT1", "layout_id": "L2"},
                        {"profile_id": "P2", "object": "Opportunity", "record_type_id": "RT1", "layout_id": "L1"}],
    "flexipages": [{"id": "F1", "developer_name": "Org_Page", "label": "Org page", "object": "Opportunity"},
                   {"id": "F2", "developer_name": "App_Page", "label": "App page", "object": "Opportunity"},
                   {"id": "F3", "developer_name": "Override", "label": "Override", "object": "Opportunity"}],
    "org_default_pages": {"Opportunity": {"Large": "Org_Page"}},
    "apps": [{"id": "A1", "developer_name": "Sales", "label": "Sales", "overrides": [
        {"object": "Opportunity", "form_factor": "Large", "page": "App_Page", "record_type": None, "profile": None},
        {"object": "Opportunity", "form_factor": "Large", "page": "Override", "record_type": "Opportunity.Renewal", "profile": "Rep"}]}],
    "apex_classes": [{"id": "C1", "name": "QuoteService", "namespace": None}, {"id": "C2", "name": "Admin", "namespace": None}],
    "flows": [
        {"id": "FL1", "api_name": "Restricted", "label": "Restricted", "process_type": "Flow", "trigger_type": None, "active": True, "restricted": True},
        {"id": "FL2", "api_name": "Open", "label": "Open", "process_type": "Flow", "trigger_type": None, "active": True, "restricted": False},
        {"id": "FL3", "api_name": "OnSave", "label": "On save", "process_type": "AutoLaunchedFlow", "trigger_type": "RecordAfterSave", "active": True, "restricted": False},
        {"id": "FL4", "api_name": "Unknown", "label": "Unknown", "process_type": "Flow", "trigger_type": None, "active": True, "restricted": None},
    ],
    "setup_entity_access": {"PSP1": {"ApexClass": ["C1"]}, "PSX": {"FlowDefinition": ["FL1"], "ApexClass": ["C1"]}},
    "run_flows": {"PSP1": False, "PSX": False},
}
PS_ROWS = {p.salesforce_id: p for p in [_ps("PSP1", "X P1", profile="P1"), _ps("PSX", "Extras"), _ps("PSG_AGG", "Bundle", ps_type="Group")]}
USER = NS(salesforce_id="005A", profile_id="P1")


def _for(assignments, components=(), groups=None, ui=UI):
    return ua.for_user(ui, USER, {"P1": "Rep", "P2": "Other"}, PS_ROWS, assignments, components, groups or {})


def test_layouts_come_from_the_profile_and_record_type():
    out = _for([])
    assert [(l["record_type"], l["layout"]) for l in out["layouts"]] == [
        ("Master (no record type)", "Opp Layout"), ("Renewal", "Renewal Layout")]
    assert "profiles only" in out["layout_note"]


def test_page_precedence_and_what_was_considered():
    pages = {(p["app"], p["record_type"], p["form_factor"]): p for p in _for([])["pages"]}
    assert pages[("Sales", "Renewal", "Desktop")]["page"] == "Override"
    assert pages[("Sales", "Renewal", "Desktop")]["rule"] == "App, record type and profile assignment"
    assert pages[("Sales", "Master (no record type)", "Desktop")]["rule"] == "App default"
    assert pages[(None, "Renewal", "Desktop")]["rule"] == "Org default"
    assert pages[(None, "Renewal", "Phone")]["page"] == ua.SYSTEM_DEFAULT
    # The first rule that matches wins; later rules aren't consulted.
    assert pages[("Sales", "Renewal", "Desktop")]["considered"] == ["App, record type and profile assignment: Override"]
    # A different profile doesn't get the profile override.
    other = ua.for_user(UI, NS(salesforce_id="005B", profile_id="P2"), {"P1": "Rep", "P2": "Other"}, PS_ROWS, [], [], {})
    assert {(p["app"], p["record_type"], p["form_factor"]): p for p in other["pages"]}[("Sales", "Renewal", "Desktop")]["rule"] == "App default"
    assert ua.VISIBILITY_NOTE in _for([])["page_notes"]


def test_apex_and_flows_with_their_grant_paths():
    direct = [NS(permission_set_id="PSX", raw_data={})]
    out = _for(direct)
    assert {a["name"]: a["via"] for a in out["apex"]} == {
        "QuoteService": [["Profile: Rep"], ["Permission set: Extras"]]}
    flows = {f["api_name"]: f for f in out["flows"]}
    assert flows["Restricted"]["can_run"] is True and flows["Restricted"]["via"] == [["Permission set: Extras"]]
    assert flows["Open"]["can_run"] is False and flows["Open"]["why"] == "No access to this flow, no Run Flows permission and not a Flow User."
    assert flows["OnSave"]["can_run"] is None and "Starts on its own" in flows["OnSave"]["why"]
    assert "wasn't read" in flows["Unknown"]["why"]
    # Without the set, the restricted flow isn't available even with Run Flows.
    ui = {**UI, "run_flows": {"PSP1": True}}
    flows = {f["api_name"]: f for f in _for([], ui=ui)["flows"]}
    assert flows["Restricted"]["can_run"] is False and flows["Open"]["can_run"] is True


def test_group_components_are_paths_and_muting_sets_are_not():
    comps = [NS(permission_set_group_id="0PG1", permission_set_id="PSX"),
             NS(permission_set_group_id="0PG1", permission_set_id="MUTE")]
    rows = {**PS_ROWS, "MUTE": _ps("MUTE", "Mute", ps_type="Muting")}
    out = ua.for_user(UI, USER, {"P1": "Rep"}, rows, [NS(permission_set_id="0PG1", raw_data={})], comps, {"0PG1": "Bundle"})
    assert ["Permission set group: Bundle", "Permission set: Extras"] in {a["name"]: a["via"] for a in out["apex"]}["QuoteService"]
    # The Salesforce shape: the group's aggregate set, with PermissionSetGroupId on the assignment.
    out = ua.for_user(UI, USER, {"P1": "Rep"}, rows, [NS(permission_set_id="PSG_AGG", raw_data={"PermissionSetGroupId": "0PG1"})],
                      comps, {"0PG1": "Bundle"})
    assert {f["api_name"]: f for f in out["flows"]}["Restricted"]["can_run"] is True


def test_not_read_yet():
    assert ua.for_user(None, USER, {}, {}, [], [], {})["available"] is False


@pytest.mark.asyncio
async def test_lumenvale(client, async_db_session, lumenvale):  # noqa: F811
    org_id, cookie = lumenvale
    r = await client.get(f"/orgs/{org_id}/users/{JUN}/pages-and-automation", cookies=cookie)
    d = r.json()
    assert r.status_code == 200 and d["profile"] == "Sales Manager"
    layouts = {(l["object"], l["record_type"]): l["layout"] for l in d["layouts"]}
    assert layouts[("Opportunity", "New Business")] == "Opportunity - Sales Manager Layout"
    assert layouts[("Case", "Billing Inquiry")] == "Case Layout"
    page = next(p for p in d["pages"] if p["app"] == "Lumenvale Sales" and p["record_type"] == "Renewal" and p["form_factor"] == "Desktop")
    assert (page["page"], page["rule"]) == ("Renewal, Sales Manager", "App, record type and profile assignment")
    flows = {f["api_name"]: f for f in d["flows"]}
    assert flows["Discount_Approval_Request"]["via"] == [["Permission set group: Sales Manager Bundle", "Permission set: Discount Approvals"]]
    assert flows["Refund_Exception"]["can_run"] is False
    assert len(d["apex"]) == 12 and d["run_flows"] is True

    g = (await client.get(f"/orgs/{org_id}/graph/user/{JUN}", params={"include": "pages_and_automation"}, cookies=cookie)).json()
    types = {n["type"] for n in g["nodes"]}
    assert {"apex_class", "flow", "layout"} <= types and g["metadata"]["pagesAndAutomation"]["available"]
    ids = {n["id"] for n in g["nodes"]}
    assert all(e["source"] in ids and e["target"] in ids for e in g["edges"])
    plain = (await client.get(f"/orgs/{org_id}/graph/user/{JUN}", cookies=cookie)).json()
    assert not {"apex_class", "flow", "layout", "lightning_page"} & {n["type"] for n in plain["nodes"]}

    org = await async_db_session.get(Organization, org_id)
    privacy_mode.set_privacy(org, privacy_mode.METADATA_ONLY, False, "test")
    await async_db_session.commit()
    assert (await client.get(f"/orgs/{org_id}/users/{JUN}/pages-and-automation", cookies=cookie)).status_code == 409


def test_flow_user_setting_and_record_type_visibility():
    ui = {**UI, "flow_users": ["005A"],
          "record_type_visibility": {"P1": {"Opportunity": {"available": [], "default": None}}}}
    out = _for([], ui=ui)
    assert {f["api_name"]: f for f in out["flows"]}["Open"]["can_run"] is True
    assert ["Flow User (user setting)"] in out["run_flows_via"]
    renewal = next(l for l in out["layouts"] if l["record_type"] == "Renewal")
    assert renewal["available"] is False and renewal["default"] is False
    # Pages only list record types the profile can use, when that's known.
    assert {p["record_type"] for p in out["pages"]} == {"Master (no record type)"}


def test_share_reasons():
    from app.services.share_sources import describe
    assert describe("Recruiter__c", {"Recruiter__c": "Recruiter"}) == {
        "kind": "apex", "label": "Granted by Apex (sharing reason: Recruiter)", "reason": "Recruiter"}
    assert describe("Manual")["kind"] == "manual_or_apex"
    assert describe("Rule")["label"] == "Sharing rule"


@pytest.mark.asyncio
async def test_live_read_degrades_part_by_part():
    """No network: a fake client answers some queries and refuses others."""
    class Fake:
        async def query_all(self, q):
            if "FROM RecordType" in q:
                return [{"Id": "012A", "SobjectType": "Opportunity", "DeveloperName": "Renewal", "Name": "Renewal", "IsActive": True}]
            if "FROM Profile" in q:
                return [{"Id": "00eA", "Name": "Rep"}]
            if "FROM ApexClass" in q:
                return [{"Id": "01pA", "Name": "QuoteService", "NamespacePrefix": None}]
            if "FlowDefinitionView" in q:
                return [{"DurableId": "300A", "ApiName": "Restricted", "Label": "R", "ProcessType": "Flow",
                         "TriggerType": None, "IsActive": True, "ActiveVersionId": "301A"}]
            if "SetupEntityAccess" in q:
                return [{"ParentId": "0PSA", "SetupEntityId": "300A", "SetupEntityType": "FlowDefinition"}]
            raise RuntimeError("INVALID_FIELD")  # PermissionsRunFlow, Flow User
        async def query_tooling(self, q):
            if "FROM Profile WHERE" in q:
                return [{"Metadata": {"recordTypeVisibilities": [{"recordType": "Opportunity.Renewal", "visible": True, "default": True}]}}]
            if "FROM Flow WHERE" in q:
                return [{"Metadata": {"isAdditionalPermissionRequiredToRun": True}}]
            if "FROM FlexiPage" in q:
                return [{"Id": "0M0A00000000001", "DeveloperName": "Opp_Page", "MasterLabel": "Opp", "EntityDefinitionId": "Opportunity"}]
            if "FROM ProfileLayout" in q:
                return [{"ProfileId": "00eA", "LayoutId": "00hA", "RecordTypeId": "012A", "TableEnumOrId": "Opportunity"}]
            raise RuntimeError("not available")
        async def describe_object(self, name):
            if name == "Opportunity":
                return {"actionOverrides": [{"name": "View", "pageId": "0M0A00000000001AAA", "formFactor": "LARGE"}]}
            if name == "AccountShare":
                return {"fields": [{"name": "RowCause", "picklistValues": [{"value": "Recruiter__c", "label": "Recruiter"}]}]}
            raise RuntimeError("no describe")

    out = await ua.collect_live(Fake())
    assert out["record_type_visibility"] == {"00eA": {"Opportunity": {"available": ["Opportunity.Renewal"], "default": "Opportunity.Renewal"}}}
    assert out["flows"][0]["restricted"] is True and out["setup_entity_access"] == {"0PSA": {"FlowDefinition": ["300A"]}}
    assert out["org_default_pages"] == {"Opportunity": {"Large": "Opp_Page"}}
    assert out["share_reasons"] == {"Account": {"Recruiter__c": "Recruiter"}}
    assert out["run_flows"] == {} and "flow_users" not in out
    assert "The Run Flows permission couldn't be read." in out["notes"]
    assert "Page layouts couldn't be read." in out["notes"] and any("UNVERIFIED" in c for c in out["page_caveats"])


@pytest.mark.asyncio
async def test_record_access_labels_apex_shares(async_db_session):
    """An Apex sharing reason is shown as granted by Apex; Manual can't be split."""
    from datetime import datetime, timezone

    from app.domain.models import AccountShareSnapshot, Organization as Org, SyncJob, SyncStatus, UserSnapshot
    from app.services.record_access import RecordAccessService

    db = async_db_session
    org = Org(name="Acme", is_demo=False)
    db.add(org)
    await db.flush()
    now = datetime.now(timezone.utc)
    db.add_all([
        UserSnapshot(organization_id=org.id, salesforce_id="005rep", username="rep@x", name="Rep", is_active=True),
        *[AccountShareSnapshot(organization_id=org.id, salesforce_id=f"00r{i}", account_id=f"001{i}", user_or_group_id="005rep",
                               row_cause=rc, account_access_level="Read", opportunity_access_level="None",
                               case_access_level="None", snapshot_date=now)
          for i, rc in enumerate(["Manual", "Recruiter__c", "Rule"])],
        SyncJob(organization_id=org.id, status=SyncStatus.COMPLETED, completed_at=now,
                sync_metadata={"ui_access": {"share_reasons": {"Account": {"Recruiter__c": "Recruiter"}}}}),
    ])
    await db.commit()
    out = await RecordAccessService(db).get_user_record_access(org.id, "005rep")
    assert [s["source"] for s in out["apex_shares"]] == ["Granted by Apex (sharing reason: Recruiter)"]
    assert [s["source_kind"] for s in out["manual_shares"]] == ["manual_or_apex"]
    assert out["summary"]["total_apex_shares"] == 1 and "can't be told apart" in out["share_notes"]["manual"]


@pytest.mark.asyncio
async def test_lumenvale_runbook_numbers_hold_with_the_item_1_part(async_db_session, lumenvale):  # noqa: F811
    """The new "Discount Approvals" set (in the Sales Manager Bundle only) changes nothing:
    Health 41, 18 findings, $183,180; License Fit $116,220."""
    from sqlalchemy import select
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
    assert (await LicenseFitService(db, org_id).run(actor_email="test")).total_annual_savings_cents == 11_622_000
