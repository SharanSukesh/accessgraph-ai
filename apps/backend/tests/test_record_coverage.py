"""Record access says "Based on records the integration user can see"
unless the integration user can see every record."""
from datetime import datetime, timezone

import pytest

from app.domain.models import Organization, SyncJob, SyncStatus, UserSnapshot
from app.services.org_analyzer import AnalyzerContext, _coverage_evidence
from app.services.record_coverage import PARTIAL_LABEL, check_record_visibility, summarize
from tests.test_demo_orgs import _cookie, _users, client  # noqa: F401  (fixture)


class _Result:
    def __init__(self, records):
        self.records = records


class _Client:
    def __init__(self, view_all_data=False, view_all=(), fail=False):
        self.view_all_data, self.view_all, self.fail, self.soql = view_all_data, view_all, fail, []

    async def query(self, soql):
        self.soql.append(soql)
        if self.fail:
            raise RuntimeError("INSUFFICIENT_ACCESS")
        if "FROM PermissionSetAssignment" in soql and "ObjectPermissions" not in soql:
            return _Result([{"PermissionSet": {"PermissionsViewAllData": self.view_all_data}}])
        return _Result([{"SobjectType": o, "PermissionsViewAllRecords": True} for o in self.view_all])


@pytest.mark.asyncio
async def test_visibility_check_reads_view_all_data_and_per_object_view_all():
    uid = "005000000000001AAA"
    got = await check_record_visibility(_Client(view_all=("Account",)), uid)
    assert got == {"checked": True, "view_all_data": False, "view_all": {"Account": True, "Opportunity": False}}
    assert summarize(got)["objects"] == {"Account": "full", "Opportunity": "partial"}
    assert summarize(got)["label"] == PARTIAL_LABEL

    assert summarize(await check_record_visibility(_Client(view_all_data=True), uid))["label"] is None
    assert await check_record_visibility(_Client(fail=True), uid) == {"checked": False}
    # Never builds SOQL from an unexpected id.
    bad = _Client()
    assert await check_record_visibility(bad, "005' OR Id != '") == {"checked": False} and bad.soql == []


def test_unknown_coverage_is_labelled_too():
    s = summarize(None)
    assert s["objects"] == {"Account": "unknown", "Opportunity": "unknown"}
    assert s["label"] == PARTIAL_LABEL and "couldn't check" in s["detail"]


def test_share_based_findings_carry_the_label_when_partial():
    ctx = AnalyzerContext(org_id="o", actor_email=None)
    ctx.record_coverage = summarize({"checked": True, "view_all_data": False, "view_all": {"Account": True}})
    assert _coverage_evidence(ctx, "Account") == {}
    assert _coverage_evidence(ctx, "Opportunity") == {"coverage": PARTIAL_LABEL, "coverage_status": "partial"}


@pytest.mark.asyncio
async def test_record_access_api_reports_coverage_from_the_latest_sync(client, async_db_session):  # noqa: F811
    admin, _ = await _users(async_db_session)
    org = Organization(name="Live", is_demo=False)
    async_db_session.add(org)
    await async_db_session.flush()
    async_db_session.add_all([
        UserSnapshot(organization_id=org.id, salesforce_id="005rep", username="rep@x", name="Rep", is_active=True),
        SyncJob(organization_id=org.id, status=SyncStatus.COMPLETED, completed_at=datetime.now(timezone.utc),
                sync_metadata={"record_coverage": {"checked": True, "view_all_data": False,
                                                   "view_all": {"Account": False, "Opportunity": False}}}),
    ])
    await async_db_session.commit()

    body = (await client.get(f"/orgs/{org.id}/users/005rep/record-access", cookies=_cookie(admin))).json()
    assert body["coverage"]["label"] == "Based on records the integration user can see"
    assert body["coverage"]["objects"] == {"Account": "partial", "Opportunity": "partial"}


@pytest.mark.asyncio
async def test_demo_sync_records_lumenvale_coverage(async_db_session):
    from app.ingestion.orchestrator import SyncOrchestrator
    from app.services.record_coverage import latest_record_coverage

    org = Organization(name="Lumenvale Systems (Demo)", is_demo=True, settings={"demo_fixture": "synthetic_mid_market"})
    async_db_session.add(org)
    await async_db_session.flush()
    job = SyncJob(organization_id=org.id, status=SyncStatus.PENDING)
    async_db_session.add(job)
    await async_db_session.commit()
    await SyncOrchestrator(async_db_session).run_sync(org.id, job.id)

    cov = await latest_record_coverage(async_db_session, org.id)
    assert cov["objects"] == {"Account": "partial", "Opportunity": "partial"} and cov["label"] == PARTIAL_LABEL
