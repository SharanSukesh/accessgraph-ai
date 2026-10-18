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


REP, NEW = "005000000000REPAAA", "005000000000NEWAAA"


class _Result:
    def __init__(self, records):
        self.records = records


async def _live_extract(monkeypatch, owner_rows):
    """Run the real extract_all with every Salesforce call stubbed out."""
    from app.salesforce.client import SalesforceAPIClient

    sf_client = SalesforceAPIClient(instance_url="https://example.invalid", access_token="x")

    async def empty(*_a, **_k):
        return []

    for name in dir(SalesforceAPIClient):
        if name.startswith("extract_") and name != "extract_all":
            monkeypatch.setattr(sf_client, name, empty)

    async def extract_users():
        from app.salesforce.models import SalesforceUser
        return [SalesforceUser(Id=REP, Username="rep@x", Name="Rep", ProfileId="00e000000000001AAA"),
                SalesforceUser(Id=NEW, Username="new@x", Name="New", ProfileId="00e000000000001AAA")]

    monkeypatch.setattr(sf_client, "extract_users", extract_users)

    async def query(soql):
        obj = soql.split(" FROM ")[1].split()[0]
        if owner_rows.get(obj) is None:
            raise RuntimeError("INVALID_TYPE")  # e.g. no access to the object
        return _Result(owner_rows[obj])

    monkeypatch.setattr(sf_client, "query", query)
    data = await sf_client.extract_all()
    return data


@pytest.mark.asyncio
async def test_live_sync_counts_owned_records_from_the_owner_field(client, async_db_session, monkeypatch):  # noqa: F811
    from app.ingestion.snapshot import SnapshotPersister

    admin, _ = await _users(async_db_session)
    org = Organization(name="Live", is_demo=False)
    async_db_session.add(org)
    await async_db_session.commit()
    data = await _live_extract(monkeypatch, {
        "Account": [{"OwnerId": REP, "cnt": 7}],
        "Opportunity": None,  # query failed
    })
    # The share extracts skip Owner rows, so there are none to count.
    assert data["account_shares"] == []
    await SnapshotPersister(async_db_session).persist_all(org.id, data)

    rep = (await client.get(f"/orgs/{org.id}/users/{REP}/record-access", cookies=_cookie(admin))).json()
    new = (await client.get(f"/orgs/{org.id}/users/{NEW}/record-access", cookies=_cookie(admin))).json()

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


@pytest.mark.asyncio
async def test_owner_counts_are_chunked_under_the_aggregate_row_limit(monkeypatch):
    """A 5,000-user org: one GROUP BY OwnerId would return more than 2,000
    rows, which Salesforce rejects. Chunks of 200 owners never do."""
    from app.salesforce.client import OWNER_COUNT_CHUNK, SalesforceAPIClient

    c = SalesforceAPIClient(instance_url="https://example.invalid", access_token="x")
    users = [f"005{i:015d}" for i in range(5000)]
    owned = {u: (i % 7) for i, u in enumerate(users)}  # some own nothing
    calls = []

    async def query(soql):
        calls.append(soql)
        ids = [x.strip(" '") for x in soql.split("IN (")[1].split(")")[0].split(",")] if "IN (" in soql else users
        rows = [{"OwnerId": u, "cnt": owned[u]} for u in ids if owned.get(u)]
        if len(rows) > 2000:
            raise RuntimeError("Aggregate query does not support queryMore(), use LIMIT")
        return _Result(rows)

    monkeypatch.setattr(c, "query", query)
    got = await c.owner_counts_for("Account", users)

    assert len(calls) == 5000 // OWNER_COUNT_CHUNK
    assert got == {u: n for u, n in owned.items() if n}
    # The unchunked query fails on the same org; that's the bug this avoids.
    assert await c.owner_counts_or_none("Account") is None


@pytest.mark.asyncio
async def test_a_failed_chunk_makes_the_count_unknown_not_partial(monkeypatch):
    from app.salesforce.client import SalesforceAPIClient

    c = SalesforceAPIClient(instance_url="https://example.invalid", access_token="x")
    users = [f"005{i:015d}" for i in range(450)]
    n = 0

    async def query(soql):
        nonlocal n
        n += 1
        if n == 2:
            raise RuntimeError("QUERY_TIMEOUT")
        return _Result([])

    monkeypatch.setattr(c, "query", query)
    assert await c.owner_counts_for("Account", users) is None
