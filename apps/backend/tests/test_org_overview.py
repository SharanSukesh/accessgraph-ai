"""Security summary, org limits, logins by profile and component counts
(Config Workbook parity rows #26-28)."""
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select

from app.domain.models import AccessAnomaly, Organization, ProfileSnapshot, UserSnapshot
from app.services import org_overview as ov
from app.services import privacy_mode
from app.services.change_risk_radar import ChangeRiskRadarService
from app.services.data_quality import DataQualityService
from app.services.org_analyzer import OrgAnalyzerService
from tests.test_demo_orgs import client  # noqa: F401
from tests.test_demo_path import lumenvale  # noqa: F401


def test_limit_status_thresholds():
    rows = {r["name"]: r for r in ov.limits_rows({
        "A": {"Max": 100, "Remaining": 5}, "B": {"Max": 100, "Remaining": 25}, "C": {"Max": 100, "Remaining": 26},
        "Z": {"Max": 0, "Remaining": 0}, "DailyApiRequests": {"Max": 1000, "Remaining": 900, "Ant Migration Tool": {}},
        "Weird": {"Max": 10}})}
    assert (rows["A"]["status"], rows["B"]["status"], rows["C"]["status"]) == ("critical", "warning", "healthy")
    assert rows["Z"]["status"] == "not_applicable" and "Weird" not in rows
    assert rows["DailyApiRequests"]["label"] == "API requests (24 hours)" and rows["A"]["pct"] == 95.0


def test_logins_by_profile_from_last_login():
    now = datetime(2026, 10, 19, tzinfo=timezone.utc)

    class U:
        def __init__(self, profile, days, active=True):
            self.profile_id, self.is_active = profile, active
            self.last_login_at = None if days is None else now - timedelta(days=days)

    rows = ov.logins_by_profile([U("p1", 3), U("p1", 45), U("p1", 200), U("p1", None), U("p2", 10), U("p2", 1, active=False)],
                                {"p1": "Sales Rep", "p2": "Admin"}, now)
    assert rows[0] == {"profileId": "p1", "profile": "Sales Rep", "active": 4, "last30": 1, "last90": 2, "never": 1, "notIn90": 1}
    assert rows[1]["active"] == 1 and rows[1]["last30"] == 1


@pytest.mark.asyncio
async def test_lumenvale_limits_summary_and_overview(client, async_db_session, lumenvale):  # noqa: F811
    db = async_db_session
    org_id, cookie = lumenvale
    before = (await client.get(f"/orgs/{org_id}/org-limits", params={"page": 1}, cookies=cookie)).json()
    assert before["total"] == 0 and before["readAt"] is None
    summary = (await client.get(f"/orgs/{org_id}/security-summary", cookies=cookie)).json()
    assert summary["health"] is None and summary["changes"] is None
    assert summary["sharing"] == {"objects": 5, "public": []}  # Lumenvale's org-wide defaults are all private

    await DataQualityService(db, org_id).run(actor_email="test")  # the runbook's 41 is after Data Quality
    await OrgAnalyzerService(db, org_id).run(actor_email="test")
    limits = (await client.get(f"/orgs/{org_id}/org-limits", params={"page": 1}, cookies=cookie)).json()
    assert limits["summary"] == {"healthy": 17, "warning": 3, "critical": 1} and limits["total"] == 21
    assert limits["items"][0]["name"] == "HourlyPublishedPlatformEvents" and limits["items"][0]["pct"] == 93.0
    warn = (await client.get(f"/orgs/{org_id}/org-limits", params={"page": 1, "status": "warning"}, cookies=cookie)).json()
    assert {r["name"] for r in warn["items"]} == {"DataStorageMB", "DailyAsyncApexExecutions", "DailyWorkflowEmails"}
    found = (await client.get(f"/orgs/{org_id}/org-limits", params={"page": 1, "q": "storage"}, cookies=cookie)).json()
    assert {r["name"] for r in found["items"]} == {"DataStorageMB", "FileStorageMB"}

    await ChangeRiskRadarService(db, org_id).run(actor_email="test")
    s = (await client.get(f"/orgs/{org_id}/security-summary", cookies=cookie)).json()
    assert s["health"]["score"] == 41 and s["health"]["findings"] == 18
    assert s["limits"] == {"total": 21, "warning": 3, "critical": 1}
    assert s["changes"]["highBlast"] == 20 and s["changes"]["events"] == 60
    flagged = (await db.execute(select(AccessAnomaly).where(AccessAnomaly.organization_id == org_id))).scalars().all()
    assert s["anomalies"]["total"] == len(flagged) == 8
    mad = next(a for a in s["admins"] if a["permission"] == "ModifyAllData")
    admins = (await client.get(f"/orgs/{org_id}/security-summary/admins", params={"page": 1, "permission": "ModifyAllData"},
                               cookies=cookie)).json()
    assert admins["total"] == mad["users"] and admins["label"] == "Modify All Data"
    sys_admin = (await db.execute(select(ProfileSnapshot).where(ProfileSnapshot.organization_id == org_id,
                                                                ProfileSnapshot.name == "System Administrator"))).scalar_one()
    sys_admins = {u.salesforce_id for u in (await db.execute(select(UserSnapshot).where(
        UserSnapshot.organization_id == org_id, UserSnapshot.is_active.is_(True),
        UserSnapshot.profile_id == sys_admin.salesforce_id))).scalars().all()}
    holders = (await client.get(f"/orgs/{org_id}/security-summary/admins", params={"permission": "ModifyAllData"},
                                cookies=cookie)).json()["items"]
    assert sys_admins <= {h["salesforceUserId"] for h in holders}
    assert (await client.get(f"/orgs/{org_id}/security-summary/admins", params={"permission": "Nope"},
                             cookies=cookie)).status_code == 400

    overview = (await client.get(f"/orgs/{org_id}/org-overview", cookies=cookie)).json()
    counts = {c["key"]: c["count"] for c in overview["components"]}
    assert (counts["objects"], counts["validation_rules"], counts["flows"], counts["apex_triggers"]) == (29, 26, 16, 12)
    assert counts["active_flows"] == 15 and counts["active_users"] == overview["logins"]["totals"]["active"]
    users = (await db.execute(select(UserSnapshot).where(UserSnapshot.organization_id == org_id,
                                                         UserSnapshot.is_active.is_(True)))).scalars().all()
    assert overview["logins"]["totals"]["never"] == sum(1 for u in users if u.last_login_at is None)
    paged = (await client.get(f"/orgs/{org_id}/logins-by-profile", params={"page": 1}, cookies=cookie)).json()
    assert paged["total"] == overview["logins"]["count"] and paged["sort"] == "active"

    org = await db.get(Organization, org_id)
    privacy_mode.set_privacy(org, privacy_mode.METADATA_ONLY, False, "test")
    await db.commit()
    s = (await client.get(f"/orgs/{org_id}/security-summary", cookies=cookie)).json()
    assert s["admins"] is None and s["anomalies"] is None and s["health"] is not None
    assert (await client.get(f"/orgs/{org_id}/security-summary/admins", cookies=cookie)).status_code == 409
    assert (await client.get(f"/orgs/{org_id}/org-overview", cookies=cookie)).json()["logins"] is None
