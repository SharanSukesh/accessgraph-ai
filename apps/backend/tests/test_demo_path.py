"""What the demo path shows on the synthetic org: users by risk, last login,
anomaly types and ranks, and the pages a demo org greys out."""
import pytest
import pytest_asyncio

from app.domain.models import Organization, SyncJob, SyncStatus
from app.ingestion.orchestrator import SyncOrchestrator
from tests.test_demo_orgs import _cookie, _users, client  # noqa: F401  (fixture)

JUN, FATIMA, NOOR = "005000000000005DMO", "005000000000004DMO", "005000000000006DMO"


@pytest_asyncio.fixture
async def lumenvale(async_db_session):
    admin, _ = await _users(async_db_session)
    org = Organization(name="Lumenvale Systems (Demo)", is_demo=True,
                       settings={"demo_fixture": "synthetic_mid_market"})
    async_db_session.add(org)
    await async_db_session.flush()
    job = SyncJob(organization_id=org.id, status=SyncStatus.PENDING)
    async_db_session.add(job)
    await async_db_session.commit()
    await SyncOrchestrator(async_db_session).run_sync(org.id, job.id)  # also runs anomalies + risk
    return org.id, _cookie(admin)


@pytest.mark.asyncio
async def test_users_list_is_complete_sorted_by_risk_and_filterable(client, lumenvale):  # noqa: F811
    org_id, cookie = lumenvale

    users = (await client.get(f"/orgs/{org_id}/users", cookies=cookie)).json()
    assert len(users) == 400
    scores = [u["riskScore"] for u in users]
    assert scores == sorted(scores, reverse=True)
    assert all(u["riskLevel"] for u in users)
    assert sum(u["riskLevel"] in ("high", "critical") for u in users) == 40
    noor = next(u for u in users if u["salesforceUserId"] == NOOR)
    assert noor["lastLoginDate"].startswith("2026-")

    by_name = (await client.get(f"/orgs/{org_id}/users", params={"sort": "name"}, cookies=cookie)).json()
    assert [u["name"] for u in by_name] == sorted((u["name"] for u in by_name), key=str.lower)

    found = (await client.get(f"/orgs/{org_id}/users", params={"search": "noor whitlock"}, cookies=cookie)).json()
    assert [u["salesforceUserId"] for u in found] == [NOOR]
    critical = (await client.get(f"/orgs/{org_id}/users", params={"riskLevel": "critical"}, cookies=cookie)).json()
    assert critical and {u["riskLevel"] for u in critical} == {"critical"}


@pytest.mark.asyncio
async def test_user_detail_reports_last_login(client, lumenvale):  # noqa: F811
    org_id, cookie = lumenvale
    user = (await client.get(f"/orgs/{org_id}/users/{NOOR}", cookies=cookie)).json()
    assert user["lastLoginDate"].startswith("2026-10-12")


@pytest.mark.asyncio
async def test_anomalies_are_typed_by_strongest_reason_and_ranked(client, lumenvale):  # noqa: F811
    org_id, cookie = lumenvale

    anomalies = (await client.get(f"/orgs/{org_id}/anomalies", cookies=cookie)).json()
    assert [a["rank"] for a in anomalies] == list(range(1, 9))
    assert {a["usersScored"] for a in anomalies} == {400}
    types = {a["userId"]: a["type"] for a in anomalies}
    assert types[JUN] == types[FATIMA] == "exclusive_access"
    assert types[NOOR] == "role_mismatch"
    assert "excessive_permissions" not in types.values()
    # The label is the first (strongest) reason.
    jun = next(a for a in anomalies if a["userId"] == JUN)
    assert jun["rank"] == 1 and jun["reasons"][0].startswith("Is the only user in the org")

    only = (await client.get(f"/orgs/{org_id}/anomalies", params={"type": "exclusive_access"},
                             cookies=cookie)).json()
    assert {a["userId"] for a in only} == {JUN, FATIMA}
    searched = (await client.get(f"/orgs/{org_id}/anomalies", params={"search": "treasury"},
                                 cookies=cookie)).json()
    assert [a["userId"] for a in searched] == [JUN]

    top = (await client.get(f"/orgs/{org_id}/anomalies/users/top", params={"limit": 3}, cookies=cookie)).json()
    assert top[0]["userId"] == JUN and top[0]["rank"] == 1 and top[0]["anomalyType"] == "exclusive_access"


@pytest.mark.asyncio
async def test_demo_org_refuses_equity_and_record_access(client, lumenvale):  # noqa: F811
    org_id, cookie = lumenvale

    r = await client.post(f"/orgs/{org_id}/equity/recommendations/generate", cookies=cookie)
    assert r.status_code == 409 and "Equity needs a live Salesforce connection" in r.json()["detail"]
    r = await client.get(f"/orgs/{org_id}/users/{NOOR}/record-access", cookies=cookie)
    assert r.status_code == 409 and "Record Access needs a live Salesforce connection" in r.json()["detail"]
