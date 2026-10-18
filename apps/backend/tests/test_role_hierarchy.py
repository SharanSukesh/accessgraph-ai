"""Role hierarchy view (roadmap 35a): the role tree, users and owned records
rolled up, flags with their thresholds, portal roles apart, the privacy
levels, and the extended UserRole read that can't break a sync."""
from types import SimpleNamespace as NS

import pytest

from app.domain.models import Organization
from app.services import privacy_mode
from app.services.role_hierarchy import OWNED_RECORDS_KEY, Thresholds, build_view, load_view
from tests.test_demo_orgs import client  # noqa: F401
from tests.test_demo_path import lumenvale  # noqa: F401


def _role(rid, name, parent=None, **raw):
    return NS(salesforce_id=rid, name=name, parent_role_id=parent, raw_data={"DeveloperName": name.replace(" ", "_"), **raw})


def _user(uid, role, active=True, account=0, opp=0):
    owned = None if account is None and opp is None else {"Account": account, "Opportunity": opp}
    return NS(salesforce_id=uid, user_role_id=role, is_active=active,
              raw_data={OWNED_RECORDS_KEY: owned} if owned else {})


ROLES = [
    _role("R1", "CEO"),
    _role("R2", "VP Sales", "R1"),
    _role("R3", "Sales Rep", "R2"),
    _role("R4", "Ops", "R1"),
    _role("P1", "Partner Exec", PortalType="Partner"),
    _role("P2", "Partner User", "P1", PortalType="Partner"),
]


def test_users_and_owned_records_roll_up_to_ancestors():
    users = [_user("u1", "R2", opp=5), _user("u2", "R3", account=3, opp=10), _user("u3", "R3", account=1, opp=1),
             _user("u4", "R3", active=False, account=2, opp=4), _user("u5", None)]
    v = build_view(ROLES, users, True)
    ceo, vp, rep = v["roles"]["R1"], v["roles"]["R2"], v["roles"]["R3"]
    assert (rep["user_count"], rep["inactive_user_count"]) == (2, 1)
    # An inactive owner's records still roll up.
    assert rep["owned"] == {"Account": 6, "Opportunity": 15}
    assert vp["subtree_owned"] == {"Account": 6, "Opportunity": 20} and vp["subtree_user_count"] == 3
    assert ceo["subtree_owned"] == {"Account": 6, "Opportunity": 20} and ceo["user_count"] == 0
    assert v["summary"]["users_without_role"] == 1
    assert [rid for rid in v["roots"]] == ["R1"] and v["portal_roots"] == ["P1"]
    assert v["roles"]["P2"]["portal_type"] == "Partner" and v["summary"]["portal_roles"] == 2


def test_an_unknown_count_is_never_shown_as_zero():
    users = [_user("u1", "R3", opp=5), NS(salesforce_id="u2", user_role_id="R3", is_active=True, raw_data={})]
    v = build_view(ROLES, users, True)
    assert v["roles"]["R3"]["owned"] == {"Account": None, "Opportunity": None}
    assert v["roles"]["R1"]["subtree_owned"]["Opportunity"] is None


def test_flags_and_thresholds():
    users = [_user("u1", "R2"), _user("u2", "R3"), _user("u3", "R3")]
    v = build_view(ROLES, users, True, Thresholds(deep_after=2, wide_after=1))
    codes = {rid: [f["code"] for f in n["flags"]] for rid, n in v["roles"].items()}
    assert codes["R1"] == ["empty", "wide"] and codes["R2"] == ["single_user"] and codes["R3"] == ["deep"]
    assert "3 levels from the top (threshold: more than 2)" in v["roles"]["R3"]["flags"][0]["reason"]
    assert v["thresholds"]["defaults"] == {"deep_after": 5, "wide_after": 6}
    # Portal roles aren't counted in the internal summary.
    assert v["summary"]["flags"] == {"empty": 2, "wide": 1, "single_user": 1, "deep": 1}


def test_metadata_only_shows_roles_without_users_or_counts():
    v = build_view(ROLES, [], False)
    assert v["users_hidden_reason"] and v["summary"]["users_without_role"] is None
    assert all(n["user_count"] is None and n["subtree_owned"] is None for n in v["roles"].values())
    assert all(f["code"] not in ("empty", "single_user") for n in v["roles"].values() for f in n["flags"])


@pytest.mark.asyncio
async def test_lumenvale(async_db_session, lumenvale):  # noqa: F811
    v = await load_view(async_db_session, lumenvale[0])
    s = v["summary"]
    assert (s["roles"], s["portal_roles"], s["max_depth"], s["users_without_role"]) == (30, 3, 6, 0)
    assert s["flags"] == {"empty": 8, "single_user": 5, "deep": 1}
    ceo = v["roles"][v["roots"][0]]
    assert ceo["name"] == "CEO" and ceo["subtree_user_count"] == 400
    # Lumenvale has Opportunity owner counts but no Account owner counts yet.
    assert ceo["subtree_owned"] == {"Account": None, "Opportunity": 9520}
    assert [v["roles"][r]["name"] for r in v["portal_roots"]] == ["Northwind Partners Partner Executive"]
    deep = [n["name"] for n in v["roles"].values() if any(f["code"] == "deep" for f in n["flags"])]
    assert deep == ["Support Associate"]
    assert v["partial_label"] == "Based on records the integration user can see"


@pytest.mark.asyncio
async def test_routes_and_privacy(client, async_db_session, lumenvale):  # noqa: F811
    org_id, cookie = lumenvale
    v = (await client.get(f"/orgs/{org_id}/roles/hierarchy", params={"deep_after": 3}, cookies=cookie)).json()
    assert v["thresholds"]["deep_after"] == 3 and v["summary"]["flags"]["deep"] > 1
    ops = next(r for r in v["roles"].values() if r["name"] == "Sales Operations")
    users = (await client.get(f"/orgs/{org_id}/roles/{ops['id']}/users", cookies=cookie)).json()
    assert len(users) == 1 and set(users[0]) >= {"name", "profile", "risk_score", "risk_level", "last_login_at", "owned"}
    assert users[0]["name"] == "Tobias Lindqvist" and users[0]["profile"] and users[0]["risk_level"]
    assert (await client.get(f"/orgs/{org_id}/roles/hierarchy")).status_code in (401, 403)

    org = await async_db_session.get(Organization, org_id)
    privacy_mode.set_privacy(org, privacy_mode.METADATA_ONLY, False, "test")
    await async_db_session.commit()
    v = (await client.get(f"/orgs/{org_id}/roles/hierarchy", cookies=cookie)).json()
    assert v["summary"]["roles"] == 30 and v["users_hidden_reason"]
    assert (await client.get(f"/orgs/{org_id}/roles/{ops['id']}/users", cookies=cookie)).status_code == 409


@pytest.mark.asyncio
async def test_extended_role_query_falls_back(monkeypatch):
    """No network: a rejected field falls back to the three fields the sync
    has always read, so the role sync still succeeds."""
    import httpx
    from app.salesforce.client import SalesforceAPIClient

    c = SalesforceAPIClient("https://example.invalid", "token")
    seen = []

    async def query_all(soql):
        seen.append(soql)
        if "DeveloperName" in soql:
            raise httpx.HTTPStatusError("400", request=httpx.Request("GET", "https://x"), response=httpx.Response(400))
        return [{"Id": "00E1", "Name": "CEO", "ParentRoleId": None}]
    monkeypatch.setattr(c, "query_all", query_all)
    roles = await c.extract_user_roles()
    assert len(seen) == 2 and roles[0].Name == "CEO" and roles[0].DeveloperName is None
