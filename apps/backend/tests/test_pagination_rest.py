"""Pagination part 5: the People list, users in a role, and installed
packages (the standing pagination rule)."""
from datetime import datetime, timezone

import pytest

from app.domain.models import InstalledPackage, Organization, PackageSprawlRun
from tests import people_scale
from tests.test_demo_orgs import _cookie, _users, client  # noqa: F401
from tests.test_demo_path import lumenvale  # noqa: F401


async def _people_org(db):
    admin, _ = await _users(db)
    org = Organization(name="People scale", is_demo=False)
    db.add(org)
    await db.flush()
    data = await people_scale.seed(db, org.id)
    await db.commit()
    return org.id, _cookie(admin), data


@pytest.mark.asyncio
async def test_people_list_pages_filters_and_counts_reports(client, async_db_session):  # noqa: F811
    org_id, cookie, data = await _people_org(async_db_session)
    url = f"/orgs/{org_id}/reporting-graph/people"
    every = (await client.get(url, cookies=cookie)).json()["items"]
    users = {u["salesforce_id"]: u for u in data["users"]}
    active = {i for i, u in users.items() if u["is_active"]}
    # Shown, as in the tree: active people, plus the inactive managers and delegated approvers they point at.
    kept = {users[i][k] for i in active for k in ("manager_id", "delegated_approver_id")
            if users[i].get(k) and users[i][k] not in active}
    assert len(kept) == 3 + 5
    assert {r["user_sf_id"] for r in every} == active | kept

    first = (await client.get(url, params={"page": 1}, cookies=cookie)).json()
    shown = len(active | kept)
    assert (first["total"], first["pages"], first["sort"], first["dir"]) == (shown, -(-shown // 25), "total", "desc")
    ceo = first["items"][0]
    assert ceo["title"] == "Chief Executive Officer" and ceo["direct"] == 6

    # Total reports: everyone shown whose chain of managers reaches the CEO.
    def reaches_ceo(i):
        seen = set()
        while i and i not in seen:
            seen.add(i)
            i = users[i]["manager_id"]
            if i == ceo["user_sf_id"]:
                return True
        return False
    assert ceo["total"] == sum(1 for i in active | kept if reaches_ceo(i))
    assert sum(r["direct"] for r in every) == sum(1 for i in active | kept if users[i]["manager_id"] in active | kept)

    page3 = (await client.get(url, params={"page": 3, "page_size": 50, "sort": "name"}, cookies=cookie)).json()
    names = sorted((r["name"] for r in every), key=str.lower)
    assert [r["name"] for r in page3["items"]] == names[100:150]

    vps = (await client.get(url, params={"page": 1, "manager": ceo["user_sf_id"]}, cookies=cookie)).json()
    assert vps["total"] == 6 and all(r["manager_name"] == ceo["name"] for r in vps["items"])
    flagged = (await client.get(url, params={"page": 1, "flag": "no_manager"}, cookies=cookie)).json()
    assert flagged["total"] == 8
    risky = (await client.get(url, params={"page": 1, "highRisk": "true", "department": "Sales"}, cookies=cookie)).json()
    assert risky["total"] > 0 and all(r["risk_level"] in ("high", "critical") and r["department"] == "Sales"
                                      for r in risky["items"])
    inactive = (await client.get(url, params={"page": 1, "inactive": "true"}, cookies=cookie)).json()
    assert inactive["total"] == sum(1 for u in users.values() if not u["is_active"])
    named = (await client.get(url, params={"page": 1, "q": "chief executive"}, cookies=cookie)).json()
    assert [r["user_sf_id"] for r in named["items"]] == [ceo["user_sf_id"]]
    # Without `page`, the export gets every match.
    assert len((await client.get(url, params={"department": "Sales"}, cookies=cookie)).json()["items"]) == \
        sum(1 for r in every if r["department"] == "Sales")


@pytest.mark.asyncio
async def test_role_users_page(client, async_db_session):  # noqa: F811
    org_id, cookie, data = await _people_org(async_db_session)
    by_role: dict = {}
    for u in data["users"]:
        by_role.setdefault(u["user_role_id"], []).append(u)
    role_id, members = max(by_role.items(), key=lambda kv: len(kv[1]))
    url = f"/orgs/{org_id}/roles/{role_id}/users"
    every = (await client.get(url, cookies=cookie)).json()
    assert isinstance(every, list) and len(every) == len(members) > 50
    p2 = (await client.get(url, params={"page": 2, "page_size": 25}, cookies=cookie)).json()
    assert p2["total"] == len(members) and [u["id"] for u in p2["items"]] == [u["id"] for u in every[25:50]]
    by_name = (await client.get(url, params={"page": 1, "page_size": 100, "sort": "name"}, cookies=cookie)).json()
    assert [u["name"] for u in by_name["items"]] == sorted((u["name"] for u in every), key=str.lower)[:100]
    inactive = (await client.get(url, params={"page": 1, "status": "inactive"}, cookies=cookie)).json()
    assert inactive["total"] == sum(1 for u in every if not u["is_active"])


@pytest.mark.asyncio
async def test_packages_page_and_search(client, lumenvale, async_db_session):  # noqa: F811
    org_id, cookie = lumenvale
    run = PackageSprawlRun(organization_id=org_id, snapshot_at=datetime.now(timezone.utc), packages_total=120)
    async_db_session.add(run)
    await async_db_session.flush()
    for i in range(120):
        async_db_session.add(InstalledPackage(
            organization_id=org_id, run_id=run.id, sf_package_id=f"033{i:015d}", name=f"Package {i:03d}",
            namespace_prefix="acme" if i % 4 == 0 else f"ns{i}", utilization_tier="unused" if i < 30 else "active"))
    await async_db_session.commit()
    url = f"/orgs/{org_id}/package-sprawl/packages"
    every = (await client.get(url, cookies=cookie)).json()
    assert len(every["packages"]) == every["total"] == 120
    p = (await client.get(url, params={"page": 2, "page_size": 50}, cookies=cookie)).json()
    assert (p["total"], p["page"], p["pages"]) == (120, 2, 3)
    assert [x["name"] for x in p["packages"]] == [x["name"] for x in every["packages"][50:100]]
    acme = (await client.get(url, params={"page": 1, "q": "acme"}, cookies=cookie)).json()
    assert acme["total"] == 30
    unused = (await client.get(url, params={"page": 1, "tier": "unused"}, cookies=cookie)).json()
    assert unused["total"] == 30 and all(x["utilization_tier"] == "unused" for x in unused["packages"])
