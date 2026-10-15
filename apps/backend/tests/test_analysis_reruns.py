"""Re-running analysis replaces an org's results instead of adding to them.

Detection, risk scoring and recommendations each run for minutes on a real
org, so two runs can overlap (the sync's own analysis and an "Analyze"
click). The tests simulate the overlap by committing a row from "another
run" in the middle of a run: the run that finishes must leave only its own
rows.
"""
from datetime import datetime, timedelta, timezone

import pytest

from app.domain.models import (
    AccessAnomaly,
    AnomalySeverity,
    Organization,
    Recommendation,
    RecommendationStatus,
    RecommendationTrack,
    RecommendationType,
    RiskLevel,
    RiskScore,
    SyncJob,
    SyncStatus,
)
from app.services.anomaly_detection import AnomalyDetectionService
from app.services.recommendations import RecommendationEngine, _plural
from app.services.risk_scoring import RiskScoringService
from sqlalchemy import func, select
from tests.test_anomaly_flagging import _uniform_org
from tests.test_demo_orgs import _cookie, _users, client  # noqa: F401  (fixture)

NOW = datetime.now(timezone.utc)


async def _count(db, model, org_id):
    return (await db.execute(select(func.count()).select_from(model).where(model.organization_id == org_id))).scalar()


def _stale_anomaly(org_id):
    return AccessAnomaly(organization_id=org_id, user_id="005u9", anomaly_score=0.9,
                         severity=AnomalySeverity.CRITICAL, reasons=["from another run"], features={},
                         peer_stats={}, detected_at=NOW, category="access")


@pytest.mark.asyncio
async def test_detection_rerun_and_overlap_leave_one_set(async_db_session, monkeypatch):
    db = async_db_session
    org_id = await _uniform_org(db, admin_profile=True)
    service = AnomalyDetectionService(db)
    first = await service.detect_anomalies(org_id)
    assert await _count(db, AccessAnomaly, org_id) == len(first) == 1

    original = AnomalyDetectionService._extract_user_features
    injected = []

    async def overlapping(self, org, user, **kwargs):
        if not injected:  # another run commits its rows while this one computes
            db.add(_stale_anomaly(org_id))
            await db.commit()
            injected.append(True)
        return await original(self, org, user, **kwargs)

    monkeypatch.setattr(AnomalyDetectionService, "_extract_user_features", overlapping)
    second = await service.detect_anomalies(org_id)

    rows = (await db.execute(select(AccessAnomaly).where(AccessAnomaly.organization_id == org_id))).scalars().all()
    assert len(rows) == len(second) == 1
    assert rows[0].reasons != ["from another run"]


@pytest.mark.asyncio
async def test_risk_scoring_overlap_leaves_one_score_per_user(async_db_session, monkeypatch):
    db = async_db_session
    org_id = await _uniform_org(db, admin_profile=True)
    await RiskScoringService(db).score_all_users(org_id)
    assert await _count(db, RiskScore, org_id) == 10

    original = RiskScoringService._load_org_context

    async def overlapping(self, org):
        db.add(RiskScore(organization_id=org_id, entity_type="user", entity_id="005u0", risk_score=99,
                         risk_level=RiskLevel.CRITICAL, factors=[], reason_text="from another run",
                         calculated_at=NOW))
        await db.commit()
        return await original(self, org)

    monkeypatch.setattr(RiskScoringService, "_load_org_context", overlapping)
    await RiskScoringService(db).score_all_users(org_id)

    assert await _count(db, RiskScore, org_id) == 10
    reasons = (await db.execute(select(RiskScore.reason_text).where(RiskScore.organization_id == org_id))).scalars()
    assert "from another run" not in set(reasons)


@pytest.mark.asyncio
async def test_recommendations_overlap_leaves_one_set(async_db_session, monkeypatch):
    db = async_db_session
    org_id = await _uniform_org(db, admin_profile=True)
    await AnomalyDetectionService(db).detect_anomalies(org_id)
    first = await RecommendationEngine(db).generate_recommendations(org_id)

    original = RecommendationEngine._recommendations_from_anomaly

    async def overlapping(self, org, anomaly):
        db.add(Recommendation(organization_id=org_id, rec_type=RecommendationType.PERMISSION_REMOVAL,
                              track=RecommendationTrack.SECURITY, status=RecommendationStatus.PENDING,
                              severity=AnomalySeverity.LOW, target_entity_type="user", target_entity_id="005u9",
                              title="from another run", description="x", rationale="x", generated_at=NOW))
        await db.commit()
        return await original(self, org, anomaly)

    monkeypatch.setattr(RecommendationEngine, "_recommendations_from_anomaly", overlapping)
    second = await RecommendationEngine(db).generate_recommendations(org_id)

    titles = (await db.execute(select(Recommendation.title).where(Recommendation.organization_id == org_id))).scalars().all()
    assert len(titles) == len(second) == len(first)
    assert "from another run" not in titles


@pytest.mark.asyncio
async def test_analyze_refuses_while_a_sync_is_running(client, async_db_session):  # noqa: F811
    admin, _ = await _users(async_db_session)
    org = Organization(name="Client", is_demo=False)
    async_db_session.add(org)
    await async_db_session.flush()
    job = SyncJob(organization_id=org.id, status=SyncStatus.RUNNING)
    async_db_session.add(job)
    await async_db_session.commit()

    r = await client.post(f"/orgs/{org.id}/analyze", cookies=_cookie(admin))
    assert r.status_code == 409 and "sync is still running" in r.json()["detail"]

    job.status = SyncStatus.COMPLETED
    await async_db_session.commit()
    assert (await client.post(f"/orgs/{org.id}/analyze", cookies=_cookie(admin))).status_code == 202

    # A sync stuck in "running" for over half an hour no longer blocks analysis.
    stuck = SyncJob(organization_id=org.id, status=SyncStatus.RUNNING,
                    created_at=datetime.now(timezone.utc) - timedelta(hours=2))
    async_db_session.add(stuck)
    await async_db_session.commit()
    assert (await client.post(f"/orgs/{org.id}/analyze", cookies=_cookie(admin))).status_code == 202


def test_recommendation_counts_are_pluralised():
    assert _plural(1, "sensitive field") == "1 sensitive field"
    assert _plural(3, "sensitive field") == "3 sensitive fields"
    assert _plural(0, "object") == "0 objects"


@pytest.mark.asyncio
async def test_sync_stays_running_until_its_analysis_finishes(async_db_session, monkeypatch):
    from app.ingestion.orchestrator import SyncOrchestrator

    db = async_db_session
    org = Organization(name="Demo", is_demo=True, settings={"demo_fixture": "acme"})
    db.add(org)
    await db.flush()
    job = SyncJob(organization_id=org.id, status=SyncStatus.PENDING)
    db.add(job)
    await db.commit()
    seen = []

    async def analysis(self, org_id, sync_job):
        seen.append((await db.get(SyncJob, job.id)).status)

    monkeypatch.setattr(SyncOrchestrator, "_run_ai_analysis", analysis)
    await SyncOrchestrator(db).run_sync(org.id, job.id)

    assert seen == [SyncStatus.RUNNING]
    assert (await db.get(SyncJob, job.id)).status == SyncStatus.COMPLETED
