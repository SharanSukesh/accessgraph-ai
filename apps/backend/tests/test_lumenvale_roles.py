"""Lumenvale's role hierarchy (fixture part 05): realistic shape, and the
Health Report and anomaly results it must not change."""
import collections

import pytest
from sqlalchemy import select

from app.domain.models import OrgFinding
from app.ingestion.demo_orgs import load_fixture
from app.services.data_quality import DataQualityService
from app.services.org_analyzer import OrgAnalyzerService
from tests.test_demo_orgs import client  # noqa: F401
from tests.test_demo_path import lumenvale  # noqa: F401


def _tree():
    d = load_fixture("synthetic_mid_market")
    roles = {r["Id"]: r for r in d["roles"]}
    users = collections.Counter(u["UserRoleId"] for u in d["users"])

    def depth(r):
        n = 0
        while r.get("ParentRoleId"):
            r = roles[r["ParentRoleId"]]
            n += 1
        return n
    return d, roles, users, depth


def test_hierarchy_is_realistic_for_the_role_tool():
    d, roles, users, depth = _tree()
    by_name = {r["Name"]: r for r in roles.values()}
    assert len(roles) == 33 and len(d["users"]) == 400
    assert all(u["UserRoleId"] in roles for u in d["users"])
    assert all(r.get("DeveloperName") for r in roles.values())
    # Sales by region, each with director, manager and associates.
    for region in ("North America", "EMEA", "APAC"):
        assert users[by_name[f"Sales Associate, {region}"]["Id"]] > 0
    # Something for each flag: empty roles, single-user roles, a depth-5 branch, a portal branch.
    assert sum(1 for r in roles.values() if not users[r["Id"]]) == 11
    assert users[by_name["Sales Operations"]["Id"]] == 1 and users[by_name["VP Sales"]["Id"]] == 1
    assert max(depth(r) for r in roles.values()) == 5
    assert {r["Name"] for r in roles.values() if r.get("PortalType") == "Partner"} == {
        "Northwind Partners Partner Executive", "Northwind Partners Partner Manager", "Northwind Partners Partner User"}


@pytest.mark.asyncio
async def test_health_report_is_unchanged_by_the_hierarchy(async_db_session, lumenvale):  # noqa: F811
    """The runbook's numbers: 41, 18 findings, $183,180."""
    db = async_db_session
    org_id, _ = lumenvale
    await DataQualityService(db, org_id).run(actor_email="test")
    snap = await OrgAnalyzerService(db, org_id).run(actor_email="test")
    rows = (await db.execute(select(OrgFinding).where(OrgFinding.snapshot_id == snap.id))).scalars().all()
    assert snap.metrics["org_health_score"] == 41
    assert len(rows) == 18
    assert sum(f.estimated_annual_savings_cents or 0 for f in rows) == 18_318_000
