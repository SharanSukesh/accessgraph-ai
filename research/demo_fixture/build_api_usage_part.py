"""Writes the Lumenvale fixture part for roadmap item 5 (API usage by source).

Synthetic: 30 days of daily API Total Usage counts (already aggregated per
day, connected app, user, API family and limit flag, the shape Newton
stores) for 6 connected apps run by 4 integration users. The nightly
warehouse ETL takes 58% of requests, and one day it ran twice, coming close
to the org's daily limit (demo_live.org_limits.DailyApiRequests.Max,
1,015,000, left as it was). The integration users are existing IT
administrators (no users are added, so nothing else in the Health Report
changes) and none is a demo-script user. Deterministic (seeded).

Each day also carries what was called (the API Usage page): every row's
requests split over the resources and objects that app plausibly uses, in
the stored shape (resources without ids or values, an Apex REST request as
its @RestResource class), and demo_live.api_usage.apex_rest lists the
org's three REST classes (one unused). The rows themselves are unchanged.

    python research/demo_fixture/build_api_usage_part.py
"""
import json
import random
from datetime import date, timedelta
from pathlib import Path

OUT = Path(__file__).resolve().parents[2] / "apps/backend/fixtures/synthetic_mid_market.parts/05-api-usage.json"
LAST_DAY = date(2026, 10, 13)  # the day before the fixture date
DAYS = 30
DAILY_LIMIT = 1_015_000
ETL_SHARE = 0.58
SPIKE_DAY = date(2026, 9, 29)  # the ETL re-ran after a failed load
SPIKE_PCT_OF_LIMIT = 0.962

# (id, name, user, {family: share}, weekday mean, weekend mean)
APPS = [
    ("0H4000000000001DMO", "Warehouse Nightly ETL", "005000000000150DMO", {"Bulk": 0.75, "REST": 0.25}, None, None),
    ("0H4000000000002DMO", "ERP Order Sync", "005000000000165DMO", {"SOAP": 1.0}, 72_000, 21_000),
    ("0H4000000000003DMO", "Marketing Automation Connector", "005000000000275DMO", {"REST": 1.0}, 41_000, 33_000),
    ("0H4000000000004DMO", "Support Chat Integration", "005000000000278DMO", {"REST": 0.6, "ApexREST": 0.4}, 28_000, 9_000),
    ("0H4000000000005DMO", "Finance Reporting Export", "005000000000165DMO", {"REST": 1.0}, 14_000, 2_000),
    ("0H4000000000006DMO", "Field Service Mobile", "005000000000278DMO", {"REST": 1.0}, 19_000, 6_000),
]


# (app id, family) -> [(resource, share, objects, apex class)]; shares sum to 1.
CALLS = {
    ("0H4000000000001DMO", "Bulk"): [("/jobs/ingest", 0.55, ["Opportunity"], None), ("/jobs/query", 0.45, ["Account"], None)],
    ("0H4000000000001DMO", "REST"): [("/query", 0.7, ["Account"], None), ("/sobjects/Opportunity", 0.3, ["Opportunity"], None)],
    ("0H4000000000002DMO", "SOAP"): [("upsert", 0.5, ["Opportunity"], None), ("query", 0.35, ["Account"], None),
                                     ("describeSObjects", 0.15, ["Opportunity"], None)],
    ("0H4000000000003DMO", "REST"): [("/composite/sobjects", 0.45, ["Contact", "Lead"], None),
                                     ("/query", 0.4, ["Contact"], None), ("/sobjects/Lead/{id}", 0.15, ["Lead"], None)],
    ("0H4000000000004DMO", "REST"): [("/sobjects/Case/{id}", 0.6, ["Case"], None), ("/query", 0.4, ["Contact"], None)],
    ("0H4000000000004DMO", "ApexREST"): [("/supportchat/v1/*", 0.75, ["Case"], "SupportChatRestService"),
                                         ("/caseintake/*", 0.25, ["Case"], "CaseIntakeRestService")],
    ("0H4000000000005DMO", "REST"): [("/query", 0.8, ["Opportunity"], None), ("/sobjects/Opportunity/describe", 0.2, ["Opportunity"], None)],
    ("0H4000000000006DMO", "REST"): [("/ui-api/records", 0.5, ["Case"], None), ("/sobjects/Case/{id}", 0.3, ["Case"], None),
                                     ("/query", 0.2, ["Account"], None)],
}
APEX_REST = [
    {"name": "SupportChatRestService", "namespace": None, "url_mapping": "/supportchat/v1/*"},
    {"name": "CaseIntakeRestService", "namespace": None, "url_mapping": "/caseintake/*"},
    {"name": "LegacyOrderRestService", "namespace": None, "url_mapping": "/legacyorders/*"},
]


def detail(rows):
    """The day's resources and objects, from its rows."""
    calls, objects = {}, {}
    for r in rows:
        spec = CALLS[(r["app_id"], r["api_family"])]
        for (resource, _, objs, cls), n in zip(spec, split(r["requests"], {i: sh for i, (_, sh, _, _) in enumerate(spec)}).values()):
            key = (r["api_family"], resource, cls)
            calls[key] = calls.get(key, 0) + n
            for o in objs:
                objects[o] = objects.get(o, 0) + n
    return {
        "calls": [{"api_family": f, "resource": res, "apex_class": cls, "namespace": None, "requests": n}
                  for (f, res, cls), n in sorted(calls.items(), key=lambda kv: (-kv[1], str(kv[0])))],
        "objects": [{"name": o, "requests": n} for o, n in sorted(objects.items(), key=lambda kv: (-kv[1], kv[0]))],
    }


def split(total, shares):
    out, left = {}, total
    items = list(shares.items())
    for fam, share in items[:-1]:
        out[fam] = round(total * share)
        left -= out[fam]
    out[items[-1][0]] = left
    return out


def main() -> None:
    rng = random.Random(5)
    days = [LAST_DAY - timedelta(days=DAYS - 1 - i) for i in range(DAYS)]
    others = {d: {} for d in days}
    for app_id, _, _, _, weekday, weekend in APPS[1:]:
        for d in days:
            mean = weekend if d.weekday() >= 5 else weekday
            others[d][app_id] = max(0, round(rng.gauss(mean, mean * 0.08)))
    others_total = sum(sum(v.values()) for v in others.values())
    etl_total = round(others_total * ETL_SHARE / (1 - ETL_SHARE))
    spike = round(DAILY_LIMIT * SPIKE_PCT_OF_LIMIT) - sum(others[SPIKE_DAY].values())
    weights = {d: rng.uniform(0.92, 1.08) for d in days if d != SPIKE_DAY}
    scale = (etl_total - spike) / sum(weights.values())
    etl = {d: round(w * scale) for d, w in weights.items()}
    etl[SPIKE_DAY] = spike
    etl[days[-2] if days[-2] != SPIKE_DAY else days[-3]] += etl_total - sum(etl.values())

    out_days = []
    for d in days:
        rows = []
        for app_id, name, user, families, _, _ in APPS:
            n = etl[d] if app_id == APPS[0][0] else others[d][app_id]
            for fam, count in split(n, families).items():
                rows.append({"app_id": app_id, "app_name": name, "user_id": user, "api_family": fam,
                             "counts_against_limit": True, "requests": count})
        rows = sorted(rows, key=lambda r: -r["requests"])
        out_days.append({"date": d.isoformat(), "rows": rows, **detail(rows)})

    total = sum(r["requests"] for day in out_days for r in day["rows"])
    etl_n = sum(r["requests"] for day in out_days for r in day["rows"] if r["app_id"] == APPS[0][0])
    peak = max(out_days, key=lambda day: sum(r["requests"] for r in day["rows"]))
    peak_n = sum(r["requests"] for r in peak["rows"])
    part = {
        "_source": "Roadmap item 5. Generated by research/demo_fixture/build_api_usage_part.py; synthetic.",
        "demo_live": {"api_usage": {"days": out_days, "apex_rest": APEX_REST}},
    }
    OUT.write_text(json.dumps(part, indent=1) + "\n")
    print(f"{total:,} requests over {DAYS} days; ETL {etl_n / total:.1%}; "
          f"peak {peak['date']} {peak_n:,} ({peak_n / DAILY_LIMIT:.1%} of {DAILY_LIMIT:,})")


if __name__ == "__main__":
    main()
