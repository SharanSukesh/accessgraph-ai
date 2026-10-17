"""Equity adds Priority Actions only when there is disparity to close, and
each run's grants replace the last run's (security analysis leaves them alone)."""
import pytest
from sqlalchemy import func, select

from app.domain.models import EquitySnapshot, Recommendation, RecommendationTrack
from app.services.equity_diagnostic import EquityDiagnosticService
from app.services.equity_recommendations import EquityRecommendationService
from app.services.recommendations import RecommendationEngine
from tests.test_demo_path import lumenvale  # noqa: F401  (fixture: synced synthetic org)
from tests.test_demo_orgs import client  # noqa: F401


async def _equity_recs(db, org_id):
    return (await db.execute(select(func.count()).select_from(Recommendation).where(
        Recommendation.organization_id == org_id, Recommendation.track == RecommendationTrack.EQUITY,
    ))).scalar_one()


@pytest.mark.asyncio
async def test_no_disparity_adds_no_priority_actions(async_db_session, lumenvale):  # noqa: F811
    db = async_db_session
    org_id, _ = lumenvale

    result = await EquityRecommendationService(db).generate(org_id)

    assert result.disparity == 0 and result.recommendations_created == 0
    assert await _equity_recs(db, org_id) == 0
    diag = await EquityDiagnosticService(db).latest_diagnostic(org_id)
    assert diag.reason == "no_disparity" and diag.recommendations_generated == 0


@pytest.mark.asyncio
async def test_grants_replace_the_previous_run_and_survive_security_analysis(async_db_session, lumenvale):  # noqa: F811
    db = async_db_session
    org_id, _ = lumenvale

    # A negative threshold forces the old behaviour (grants even at disparity 0).
    first = await EquityRecommendationService(db, budget=2, min_disparity=-1).generate(org_id)
    assert first.recommendations_created == 2
    await EquityRecommendationService(db, budget=1, min_disparity=-1).generate(org_id)
    assert await _equity_recs(db, org_id) == 1  # replaced, not 2 + 1

    security_before = (await db.execute(select(func.count()).select_from(Recommendation).where(
        Recommendation.organization_id == org_id, Recommendation.track == RecommendationTrack.SECURITY,
    ))).scalar_one()
    await RecommendationEngine(db).generate_recommendations(org_id)
    assert await _equity_recs(db, org_id) == 1
    assert security_before == 7

    # Back at the default threshold: nothing to close, so the old grants go.
    await EquityRecommendationService(db).generate(org_id)
    assert await _equity_recs(db, org_id) == 0
    assert (await db.execute(select(func.count()).select_from(EquitySnapshot).where(
        EquitySnapshot.organization_id == org_id))).scalar_one() == 3


@pytest.mark.asyncio
async def test_threshold_is_configurable_per_org(async_db_session, lumenvale):  # noqa: F811
    from app.domain.models import Organization

    db = async_db_session
    org_id, _ = lumenvale
    org = await db.get(Organization, org_id)
    org.settings = {**(org.settings or {}), "equity_min_disparity": -1}
    await db.commit()

    result = await EquityRecommendationService(db, budget=1).generate(org_id)
    assert result.recommendations_created == 1
