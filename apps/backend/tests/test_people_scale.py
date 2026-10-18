"""People view at scale: the reporting graph returns every user (inactive
ones too) with their raw relationships, risk level and flags, for a
600-user org, quickly."""
import time

import pytest

from app.domain.models import Organization
from tests import people_scale
from tests.test_demo_orgs import _cookie, _users, client  # noqa: F401


@pytest.mark.asyncio
async def test_six_hundred_users_with_flags(client, async_db_session):  # noqa: F811
    admin, _ = await _users(async_db_session)
    org = Organization(name="People scale", is_demo=False)
    async_db_session.add(org)
    await async_db_session.flush()
    data = await people_scale.seed(async_db_session, org.id)
    await async_db_session.commit()

    started = time.perf_counter()
    r = await client.get(f"/orgs/{org.id}/reporting-graph", cookies=_cookie(admin))
    elapsed = time.perf_counter() - started
    assert r.status_code == 200
    body = r.json()
    nodes = {n["user_sf_id"]: n for n in body["nodes"]}
    assert len(nodes) == 600 and sum(not n["is_active"] for n in nodes.values()) == 43
    assert elapsed < 5, elapsed

    flagged = lambda f: {i for i, n in nodes.items() if f in n["flags"]}  # noqa: E731
    users = {u["salesforce_id"]: u for u in data["users"]}
    # The CEO and the 8 planted people have no manager.
    assert len(flagged("no_manager")) == 9
    # Every active report of the 3 inactive managers.
    inactive_managers = {i for i, u in users.items() if not u["is_active"] and u["title"].endswith("Manager")}
    assert len(inactive_managers) == 3
    assert flagged("manager_inactive") == {i for i, u in users.items() if u["is_active"] and u["manager_id"] in inactive_managers}
    assert len(flagged("delegated_approver_inactive")) == 5
    # Inactive users carry no flags of their own.
    assert all(not n["flags"] for n in nodes.values() if not n["is_active"])
    assert sum(n["risk_level"] == "high" for n in nodes.values()) == 30
    assert sum(n["risk_level"] == "critical" for n in nodes.values()) == 6

    # Edges reach inactive managers and approvers too, so the chain stays whole.
    edges = body["edges"]
    assert sum(e["edge_type"] == "manager" for e in edges) == sum(1 for u in users.values() if u["manager_id"])
    assert sum(e["edge_type"] == "delegated_approver" for e in edges) == 5
    one = next(iter(flagged("manager_inactive")))
    assert nodes[one]["manager_id"] in inactive_managers


@pytest.mark.asyncio
async def test_manager_loops_are_flagged(client, async_db_session):  # noqa: F811
    from app.domain.models import UserSnapshot
    admin, _ = await _users(async_db_session)
    org = Organization(name="Loops", is_demo=False)
    async_db_session.add(org)
    await async_db_session.flush()
    for sid, mgr in (("005A", "005B"), ("005B", "005C"), ("005C", "005A"), ("005D", "005A"), ("005E", None)):
        async_db_session.add(UserSnapshot(organization_id=org.id, salesforce_id=sid, username=sid, name=sid,
                                          is_active=True, manager_id=mgr))
    await async_db_session.commit()
    nodes = {n["user_sf_id"]: n["flags"] for n in
             (await client.get(f"/orgs/{org.id}/reporting-graph", cookies=_cookie(admin))).json()["nodes"]}
    assert {i for i, f in nodes.items() if "manager_loop" in f} == {"005A", "005B", "005C"}
    assert nodes["005D"] == [] and nodes["005E"] == ["no_manager"]
