"""Cleanup impact (item 13, parity #21-22): never "safe to delete"; what
references a field, where Newton looked and couldn't, and its population."""
import io

import pytest
from openpyxl import load_workbook

from app.services import org_docs
from app.services.cleanup_impact import NOT_CHECKABLE, ImpactIndex
from app.services.data_quality import DataQualityService
from tests.test_demo_orgs import client  # noqa: F401
from tests.test_demo_path import lumenvale  # noqa: F401
from tests.test_documentation_export import _rows

SCHEMA = {"objects": {
    "Account": {"fields": {"Name": {"label": "Name"}, "Old_Score__c": {"label": "Old Score"},
                           "Notes__c": {"label": "Notes"}, "Gone__c": {"label": "Gone"}}},
    "Invoice__c": {"fields": {"Account__c": {"referenceTo": ["Account"]},
                              "Score_Copy__c": {"calculatedFormula": "Account__r.Old_Score__c * 2"}}},
}}
DOCS = {"validation_rules": [{"object": "Account", "name": "Notes_Rule", "active": False, "formula": "ISBLANK(Notes__c)"}],
        "dependencies": [], "apex_field_tokens": {"ScoreService": ["Old_Score__c"]}}
UI = {"flows": [], "flow_details": {}, "layouts": [], "layout_fields": {}}
POP = {"Account": {"populated": {"Old_Score__c": 0, "Notes__c": 0, "Gone__c": 0}, "records": 1000, "estimated": False}}


def test_verdicts_from_each_kind_of_reference():
    idx = ImpactIndex(SCHEMA, UI, DOCS, POP)
    old = idx.impact("Account", "Old_Score__c")
    kinds = {r["kind"] for r in old["references"]}
    assert kinds == {"Formula field", "Apex class"} and old["verdict"]["level"] == "in_use"
    # Another object's formula through a relationship path, and an Apex class by name.
    assert {r["name"] for r in old["references"]} == {"Invoice__c.Score_Copy__c", "ScoreService"}
    notes = idx.impact("Account", "Notes__c")
    assert notes["verdict"]["level"] == "inactive_only" and "inactive validation rules" in notes["verdict"]["text"]
    gone = idx.impact("Account", "Gone__c")
    assert gone["verdict"]["level"] == "candidate" and "no value on any of 1,000 records" in gone["verdict"]["text"]
    assert idx.impact("Account", "Name")["verdict"]["level"] == "standard"
    assert all("safe to delete" not in i["verdict"]["text"].lower()
               for i in (old, notes, gone)) and gone["notCheckable"] == NOT_CHECKABLE


def test_confidence_and_population_caveats():
    full = ImpactIndex(SCHEMA, UI, DOCS, POP).impact("Account", "Gone__c")["verdict"]
    assert full["confidence"] == "High"
    truncated = ImpactIndex(SCHEMA, UI, {**DOCS, "dependencies_truncated": True}, POP).impact("Account", "Gone__c")
    assert truncated["verdict"]["confidence"] != "High"
    assert any("2,000-row limit" in s["note"] for s in truncated["sources"])
    no_index = ImpactIndex(SCHEMA, None, {k: v for k, v in DOCS.items() if k != "dependencies"}, POP)
    assert no_index.impact("Account", "Gone__c")["verdict"]["confidence"] == "Low"
    unmeasured = ImpactIndex(SCHEMA, UI, DOCS, {}).impact("Account", "Gone__c")["verdict"]
    assert unmeasured["level"] == "unmeasured" and "run Data Quality" in unmeasured["text"]
    sampled = ImpactIndex(SCHEMA, UI, DOCS, {"Account": {**POP["Account"], "estimated": True}}).impact("Account", "Gone__c")
    assert sampled["verdict"]["level"] == "unmeasured" and "estimate" in sampled["verdict"]["text"]


@pytest.mark.asyncio
async def test_live_reads_keep_field_names_never_code():
    queries = []
    body = "public class ScoreService { /* Legacy_Thing__c */ void f(){ a.Old_Score__c = 1; } // Fax_Ext__c\n}"

    class Client:
        async def query_tooling(self, q):
            queries.append(q)
            if "FROM ApexClass" in q:
                return [{"Id": "01p1", "Name": "ScoreService", "Body": body, "Status": "Active"}]
            if "FROM CustomField" in q:
                return [{"Id": "00N000000000001AAA", "DeveloperName": "Old_Score", "NamespacePrefix": None,
                         "TableEnumOrId": "Account"}]
            if "FROM MetadataComponentDependency" in q:
                return [{"MetadataComponentType": "ValidationRule", "MetadataComponentName": "Old_Score_Range",
                         "MetadataComponentId": "03d1", "RefMetadataComponentId": "00N000000000001",
                         "RefMetadataComponentName": "Old_Score"}]
            raise RuntimeError("not allowed")

        async def query_all(self, q):
            queries.append(q)
            raise RuntimeError("not allowed")

        async def describe_layouts(self, name):
            return {}

        async def get_code_coverage(self):
            return {"items": []}

    out = await org_docs.collect_live(Client(), [])
    assert out["apex_field_tokens"] == {"ScoreService": ["Old_Score__c"]}  # names in comments don't count
    assert "a.Old_Score__c = 1" not in repr(out)
    assert out["custom_fields"] == {"00N000000000001": "Account.Old_Score__c"}
    assert out["dependencies"][0]["field"] == "Account.Old_Score__c" and out["dependencies_truncated"] is False
    assert all(q.lstrip().upper().startswith("SELECT") for q in queries)


@pytest.mark.asyncio
async def test_lumenvale_candidates(client, async_db_session, lumenvale):  # noqa: F811
    org_id, cookie = lumenvale
    before = (await client.get(f"/orgs/{org_id}/fields/Account.Legacy_Region__c/impact", cookies=cookie)).json()
    assert before["verdict"]["level"] == "unmeasured"  # no Data Quality run yet
    await DataQualityService(async_db_session, org_id).run(actor_email="test")

    legacy = (await client.get(f"/orgs/{org_id}/fields/Account.Legacy_Region__c/impact", cookies=cookie)).json()
    assert (legacy["verdict"]["level"], legacy["verdict"]["confidence"]) == ("candidate", "High")
    assert legacy["references"] == [] and legacy["population"]["populated"] == 0 and legacy["population"]["records"] == 5200

    old = (await client.get(f"/orgs/{org_id}/fields/Account.Old_Score__c/impact", params={"page": 1},
                            cookies=cookie)).json()
    assert old["impact"]["verdict"]["level"] == "in_use" and old["total"] == 1
    rule = old["items"][0]
    assert (rule["kind"], rule["name"], rule["active"]) == ("Validation rule", "Account.Old_Score_Range", True)
    assert rule["foundBy"] == ["Dependency index", "Validation rule"]  # one place, found twice

    fax = (await client.get(f"/orgs/{org_id}/fields/Account.Fax_Ext__c/impact", cookies=cookie)).json()
    assert fax["verdict"]["level"] == "inactive_only"
    assert [(r["kind"], r["name"], r["active"]) for r in fax["references"]] == [("Flow", "Legacy Fax Sync", False)]
    assert fax["population"]["populated"] == 3120

    url = f"/orgs/{org_id}/cleanup-candidates"
    page = (await client.get(url, params={"page": 1}, cookies=cookie)).json()
    assert page["summary"]["candidate"] == 3 and page["summary"]["inactive_only"] >= 1
    assert [f"{r['object']}.{r['field']}" for r in page["items"][:3]] == [
        "Account.DUNS_Override__c", "Account.Legacy_Region__c", "Account.Secondary_SIC__c"]
    strong = (await client.get(url, params={"page": 1, "level": "candidate"}, cookies=cookie)).json()
    assert strong["total"] == 3 and all(r["populated"] == 0 for r in strong["items"])
    every = (await client.get(url, cookies=cookie)).json()  # the export: every custom field
    assert every["total"] == page["total"] == sum(v for k, v in page["summary"].items() if k != "standard")
    found = (await client.get(url, params={"page": 1, "q": "fax"}, cookies=cookie)).json()
    assert [r["field"] for r in found["items"]] == ["Fax_Ext__c"]

    wb = load_workbook(io.BytesIO((await client.get(f"/orgs/{org_id}/documentation.xlsx", cookies=cookie)).content))
    _, rows = _rows(wb["Cleanup Candidates"])
    by = {(r["Object"], r["Field"]): r for r in rows if r["Field"]}
    assert by[("Account", "Old_Score__c")]["Where"] == "Validation rule: Account.Old_Score_Range"
    assert by[("Account", "Fax_Ext__c")]["Where"] == "Flow: Legacy Fax Sync (inactive)"
    assert by[("Account", "Legacy_Region__c")]["Verdict"] == "Strong cleanup candidate"
