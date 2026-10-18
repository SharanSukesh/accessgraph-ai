"""API usage by source (roadmap item 5): which connected app, integration
user and API type is spending the org's daily API requests.

Source: the API Total Usage event log (EventLogFile, EventType
'ApiTotalUsage', daily files). It's free without Event Monitoring and
needs View Event Log Files plus API Enabled; Salesforce keeps it for a day.
There's no count column, so Newton counts log rows as it reads them and
keeps only counts per day, connected app, user, API family and whether
the request counted against the limit; never the rows. USER_NAME is never
read: names come from Newton's own user sync, under the privacy level.

Because of the one-day retention a trend only exists if Newton reads the
log every day. Until the daily collector (Proposal P3) exists, each Health
Report run adds the days it finds to the ones earlier runs kept, so a
single run shows yesterday only and says so.

Salesforce lists the log's API families as REST, SOAP, Bulk, ApexREST,
DirectApexREST and DirectAura; a composite request is logged once (its
parent request).
"""
from __future__ import annotations

from collections import Counter
from typing import Any, Callable, Dict, Iterable, List, Optional, Tuple

EVENT_TYPE = "ApiTotalUsage"
KEEP_DAYS = 30
TOP_N = 8

COVERAGE_NOTE = (
    "Counts are rows in Salesforce's API Total Usage log (REST, SOAP, Bulk, Apex REST and Aura "
    "requests); a composite request is logged once."
)
NO_PERMISSION_REASON = (
    "Newton couldn't read the API Total Usage event log. Reading it needs the "
    "\"View Event Log Files\" and \"API Enabled\" permissions on Newton's integration user."
)
NO_LOGS_REASON = "Salesforce returned no API Total Usage log for the last day."
USERS_HIDDEN_REASON = "Integration users aren't shown: this client's privacy level excludes user records."
NO_APP = "No connected app"

_KEY_FIELDS = ("app_id", "app_name", "user_id", "api_family", "counts_against_limit")


def _truthy(v: Any) -> bool:
    return str(v).strip().lower() in ("true", "1", "yes")


def _row_key(r: Dict[str, str]) -> Tuple[Any, ...]:
    return (
        (r.get("CONNECTED_APP_ID") or "").strip() or None,
        (r.get("CONNECTED_APP_NAME") or "").strip() or None,
        (r.get("USER_ID") or "").strip() or None,
        (r.get("API_FAMILY") or "").strip() or "Unknown",
        _truthy(r.get("COUNTS_AGAINST_API_LIMIT")),
    )


def _as_rows(counts: Counter) -> List[Dict[str, Any]]:
    return [{**dict(zip(_KEY_FIELDS, k)), "requests": n} for k, n in sorted(counts.items(), key=lambda kv: (-kv[1], str(kv[0])))]


def aggregate_rows(rows: Iterable[Dict[str, str]]) -> List[Dict[str, Any]]:
    """Count one day's log rows (dicts keyed by the CSV header) per app,
    user, API type and limit flag. Each row is one request."""
    return _as_rows(Counter(_row_key(r) for r in rows))


class LogCounter:
    """Counts an event-log CSV fed one line at a time, so a large day is
    never held in memory. Joins lines when a quoted value spans a break."""

    def __init__(self) -> None:
        self.header: Optional[List[str]] = None
        self.pending = ""
        self.counts: Counter = Counter()

    def feed(self, line: str) -> None:
        import csv
        self.pending = f"{self.pending}\n{line}" if self.pending else line
        if self.pending.count('"') % 2:
            return
        values = next(csv.reader([self.pending]), [])
        self.pending = ""
        if not values:
            return
        if self.header is None:
            self.header = values
        else:
            self.counts[_row_key(dict(zip(self.header, values)))] += 1

    def rows(self) -> List[Dict[str, Any]]:
        return _as_rows(self.counts)


def _strip_users(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    merged: Counter = Counter()
    for r in rows:
        merged[(r.get("app_id"), r.get("app_name"), None, r.get("api_family"), bool(r.get("counts_against_limit")))] += int(r["requests"])
    return _as_rows(merged)


def merge_days(previous: Iterable[Dict[str, Any]], collected: Iterable[Dict[str, Any]],
               keep_users: bool, keep: int = KEEP_DAYS) -> List[Dict[str, Any]]:
    """Days kept by earlier runs plus the ones just read (a day read again
    replaces the stored one), newest `keep` days, oldest first. Without
    user records the user is dropped from every stored row, old ones too."""
    by_date: Dict[str, List[Dict[str, Any]]] = {}
    for day in list(previous or []) + list(collected or []):
        if day.get("date"):
            by_date[day["date"]] = list(day.get("rows") or [])
    dates = sorted(by_date)[-keep:]
    return [{"date": d, "rows": by_date[d] if keep_users else _strip_users(by_date[d])} for d in dates]


def _share(n: int, total: int) -> float:
    return round(n / total * 100, 1) if total else 0.0


def _ranked(counts: Dict[Any, int], total: int, label: Callable[[Any], Dict[str, Any]], top: int = TOP_N) -> List[Dict[str, Any]]:
    ordered = sorted(counts.items(), key=lambda kv: (-kv[1], str(kv[0])))
    out = [{**label(k), "requests": n, "share_pct": _share(n, total)} for k, n in ordered[:top]]
    rest = sum(n for _, n in ordered[top:])
    if rest:
        out.append({"name": f"Other ({len(ordered) - top})", "other": True, "requests": rest, "share_pct": _share(rest, total)})
    return out


def _limit(org_limits: Dict[str, Any]) -> Optional[Dict[str, int]]:
    entry = (org_limits or {}).get("DailyApiRequests") or {}
    mx, rem = entry.get("Max"), entry.get("Remaining")
    if not isinstance(mx, int) or not isinstance(rem, int):
        return None
    return {"max": mx, "remaining": rem, "used": mx - rem}


def summarize(
    read: Optional[Dict[str, Any]],
    previous_days: Optional[List[Dict[str, Any]]],
    org_limits: Dict[str, Any],
    user_name: Callable[[str], str],
    keep_users: bool,
    connected_apps: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """JSON-ready API usage section of the Health Report.

    read: client.get_api_total_usage() output, {"status", "days"} (None
    when the read failed outright). previous_days: the days the last run
    kept. user_name: display name for a Salesforce user id (an alias on
    masked orgs). connected_apps: [{name, last_used_at}] from the latest
    Integration Sprawl run, shown when the log can't be read.
    """
    read = read or {"status": "unavailable", "days": []}
    days = merge_days(previous_days or [], read.get("days") or [], keep_users)
    limit = _limit(org_limits)
    status = "ok" if days else ("no_logs" if read.get("status") == "ok" else "unavailable")
    out: Dict[str, Any] = {
        "status": status,
        "reason": None if days else (NO_LOGS_REASON if status == "no_logs" else NO_PERMISSION_REASON),
        "read_status": read.get("status"),
        "coverage_note": COVERAGE_NOTE,
        "limit": limit,
        "days": days,
        "days_collected": len(days),
    }
    if not days:
        out["connected_apps"] = [
            {"name": a.get("name"), "last_used_at": a.get("last_used_at")} for a in (connected_apps or [])
        ][:25]
        return out

    trend, by_app, by_user, by_family = [], Counter(), Counter(), Counter()
    app_names: Dict[Optional[str], str] = {}
    for day in days:
        total = counting = 0
        for r in day["rows"]:
            n = int(r["requests"])
            total += n
            counting += n if r.get("counts_against_limit") else 0
            app_key = r.get("app_id") or r.get("app_name")
            by_app[app_key] += n
            app_names.setdefault(app_key, r.get("app_name") or NO_APP)
            if keep_users and r.get("user_id"):
                by_user[r["user_id"]] += n
            by_family[r.get("api_family") or "Unknown"] += n
        trend.append({"date": day["date"], "requests": total, "counting": counting,
                      "pct_of_limit": _share(counting, limit["max"]) if limit else None})
    total = sum(t["requests"] for t in trend)
    peak = max(trend, key=lambda t: (t["counting"], t["date"]))
    out.update({
        "first_day": days[0]["date"],
        "last_day": days[-1]["date"],
        "single_day": len(days) == 1,
        "total_requests": total,
        "daily_average": round(total / len(days)),
        "trend": trend,
        "peak": peak,
        "by_app": _ranked(by_app, total, lambda k: {"id": k, "name": app_names.get(k) or NO_APP}),
        "by_family": _ranked(by_family, total, lambda k: {"name": k}),
        "by_user": _ranked(by_user, total, lambda k: {"id": k, "name": user_name(k)}) if keep_users else None,
        "users_hidden_reason": None if keep_users else USERS_HIDDEN_REASON,
    })
    return out


def user_namer(users: Iterable[Any], keep_identity: bool, alias: Callable[[str], str]) -> Callable[[str], str]:
    """Display names for event-log user ids. Event logs may carry 15-
    character ids, so users are matched on the first 15 characters. On a
    masked org the synced names are already aliases; a user missing from
    the sync gets the alias too, never a name."""
    names: Dict[str, str] = {}
    for u in users:
        sid = getattr(u, "salesforce_id", None)
        if sid:
            names[sid[:15]] = getattr(u, "name", None) or getattr(u, "username", None) or sid

    def name(uid: str) -> str:
        found = names.get(uid[:15])
        if found:
            return found
        return f"Salesforce user {uid}" if keep_identity else alias(uid)
    return name
