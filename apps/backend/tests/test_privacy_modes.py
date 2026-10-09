"""Per-client privacy levels: masking, purge on tightening, feature gates,
and what live pulls may store."""
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select

from app.domain.models import (
    AccessAnomaly,
    AccountShareSnapshot,
    AnomalySeverity,
    ChangeAuditEvent,
    ChangeAuditRun,
    DataQualityRun,
    ObjectQualityScore,
    OrgAnalysisSnapshot,
    OrgFinding,
    FindingCategory,
    FindingSeverity,
    Organization,
    Recommendation,
    RecommendationTrack,
    RecommendationType,
    ReportInventoryItem,
    ReportSprawlRun,
    RiskLevel,
    RiskScore,
    UserSnapshot,
)
from app.services import privacy_mode
from app.services.anomaly_detection import AnomalyDetectionService
from app.services.data_retention import org_scoped_tables
from app.services.privacy_purge import HANDLED_TABLES, UNAFFECTED_TABLES, enforce_privacy_mode
from app.services.report_sprawl import ReportSprawlService
from tests.test_route_auth import _cookie, _setup, client  # noqa: F401 — fixture

NOW = datetime.now(timezone.utc)
JANE = "005000000000001AAA"


def _privacy(mode, aggregates=False):
    return {"privacy": {"mode": mode, "allow_record_aggregates": aggregates}}


@pytest.fixture(autouse=True)
def _no_graph(monkeypatch):
    async def _clear(org_id):
        return None

    monkeypatch.setattr("app.services.data_retention._clear_graph", _clear)


async def _rows(db, model, org_id):
    result = await db.execute(select(model).where(model.organization_id == org_id))
    return list(result.scalars().all())


def _jane(org_id):
    return UserSnapshot(
        organization_id=org_id,
        salesforce_id=JANE,
        name="Jane Doe",
        username="jane@acme.example",
        email="jane@acme.example",
        title="VP Sales",
        department="Sales",
        profile_id="00e000000000001",
        is_active=True,
        raw_data={
            "Id": JANE, "Name": "Jane Doe", "Email": "jane@acme.example",
            "Phone": "555-0100", "Department": "Sales", "ProfileId": "00e000000000001",
        },
    )


# ------------------------------------------------------------- masking


def test_mask_user_record_drops_identity_keeps_structure():
    masked = privacy_mode.mask_user_record("org-1", {
        "Id": JANE, "Name": "Jane Doe", "Username": "jane@acme.example",
        "Email": "jane@acme.example", "Phone": "555-0100", "Title": "Chief Revenue Officer",
        "Department": "Sales", "ProfileId": "00e000000000001", "IsActive": True,
    })

    assert masked["Id"] == JANE
    assert masked["Department"] == "Sales"
    assert masked["ProfileId"] == "00e000000000001"
    assert masked["Name"] == privacy_mode.user_alias("org-1", JANE)
    assert masked["Email"] is None
    assert masked["Title"] == "Senior leader"
    assert "Phone" not in masked
    assert "jane" not in str(masked).lower()


# ------------------------------------------------------------- purge


def test_every_org_scoped_table_is_reviewed_for_privacy():
    tables = {t.name for t in org_scoped_tables()}
    assert not HANDLED_TABLES & UNAFFECTED_TABLES
    assert tables - HANDLED_TABLES - UNAFFECTED_TABLES == set()


@pytest.mark.asyncio
async def test_masked_purge_aliases_users_and_drops_audit_text(async_db_session):
    db = async_db_session
    org = Organization(name="Client", settings=_privacy("masked"))
    db.add(org)
    await db.flush()
    alias = privacy_mode.user_alias(org.id, JANE)
    run = ChangeAuditRun(
        organization_id=org.id, snapshot_at=NOW, since=NOW - timedelta(days=30),
        rollups={
            "by_actor": {"Jane Doe": 3},
            "new_actors": ["Jane Doe"],
            "top_actors_detailed": [{"name": "Jane Doe", "count": 3}],
            "bursts": [{"actor": "Jane Doe", "sample_displays": ["Reset password for Bob Roe"]}],
        },
    )
    db.add_all([_jane(org.id), run])
    await db.flush()
    db.add_all([
        ChangeAuditEvent(
            organization_id=org.id, run_id=run.id, sf_event_id="0Ym000000000001",
            created_at_sf=NOW, actor_id=JANE, actor_name="Jane Doe",
            display="Reset password for Bob Roe", delegate_user="admin@acme.example",
        ),
        AccessAnomaly(
            organization_id=org.id, user_id=JANE, anomaly_score=0.9,
            severity=AnomalySeverity.HIGH, detected_at=NOW, category="session",
            reasons=["Impossible travel: login from Boston, US then Berlin, Germany"],
        ),
        AccessAnomaly(
            organization_id=org.id, user_id=JANE, anomaly_score=0.7,
            severity=AnomalySeverity.MEDIUM, detected_at=NOW, category="access",
        ),
        Recommendation(
            organization_id=org.id, rec_type=RecommendationType.ACCESS_REVIEW,
            severity=AnomalySeverity.MEDIUM, target_entity_type="user", target_entity_id=JANE,
            title="Review permission set assignments for Jane Doe", description="-",
            rationale="-", generated_at=NOW,
        ),
        Recommendation(
            organization_id=org.id, rec_type=RecommendationType.GRANT_FOR_EQUITY,
            track=RecommendationTrack.EQUITY, severity=AnomalySeverity.INFO,
            target_entity_type="user", target_entity_id=JANE,
            title="Connect Jane Doe", description="-", rationale="-", generated_at=NOW,
        ),
    ])
    await db.commit()

    counts = await enforce_privacy_mode(db, org)
    await db.commit()

    user = (await _rows(db, UserSnapshot, org.id))[0]
    assert (user.name, user.email, user.title) == (alias, None, "Senior leader")
    assert user.username.endswith("@masked.newton")
    assert "Phone" not in user.raw_data and user.raw_data["Department"] == "Sales"

    event = (await _rows(db, ChangeAuditEvent, org.id))[0]
    assert (event.actor_id, event.actor_name) == (JANE, alias)
    assert event.display == "" and event.delegate_user is None

    rollups = (await _rows(db, ChangeAuditRun, org.id))[0].rollups
    assert rollups["by_actor"] == {alias: 3}
    assert rollups["new_actors"] == [alias]
    assert rollups["top_actors_detailed"][0]["name"] == alias
    assert rollups["bursts"][0] == {"actor": alias, "sample_displays": []}

    anomalies = await _rows(db, AccessAnomaly, org.id)
    assert [a.category for a in anomalies] == ["access"]

    recs = await _rows(db, Recommendation, org.id)
    assert [r.title for r in recs] == [f"Review permission set assignments for {alias}"]

    assert counts["users_snapshot_updated"] == 1
    assert counts["access_anomalies_deleted"] == 1
    assert counts["recommendations_deleted"] == 1

    # A second pass finds nothing left to change.
    assert await enforce_privacy_mode(db, org) == {}


@pytest.mark.asyncio
@pytest.mark.parametrize("aggregates", [False, True])
async def test_metadata_only_purge_deletes_user_data(async_db_session, aggregates):
    db = async_db_session
    org = Organization(name="Client", settings=_privacy("metadata_only", aggregates))
    db.add(org)
    await db.flush()
    dq_run = DataQualityRun(organization_id=org.id, snapshot_at=NOW)
    snapshot = OrgAnalysisSnapshot(
        organization_id=org.id, snapshot_at=NOW, findings_count=2,
        findings_by_severity={"medium": 2}, findings_by_category={"data_quality": 1, "user_activity": 1},
        metrics={"sobject_record_counts": {"Account": 10}, "total_accounts": 10, "total_roles": 4},
    )
    report_run = ReportSprawlRun(organization_id=org.id, snapshot_at=NOW)
    db.add_all([_jane(org.id), dq_run, snapshot, report_run])
    await db.flush()
    db.add_all([
        RiskScore(
            organization_id=org.id, entity_type="user", entity_id=JANE, risk_score=80,
            risk_level=RiskLevel.HIGH, reason_text="Jane Doe holds Modify All", calculated_at=NOW,
        ),
        AccessAnomaly(
            organization_id=org.id, user_id=JANE, anomaly_score=0.7,
            severity=AnomalySeverity.MEDIUM, detected_at=NOW, category="access",
        ),
        AccountShareSnapshot(
            organization_id=org.id, salesforce_id="00r000000000001", account_id="001000000000001",
            user_or_group_id=JANE, account_access_level="Edit", opportunity_access_level="None",
            case_access_level="None", row_cause="Manual", snapshot_date=NOW,
        ),
        ObjectQualityScore(
            organization_id=org.id, run_id=dq_run.id, object_name="Account", object_label="Account",
        ),
        OrgFinding(
            organization_id=org.id, snapshot_id=snapshot.id, category=FindingCategory.DATA_QUALITY,
            code="ACCOUNT_OWNERSHIP_CONCENTRATION", severity=FindingSeverity.MEDIUM,
            title="Top 5 owners hold 60% of 10 accounts", description="-",
            evidence={"top_owners": [{"owner_id": JANE, "owner_name": "Jane Doe"}]},
        ),
        OrgFinding(
            organization_id=org.id, snapshot_id=snapshot.id, category=FindingCategory.USER_ACTIVITY,
            code="USER_DORMANT", severity=FindingSeverity.MEDIUM, title="1 users dormant",
            description="-",
            evidence={"sample": [{"id": JANE, "name": "Jane Doe", "email": "jane@acme.example"}]},
        ),
        ReportInventoryItem(
            organization_id=org.id, run_id=report_run.id, sf_id="00O000000000001",
            item_type="report", name="Pipeline", owner_sf_id=JANE, owner_name="Jane Doe",
            owner_is_active=True, evidence={"tier_reason": "Jane Doe (owner) ran it last week"},
        ),
    ])
    await db.commit()

    await enforce_privacy_mode(db, org)
    await db.commit()

    for model in (UserSnapshot, RiskScore, AccessAnomaly, AccountShareSnapshot):
        assert await _rows(db, model, org.id) == [], model.__tablename__

    item = (await _rows(db, ReportInventoryItem, org.id))[0]
    assert item.owner_name is None
    assert "Jane" not in item.evidence["tier_reason"]

    findings = {f.code: f for f in await _rows(db, OrgFinding, org.id)}
    sample = findings["USER_DORMANT"].evidence["sample"][0]
    assert sample == {"id": JANE, "name": privacy_mode.user_alias(org.id, JANE)}

    snap = (await _rows(db, OrgAnalysisSnapshot, org.id))[0]
    dq_left = await _rows(db, DataQualityRun, org.id) + await _rows(db, ObjectQualityScore, org.id)
    if aggregates:
        assert len(dq_left) == 2
        assert "ACCOUNT_OWNERSHIP_CONCENTRATION" in findings
        assert snap.metrics["total_accounts"] == 10
    else:
        assert dq_left == []
        assert set(findings) == {"USER_DORMANT"}
        assert snap.findings_count == 1
        assert snap.findings_by_category == {"data_quality": 0, "user_activity": 1}
        assert snap.metrics == {"total_roles": 4}


# ------------------------------------------------------------- gates


@pytest.mark.asyncio
async def test_feature_gates_return_409_for_privacy_level(client, async_db_session):  # noqa: F811
    _, a, b, admin, *_ = await _setup(async_db_session)
    a.settings = _privacy("metadata_only")
    b.settings = _privacy("masked")
    await async_db_session.commit()

    for path in ("change-risk/run", "license-fit/run", "restructure/run",
                 "equity/recommendations/generate", "data-quality/run"):
        r = await client.post(f"/orgs/{a.id}/{path}", cookies=_cookie(admin))
        assert r.status_code == 409, path
        assert r.json()["detail"]["code"] == "privacy_mode"

    r = await client.get(f"/orgs/{a.id}/reporting-graph", cookies=_cookie(admin))
    assert r.status_code == 409

    # Masked keeps the audit trail, so the run proceeds past the gate (and
    # then fails for want of a Salesforce connection).
    r = await client.post(f"/orgs/{b.id}/change-risk/run", cookies=_cookie(admin))
    assert r.status_code == 500


# ------------------------------------------------------------- live pulls


class _FakeLoginClient:
    def __init__(self, history, geo):
        self.history, self.geo = history, geo

    async def get_login_history(self, since_days=90):
        return self.history

    async def get_login_geo(self, since_days=90):
        return self.geo


def _iso(dt):
    return dt.strftime("%Y-%m-%dT%H:%M:%S.000Z")


@pytest.mark.asyncio
async def test_session_anomalies_keep_no_login_detail_when_masked(async_db_session):
    db = async_db_session
    org = Organization(name="Client", settings=_privacy("masked"))
    db.add(org)
    await db.flush()
    db.add(_jane(org.id))
    await db.commit()

    logins = [
        ("L1", NOW - timedelta(days=40), "Chrome 120", "Mac OSX", "United States", "Boston"),
        ("L2", NOW - timedelta(days=2, hours=1), "Firefox 130", "Windows 11", "United States", "Boston"),
        ("L3", NOW - timedelta(days=2), "Firefox 130", "Windows 11", "Germany", "Berlin"),
    ]
    history = [
        {"Id": lid, "UserId": JANE, "LoginTime": _iso(ts), "Status": "Success",
         "Browser": browser, "Platform": platform, "SourceIp": "203.0.113.9"}
        for lid, ts, browser, platform, _, _ in logins
    ]
    geo = [
        {"LoginHistoryId": lid, "Country": country, "City": city, "Latitude": 1.0, "Longitude": 2.0}
        for lid, _, _, _, country, city in logins
    ]

    found = await AnomalyDetectionService(db).detect_session_anomalies(
        org.id, _FakeLoginClient(history, geo)
    )

    assert len(found) == 1
    stored = str([found[0].reasons, found[0].features, found[0].peer_stats])
    assert "Germany" in stored
    for detail in ("Boston", "Berlin", "Chrome", "Firefox", "Windows", "Mac", "203.0.113"):
        assert detail not in stored, detail


@pytest.mark.asyncio
async def test_session_anomalies_skipped_without_login_history(async_db_session):
    db = async_db_session
    org = Organization(name="Client", settings=_privacy("metadata_only"))
    db.add(org)
    await db.commit()

    class _Exploding:
        async def get_login_history(self, since_days=90):
            raise AssertionError("LoginHistory must not be queried")

    assert await AnomalyDetectionService(db).detect_session_anomalies(org.id, _Exploding()) == []


class _FakeReportClient:
    def __init__(self):
        self.soql = []

    async def extract_reports(self):
        return [{
            "Id": "00O000000000001", "Name": "Pipeline", "OwnerId": JANE,
            "LastRunDate": _iso(NOW - timedelta(days=3)),
        }]

    async def extract_dashboards(self):
        return [{"Id": "01Z000000000001", "Title": "Sales", "RunningUserId": JANE}]

    async def extract_folders(self):
        return []

    async def query_all(self, soql):
        self.soql.append(soql)
        return [{"Id": JANE, "Name": "Jane Doe", "IsActive": False}]


async def _report_run(db, settings):
    org = Organization(name="Client", settings=settings)
    db.add(org)
    await db.commit()
    fake = _FakeReportClient()
    service = ReportSprawlService(db, org.id)

    async def _client():
        return fake

    service._client = _client
    await service.run()
    items = await _rows(db, ReportInventoryItem, org.id)
    return org, fake, {i.item_type: i for i in items}


@pytest.mark.asyncio
async def test_report_sprawl_metadata_only_never_queries_users(async_db_session):
    _, fake, items = await _report_run(async_db_session, _privacy("metadata_only"))

    assert not any("FROM User" in q for q in fake.soql)
    report = items["report"]
    assert report.owner_name is None and report.owner_is_active is None
    assert report.tier == "live"
    assert "privacy level" in report.evidence["tier_reason"]


@pytest.mark.asyncio
async def test_report_sprawl_masked_stores_owner_alias(async_db_session):
    org, fake, items = await _report_run(async_db_session, _privacy("masked"))

    alias = privacy_mode.user_alias(org.id, JANE)
    assert any("FROM User" in q for q in fake.soql)
    assert items["report"].owner_name == alias
    assert items["report"].tier == "orphaned"
    assert "Jane" not in str(items["dashboard"].evidence)
    assert alias in items["dashboard"].evidence["tier_reason"]


class _FakeAuditClient:
    async def extract_setup_audit_trail(self, since_days=30, limit=5000):
        return [
            {
                "Id": f"0Ym00000000000{i}", "CreatedDate": _iso(NOW - timedelta(minutes=i)),
                "CreatedBy": {"Id": JANE, "Name": "Jane Doe", "Username": "jane@acme.example"},
                "Section": "Manage Users", "Action": "resetpassword",
                "Display": "Deleted user Bob Roe", "DelegateUser": "admin@acme.example",
            }
            for i in range(3)
        ]

    async def extract_recent_metadata_activity(self, since_days=30, top_per_type=5):
        return {"flow": {"count": 1, "top": [{"id": "301", "name": "F", "actor": "Jane Doe"}]}}


@pytest.mark.asyncio
async def test_change_risk_masked_stores_aliases_not_audit_text(async_db_session):
    from app.services.change_risk_radar import ChangeRiskRadarService

    db = async_db_session
    org = Organization(name="Client", settings=_privacy("masked"))
    db.add(org)
    await db.commit()
    service = ChangeRiskRadarService(db, org.id)

    async def _client():
        return _FakeAuditClient()

    service._client = _client
    run = await service.run()

    alias = privacy_mode.user_alias(org.id, JANE)
    events = await _rows(db, ChangeAuditEvent, org.id)
    assert {(e.actor_name, e.display, e.delegate_user) for e in events} == {(alias, "", None)}
    # The "delete" keyword still scored, though the text is gone.
    assert all(e.blast_radius == 75 for e in events)
    stored = str(run.rollups)
    assert "Jane" not in stored and "Bob" not in stored and "acme" not in stored
    assert run.rollups["bursts"][0]["sample_displays"] == []


@pytest.mark.asyncio
async def test_tightening_via_route_purges_and_reports_counts(client, async_db_session):  # noqa: F811
    _, a, _, admin, *_ = await _setup(async_db_session)
    async_db_session.add(_jane(a.id))
    await async_db_session.commit()

    r = await client.put(
        f"/orgs/{a.id}/privacy/mode", json={"mode": "metadata_only"}, cookies=_cookie(admin)
    )

    assert r.status_code == 200
    assert r.json()["purged"]["users_snapshot_deleted"] == 1
    assert await _rows(async_db_session, UserSnapshot, a.id) == []
