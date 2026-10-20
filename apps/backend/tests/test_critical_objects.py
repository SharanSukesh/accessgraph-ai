"""Critical objects (roadmap item 2): Data Quality runs on demo orgs from
the fixture, flags stale / mostly empty / never-populated objects with
reasons, samples very large objects, counts long text from a sample, and
labels partial counts."""

import pytest
from sqlalchemy import select

from app.domain.models import ObjectQualityScore, OrgFinding, Recommendation, RecommendationType
from app.services.critical_objects import CriticalObjectSettings, critical_flags, save_settings
from app.services.data_quality import DataQualityService
from app.services.org_analyzer import OrgAnalyzerService
from app.services.recommendations import RecommendationEngine
from tests.test_demo_orgs import client  # noqa: F401
from tests.test_demo_path import lumenvale  # noqa: F401


async def _scores(db, run_id):
    rows = (await db.execute(select(ObjectQualityScore).where(ObjectQualityScore.run_id == run_id))).scalars().all()
    return {r.object_name: r for r in rows}


def _codes(score):
    return {f["code"] for f in (score.evidence or {}).get("critical", {}).get("flags", [])}


@pytest.mark.asyncio
async def test_data_quality_runs_on_the_demo_org_and_flags_the_plants(async_db_session, lumenvale):  # noqa: F811
    db = async_db_session
    org_id, _ = lumenvale
    run = await DataQualityService(db, org_id).run(actor_email="test")
    s = await _scores(db, run.id)

    # The three planted custom objects are in the default (business) scope.
    assert {"Legacy_Order__c", "Partner_Survey__c", "Web_Event__c"} <= set(s)
    assert _codes(s["Legacy_Order__c"]) == {"stale"}
    assert "92% of 18,400 records" in s["Legacy_Order__c"].evidence["critical"]["flags"][0]["reason"]
    assert _codes(s["Partner_Survey__c"]) == {"mostly_empty"}
    assert _codes(s["Account"]) == {"never_populated"}
    # Old_Score__c is item 13's "unpopulated but referenced" cleanup candidate.
    assert sorted(s["Account"].evidence["never_populated"]) == ["DUNS_Override__c", "Legacy_Region__c", "Old_Score__c",
                                                                "Secondary_SIC__c"]
    # Every other object is clean.
    flagged = {name for name, r in s.items() if _codes(r)}
    assert flagged == {"Legacy_Order__c", "Partner_Survey__c", "Account"}

    # 2M-record object: sampled and labelled as an estimate.
    web = s["Web_Event__c"].evidence
    assert web["estimated"] and web["estimate_label"] == "estimated (sampled 10,000 of about 2,000,000)"
    # Long text can't be counted without reading record contents, so it's listed as not counted.
    notes = next(t for t in s["Account"].evidence["text_fields"] if t["field"] == "Strategy_Notes__c")
    assert notes["populated_pct"] is None
    assert notes["label"] == "not counted, to keep our promise of never reading record contents"
    # The integration user has no View All in the fixture: partial counts are labelled.
    assert s["Account"].evidence["coverage_label"] == "Based on records the integration user can see"


@pytest.mark.asyncio
async def test_thresholds_are_per_org_and_stored_with_the_run(async_db_session, lumenvale):  # noqa: F811
    import json

    db = async_db_session
    org_id, _ = lumenvale
    await save_settings(db, org_id, {"min_fill_pct": 50, "stale_share_pct": 95})
    run = await DataQualityService(db, org_id).run(actor_email="test")
    s = await _scores(db, run.id)

    assert json.loads(run.error)["settings"]["min_fill_pct"] == 50.0
    assert "stale" not in _codes(s["Legacy_Order__c"])  # 92% is under the 95% threshold now
    assert "mostly_empty" in _codes(s["Partner_Survey__c"])


@pytest.mark.asyncio
async def test_health_report_and_priority_actions_follow_the_run(async_db_session, lumenvale):  # noqa: F811
    db = async_db_session
    org_id, _ = lumenvale
    await DataQualityService(db, org_id).run(actor_email="test")
    snap = await OrgAnalyzerService(db, org_id).run(actor_email="test")
    codes = {f.code: f for f in (await db.execute(
        select(OrgFinding).where(OrgFinding.snapshot_id == snap.id))).scalars().all()}

    assert codes["CRITICAL_OBJECT_STALE"].title == "Mostly stale records on 1 object"
    assert codes["FIELDS_NEVER_POPULATED"].title == "4 never-populated fields on 1 object"
    assert codes["CRITICAL_OBJECT_MOSTLY_EMPTY"].title == "1 mostly empty object"
    assert "Legacy Order" in str(codes["CRITICAL_OBJECT_STALE"].evidence["objects"])

    async def actions():
        return (await db.execute(select(Recommendation).where(
            Recommendation.organization_id == org_id,
            Recommendation.rec_type == RecommendationType.DATA_CLEANUP,
        ))).scalars().all()

    titles = sorted(r.title for r in await actions())
    assert titles == [
        "Clean up Account: fields never populated",
        "Clean up Legacy Order: stale",
        "Clean up Partner Survey: mostly empty",
    ]
    for _ in range(2):
        await RecommendationEngine(db).generate_recommendations(org_id)
    kept = await actions()
    assert len(kept) == 3  # kept across rebuilds, never duplicated
    assert {r.track.value for r in kept} == {"data_quality"}


def test_flags_never_call_a_sampled_field_never_populated():
    s = CriticalObjectSettings()
    flags = critical_flags(record_count=2_000_000, staleness_pct=10.0, stale_count=1, completeness_pct=70.0,
                           fields_inspected=4, never_populated=["X__c"], estimated=True, settings=s)
    assert flags == []
    assert CriticalObjectSettings.from_dict({"sample_size": 10**9}).sample_size == 50_000  # clamped


@pytest.mark.asyncio
async def test_settings_api_and_flags_on_the_object_list(client, async_db_session, lumenvale):  # noqa: F811
    org_id, cookie = lumenvale
    got = (await client.get(f"/orgs/{org_id}/data-quality/settings", cookies=cookie)).json()
    assert got["settings"]["stale_days"] == 180 and got["defaults"]["min_fill_pct"] == 40.0

    put = await client.put(f"/orgs/{org_id}/data-quality/settings", json={"stale_days": 5}, cookies=cookie)
    assert put.status_code == 200 and put.json()["settings"]["stale_days"] == 30  # clamped to the minimum
    await client.put(f"/orgs/{org_id}/data-quality/settings", json={"stale_days": 180}, cookies=cookie)

    r = await client.post(f"/orgs/{org_id}/data-quality/run", cookies=cookie)
    assert r.status_code == 200, r.text
    objs = {o["object_name"]: o for o in (await client.get(f"/orgs/{org_id}/data-quality/objects",
                                                           cookies=cookie)).json()["objects"]}
    assert [f["code"] for f in objs["Legacy_Order__c"]["critical_flags"]] == ["stale"]
    assert objs["Web_Event__c"]["estimate_label"].startswith("estimated (sampled")
    assert objs["Account"]["coverage_label"] == "Based on records the integration user can see"


class _Result:
    def __init__(self, records):
        self.records = records


@pytest.mark.asyncio
async def test_large_object_sampling_reads_ids_and_counts_only(monkeypatch):
    """The sample never selects a business field: only Id to find where it
    ends, then one aggregate COUNT() bounded by that Id."""
    from app.salesforce.client import SalesforceAPIClient

    c = SalesforceAPIClient(instance_url="https://example.invalid", access_token="x")
    seen = []

    async def query(soql):
        seen.append(soql)
        if soql.startswith("SELECT Id FROM"):
            start = 0 if "WHERE" not in soql else 2000
            return _Result([{"Id": f"a00{start + i:015d}"} for i in range(2000)])
        return _Result([{"t": 4000, "f_Page__c": 3960, "f_Referrer__c": 2440}])

    monkeypatch.setattr(c, "query", query)
    got = await c.bounded_populated_counts("Web_Event__c", ["Page__c", "Referrer__c"], 4000)

    assert got == {"__sampled__": 4000, "Page__c": 3960, "Referrer__c": 2440}
    selects = [q.split(" FROM ")[0] for q in seen]
    assert all(sel == "SELECT Id" or sel.startswith("SELECT COUNT(Id) t") for sel in selects)
    assert "WHERE Id <= 'a00000000000003999'" in seen[-1]
