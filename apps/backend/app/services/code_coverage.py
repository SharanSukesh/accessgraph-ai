"""Org code coverage: the deployment-readiness picture a consultant needs
before quoting a change.

Newton only reads coverage Salesforce already holds; it never runs tests.
Sources (Tooling API unless noted):
  - ApexOrgWideCoverage.PercentCovered: the org-wide figure the 75%
    production-deployment gate uses.
  - ApexCodeCoverageAggregate: covered / uncovered lines per class or
    trigger, from the most recent test runs.
  - ApexClass / ApexTrigger: names and LastModifiedDate (managed-package
    code, which doesn't count towards org coverage, is left out).
  - ApexTestRunResult (SOQL): when tests last ran.
The figures are only as current as the last test run, so a stale run, or
code changed since it, is reported alongside them.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

DEPLOY_GATE_PCT = 75.0
STALE_AFTER_DAYS = 30
LIST_CAP = 25


def _parse(ts: Optional[str]) -> Optional[datetime]:
    if not ts:
        return None
    try:
        dt = datetime.fromisoformat(ts.replace("Z", "+00:00").replace("+0000", "+00:00"))
    except ValueError:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _looks_like_test(name: str) -> bool:
    # Test classes have no coverable lines of their own; without reading
    # each class body, the name is the only cheap signal.
    return "test" in (name or "").lower()


def summarize_coverage(raw: Optional[Dict[str, Any]], now: Optional[datetime] = None) -> Optional[Dict[str, Any]]:
    """JSON-ready summary of get_code_coverage() output, or None when the
    org returned no coverage data at all (not measured, not "0%")."""
    if not raw:
        return None
    now = now or datetime.now(timezone.utc)
    items: List[Dict[str, Any]] = []
    for it in raw.get("items") or []:
        covered, uncovered = it.get("covered"), it.get("uncovered")
        lines = (covered or 0) + (uncovered or 0) if covered is not None else None
        pct = round(covered / lines * 100, 1) if lines else None
        items.append({
            "name": it.get("name") or it.get("id"),
            "type": it.get("type") or "class",
            "pct": pct,
            "covered": covered,
            "lines": lines,
            "last_modified": it.get("last_modified"),
        })
    measured = [i for i in items if i["pct"] is not None]
    org_wide = raw.get("org_wide_percent")
    org_wide_source = "ApexOrgWideCoverage"
    if org_wide is None and measured:
        total = sum(i["lines"] for i in measured)
        org_wide = round(sum(i["covered"] for i in measured) / total * 100, 1) if total else None
        org_wide_source = "computed from per-class lines"
    if org_wide is None and not measured:
        return None

    last_run = _parse(raw.get("last_test_run"))
    days_since_run = (now - last_run).days if last_run else None
    changed = sorted(
        (i for i in items if last_run and (_parse(i["last_modified"]) or last_run) > last_run),
        key=lambda i: i["last_modified"], reverse=True,
    )
    no_data = [i for i in items if i["pct"] is None and not _looks_like_test(i["name"])]

    def names(rows): return [{"name": r["name"], "type": r["type"], "pct": r["pct"]} for r in rows[:LIST_CAP]]

    zero = [i for i in measured if i["pct"] == 0]
    below = sorted((i for i in measured if i["pct"] < DEPLOY_GATE_PCT), key=lambda i: (i["pct"], i["name"]))
    return {
        "org_wide_pct": org_wide,
        "org_wide_source": org_wide_source,
        "gate_pct": DEPLOY_GATE_PCT,
        "below_gate": org_wide is not None and org_wide < DEPLOY_GATE_PCT,
        "classes": sum(1 for i in items if i["type"] == "class"),
        "triggers": sum(1 for i in items if i["type"] == "trigger"),
        "measured": len(measured),
        "below_gate_items": len(below),
        "lowest": names(below),
        "zero_classes": names([i for i in zero if i["type"] == "class"]),
        "zero_triggers": names([i for i in zero if i["type"] == "trigger"]),
        "no_data": names(no_data),
        "no_data_count": len(no_data),
        "last_test_run": last_run.isoformat() if last_run else None,
        "days_since_run": days_since_run,
        "stale": days_since_run is None or days_since_run > STALE_AFTER_DAYS,
        "changed_since_run": [{"name": i["name"], "type": i["type"], "last_modified": i["last_modified"]}
                              for i in changed[:LIST_CAP]],
        "changed_since_run_count": len(changed),
    }
