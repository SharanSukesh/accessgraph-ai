"""Org code coverage (roadmap item 4): org-wide figure against the 75%
gate, 0% lists, staleness, Health Report findings and a Priority Action."""
from datetime import datetime, timezone

import pytest
from sqlalchemy import select

from app.domain.models import OrgFinding, Recommendation, RecommendationType
from app.ingestion.demo_orgs import load_fixture
from app.services.code_coverage import summarize_coverage
from app.services.org_analyzer import OrgAnalyzerService
from app.services.recommendations import RecommendationEngine
from tests.test_demo_orgs import client  # noqa: F401
from tests.test_demo_path import lumenvale  # noqa: F401

FIXTURE_DATE = datetime(2026, 10, 14, 9, 0, tzinfo=timezone.utc)


def _lumenvale_raw():
    return load_fixture("synthetic_mid_market")["demo_live"]["code_coverage"]


def test_lumenvale_summary_matches_the_planted_picture():
    s = summarize_coverage(_lumenvale_raw(), now=FIXTURE_DATE)
    assert s["org_wide_pct"] == 71 and s["below_gate"] and s["org_wide_source"] == "ApexOrgWideCoverage"
    assert len(s["zero_classes"]) == 4 and len(s["zero_triggers"]) == 2
    assert s["measured"] == 72  # 60 classes + 12 triggers; test classes have no rows of their own
    assert s["days_since_run"] == 40 and s["stale"]
    assert [c["name"] for c in s["changed_since_run"]] == ["RenewalService"]
    # Test classes are recognised by @isTest, not by name; a non-test class
    # with no coverage row is "no data", never 0%.
    assert s["test_classes"] == 19
    assert sorted(c["name"] for c in s["no_data"]) == ["ContestEntryHandler", "LegacyBatchExporter"]
    assert s["lowest"][0]["pct"] == 0


def test_no_coverage_data_is_not_measured_rather_than_zero():
    assert summarize_coverage({}) is None
    assert summarize_coverage({"org_wide_percent": None, "items": [], "last_test_run": None}) is None


def test_org_wide_is_computed_from_lines_when_salesforce_has_no_figure():
    s = summarize_coverage({"items": [
        {"name": "A", "type": "class", "covered": 30, "uncovered": 70, "last_modified": None},
        {"name": "B", "type": "trigger", "covered": 50, "uncovered": 50, "last_modified": None},
    ]})
    assert s["org_wide_pct"] == 40.0 and s["org_wide_source"] == "computed from per-class lines"
    assert s["stale"]  # no test run found


@pytest.mark.asyncio
async def test_health_report_and_priority_action_on_lumenvale(async_db_session, lumenvale):  # noqa: F811
    db = async_db_session
    org_id, _ = lumenvale
    snap = await OrgAnalyzerService(db, org_id).run(actor_email="test")
    findings = {f.code: f for f in (await db.execute(
        select(OrgFinding).where(OrgFinding.snapshot_id == snap.id))).scalars().all()}

    assert findings["ORG_COVERAGE_BELOW_GATE"].title.startswith("Org-wide Apex coverage is 71%")
    assert "(6 at 0%)" in findings["APEX_LOW_COVERAGE"].title
    # One root cause: the gate finding carries the severity, the list is detail.
    assert findings["ORG_COVERAGE_BELOW_GATE"].severity.value == "high"
    assert findings["APEX_LOW_COVERAGE"].severity.value == "medium"
    # Days since the run grow with the calendar; the change after it is fixed.
    assert "days ago; 1 class/trigger changed since" in findings["APEX_COVERAGE_STALE"].title
    assert snap.metrics["code_coverage"]["org_wide_pct"] == 71
    # Profile tiles agree with the coverage read (81 classes incl. tests, 12 triggers).
    assert (snap.metrics["total_apex_classes"], snap.metrics["total_apex_triggers"]) == (81, 12)

    async def actions():
        return (await db.execute(select(Recommendation).where(
            Recommendation.organization_id == org_id,
            Recommendation.rec_type == RecommendationType.DEPLOYMENT_READINESS,
        ))).scalars().all()

    assert len(await actions()) == 1
    # A later anomaly-driven rebuild of Priority Actions keeps it.
    await RecommendationEngine(db).generate_recommendations(org_id)
    kept = await actions()
    assert len(kept) == 1 and "71%" in kept[0].title


class _Result:
    def __init__(self, records):
        self.records = records


@pytest.mark.asyncio
async def test_client_reads_coverage_without_running_tests(monkeypatch):
    from app.salesforce.client import SalesforceAPIClient

    c = SalesforceAPIClient(instance_url="https://example.invalid", access_token="x")
    seen = []

    async def query_tooling(soql):
        seen.append(soql)
        if "ApexOrgWideCoverage" in soql:
            return [{"PercentCovered": 68}]
        if "ApexCodeCoverageAggregate" in soql:
            return [{"ApexClassOrTriggerId": "01pA", "NumLinesCovered": 9, "NumLinesUncovered": 1}]
        if "FROM ApexClass" in soql:
            return [{"Id": "01pA", "Name": "A", "LastModifiedDate": "2026-09-01T00:00:00.000+0000",
                     "Body": "public class A { }"},
                    {"Id": "01pB", "Name": "B", "LastModifiedDate": "2026-09-02T00:00:00.000+0000",
                     "Body": "@IsTest(SeeAllData=false)\nprivate class B { }"}]
        return []

    async def query(soql):
        seen.append(soql)
        return _Result([{"StartTime": "2026-09-10T00:00:00.000+0000"}])

    monkeypatch.setattr(c, "query_tooling", query_tooling)
    monkeypatch.setattr(c, "query", query)
    raw = await c.get_code_coverage()

    assert raw["org_wide_percent"] == 68 and raw["last_test_run"].startswith("2026-09-10")
    assert {i["name"]: i["covered"] for i in raw["items"]} == {"A": 9, "B": None}
    assert {i["name"]: i["is_test"] for i in raw["items"]} == {"A": False, "B": True}
    assert "Body" not in str(raw)  # the source is checked, not kept
    assert all(q.lstrip().upper().startswith("SELECT") for q in seen)  # read-only
    assert any("NamespacePrefix = NULL" in q for q in seen)  # managed-package code excluded


@pytest.mark.asyncio
async def test_coverage_action_has_its_own_track_and_is_never_duplicated(async_db_session, lumenvale):  # noqa: F811
    from app.domain.models import RecommendationTrack

    db = async_db_session
    org_id, _ = lumenvale
    await OrgAnalyzerService(db, org_id).run(actor_email="test")
    for _ in range(2):
        await RecommendationEngine(db).generate_recommendations(org_id)
    rows = (await db.execute(select(Recommendation).where(
        Recommendation.organization_id == org_id,
        Recommendation.rec_type == RecommendationType.DEPLOYMENT_READINESS,
    ))).scalars().all()
    assert len(rows) == 1 and rows[0].track == RecommendationTrack.DEPLOYMENT


@pytest.mark.asyncio
async def test_priority_actions_filter_by_deployment_track(client, async_db_session, lumenvale):  # noqa: F811
    db = async_db_session
    org_id, cookie = lumenvale
    await OrgAnalyzerService(db, org_id).run(actor_email="test")
    dep = (await client.get(f"/orgs/{org_id}/recommendations", params={"track": "deployment"}, cookies=cookie)).json()
    sec = (await client.get(f"/orgs/{org_id}/recommendations", params={"track": "security"}, cookies=cookie)).json()
    assert [r["track"] for r in dep] == ["deployment"] and "71%" in dep[0]["title"]
    assert all(r["rec_type"] != "deployment_readiness" for r in sec)
