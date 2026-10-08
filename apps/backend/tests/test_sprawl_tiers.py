from datetime import datetime, timedelta, timezone

import pytest

from app.api.routes.automation_sprawl import (
    ItemResponse as AutomationItemResponse,
    _stored_tiers,
)
from app.domain.models import AutomationInventoryItem
from app.services.automation_sprawl import AutomationSprawlService
from app.services.report_sprawl import ReportSprawlService


NOW = datetime(2026, 10, 8, 12, 0, tzinfo=timezone.utc)
ACTIVE_USER = "005000000000001"
INACTIVE_USER = "005000000000002"
USERS = {
    ACTIVE_USER: {"Id": ACTIVE_USER, "Name": "Ada Admin", "IsActive": True},
    INACTIVE_USER: {"Id": INACTIVE_USER, "Name": "Gone Dev", "IsActive": False},
}


def _sf_date(days_ago):
    return (NOW - timedelta(days=days_ago)).strftime("%Y-%m-%dT%H:%M:%S.000+0000")


def _automation():
    return AutomationSprawlService.__new__(AutomationSprawlService)


def _reports():
    return ReportSprawlService.__new__(ReportSprawlService)


def _flow(*, active=True, days=30, modifier=ACTIVE_USER, out_of_date=False, namespace=None):
    return {
        "Id": "300000000000001",
        "Label": "Lead Routing",
        "ApiName": "Lead_Routing",
        "IsActive": active,
        "IsOutOfDate": out_of_date,
        "LastModifiedById": modifier,
        "LastModifiedDate": _sf_date(days),
        "NamespacePrefix": namespace,
    }


def _trigger(*, status="Active", valid=True, days=30, modifier=ACTIVE_USER, namespace=None):
    return {
        "Id": "01q000000000001",
        "Name": "AccountTrigger",
        "Status": status,
        "IsValid": valid,
        "LastModifiedById": modifier,
        "LastModifiedDate": _sf_date(days),
        "NamespacePrefix": namespace,
        "TableEnumOrId": "Account",
    }


# ---------------------------------------------------------------- automation


def test_recent_active_flow_is_active():
    item = _automation()._score_flow(_flow(), USERS, NOW)
    assert item.tier == "active"


def test_invalid_active_trigger_needs_attention():
    item = _automation()._score_trigger(_trigger(valid=False), USERS, NOW)
    assert item.tier == "needs_attention"
    assert "confirm it compiles" in item.evidence["tier_reason"]


def test_invalid_inactive_trigger_is_inactive_not_needs_attention():
    item = _automation()._score_trigger(
        _trigger(status="Inactive", valid=False), USERS, NOW
    )
    assert item.tier == "inactive"
    assert "Marked invalid by Salesforce" in item.evidence["notes"]


def test_out_of_date_flow_alone_is_not_needs_attention():
    item = _automation()._score_flow(_flow(out_of_date=True), USERS, NOW)
    assert item.tier == "active"
    assert item.is_valid is None
    assert item.evidence["notes"] == ["Newer version saved but not activated"]


def test_inactive_modifier_is_orphaned():
    item = _automation()._score_flow(_flow(modifier=INACTIVE_USER), USERS, NOW)
    assert item.tier == "orphaned"
    assert "Gone Dev" in item.evidence["tier_reason"]


def test_unresolved_modifier_is_not_orphaned():
    item = _automation()._score_flow(
        _flow(modifier="005000000000099"), USERS, NOW
    )
    assert item.tier == "active"
    assert item.owner_is_active is None
    assert "couldn't be resolved" in item.evidence["tier_reason"]


def test_inactive_flow_recently_modified_is_inactive():
    item = _automation()._score_flow(_flow(active=False, days=10), USERS, NOW)
    assert item.tier == "inactive"


def test_inactive_trigger_is_inactive():
    item = _automation()._score_trigger(_trigger(status="Inactive"), USERS, NOW)
    assert item.tier == "inactive"


def test_old_active_flow_is_unchanged_with_usage_caveat():
    item = _automation()._score_flow(_flow(days=400), USERS, NOW)
    assert item.tier == "unchanged"
    assert "Event Monitoring" in item.evidence["tier_reason"]


def test_old_inactive_flow_is_inactive_not_unchanged():
    item = _automation()._score_flow(_flow(active=False, days=900), USERS, NOW)
    assert item.tier == "inactive"


def test_managed_package_never_orphaned_or_unchanged():
    item = _automation()._score_flow(
        _flow(modifier=INACTIVE_USER, days=900, namespace="acme"), USERS, NOW
    )
    assert item.tier == "active"
    assert item.evidence["managed_package"] == "acme"

    trig = _automation()._score_trigger(
        _trigger(modifier=INACTIVE_USER, days=900, namespace="acme"),
        USERS,
        NOW,
    )
    assert trig.tier == "active"
    assert trig.evidence["managed_package"] == "acme"


def test_managed_package_still_tiers_inactive_and_needs_attention():
    inactive = _automation()._score_flow(
        _flow(active=False, namespace="acme"), USERS, NOW
    )
    assert inactive.tier == "inactive"
    invalid = _automation()._score_trigger(
        _trigger(valid=False, namespace="acme"), USERS, NOW
    )
    assert invalid.tier == "needs_attention"


def test_legacy_automation_tiers_map_to_new_names():
    row = AutomationInventoryItem(
        id="i1",
        sf_id="300000000000001",
        item_type="flow",
        name="Old",
        tier="broken",
        evidence={},
    )
    assert AutomationItemResponse.from_orm(row).tier == "needs_attention"
    row.tier = "dormant"
    assert AutomationItemResponse.from_orm(row).tier == "unchanged"
    assert _stored_tiers("needs_attention") == ["needs_attention", "broken"]
    assert _stored_tiers("inactive") == ["inactive"]


# ---------------------------------------------------------------- reports


def _report(*, last_run=None, last_ref=None, owner=ACTIVE_USER):
    return {
        "Id": "00O000000000001",
        "Name": "Pipeline by Stage",
        "OwnerId": owner,
        "LastRunDate": _sf_date(last_run) if last_run is not None else None,
        "LastReferencedDate": (
            _sf_date(last_ref) if last_ref is not None else None
        ),
    }


def _dashboard(*, running_user=ACTIVE_USER, last_ref=None):
    return {
        "Id": "01Z000000000001",
        "Title": "Sales Overview",
        "RunningUserId": running_user,
        "LastReferencedDate": (
            _sf_date(last_ref) if last_ref is not None else None
        ),
    }


def test_report_prefers_last_run_date():
    item = _reports()._score_report(
        _report(last_run=20, last_ref=800), USERS, NOW
    )
    assert item.tier == "live"
    assert item.days_since_last_view == 20
    assert item.evidence["usage_source"] == "last_run"


def test_report_old_last_run_is_zombie_even_if_recently_viewed_by_connected_user():
    item = _reports()._score_report(
        _report(last_run=500, last_ref=1), USERS, NOW
    )
    assert item.tier == "zombie"


def test_integration_user_never_viewed_but_recently_run_is_live():
    item = _reports()._score_report(_report(last_run=5), USERS, NOW)
    assert item.tier == "live"


def test_report_falls_back_to_connected_user_view_with_caveat():
    item = _reports()._score_report(_report(last_ref=10), USERS, NOW)
    assert item.tier == "live"
    assert item.evidence["usage_source"] == "connected_user_view"
    assert "connected user's views only" in item.evidence["tier_reason"]


def test_report_never_run_is_zombie():
    item = _reports()._score_report(_report(), USERS, NOW)
    assert item.tier == "zombie"


def test_report_inactive_owner_is_orphaned():
    item = _reports()._score_report(
        _report(last_run=5, owner=INACTIVE_USER), USERS, NOW
    )
    assert item.tier == "orphaned"


def test_report_unresolved_owner_is_not_orphaned():
    item = _reports()._score_report(
        _report(last_run=5, owner="005000000000099"), USERS, NOW
    )
    assert item.tier == "live"
    assert "Owner couldn't be resolved" in item.evidence["tier_reason"]

    folder_owned = _reports()._score_report(
        _report(last_run=5, owner="00l000000000001"), USERS, NOW
    )
    assert folder_owned.tier == "live"
    assert "shared folder" in folder_owned.evidence["tier_reason"]


def test_dashboard_is_unknown_usage_regardless_of_view_dates():
    for last_ref in (None, 1, 900):
        item = _reports()._score_dashboard(
            _dashboard(last_ref=last_ref), USERS, {}, NOW
        )
        assert item.tier == "unknown_usage"
        assert item.days_since_last_view is None
        assert "isn't observable" in item.evidence["tier_reason"]


def test_dashboard_inactive_running_user_is_orphaned():
    item = _reports()._score_dashboard(
        _dashboard(running_user=INACTIVE_USER), USERS, {}, NOW
    )
    assert item.tier == "orphaned"


def test_dashboard_unresolved_running_user_is_unknown_usage():
    item = _reports()._score_dashboard(
        _dashboard(running_user="005000000000099"), USERS, {}, NOW
    )
    assert item.tier == "unknown_usage"
    assert "Owner couldn't be resolved" in item.evidence["tier_reason"]


# ---------------------------------------------------------------- full run


class _FakeReportClient:
    def __init__(self, reports, dashboards):
        self._reports = reports
        self._dashboards = dashboards

    async def extract_reports(self):
        return self._reports

    async def extract_dashboards(self):
        return self._dashboards

    async def extract_folders(self):
        return []

    async def query_all(self, soql):
        return list(USERS.values())


@pytest.mark.asyncio
async def test_report_run_counts_unknown_usage_and_duplicates(async_db_session):
    from app.domain.models import Organization

    org = Organization(id="org-1", name="Acme")
    async_db_session.add(org)
    await async_db_session.commit()

    dash_a = _dashboard()
    dash_b = dict(_dashboard(), Id="01Z000000000002", Title="Sales Overview copy")
    dash_c = dict(_dashboard(), Id="01Z000000000003", Title="Exec Summary")
    client = _FakeReportClient([_report(last_run=5)], [dash_a, dash_b, dash_c])

    service = ReportSprawlService(async_db_session, "org-1")

    async def _client():
        return client

    service._client = _client
    run = await service.run()

    assert run.items_live == 1
    assert run.items_duplicate == 2
    assert run.items_unknown_usage == 1
    assert run.items_never_referenced == 0


class _FakeAutomationClient:
    def __init__(self, flows, triggers):
        self._flows = flows
        self._triggers = triggers

    async def extract_flows(self):
        return self._flows

    async def extract_apex_triggers(self):
        return self._triggers

    async def query_all(self, soql):
        return list(USERS.values())


@pytest.mark.asyncio
async def test_automation_run_persists_new_tier_counts(async_db_session):
    from sqlalchemy import text

    from app.domain.models import Organization

    async_db_session.add(Organization(id="org-2", name="Acme"))
    await async_db_session.commit()

    flows = [
        _flow(),
        dict(_flow(active=False), Id="300000000000002", Label="Old Lead"),
        dict(_flow(days=500), Id="300000000000003", Label="Case Escalation"),
    ]
    triggers = [_trigger(valid=False)]
    service = AutomationSprawlService(async_db_session, "org-2")

    async def _client():
        return _FakeAutomationClient(flows, triggers)

    service._client = _client
    run = await service.run()

    assert run.items_active == 1
    assert run.items_inactive == 1
    assert run.items_unchanged == 1
    assert run.items_needs_attention == 1
    assert run.items_orphaned == 0

    legacy = (
        await async_db_session.execute(
            text(
                "SELECT items_broken, items_dormant FROM automation_sprawl_runs "
                "WHERE id = :id"
            ),
            {"id": run.id},
        )
    ).one()
    assert tuple(legacy) == (1, 1)
