"""GROUP_EMPTY flags public groups and queues with no members, never the
groups Salesforce fills implicitly (role, organization, manager, territory)."""
from types import SimpleNamespace as NS

import pytest
from sqlalchemy import select

from app.domain.models import OrgFinding
from app.services.data_quality import DataQualityService
from app.services.org_analyzer import AnalyzerContext, OrgAnalyzerService
from tests.test_demo_orgs import client  # noqa: F401
from tests.test_demo_path import lumenvale  # noqa: F401


def _group(gid, gtype):
    return NS(salesforce_id=gid, name=f"{gtype} {gid}", group_type=gtype)


def _group_empty(groups, members):
    ctx = AnalyzerContext(org_id="o", actor_email=None)
    ctx.groups = groups
    ctx.group_members = [NS(group_id=g) for g in members]
    findings = OrgAnalyzerService(db=None, org_id="o")._analyze_configuration(ctx)
    return next((f for f in findings if f.code == "GROUP_EMPTY"), None)


IMPLICIT = ["Role", "RoleAndSubordinates", "RoleAndSubordinatesInternal", "Organization", "Manager",
            "ManagerAndSubordinatesInternal", "Territory", "TerritoryAndSubordinates", "Personal"]


def test_role_and_other_implicit_groups_are_never_empty():
    groups = [_group(f"00G{i}", t) for i, t in enumerate(IMPLICIT)]
    assert _group_empty(groups, members=[]) is None


def test_public_groups_and_queues_without_members_are_flagged():
    groups = [_group(f"00G{i}", t) for i, t in enumerate(IMPLICIT)] + [
        _group("00GpubEmpty", "Regular"), _group("00GqEmpty", "Queue"),
        _group("00GpubFull", "Regular"), _group("00GqFull", "Queue"),
    ]
    finding = _group_empty(groups, members=["00GpubFull", "00GqFull"])
    assert finding.affected_count == 2
    assert {g["id"] for g in finding.evidence["sample"]} == {"00GpubEmpty", "00GqEmpty"}


@pytest.mark.asyncio
async def test_lumenvale_health_report_is_unchanged(async_db_session, lumenvale):  # noqa: F811
    """The runbook's numbers: 41, 18 findings, $183,180."""
    db = async_db_session
    org_id, _ = lumenvale
    await DataQualityService(db, org_id).run(actor_email="test")
    snap = await OrgAnalyzerService(db, org_id).run(actor_email="test")
    rows = (await db.execute(select(OrgFinding).where(OrgFinding.snapshot_id == snap.id))).scalars().all()
    assert snap.metrics["org_health_score"] == 41
    assert len(rows) == 18
    assert sum(f.estimated_annual_savings_cents or 0 for f in rows) == 18_318_000
