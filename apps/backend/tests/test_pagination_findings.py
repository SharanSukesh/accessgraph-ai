"""Pagination part 4: anomalies, Priority Actions, findings, API usage tables.
The old silent caps (anomalies 100, recommendations 100) are gone."""
from datetime import datetime, timedelta, timezone

import pytest

from app.domain.models import (
    AccessAnomaly, AnomalySeverity, Organization, Recommendation, RecommendationStatus, RecommendationTrack,
    RecommendationType,
)
from tests.test_demo_orgs import _cookie, _users, client  # noqa: F401
from tests.test_demo_path import lumenvale  # noqa: F401


async def _many(db, n_anomalies=150, n_recs=130):
    from tests import people_scale
    admin, _ = await _users(db)
    org = Organization(name="Scale", is_demo=False)
    db.add(org)
    await db.flush()
    data = await people_scale.seed(db, org.id)
    users = [u["salesforce_id"] for u in data["users"]]
    now = datetime.now(timezone.utc)
    for i in range(n_anomalies):
        db.add(AccessAnomaly(organization_id=org.id, user_id=users[i], anomaly_score=1 - i / 1000,
                             severity=AnomalySeverity.HIGH if i % 10 == 0 else AnomalySeverity.MEDIUM,
                             category="session" if i % 10 == 0 else "access",
                             reasons=[f"Reason {i}" + (" impossible travel" if i % 10 == 0 else "")], detected_at=now))
    for i in range(n_recs):
        db.add(Recommendation(organization_id=org.id, rec_type=RecommendationType.ACCESS_REVIEW,
                              track=RecommendationTrack.SECURITY,
                              status=RecommendationStatus.PENDING if i % 3 else RecommendationStatus.APPLIED,
                              severity=AnomalySeverity.HIGH if i % 5 == 0 else AnomalySeverity.LOW,
                              target_entity_type="user", target_entity_id=users[i], title=f"Review access {i:03d}",
                              description="Synthetic." + (" Payroll" if i % 7 == 0 else ""), rationale="Synthetic.",
                              generated_at=now - timedelta(minutes=i)))
    await db.commit()
    return org.id, _cookie(admin)


@pytest.mark.asyncio
async def test_anomalies_have_no_cap_and_page_with_a_summary(client, async_db_session):  # noqa: F811
    org_id, cookie = await _many(async_db_session)
    every = (await client.get(f"/orgs/{org_id}/anomalies", cookies=cookie)).json()
    assert len(every) == 150  # was cut at 100
    p = (await client.get(f"/orgs/{org_id}/anomalies", params={"page": 2, "page_size": 50}, cookies=cookie)).json()
    assert (p["total"], p["page"], len(p["items"])) == (150, 2, 50)
    assert [a["id"] for a in p["items"]] == [a["id"] for a in every[50:100]]
    assert p["summary"]["all"] == 150 and p["summary"]["session"] == 15 and p["summary"]["access"] == 135
    session = (await client.get(f"/orgs/{org_id}/anomalies", params={"page": 1, "category": "session"}, cookies=cookie)).json()
    assert session["total"] == 15 and session["summary"]["all"] == 150  # the summary ignores filters
    travel = (await client.get(f"/orgs/{org_id}/anomalies", params={"page": 1, "q": "impossible travel"}, cookies=cookie)).json()
    assert travel["total"] == 15


@pytest.mark.asyncio
async def test_recommendations_have_no_cap_and_filter_on_the_server(client, async_db_session):  # noqa: F811
    org_id, cookie = await _many(async_db_session)
    every = (await client.get(f"/orgs/{org_id}/recommendations", cookies=cookie)).json()
    assert len(every) == 130  # was cut at 100
    p = (await client.get(f"/orgs/{org_id}/recommendations", params={"page": 6, "page_size": 25}, cookies=cookie)).json()
    assert (p["total"], p["page"], len(p["items"])) == (130, 6, 5)
    assert p["summary"]["byStatus"] == {"pending": 86, "applied": 44}
    high = (await client.get(f"/orgs/{org_id}/recommendations", params={"page": 1, "severity": "high"}, cookies=cookie)).json()
    assert high["total"] == 26 and all(r["severity"] == "high" for r in high["items"])  # severity used to be ignored
    payroll = (await client.get(f"/orgs/{org_id}/recommendations", params={"page": 1, "q": "payroll"}, cookies=cookie)).json()
    assert payroll["total"] == 19  # search used to be ignored
    by_title = (await client.get(f"/orgs/{org_id}/recommendations",
                                 params={"page": 1, "sort": "title", "dir": "desc"}, cookies=cookie)).json()
    assert by_title["items"][0]["title"] == "Review access 129"


@pytest.mark.asyncio
async def test_findings_and_api_usage_tables_page(client, async_db_session, lumenvale):  # noqa: F811
    from app.services.data_quality import DataQualityService
    from app.services.org_analyzer import OrgAnalyzerService
    org_id, cookie = lumenvale
    await DataQualityService(async_db_session, org_id).run(actor_email="test")
    await OrgAnalyzerService(async_db_session, org_id).run(actor_email="test")
    every = (await client.get(f"/orgs/{org_id}/org-analyzer/findings", params={"limit": 500}, cookies=cookie)).json()
    assert every["total"] == 18
    p = (await client.get(f"/orgs/{org_id}/org-analyzer/findings", params={"page": 2, "page_size": 25}, cookies=cookie)).json()
    assert (p["page"], p["pages"], len(p["findings"])) == (1, 1, 18)
    lic = (await client.get(f"/orgs/{org_id}/org-analyzer/findings", params={"page": 1, "q": "license"}, cookies=cookie)).json()
    assert 0 < lic["total"] < 18
    savings = (await client.get(f"/orgs/{org_id}/org-analyzer/findings",
                                params={"page": 1, "sort": "savings", "dir": "desc"}, cookies=cookie)).json()
    cents = [f["estimated_annual_savings_cents"] or 0 for f in savings["findings"]]
    assert cents == sorted(cents, reverse=True)
    apps = (await client.get(f"/orgs/{org_id}/org-analyzer/api-usage/apps", params={"page": 1, "page_size": 25},
                             cookies=cookie)).json()
    full = (await client.get(f"/orgs/{org_id}/org-analyzer/api-usage/apps", cookies=cookie)).json()
    assert apps["total"] == full["total"] > 0
