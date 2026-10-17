"""Owned-record counts the sync can't see are unknown (null), not zero."""
from datetime import datetime, timezone

import pytest

from app.domain.models import AccountShareSnapshot, Organization, UserSnapshot
from tests.test_demo_orgs import _cookie, _users, client  # noqa: F401  (fixture)


@pytest.mark.asyncio
async def test_unsynced_objects_report_null_owned_records(client, async_db_session):  # noqa: F811
    admin, _ = await _users(async_db_session)
    org = Organization(name="Acme", is_demo=False)
    async_db_session.add(org)
    await async_db_session.flush()
    async_db_session.add_all([
        UserSnapshot(organization_id=org.id, salesforce_id="005rep", username="rep@x", name="Rep", is_active=True),
        AccountShareSnapshot(organization_id=org.id, salesforce_id="00rS1", account_id="001a",
                             user_or_group_id="005rep", row_cause="Owner", account_access_level="All",
                             opportunity_access_level="Edit", case_access_level="Edit",
                             snapshot_date=datetime.now(timezone.utc)),
    ])
    await async_db_session.commit()

    body = (await client.get(f"/orgs/{org.id}/users/005rep/record-access", cookies=_cookie(admin))).json()

    # Snapshot from before owner counts were stored: Owner share rows are
    # used where they exist; Opportunity has none, so it's unknown, not 0.
    assert body["ownedRecords"]["Account"] == 1
    assert body["ownedRecords"]["Opportunity"] is None
    assert {body["ownedRecords"][k] for k in ("Case", "Contact", "Lead")} == {None}
    assert body["summary"]["total_owned_records"] == 1


class _Result:
    def __init__(self, records):
        self.records = records


async def _live_extract(monkeypatch, owner_rows):
    """Run the real extract_all with every Salesforce call stubbed out."""
    from app.salesforce.client import SalesforceAPIClient

    client = SalesforceAPIClient(instance_url="https://example.invalid", access_token="x")

    async def empty(*_a, **_k):
        return []

    for name in dir(SalesforceAPIClient):
        if name.startswith("extract_") and name != "extract_all":
            monkeypatch.setattr(client, name, empty)

    async def extract_users():
        return []

    async def query(soql):
        obj = soql.split(" FROM ")[1].split()[0]
        if owner_rows.get(obj) is None:
            raise RuntimeError("INVALID_TYPE")  # e.g. no access to the object
        return _Result(owner_rows[obj])

    monkeypatch.setattr(client, "query", query)
    data = await client.extract_all()
    data["users"] = [{"Id": "005rep", "Username": "rep@x", "Name": "Rep", "IsActive": True},
                     {"Id": "005new", "Username": "new@x", "Name": "New", "IsActive": True}]
    return data


@pytest.mark.asyncio
async def test_live_sync_counts_owned_records_from_the_owner_field(client, async_db_session, monkeypatch):  # noqa: F811
    from app.ingestion.snapshot import SnapshotPersister

    admin, _ = await _users(async_db_session)
    org = Organization(name="Live", is_demo=False)
    async_db_session.add(org)
    await async_db_session.commit()
    data = await _live_extract(monkeypatch, {
        "Account": [{"OwnerId": "005rep", "cnt": 7}],
        "Opportunity": None,  # query failed
    })
    # The share extracts skip Owner rows, so there are none to count.
    assert data["account_shares"] == []
    await SnapshotPersister(async_db_session).persist_all(org.id, data)

    rep = (await client.get(f"/orgs/{org.id}/users/005rep/record-access", cookies=_cookie(admin))).json()
    new = (await client.get(f"/orgs/{org.id}/users/005new/record-access", cookies=_cookie(admin))).json()

    assert rep["ownedRecords"]["Account"] == 7  # was always 0 before
    assert new["ownedRecords"]["Account"] == 0
    # A failed count is unknown, never zero.
    assert rep["ownedRecords"]["Opportunity"] is None


@pytest.mark.asyncio
async def test_old_snapshot_without_counts_or_owner_rows_is_unknown(client, async_db_session):  # noqa: F811
    admin, _ = await _users(async_db_session)
    org = Organization(name="Old", is_demo=False)
    async_db_session.add(org)
    await async_db_session.flush()
    async_db_session.add(UserSnapshot(organization_id=org.id, salesforce_id="005rep", username="rep@x",
                                      name="Rep", is_active=True))
    await async_db_session.commit()

    body = (await client.get(f"/orgs/{org.id}/users/005rep/record-access", cookies=_cookie(admin))).json()
    assert body["ownedRecords"]["Account"] is None and body["ownedRecords"]["Opportunity"] is None
    assert body["summary"]["total_owned_records"] is None
