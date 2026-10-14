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

    assert body["ownedRecords"]["Account"] == 1
    assert body["ownedRecords"]["Opportunity"] == 0
    assert {body["ownedRecords"][k] for k in ("Case", "Contact", "Lead")} == {None}
    assert body["summary"]["total_owned_records"] == 1
