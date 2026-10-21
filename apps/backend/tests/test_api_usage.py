"""API usage by source (roadmap item 5): counted on ingest, kept per day
across runs, users hidden or aliased under the privacy level, and no change
to Lumenvale's Health Report."""
from types import SimpleNamespace as NS

import pytest
from sqlalchemy import select

from app.domain.models import Organization, OrgFinding
from app.services import api_usage, privacy_mode
from app.services.data_quality import DataQualityService
from app.services.org_analyzer import OrgAnalyzerService
from tests.test_demo_orgs import client  # noqa: F401
from tests.test_demo_path import lumenvale  # noqa: F401

HEADER = '"EVENT_TYPE","TIMESTAMP","USER_ID","USER_NAME","CONNECTED_APP_ID","CONNECTED_APP_NAME","API_FAMILY","COUNTS_AGAINST_API_LIMIT"'
LIMITS = {"DailyApiRequests": {"Max": 100_000, "Remaining": 60_000}}


def _row(user, app_id, app, fam, counts="true", name="Jo Example"):
    return f'"ApiTotalUsage","20261013000000.000","{user}","{name}","{app_id}","{app}","{fam}","{counts}"'


def _count(lines):
    c = api_usage.LogCounter()
    for line in lines:
        c.feed(line)
    return c.rows()


def test_log_rows_are_counted_and_never_kept():
    rows = _count([
        HEADER,
        _row("005A", "0H41", "ETL", "Bulk"),
        _row("005A", "0H41", "ETL", "Bulk"),
        _row("005A", "0H41", "ETL", "REST"),
        _row("005B", "", "", "SOAP", counts="false"),
    ])
    assert {(r["app_name"], r["api_family"], r["counts_against_limit"]): r["requests"] for r in rows} == {
        ("ETL", "Bulk", True): 2, ("ETL", "REST", True): 1, (None, "SOAP", False): 1,
    }
    # Only counts per app, user, family and limit flag: never names or timestamps.
    assert all(set(r) == {"app_id", "app_name", "user_id", "api_family", "counts_against_limit", "requests"} for r in rows)
    assert "Jo Example" not in repr(rows)


def test_quoted_value_spanning_a_line_break():
    rows = _count([HEADER, '"ApiTotalUsage","t","005A","x","0H41","Multi', 'line app","REST","true"'])
    assert rows[0]["app_name"] == "Multi\nline app" and rows[0]["requests"] == 1


def _day(date, n, user="005A", app="ETL"):
    return {"date": date, "rows": [{"app_id": app, "app_name": app, "user_id": user, "api_family": "REST",
                                    "counts_against_limit": True, "requests": n}]}


def _summary(read, previous=(), keep_users=True, keep_identity=True, users=()):
    namer = api_usage.user_namer(users, keep_identity, lambda uid: privacy_mode.user_alias("org", uid))
    return api_usage.summarize(read, list(previous), LIMITS, namer, keep_users)


def test_one_run_shows_yesterday_only_and_later_runs_add_days():
    first = _summary({"status": "ok", "days": [_day("2026-10-12", 500)]})
    assert first["single_day"] and first["days_collected"] == 1
    second = _summary({"status": "ok", "days": [_day("2026-10-13", 700)]}, previous=first["days"])
    assert [t["date"] for t in second["trend"]] == ["2026-10-12", "2026-10-13"]
    assert not second["single_day"]
    # A day read again replaces the stored one; only 30 days are kept.
    again = _summary({"status": "ok", "days": [_day("2026-10-13", 900)]}, previous=second["days"])
    assert again["trend"][-1]["requests"] == 900
    many = [_day(f"2026-09-{d:02d}", 1) for d in range(1, 31)] + [_day("2026-10-01", 1)]
    assert _summary({"status": "ok", "days": many})["days_collected"] == 30


def test_shares_peak_and_limit():
    read = {"status": "ok", "days": [
        {"date": "2026-10-12", "rows": [
            {"app_id": "A", "app_name": "ETL", "user_id": "005A", "api_family": "Bulk", "counts_against_limit": True, "requests": 58},
            {"app_id": "B", "app_name": "ERP", "user_id": "005B", "api_family": "SOAP", "counts_against_limit": True, "requests": 30},
            {"app_id": None, "app_name": None, "user_id": "005B", "api_family": "REST", "counts_against_limit": False, "requests": 12},
        ]},
        _day("2026-10-13", 95_000, app="A"),
    ]}
    s = _summary(read)
    assert s["status"] == "ok" and s["total_requests"] == 95_100
    assert (s["by_app"][0]["id"], s["by_app"][0]["name"], s["by_app"][0]["requests"]) == ("A", "ETL", 95_058)
    assert s["peak"] == {"date": "2026-10-13", "requests": 95_000, "counting": 95_000, "pct_of_limit": 95.0}
    assert s["trend"][0]["counting"] == 88
    assert s["limit"] == {"max": 100_000, "remaining": 60_000, "used": 40_000}
    assert any(a["name"] == api_usage.NO_APP for a in s["by_app"])


def test_masked_users_get_aliases_and_metadata_only_drops_them():
    read = {"status": "ok", "days": [_day("2026-10-13", 10, user="005000000000150")]}
    synced = [NS(salesforce_id="005000000000150DMO", name="User 1A2B3C", username=None)]
    masked = _summary(read, keep_identity=False, users=synced)
    assert masked["by_user"][0]["name"] == "User 1A2B3C"  # 15-char log id matched to the 18-char sync id
    unsynced = _summary({"status": "ok", "days": [_day("2026-10-13", 10, user="005XYZ")]}, keep_identity=False)
    assert unsynced["by_user"][0]["name"] == privacy_mode.user_alias("org", "005XYZ")

    hidden = _summary(read, keep_users=False)
    assert hidden["by_user"] is None and hidden["users_hidden_reason"]
    assert all(r["user_id"] is None for d in hidden["days"] for r in d["rows"])
    # Days kept by an earlier run at a less strict level lose their users too.
    later = _summary({"status": "ok", "days": []}, previous=_summary(read)["days"], keep_users=False)
    assert all(r["user_id"] is None for d in later["days"] for r in d["rows"])


def test_unreadable_log_says_why_and_lists_connected_apps():
    s = api_usage.summarize({"status": "unavailable", "days": []}, [], LIMITS, str, True,
                            [{"name": "ERP Order Sync", "last_used_at": "2026-10-12T00:00:00+00:00"}])
    assert s["status"] == "unavailable" and "View Event Log Files" in s["reason"]
    assert s["limit"]["used"] == 40_000 and s["connected_apps"][0]["name"] == "ERP Order Sync"
    assert api_usage.summarize({"status": "ok", "days": []}, [], {}, str, True)["status"] == "no_logs"


async def _run(db, org_id):
    await DataQualityService(db, org_id).run(actor_email="test")
    return await OrgAnalyzerService(db, org_id).run(actor_email="test")


@pytest.mark.asyncio
async def test_lumenvale_api_usage_and_unchanged_health_report(async_db_session, lumenvale):  # noqa: F811
    db = async_db_session
    org_id, _ = lumenvale
    snap = await _run(db, org_id)
    u = snap.metrics["api_usage"]
    assert u["status"] == "ok" and u["days_collected"] == 30
    from tests.test_demo_dates import shifted
    assert (u["first_day"], u["last_day"]) == (shifted("2026-09-14"), shifted("2026-10-13"))  # moved with today
    assert u["by_app"][0]["name"] == "Warehouse Nightly ETL" and u["by_app"][0]["share_pct"] == 58.0
    assert len(u["by_app"]) == 6 and len(u["by_user"]) == 4
    assert u["by_user"][0]["name"] == "Ayla Zielinski"
    assert u["peak"]["date"] == shifted("2026-09-29") and u["peak"]["pct_of_limit"] == 96.2
    assert u["limit"]["max"] == 1_015_000
    # No new findings: the runbook's numbers hold.
    rows = (await db.execute(select(OrgFinding).where(OrgFinding.snapshot_id == snap.id))).scalars().all()
    assert snap.metrics["org_health_score"] == 41
    assert len(rows) == 18
    assert sum(f.estimated_annual_savings_cents or 0 for f in rows) == 18_318_000


@pytest.mark.asyncio
async def test_lumenvale_metadata_only_keeps_no_users(async_db_session, lumenvale):  # noqa: F811
    db = async_db_session
    org_id, _ = lumenvale
    org = await db.get(Organization, org_id)
    privacy_mode.set_privacy(org, privacy_mode.METADATA_ONLY, False, "test")
    await db.flush()
    snap = await OrgAnalyzerService(db, org_id).run(actor_email="test")
    u = snap.metrics["api_usage"]
    assert u["by_user"] is None and u["by_app"][0]["name"] == "Warehouse Nightly ETL"
    assert all(r["user_id"] is None for d in u["days"] for r in d["rows"])


@pytest.mark.asyncio
async def test_live_read_counts_only_the_newest_file_per_day(monkeypatch):
    """No network: Salesforce's responses are mocked."""
    import httpx
    from app.salesforce import client as sf

    files = [
        {"Id": "0AT1", "LogDate": "2026-10-13T00:00:00.000+0000", "CreatedDate": "2026-10-14T02:00:00.000+0000"},
        {"Id": "0AT2", "LogDate": "2026-10-13T00:00:00.000+0000", "CreatedDate": "2026-10-14T09:00:00.000+0000"},
    ]
    bodies = {"0AT1": [HEADER, _row("005A", "0H41", "ETL", "Bulk")],
              "0AT2": [HEADER] + [_row("005A", "0H41", "ETL", "Bulk")] * 3}
    seen = []

    def handler(request):
        fid = request.url.path.split("/")[-2]
        seen.append(fid)
        return httpx.Response(200, text="\n".join(bodies[fid]) + "\n")

    real = httpx.AsyncClient
    monkeypatch.setattr(sf.httpx, "AsyncClient", lambda **kw: real(transport=httpx.MockTransport(handler), **kw))
    c = sf.SalesforceAPIClient("https://example.invalid", "token")

    async def query_all(soql):
        assert "EventType = 'ApiTotalUsage'" in soql and "Interval = 'Daily'" in soql
        return files
    monkeypatch.setattr(c, "query_all", query_all)
    out = await c.get_api_total_usage()
    assert seen == ["0AT2"]
    assert out["status"] == "ok" and out["days"][0]["date"] == "2026-10-13"
    assert out["days"][0]["rows"][0]["requests"] == 3

    async def denied(soql):
        raise httpx.HTTPStatusError("403", request=httpx.Request("GET", "https://x"), response=httpx.Response(403))
    monkeypatch.setattr(c, "query_all", denied)
    assert await c.get_api_total_usage() == {"status": "unavailable", "days": []}


@pytest.mark.asyncio
async def test_switching_privacy_level_scrubs_earlier_snapshots(async_db_session, lumenvale):  # noqa: F811
    """Users named in an earlier Health Report's API usage section are
    aliased (Masked) or removed (Metadata only) by the privacy purge."""
    from app.domain.models import OrgAnalysisSnapshot
    from app.services.privacy_purge import enforce_privacy_mode

    db = async_db_session
    org_id, _ = lumenvale
    snap = await OrgAnalyzerService(db, org_id).run(actor_email="test")
    assert snap.metrics["api_usage"]["by_user"][0]["name"] == "Ayla Zielinski"
    org = await db.get(Organization, org_id)

    privacy_mode.set_privacy(org, privacy_mode.MASKED, True, "test")
    await enforce_privacy_mode(db, org)
    await db.flush()
    row = await db.get(OrgAnalysisSnapshot, snap.id)
    users = row.metrics["api_usage"]["by_user"]
    assert users[0]["name"] == privacy_mode.user_alias(org_id, "005000000000150DMO")
    assert row.metrics["api_usage"]["users"][0]["name"] == users[0]["name"]
    assert "Ayla Zielinski" not in repr(row.metrics["api_usage"])

    privacy_mode.set_privacy(org, privacy_mode.METADATA_ONLY, False, "test")
    await enforce_privacy_mode(db, org)
    await db.flush()
    row = await db.get(OrgAnalysisSnapshot, snap.id)
    usage = row.metrics["api_usage"]
    assert usage["by_user"] is None and usage["users"] is None and usage["users_hidden_reason"]
    assert all(r["user_id"] is None for d in usage["days"] for r in d["rows"])
    assert usage["by_app"][0]["name"] == "Warehouse Nightly ETL"


# ---------------------------------------------------------------- what's called (API Usage page)

DETAIL_HEADER = HEADER + ',"API_RESOURCE","ENTITY_NAME"'


def _detail_row(fam, resource, entity="", user="005A"):
    return _row(user, "0H41", "ETL", fam) + f',"{resource}","{entity}"'


def test_resources_keep_no_ids_values_or_query_strings():
    rk = api_usage.resource_key
    assert rk("/v21.0/sobjects/Account/001xx000003DGQWAA4") == "/sobjects/Account/{id}"
    assert rk("describeSObjects") == "describeSObjects"
    assert rk("/services/data/v62.0/query?q=SELECT+Id+FROM+Contact+WHERE+Email='a@b.c'") == "/query"
    assert rk("/v62.0/sobjects/Contact/Email__c/jo@x.com") == "/sobjects/Contact/{key}"
    assert rk("/v62.0/sobjects/Account/describe") == "/sobjects/Account/describe"
    assert rk("/v62.0/ui-api/records/001xx000003DGQWAA4") == "/ui-api/records"
    assert rk("/v62.0/connect/user-profiles/John Smith") == "/connect/user-profiles"
    assert rk("/v62.0/jobs/ingest/750xx000000001AAA/batches") == "/jobs/ingest"
    assert rk("") is None and rk("not a name!") == "{value}"
    assert api_usage.entity_names("[Account, Contact]") == ["Account", "Contact"]
    assert api_usage.entity_names("Account;Opportunity") == ["Account", "Opportunity"]
    assert api_usage.entity_names("") == []


def test_rest_resource_annotation_and_salesforce_matching_rules():
    body = """// @RestResource(urlMapping='/old/*')
    /* @RestResource(urlMapping='/older/*') */
    @RestResource( urlMapping = '/chat/v1/*' )
    global with sharing class SupportChatRestService { String s = '//not a comment'; }"""
    assert api_usage.parse_rest_resource(body) == "/chat/v1/*"
    assert api_usage.parse_rest_resource("public class X {}") is None
    assert api_usage.parse_rest_resource("(hidden)") is None  # managed package bodies
    m = api_usage.ApexRestMatcher([
        {"name": "Wild", "namespace": None, "url_mapping": "/chat/v1/*"},
        {"name": "Exact", "namespace": None, "url_mapping": "/chat/v1/sessions"},
        {"name": "Short", "namespace": None, "url_mapping": "/chat/*"},
        {"name": "Ns", "namespace": "abc", "url_mapping": "/chat/*"},
    ])
    name = lambda raw: (m.match(raw) or {}).get("name")  # noqa: E731
    assert name("/services/apexrest/chat/v1/sessions") == "Exact"      # an exact match wins
    assert name("/services/apexrest/chat/v1/sessions/12") == "Wild"    # then the longest wildcard
    assert name("/services/apexrest/chat/v1") == "Wild"                # "/x/*" also matches "/x"
    assert name("/services/apexrest/chat/other") == "Short"
    assert name("/services/apexrest/abc/chat/z") == "Ns"               # the namespace comes first
    assert name("/services/apexrest/Chat/v1/q") is None                # case-sensitive
    assert name("nope") is None


def test_log_counts_resources_objects_and_apex_classes_never_paths():
    m = api_usage.ApexRestMatcher([{"name": "SupportChatRestService", "namespace": None, "url_mapping": "/chat/v1/*"}])
    c = api_usage.LogCounter(m)
    for line in [
        DETAIL_HEADER,
        _detail_row("REST", "/v62.0/sobjects/Account/001xx000003DGQWAA4", "Account"),
        _detail_row("REST", "/v62.0/sobjects/Account/001xx000003DGQXAA4", "Account"),
        _detail_row("REST", "/v62.0/query?q=SELECT+Name+FROM+Contact", "Contact"),
        _detail_row("ApexREST", "/services/apexrest/chat/v1/session/jo@x.com", "Case"),
        _detail_row("ApexREST", "/services/apexrest/unknown/thing", ""),
    ]:
        c.feed(line)
    d = c.detail()
    calls = {(x["api_family"], x["resource"], x["apex_class"]): x["requests"] for x in d["calls"]}
    assert calls == {
        ("REST", "/sobjects/Account/{id}", None): 2, ("REST", "/query", None): 1,
        ("ApexREST", "/chat/v1/*", "SupportChatRestService"): 1, ("ApexREST", api_usage.UNMATCHED_APEX, None): 1,
    }
    assert {o["name"]: o["requests"] for o in d["objects"]} == {"Account": 2, "Contact": 1, "Case": 1}
    assert "jo@x.com" not in repr(d) and "001xx" not in repr(d) and "unknown/thing" not in repr(d)
    # The per-app rows are unchanged by the extra columns.
    assert sum(r["requests"] for r in c.rows()) == 5


def test_summary_has_series_per_source_and_whats_called():
    days = [
        {"date": "2026-10-12", "rows": [
            {"app_id": "A", "app_name": "ETL", "user_id": "005A", "api_family": "REST", "counts_against_limit": True, "requests": 60},
            {"app_id": "B", "app_name": "ERP", "user_id": "005B", "api_family": "SOAP", "counts_against_limit": True, "requests": 40}],
         "calls": [{"api_family": "REST", "resource": "/query", "apex_class": None, "namespace": None, "requests": 60},
                   {"api_family": "SOAP", "resource": "upsert", "apex_class": None, "namespace": None, "requests": 40}],
         "objects": [{"name": "Account", "requests": 100}]},
        {"date": "2026-10-13", "rows": [
            {"app_id": "A", "app_name": "ETL", "user_id": "005A", "api_family": "ApexREST", "counts_against_limit": True, "requests": 10}],
         "calls": [{"api_family": "ApexREST", "resource": "/chat/*", "apex_class": "Chat", "namespace": None, "requests": 10}],
         "objects": [{"name": "Case", "requests": 10}]},
    ]
    s = api_usage.summarize({"status": "ok", "days": days}, [], LIMITS, str, True,
                            apex_rest=[{"name": "Chat", "namespace": None, "url_mapping": "/chat/*"},
                                       {"name": "Unused", "namespace": None, "url_mapping": "/unused/*"}])
    assert [(a["name"], a["requests"], a["series"]) for a in s["apps"]] == [("ETL", 70, [60, 10]), ("ERP", 40, [40, 0])]
    assert [(u["id"], u["series"]) for u in s["users"]] == [("005A", [60, 10]), ("005B", [40, 0])]
    assert [(f["name"], f["series"]) for f in s["families"]] == [("REST", [60, 0]), ("SOAP", [40, 0]), ("ApexREST", [0, 10])]
    assert [(r["resource"], r["requests"]) for r in s["by_resource"]] == [("/query", 60), ("upsert", 40)]
    assert [(o["name"], o["requests"]) for o in s["by_object"]] == [("Account", 100), ("Case", 10)]
    assert [(e["url_mapping"], e["apex_class"], e["requests"]) for e in s["apex_rest"]] == [
        ("/chat/*", "Chat", 10), ("/unused/*", "Unused", 0)]
    assert s["detail_days"] == 2 and s["apex_rest_read"]
    # Days kept before detail was collected carry none, and say so.
    old = [{"date": d["date"], "rows": d["rows"]} for d in days]
    s2 = api_usage.summarize({"status": "ok", "days": []}, old, LIMITS, str, False)
    assert s2["detail_days"] == 0 and s2["by_resource"] == [] and s2["users"] is None and not s2["apex_rest_read"]


@pytest.mark.asyncio
async def test_lumenvale_whats_called(async_db_session, lumenvale):  # noqa: F811
    db = async_db_session
    org_id, _ = lumenvale
    snap = await _run(db, org_id)
    u = snap.metrics["api_usage"]
    assert u["detail_days"] == 30 and len(u["apps"]) == 6 and len(u["users"]) == 4
    assert u["apps"][0]["name"] == "Warehouse Nightly ETL" and len(u["apps"][0]["series"]) == 30
    assert sum(a["requests"] for a in u["apps"]) == u["total_requests"]
    assert sum(r["requests"] for r in u["by_resource"]) + sum(e["requests"] for e in u["apex_rest"]) == u["total_requests"]
    endpoints = {e["apex_class"]: e["requests"] for e in u["apex_rest"]}
    assert set(endpoints) == {"SupportChatRestService", "CaseIntakeRestService", "LegacyOrderRestService"}
    assert endpoints["LegacyOrderRestService"] == 0 and endpoints["SupportChatRestService"] > endpoints["CaseIntakeRestService"]
    assert snap.metrics["org_health_score"] == 41
