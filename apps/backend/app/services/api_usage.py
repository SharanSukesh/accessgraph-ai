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

What's called (the API Usage page): the log's API_RESOURCE ("the API method
or resource", e.g. describeSObjects or /v21.0/sobjects/Account/001...) and
ENTITY_NAME ("the name of the object accessed", type Set) are counted per
day too, never kept as read: query strings are dropped, record ids and
value-like path segments become placeholders, and only the first segments
of a path are kept (resource_key). An Apex REST request is kept only as the
@RestResource urlMapping it resolves to and its class (ApexRestMatcher,
Salesforce's rules: exact match first, then the longest wildcard pattern),
never its path. UNVERIFIED: the docs don't show API_RESOURCE for an Apex
REST request or how ENTITY_NAME separates several objects; both are parsed
defensively.
"""
from __future__ import annotations

import re
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
DETAIL_TOP = 100          # resources / objects kept per day; the rest is one "Other" row
OTHER = "Other"
UNMATCHED_APEX = "No matching @RestResource class"
OBJECTS_NOTE = "A request can touch more than one object, so these counts don't add up to the total."

# --------------------------------------------------------------- what's called

_ID = re.compile(r"^[A-Za-z0-9]{15}(?:[A-Za-z0-9]{3})?$")
_NAME = re.compile(r"^[A-Za-z][A-Za-z0-9_]{0,79}$")
_PATH_NAME = re.compile(r"^[A-Za-z][A-Za-z0-9_-]{0,79}$")  # REST resource names: ui-api, user-profiles
_VERSION = re.compile(r"^v\d+(?:\.\d+)?$")
_SOBJECT_SAFE = {"describe", "listviews", "quickActions", "updated", "deleted", "layouts", "compactLayouts",
                 "eventSchema", "richTextImageFields", "relationships", "suggestedArticles", "approvalLayouts"}


def _segment(seg: str) -> str:
    """A path segment as kept: names stay, ids and anything value-like don't."""
    if _ID.match(seg) and any(ch.isdigit() for ch in seg):
        return "{id}"
    if seg.isdigit():
        return "{n}"
    return seg if _PATH_NAME.match(seg) else "{value}"


def resource_key(raw: Optional[str]) -> Optional[str]:
    """API_RESOURCE reduced to what's safe to keep: a SOAP method name, or a
    REST path without its query string, version, record ids or values,
    cut to two segments (three under /sobjects/<object>)."""
    raw = (raw or "").strip()
    if not raw:
        return None
    if "/" not in raw:
        return raw if _NAME.match(raw) else "{value}"
    segs = [x for x in raw.split("?", 1)[0].split("#", 1)[0].split("/") if x]
    if segs[:2] == ["services", "data"]:
        segs = segs[2:]
    if segs and _VERSION.match(segs[0]):
        segs = segs[1:]
    if not segs:
        return "/"
    if segs[0] == "sobjects" and len(segs) > 1:
        kept = ["sobjects", _segment(segs[1])]
        if len(segs) > 2:
            kept.append(segs[2] if segs[2] in _SOBJECT_SAFE else ("{id}" if _segment(segs[2]) == "{id}" else "{key}"))
        return "/" + "/".join(kept)
    return "/" + "/".join(_segment(x) for x in segs[:2])


def entity_names(raw: Optional[str]) -> List[str]:
    """ENTITY_NAME (a Set) as object names; anything that isn't a name is dropped."""
    parts = re.split(r"[,;|\s]+", (raw or "").strip().strip("[]{}()"))
    return sorted({x.strip("\"'") for x in parts if _NAME.match(x.strip("\"'"))})


def parse_rest_resource(body: Optional[str]) -> Optional[str]:
    """The urlMapping of an Apex class's @RestResource annotation, or None.
    Comments are skipped so a commented-out annotation doesn't count."""
    if not body or "restresource" not in body.lower():
        return None
    out, i, n = [], 0, len(body)
    while i < n:
        two = body[i:i + 2]
        if two == "//":
            j = body.find("\n", i)
            i = n if j < 0 else j
        elif two == "/*":
            j = body.find("*/", i + 2)
            i = n if j < 0 else j + 2
        elif body[i] == "'":
            j = i + 1
            while j < n and body[j] != "'":
                j += 2 if body[j] == "\\" else 1
            out.append(body[i:j + 1])
            i = j + 1
        else:
            out.append(body[i])
            i += 1
    m = re.search(r"@RestResource\s*\(\s*urlMapping\s*=\s*'([^']*)'\s*\)", "".join(out), re.IGNORECASE)
    return m.group(1).strip() if m else None


class ApexRestMatcher:
    """Resolves an Apex REST path to its class the way Salesforce does: the
    mapping is relative to /services/apexrest/ (with the namespace first for
    a namespaced class) and case-sensitive; an exact match wins, otherwise
    the longest matching wildcard pattern. "/x/*" also matches "/x".
    UNVERIFIED: a wildcard in the middle is taken to match one segment."""

    def __init__(self, classes: Iterable[Dict[str, Any]] = ()) -> None:
        self.patterns: List[Tuple[str, Dict[str, Any]]] = []
        for c in classes or []:
            mapping = (c.get("url_mapping") or "").strip()
            if not mapping.startswith("/"):
                continue
            full = (f"/{c['namespace']}" if c.get("namespace") else "") + mapping
            self.patterns.append((full.rstrip("/") or "/", c))

    @staticmethod
    def _path(raw: str) -> Optional[str]:
        path = raw.split("?", 1)[0].strip()
        low = path.lower()
        for marker in ("/services/apexrest", "/apexrest"):
            k = low.find(marker)
            if k >= 0:
                path = path[k + len(marker):]
                break
        return (path.rstrip("/") or "/") if path.startswith("/") else None

    @staticmethod
    def _matches(pattern: str, path: str) -> bool:
        p, q = pattern.split("/"), path.split("/")
        if p[-1] == "*":
            p = p[:-1]
            if len(q) < len(p):
                return False
            q = q[:len(p)]
        return len(p) == len(q) and all(a == "*" or a == b for a, b in zip(p, q))

    def match(self, raw: Optional[str]) -> Optional[Dict[str, Any]]:
        path = self._path(raw or "")
        if path is None:
            return None
        exact = [c for pat, c in self.patterns if "*" not in pat and pat == path]
        if exact:
            return exact[0]
        hits = [(len(pat), c) for pat, c in self.patterns if "*" in pat and self._matches(pat, path)]
        return max(hits, key=lambda h: h[0])[1] if hits else None



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

    def __init__(self, apex_rest: Optional["ApexRestMatcher"] = None) -> None:
        self.header: Optional[List[str]] = None
        self.pending = ""
        self.counts: Counter = Counter()
        self.calls: Counter = Counter()
        self.objects: Counter = Counter()
        self.apex_rest = apex_rest or ApexRestMatcher()

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
            row = dict(zip(self.header, values))
            self.counts[_row_key(row)] += 1
            self._count_detail(row)

    def _count_detail(self, row: Dict[str, str]) -> None:
        family = (row.get("API_FAMILY") or "").strip() or "Unknown"
        raw = row.get("API_RESOURCE")
        if family == "ApexREST":
            cls = self.apex_rest.match(raw)
            key = (family, cls["url_mapping"] if cls else UNMATCHED_APEX,
                   cls.get("name") if cls else None, cls.get("namespace") if cls else None)
        else:
            key = (family, resource_key(raw), None, None)
        if key[1]:
            self.calls[key] += 1
        for name in entity_names(row.get("ENTITY_NAME")):
            self.objects[name] += 1

    def rows(self) -> List[Dict[str, Any]]:
        return _as_rows(self.counts)

    def detail(self) -> Dict[str, List[Dict[str, Any]]]:
        """Per-day resources and objects, the top DETAIL_TOP of each."""
        return {"calls": _top_calls(self.calls), "objects": _top_objects(self.objects)}


def _top_calls(counts: Counter) -> List[Dict[str, Any]]:
    ordered = sorted(counts.items(), key=lambda kv: (-kv[1], str(kv[0])))
    out = [{"api_family": k[0], "resource": k[1], "apex_class": k[2], "namespace": k[3], "requests": n}
           for k, n in ordered[:DETAIL_TOP]]
    rest = sum(n for _, n in ordered[DETAIL_TOP:])
    if rest:
        out.append({"api_family": None, "resource": OTHER, "apex_class": None, "namespace": None, "requests": rest})
    return out


def _top_objects(counts: Counter) -> List[Dict[str, Any]]:
    ordered = sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))
    out = [{"name": k, "requests": n} for k, n in ordered[:DETAIL_TOP]]
    rest = sum(n for _, n in ordered[DETAIL_TOP:])
    if rest:
        out.append({"name": OTHER, "requests": rest})
    return out


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
    by_date: Dict[str, Dict[str, Any]] = {}
    for day in list(previous or []) + list(collected or []):
        if day.get("date"):
            by_date[day["date"]] = day
    out = []
    for d in sorted(by_date)[-keep:]:
        day = by_date[d]
        rows = list(day.get("rows") or [])
        kept: Dict[str, Any] = {"date": d, "rows": rows if keep_users else _strip_users(rows)}
        for k in ("calls", "objects"):
            if day.get(k) is not None:
                kept[k] = list(day[k])
        out.append(kept)
    return out


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


def _series(per_day: List[Counter], key: Any) -> List[int]:
    return [c.get(key, 0) for c in per_day]


def _sources(per_day: List[Counter], total: int, label: Callable[[Any], Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Every source, largest first, with its share and its count each day."""
    totals: Counter = Counter()
    for c in per_day:
        totals.update(c)
    return [{**label(k), "requests": n, "share_pct": _share(n, total), "series": _series(per_day, k)}
            for k, n in sorted(totals.items(), key=lambda kv: (-kv[1], str(kv[0])))]


def _whats_called(days: List[Dict[str, Any]], apex_rest: Optional[List[Dict[str, Any]]]) -> Dict[str, Any]:
    """Resources, objects and Apex REST endpoints over the days that carry
    them (days kept before this was collected don't)."""
    detail_days = [d for d in days if d.get("calls") is not None]
    calls: Counter = Counter()
    objects: Counter = Counter()
    for d in detail_days:
        for c in d.get("calls") or []:
            calls[(c.get("api_family"), c.get("resource"), c.get("apex_class"), c.get("namespace"))] += int(c["requests"])
        for o in d.get("objects") or []:
            objects[o["name"]] += int(o["requests"])
    total = sum(calls.values())
    resources = [{"api_family": k[0], "resource": k[1], "requests": n, "share_pct": _share(n, total)}
                 for k, n in sorted(calls.items(), key=lambda kv: (-kv[1], str(kv[0]))) if k[0] != "ApexREST"]
    endpoints: Dict[Tuple[Any, Any, Any], int] = {}
    for (fam, res, cls, ns), n in calls.items():
        if fam == "ApexREST":
            endpoints[(res, cls, ns)] = endpoints.get((res, cls, ns), 0) + n
    for c in apex_rest or []:
        endpoints.setdefault((c.get("url_mapping"), c.get("name"), c.get("namespace")), 0)
    apex = [{"url_mapping": k[0], "apex_class": k[1], "namespace": k[2], "requests": n,
             "share_pct": _share(n, total)}
            for k, n in sorted(endpoints.items(), key=lambda kv: (-kv[1], str(kv[0])))]
    return {
        "detail_days": len(detail_days),
        "detail_first_day": detail_days[0]["date"] if detail_days else None,
        "by_resource": resources,
        "by_object": [{"name": k, "requests": n, "share_pct": _share(n, total)}
                      for k, n in sorted(objects.items(), key=lambda kv: (-kv[1], kv[0]))],
        "objects_note": OBJECTS_NOTE,
        "apex_rest": apex,
        "apex_rest_read": apex_rest is not None,
    }


def summarize(
    read: Optional[Dict[str, Any]],
    previous_days: Optional[List[Dict[str, Any]]],
    org_limits: Dict[str, Any],
    user_name: Callable[[str], str],
    keep_users: bool,
    connected_apps: Optional[List[Dict[str, Any]]] = None,
    apex_rest: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """JSON-ready API usage section of the Health Report.

    read: client.get_api_total_usage() output, {"status", "days"} (None
    when the read failed outright). previous_days: the days the last run
    kept. user_name: display name for a Salesforce user id (an alias on
    masked orgs). connected_apps: [{name, last_used_at}] from the latest
    Integration Sprawl run, shown when the log can't be read. apex_rest:
    the org's @RestResource classes [{name, namespace, url_mapping}], None
    when they couldn't be read.
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
    app_days: List[Counter] = []
    user_days: List[Counter] = []
    family_days: List[Counter] = []
    app_names: Dict[Optional[str], str] = {}
    for day in days:
        total = counting = 0
        app_day, user_day, family_day = Counter(), Counter(), Counter()
        for r in day["rows"]:
            n = int(r["requests"])
            total += n
            counting += n if r.get("counts_against_limit") else 0
            app_key = r.get("app_id") or r.get("app_name")
            by_app[app_key] += n
            app_day[app_key] += n
            app_names.setdefault(app_key, r.get("app_name") or NO_APP)
            if keep_users and r.get("user_id"):
                by_user[r["user_id"]] += n
                user_day[r["user_id"]] += n
            by_family[r.get("api_family") or "Unknown"] += n
            family_day[r.get("api_family") or "Unknown"] += n
        app_days.append(app_day)
        user_days.append(user_day)
        family_days.append(family_day)
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
        # The API Usage page: every source with its daily series, and what's called.
        "apps": _sources(app_days, total, lambda k: {"id": k, "name": app_names.get(k) or NO_APP}),
        "users": _sources(user_days, total, lambda k: {"id": k, "name": user_name(k)}) if keep_users else None,
        "families": _sources(family_days, total, lambda k: {"name": k}),
        **_whats_called(days, apex_rest),
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
