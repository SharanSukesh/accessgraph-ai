"""Pagination part 2: users list, user access tabs, pages and automation,
record access sections (the standing pagination rule)."""
import pytest

from app.domain.models import Organization
from tests.test_demo_orgs import _cookie, _users, client  # noqa: F401
from tests.test_demo_path import lumenvale  # noqa: F401

JUN = "005000000000005DMO"


@pytest.mark.asyncio
async def test_users_list_pages_on_the_server(client, lumenvale):  # noqa: F811
    org_id, cookie = lumenvale
    every = (await client.get(f"/orgs/{org_id}/users", cookies=cookie)).json()
    assert len(every) == 400  # without `page`: every user, for exports

    p = (await client.get(f"/orgs/{org_id}/users", params={"page": 3, "page_size": 50, "sort": "risk", "dir": "desc"},
                          cookies=cookie)).json()
    assert (p["total"], p["page"], p["pages"], len(p["items"])) == (400, 3, 8, 50)
    assert [u["salesforceUserId"] for u in p["items"]] == [u["salesforceUserId"] for u in every[100:150]]
    assert p["summary"]["users"] == 400 and sum(p["summary"]["byRisk"].values()) == 400
    assert p["summary"]["byRisk"].get("high", 0) + p["summary"]["byRisk"].get("critical", 0) == 40

    high = (await client.get(f"/orgs/{org_id}/users", params={"page": 1, "riskLevel": "high"}, cookies=cookie)).json()
    assert high["total"] == p["summary"]["byRisk"]["high"] and all(u["riskLevel"] == "high" for u in high["items"])
    named = (await client.get(f"/orgs/{org_id}/users", params={"page": 1, "q": "noor whitlock"}, cookies=cookie)).json()
    assert [u["name"] for u in named["items"]] == ["Noor Whitlock"]
    by_profile = (await client.get(f"/orgs/{org_id}/users", params={"page": 1, "page_size": 100, "sort": "profile"},
                                   cookies=cookie)).json()
    profiles = [u["profile"] or "" for u in by_profile["items"]]
    assert profiles == sorted(profiles, key=str.lower)
    inactive = (await client.get(f"/orgs/{org_id}/users", params={"page": 1, "status": "inactive"}, cookies=cookie)).json()
    assert inactive["total"] == 400 - p["summary"]["active"] and all(not u["isActive"] for u in inactive["items"])


@pytest.mark.asyncio
async def test_user_access_tabs_page_and_filter(client, lumenvale):  # noqa: F811
    org_id, cookie = lumenvale
    every = (await client.get(f"/orgs/{org_id}/users/{JUN}/access/fields", cookies=cookie)).json()["fields"]
    first = (await client.get(f"/orgs/{org_id}/users/{JUN}/access/fields", params={"page": 1, "page_size": 25},
                              cookies=cookie)).json()
    assert first["total"] == len(every)
    sens = (await client.get(f"/orgs/{org_id}/users/{JUN}/access/fields", params={"page": 1, "sensitive": "true"},
                             cookies=cookie)).json()
    assert sens["total"] == sum(1 for f in every if f["isSensitive"]) and all(f["isSensitive"] for f in sens["items"])
    objs = (await client.get(f"/orgs/{org_id}/users/{JUN}/effective-access/objects",
                             params={"page": 1, "q": "treasury"}, cookies=cookie)).json()
    assert [o["objectName"] for o in objs["items"]] == ["Treasury_Account__c"]


@pytest.mark.asyncio
async def test_pages_and_automation_previews_and_section_lists(client, lumenvale):  # noqa: F811
    org_id, cookie = lumenvale
    full = (await client.get(f"/orgs/{org_id}/users/{JUN}/pages-and-automation", cookies=cookie)).json()
    prev = (await client.get(f"/orgs/{org_id}/users/{JUN}/pages-and-automation", params={"preview": 10}, cookies=cookie)).json()
    assert prev["counts"]["apex"] == len(full["apex"]) == 12 and len(prev["apex"]) == 10
    assert prev["counts"]["flows"] == len(full["flows"]) and len(prev["flows"]) <= 10
    desktop = sum(1 for p in full["pages"] if p["form_factor"] == "Desktop")
    assert prev["counts"]["pages_desktop"] == desktop
    apex = (await client.get(f"/orgs/{org_id}/users/{JUN}/pages-and-automation",
                             params={"section": "apex", "page": 2, "page_size": 25, "sort": "name"}, cookies=cookie)).json()
    assert (apex["total"], apex["page"]) == (12, 1)  # past the end: the last page
    phone = (await client.get(f"/orgs/{org_id}/users/{JUN}/pages-and-automation",
                              params={"section": "pages", "form_factor": "Phone", "page": 1}, cookies=cookie)).json()
    assert phone["total"] == len(full["pages"]) - desktop and all(p["form_factor"] == "Phone" for p in phone["items"])
    flows = (await client.get(f"/orgs/{org_id}/users/{JUN}/pages-and-automation",
                              params={"section": "flows", "page": 1, "q": "discount"}, cookies=cookie)).json()
    assert [f["api_name"] for f in flows["items"]] == ["Discount_Approval_Request"]


@pytest.mark.asyncio
async def test_record_access_sections_page(client, async_db_session):  # noqa: F811
    from tests import people_scale
    admin, _ = await _users(async_db_session)
    org = Organization(name="People scale", is_demo=False)
    async_db_session.add(org)
    await async_db_session.flush()
    data = await people_scale.seed(async_db_session, org.id)
    await async_db_session.commit()
    ceo = data["users"][0]["salesforce_id"]
    prev = (await client.get(f"/orgs/{org.id}/users/{ceo}/record-access", params={"preview": 10}, cookies=_cookie(admin))).json()
    assert prev["counts"]["subordinateRoles"] == 24 and len(prev["roleHierarchy"]["subordinate_roles"]) == 10
    page = (await client.get(f"/orgs/{org.id}/users/{ceo}/record-access",
                             params={"section": "subordinateRoles", "page": 1, "page_size": 25, "q": "sales"},
                             cookies=_cookie(admin))).json()
    assert page["total"] == 4 and all("Sales" in r["role_name"] for r in page["items"])
