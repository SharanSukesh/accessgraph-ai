"""Roadmap item 8: field metadata from the describe, on the Schema pages."""
import httpx
import pytest

from app.domain.models import Organization
from app.ingestion.demo_orgs import load_fixture
from app.salesforce.client import SalesforceAPIClient
from app.services import privacy_mode
from app.services import schema_metadata as sm
from tests.test_demo_orgs import client  # noqa: F401
from tests.test_demo_path import lumenvale  # noqa: F401


def test_encryption_formula_and_master_detail_from_the_describe():
    shield = sm.normalize_field({"name": "SSN__c", "type": "string", "encrypted": True, "length": 20})
    classic = sm.normalize_field({"name": "Acct__c", "type": "encryptedstring", "length": 32})
    plain = sm.normalize_field({"name": "Notes__c", "type": "string", "encrypted": False})
    assert (shield["encryption"], classic["encryption"], "encryption" in plain) == ("shield", "classic", False)
    formula = sm.normalize_field({"name": "F__c", "type": "currency", "calculated": True, "calculatedFormula": "A__c * 2"})
    assert formula["formula"] and formula["calculatedFormula"] == "A__c * 2"
    md = sm.normalize_field({"name": "Inv__c", "type": "reference", "referenceTo": ["Invoice__c"], "relationshipOrder": 0,
                             "nillable": False, "createable": True})
    lookup = sm.normalize_field({"name": "AccountId", "type": "reference", "referenceTo": ["Account"], "nillable": True})
    assert (md["relationship"], md["required"]) == ("master_detail", True)
    assert (lookup["relationship"], lookup["required"]) == ("lookup", False)
    # Not nillable but defaulted (OwnerId) or not createable (Id): not required of the user.
    assert not sm.normalize_field({"name": "OwnerId", "type": "reference", "nillable": False, "defaultedOnCreate": True})["required"]
    assert not sm.normalize_field({"name": "Id", "type": "id", "nillable": False, "createable": False})["required"]


def test_type_labels():
    f = lambda **kw: sm.normalize_field({"name": "X__c", **kw})  # noqa: E731
    assert sm.type_label(f(type="string", length=80)) == "Text(80)"
    assert sm.type_label(f(type="encryptedstring", length=32)) == "Text (Encrypted)(32)"
    assert sm.type_label(f(type="currency", calculated=True)) == "Formula (Currency)"
    assert sm.type_label(f(type="reference", referenceTo=["Invoice__c"], relationshipOrder=0)) == "Master-Detail(Invoice__c)"
    assert sm.type_label(f(type="reference", referenceTo=["Group", "User"])) == "Lookup(Group, User)"
    assert sm.type_label(f(type="somethingnew")) == "somethingnew"
    assert sm.field_payload(None) == {"dataType": None, "typeLabel": None, "isEncrypted": None, "encryption": None}


def test_objects_come_from_object_and_field_permissions():
    data = {"object_permissions": [{"SobjectType": "Account"}],
            "field_permissions": [{"SobjectType": "Case", "Field": "Case.Status"}, {"Field": "Lead.Phone"}]}
    assert sm.objects_in(data) == ["Account", "Case", "Lead"]


@pytest.mark.asyncio
async def test_live_collection_lists_what_failed_and_caps_the_count(monkeypatch):
    queries = []

    class Client:
        async def describe_object(self, name):
            if name in ("Broken__c", "Hidden__c"):
                raise httpx.HTTPStatusError("403", request=None, response=None)
            return {"name": name, "fields": [{"name": "Id", "type": "id"}]}

        async def query_tooling(self, soql):
            queries.append(soql)
            if "'Hidden__c'" in soql:
                return [{"QualifiedApiName": "Secret__c", "Label": "Secret", "DataType": "Text(40)", "Length": 40}]
            if "'A'" in soql:  # a field the describe left out
                return [{"QualifiedApiName": "Id", "DataType": "Lookup()"},
                        {"QualifiedApiName": "Pay__c", "Label": "Pay", "DataType": "Currency(16, 2)", "Precision": 18, "Scale": 2}]
            return []

    monkeypatch.setattr(sm, "MAX_OBJECTS", 4)
    out = await sm.collect_live(Client(), ["Z", "Broken__c", "A", "C", "A", "Hidden__c"])
    assert sorted(out["objects"]) == ["A", "C", "Hidden__c"] and out["failed"] == ["Broken__c"] and out["skipped"] == ["Z"]
    # One equality-filtered Tooling query per object read.
    assert len(queries) == 4 and all(q.endswith("WHERE EntityDefinition.QualifiedApiName = '%s'" % q.split("'")[1]) for q in queries)
    a = out["objects"]["A"]["fields"]
    assert a["Id"]["type"] == "id"  # the describe wins where it has the field
    assert sm.field_payload(a["Pay__c"]) == {"dataType": None, "typeLabel": "Currency(16, 2)", "isEncrypted": None,
                                              "encryption": None}
    assert out["objects"]["Hidden__c"]["describe_failed"]
    assert out["notes"] == [
        "1 objects weren't read: at most 4 per sync.",
        "1 objects couldn't be read: Broken__c.",
        "1 objects couldn't be described (Hidden__c): their fields come from FieldDefinition, without the object's "
        "label, encryption, formulas or picklist values.",
        "1 fields aren't visible to the integration user (field-level security), so the describe left them out: "
        "their type comes from FieldDefinition; encryption, formula text and picklist values aren't known for them.",
    ]


def test_field_definition_rows():
    md = sm.normalize_field_definition({"QualifiedApiName": "Inv__c", "DataType": "Master-Detail(Invoice)",
                                        "ReferenceTo": {"referenceTo": ["Invoice__c"]}, "RelationshipName": "Inv"})
    assert (md["referenceTo"], md["relationship"], md["custom"]) == (["Invoice__c"], "master_detail", True)
    lookup = sm.normalize_field_definition({"QualifiedApiName": "AccountId", "DataType": "Lookup(Account)",
                                            "ReferenceTo": ["Account"]})
    assert lookup["relationship"] == "lookup" and sm.type_label(lookup) == "Lookup(Account)"
    assert sm.field_details(lookup)["fromFieldDefinition"] and "required" not in sm.field_details(lookup)


@pytest.mark.asyncio
async def test_describe_is_a_read_at_the_negotiated_version(monkeypatch):
    seen = []

    def handler(request):
        seen.append((request.method, request.url.path))
        if request.url.path == "/services/data/":
            return httpx.Response(200, json=[{"version": "67.0"}, {"version": "68.0"}])
        return httpx.Response(200, json={"name": "Account", "fields": []})

    real = httpx.AsyncClient
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kw: real(transport=httpx.MockTransport(handler), **kw))
    from app.salesforce import api_version
    api_version._cache.clear()
    c = SalesforceAPIClient(instance_url="https://describe.example", access_token="t")
    assert (await c.describe_object("Account"))["name"] == "Account"
    assert seen == [("GET", "/services/data/"), ("GET", "/services/data/v68.0/sobjects/Account/describe")]


def test_lumenvale_part_has_the_planted_fields():
    live = load_fixture("synthetic_mid_market")["demo_live"]
    objects = sm.from_describes(live["schema"], live["field_definitions"])
    assert len(objects) == 29
    md = sorted(f"{o}.{n}" for o, d in objects.items() for n, f in d["fields"].items() if f.get("relationship") == "master_detail")
    assert md == ["Compensation__c.Employee__c", "Payment__c.Invoice__c"]
    enc = {f"{o}.{n}": f["encryption"] for o, d in objects.items() for n, f in d["fields"].items() if f.get("encryption")}
    assert enc == {"Compensation__c.Salary_Band__c": "shield", "Employee__c.National_ID__c": "shield",
                   "Treasury_Account__c.Account_Number__c": "classic"}
    formulas = sorted(f"{o}.{n}" for o, d in objects.items() for n, f in d["fields"].items() if f["formula"])
    assert formulas == ["Employee__c.Tenure_Years__c", "Invoice__c.Days_Overdue__c", "Opportunity.Discounted_Amount__c"]
    # Hidden from the integration user: in FieldDefinition, not the describe.
    comp = objects["Compensation__c"]
    assert comp["fields_from_field_definition"] == 2
    assert {n for n, f in comp["fields"].items() if f.get("source") == "field_definition"} == {"Bonus__c", "Equity_Grant__c"}
    # Detail objects have no owner.
    assert "OwnerId" not in objects["Payment__c"]["fields"] and "OwnerId" in objects["Invoice__c"]["fields"]


@pytest.mark.asyncio
async def test_schema_pages_on_lumenvale(client, async_db_session, lumenvale):  # noqa: F811
    org_id, cookie = lumenvale
    page = (await client.get(f"/orgs/{org_id}/fields", params={"object_type": "Employee__c"}, cookies=cookie)).json()
    by_name = {f["apiName"].split(".")[-1]: f for f in page["fields"]}
    assert by_name["National_ID__c"]["isEncrypted"] is True and by_name["National_ID__c"]["encryption"] == "shield"
    assert by_name["Department__c"]["dataType"] == "picklist" and by_name["Department__c"]["isEncrypted"] is False

    f = (await client.get(f"/orgs/{org_id}/fields/Treasury_Account__c.Account_Number__c", cookies=cookie)).json()
    assert (f["typeLabel"], f["encryption"], f["attributes"]["length"]) == ("Text (Encrypted)(32)", "classic", 32)
    # A formula field has no field permissions in the fixture; its access comes from the object.
    f = (await client.get(f"/orgs/{org_id}/fields/Invoice__c.Days_Overdue__c", cookies=cookie)).json()
    assert f["attributes"]["calculatedFormula"].startswith("IF(ISBLANK(Due_Date__c)") and f["inheritedFromObject"]

    o = (await client.get(f"/orgs/{org_id}/objects/Invoice__c", cookies=cookie)).json()
    assert o["schemaSynced"] and o["label"] == "Invoice" and len(o["fields"]) == 11
    assert o["relationships"]["children"] == [{"object": "Payment__c", "field": "Invoice__c", "relationshipName": "Payments__r",
                                               "kind": "master_detail", "cascadeDelete": True}]
    assert [p["to"] for p in o["relationships"]["parents"]] == [["Account"], ["Group", "User"]]
    comp = (await client.get(f"/orgs/{org_id}/objects/Compensation__c", cookies=cookie)).json()
    assert (comp["fieldsFromFieldDefinition"], comp["describeFailed"]) == (2, False)
    bonus = (await client.get(f"/orgs/{org_id}/fields/Compensation__c.Bonus__c", cookies=cookie)).json()
    assert (bonus["typeLabel"], bonus["isEncrypted"], bonus["attributes"]["fromFieldDefinition"]) == ("Currency(16, 2)", None, True)
    assert any("2 fields aren't visible to the integration user" in n for n in page["schemaNotes"])
    objects = {x["name"]: x for x in (await client.get(f"/orgs/{org_id}/objects", cookies=cookie)).json()}
    assert objects["Benefits_Enrollment__c"]["label"] == "Benefits Enrollment" and objects["Invoice__c"]["fieldCount"] == 11

    # Configuration: the same at Metadata only.
    org = await async_db_session.get(Organization, org_id)
    privacy_mode.set_privacy(org, privacy_mode.METADATA_ONLY, False, "test")
    await async_db_session.commit()
    o = (await client.get(f"/orgs/{org_id}/objects/Invoice__c", cookies=cookie)).json()
    assert o["schemaSynced"] and len(o["fields"]) == 11


@pytest.mark.asyncio
async def test_without_a_synced_describe_everything_stays_null(client, async_db_session, lumenvale):  # noqa: F811
    from sqlalchemy import select
    from sqlalchemy.orm import attributes
    from app.domain.models import SyncJob
    org_id, cookie = lumenvale
    for job in (await async_db_session.execute(select(SyncJob).where(SyncJob.organization_id == org_id))).scalars():
        job.sync_metadata = {k: v for k, v in (job.sync_metadata or {}).items() if k != "schema"}
        attributes.flag_modified(job, "sync_metadata")
    await async_db_session.commit()
    f = (await client.get(f"/orgs/{org_id}/fields/Employee__c.National_ID__c", cookies=cookie)).json()
    assert (f["dataType"], f["isEncrypted"], f["attributes"]) == (None, None, None)
    o = (await client.get(f"/orgs/{org_id}/objects/Invoice__c", cookies=cookie)).json()
    assert (o["schemaSynced"], o["fields"], o["relationships"]) == (False, None, None)
    objects = {x["name"]: x for x in (await client.get(f"/orgs/{org_id}/objects", cookies=cookie)).json()}
    assert objects["Invoice__c"]["fieldCount"] is None
