"""Custom metadata records, opt-in per type (item 11 part c2, parity #7):
types listed at every sync, records read only for types an admin turned on,
removed when turned off."""
import io

import pytest
from openpyxl import load_workbook
from sqlalchemy import select

from app.domain.models import AuditLog, OrgAccessGrant, OrgUser, SyncJob, SyncStatus
from app.ingestion.orchestrator import SyncOrchestrator
from app.services import custom_metadata as cmdt
from tests.test_demo_orgs import _cookie, client  # noqa: F401
from tests.test_demo_path import lumenvale  # noqa: F401
from tests.test_documentation_export import _rows

DISCOUNT = "Discount_Threshold__mdt"
ENDPOINTS = "Integration_Endpoint__mdt"


async def _resync(db, org_id):
    job = SyncJob(organization_id=org_id, status=SyncStatus.PENDING)
    db.add(job)
    await db.commit()
    await SyncOrchestrator(db).run_sync(org_id, job.id)


async def _workbook(client, org_id, cookie):  # noqa: F811
    return load_workbook(io.BytesIO((await client.get(f"/orgs/{org_id}/documentation.xlsx", cookies=cookie)).content))


@pytest.mark.asyncio
async def test_off_by_default_then_on_for_one_type_then_off(client, async_db_session, lumenvale):  # noqa: F811
    db = async_db_session
    org_id, cookie = lumenvale
    url = f"/orgs/{org_id}/custom-metadata"

    listed = (await client.get(url, cookies=cookie)).json()
    assert listed["summary"]["types"] == 4 and listed["summary"]["enabled"] == 0
    assert all(not t["enabled"] and t["records"] is None for t in listed["items"])
    wb = await _workbook(client, org_id, cookie)
    _, types = _rows(wb["Custom Metadata Types"])
    assert len(types) == 4 and all(t["Records"].startswith("Not read") for t in types)
    assert _rows(wb["Custom Metadata Records"])[1] == [{"Type": "No custom metadata records: no type is turned on, "
                                                                "or none was read yet.", "Record": None, "Label": None,
                                                        "Namespace": None, "Field": None, "Value": None}]

    analyst = (await db.execute(select(OrgUser).where(OrgUser.email == "analyst@firm.test"))).scalar_one()
    db.add(OrgAccessGrant(org_user_id=analyst.id, organization_id=org_id))
    await db.commit()
    assert (await client.get(url, cookies=_cookie(analyst))).status_code == 200  # can see which are on
    assert (await client.put(url, json={"types": [DISCOUNT]}, cookies=_cookie(analyst))).status_code == 403
    assert (await client.put(url, json={"types": ["Account"]}, cookies=cookie)).status_code == 400

    r = await client.put(url, json={"types": [DISCOUNT], "note": "SOW 2026-14"}, cookies=cookie)
    assert r.status_code == 200 and r.json()["types"] == [DISCOUNT] and r.json()["changed_by"] == "admin@firm.test"
    log = (await db.execute(select(AuditLog).where(AuditLog.resource_type == "custom_metadata_records"))).scalars().all()
    assert len(log) == 1 and log[0].context_data["turned_on"] == [DISCOUNT]
    # Read from the next sync, not before.
    first = (await client.get(url, cookies=cookie)).json()["items"][0]
    assert (first["name"], first["enabled"], first["records"]) == (DISCOUNT, True, None)

    await _resync(db, org_id)
    on = (await client.get(url, params={"enabled": "true"}, cookies=cookie)).json()
    assert [(t["name"], t["records"]) for t in on["items"]] == [(DISCOUNT, 4)]
    wb = await _workbook(client, org_id, cookie)
    _, records = _rows(wb["Custom Metadata Records"])
    assert {r["Type"] for r in records} == {DISCOUNT} and len(records) == 4 * 3
    strategic = {r["Field"]: r["Value"] for r in records if r["Record"] == "Strategic"}
    assert strategic == {"Max_Percent__c": 40, "Approver_Role__c": "VP Sales", "Active__c": "Yes"}
    # A type that's off is never stored, so its values can't leak into the export.
    jobs = (await db.execute(select(SyncJob).where(SyncJob.organization_id == org_id))).scalars().all()
    assert not any(ENDPOINTS in ((j.sync_metadata or {}).get("org_docs") or {}).get("custom_metadata_records", {})
                   for j in jobs)

    # Off again: the stored records go now, not at the next sync.
    r = await client.put(url, json={"types": []}, cookies=cookie)
    assert r.json()["records_removed_for"] >= 1
    await db.commit()
    for j in (await db.execute(select(SyncJob).where(SyncJob.organization_id == org_id))).scalars().all():
        await db.refresh(j)
        assert not ((j.sync_metadata or {}).get("org_docs") or {}).get("custom_metadata_records")
    wb = await _workbook(client, org_id, cookie)
    assert len(_rows(wb["Custom Metadata Records"])[1]) == 1  # the "none" line


@pytest.mark.asyncio
async def test_types_list_pages_and_searches(client, lumenvale):  # noqa: F811
    org_id, cookie = lumenvale
    p = (await client.get(f"/orgs/{org_id}/custom-metadata", params={"page": 1, "q": "region"}, cookies=cookie)).json()
    assert [t["name"] for t in p["items"]] == ["Region_Mapping__mdt"] and p["total"] == 1


@pytest.mark.asyncio
async def test_live_read_lists_types_and_reads_only_the_ones_turned_on():
    queries = []

    class Fake:
        async def list_all_sobjects(self):
            return [{"name": "Account", "label": "Account"}, {"name": DISCOUNT, "label": "Discount Threshold"},
                    {"name": ENDPOINTS, "label": "Integration Endpoint"}]

        async def describe_object(self, name):
            queries.append(f"describe {name}")
            return {"fields": [{"name": "Id"}, {"name": "DeveloperName"}, {"name": "MasterLabel"}, {"name": "Label"},
                               {"name": "QualifiedApiName"}, {"name": "Max_Percent__c"}]}

        async def query_all(self, q):
            queries.append(q)
            return [{"DeveloperName": "Standard", "MasterLabel": "Standard deals", "NamespacePrefix": None,
                     "Max_Percent__c": 20}]

    out = await cmdt.collect_live(Fake(), {DISCOUNT, "Gone__mdt"})
    assert [t["name"] for t in out["types"]] == [DISCOUNT, ENDPOINTS]
    assert queries == [f"describe {DISCOUNT}",
                       f"SELECT DeveloperName, MasterLabel, NamespacePrefix, Max_Percent__c FROM {DISCOUNT}"]
    assert out["records"] == {DISCOUNT: {"fields": ["Max_Percent__c"], "records": [
        {"name": "Standard", "label": "Standard deals", "namespace": None, "values": {"Max_Percent__c": 20}}]}}
