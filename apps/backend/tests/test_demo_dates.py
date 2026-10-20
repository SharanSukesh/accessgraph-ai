"""Lumenvale's dates move with today (DemoFixture.anchor), so the runbook
numbers hold on any day: Health 41, 18 findings, $183,180; License Fit
$116,220. The 20 Oct failure: a synthetic user's last login crossed 90 days."""
from datetime import datetime, timedelta

import pytest
from sqlalchemy import select

from app.ingestion import demo_orgs
from app.ingestion.demo_orgs import DEMO_FIXTURES, load_demo_data, load_fixture, shift_dates

ANCHOR = datetime.fromisoformat(DEMO_FIXTURES["synthetic_mid_market"].anchor)


def test_shift_keeps_formats_and_time_zones():
    d = timedelta(days=3, hours=2)
    data = {"a": "2026-07-22T01:00:00.000+0000", "b": "2026-07-22", "c": "2026-07-22T01:00:00Z",
            "d": ["2026-07-22T23:30:00+00:00", "not a date", 5], "2026-07-22": {"x": None}}
    assert shift_dates(data, d) == {"a": "2026-07-25T03:00:00.000+0000", "b": "2026-07-25", "c": "2026-07-25T03:00:00Z",
                                    "d": ["2026-07-26T01:30:00+00:00", "not a date", 5], "2026-07-25": {"x": None}}


def test_days_since_are_the_same_whenever_the_demo_syncs():
    def ages(now):
        users = load_demo_data("synthetic_mid_market", now)["users"]
        parse = lambda v: datetime.fromisoformat(v.replace("+0000", "+00:00"))  # noqa: E731
        return [(now - parse(u["LastLoginDate"])).days for u in users if u.get("LastLoginDate")]
    assert ages(ANCHOR) == ages(ANCHOR + timedelta(days=1, hours=5)) == ages(ANCHOR + timedelta(days=400))
    # At the anchor nothing moves.
    assert load_demo_data("synthetic_mid_market", ANCHOR)["users"] == load_fixture("synthetic_mid_market")["users"]


@pytest.mark.asyncio
@pytest.mark.parametrize("days_later", [1, 30, 200])
async def test_runbook_numbers_hold_on_later_days(async_db_session, monkeypatch, days_later):
    from app.domain.models import OrgFinding, Organization, SyncJob, SyncStatus
    from app.ingestion.orchestrator import SyncOrchestrator
    from app.services import code_coverage, data_quality, license_fit, org_analyzer
    from app.services.data_quality import DataQualityService
    from app.services.license_fit import LicenseFitService
    from app.services.org_analyzer import OrgAnalyzerService

    real = datetime
    shift = timedelta(days=days_later)

    class Later(real):
        @classmethod
        def now(cls, tz=None):
            return real.now(tz) + shift

        @classmethod
        def utcnow(cls):
            return real.utcnow() + shift

    for module in (demo_orgs, org_analyzer, license_fit, code_coverage, data_quality):
        monkeypatch.setattr(module, "datetime", Later)

    db = async_db_session
    org = Organization(name="Lumenvale Systems (Demo)", is_demo=True, settings={"demo_fixture": "synthetic_mid_market"})
    db.add(org)
    await db.flush()
    job = SyncJob(organization_id=org.id, status=SyncStatus.PENDING)
    db.add(job)
    await db.commit()
    await SyncOrchestrator(db).run_sync(org.id, job.id)
    await DataQualityService(db, org.id).run(actor_email="test")
    snap = await OrgAnalyzerService(db, org.id).run(actor_email="test")
    rows = (await db.execute(select(OrgFinding).where(OrgFinding.snapshot_id == snap.id))).scalars().all()
    assert (snap.metrics["org_health_score"], len(rows)) == (41, 18)
    assert sum(f.estimated_annual_savings_cents or 0 for f in rows) == 18_318_000
    assert (await LicenseFitService(db, org.id).run(actor_email="test")).total_annual_savings_cents == 11_622_000
