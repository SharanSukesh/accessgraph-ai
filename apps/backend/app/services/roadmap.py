"""Priced roadmap builder (P1, with P2 playbooks).

The Health Report's findings are grouped into work packages by the firm's
playbooks (finding codes -> package). Each package carries:

- **inferred effort**: a low-high range in days from its playbook (a base
  range plus a per-item range times the findings' size), never one exact
  number;
- **confirmed effort**: the consultant's own range, kept apart and shown
  as such everywhere;
- a **price range**: effort times the blended day rate of the playbook's
  role mix, from the firm's rate card (per-engagement overrides allowed);
- dependencies, from which the phases follow.

Packages hold findings by `evidence.review_key`, which survives a rerun of
the Health Report, so they always show the latest findings with the
visibility the privacy mode allows. Findings a reviewer marked "not
useful" (item 10) start outside the plan. Savings are the findings'
estimates and are labelled "estimated" (the savings ledger, item 18, comes
later).

The rate card and playbooks are the firm's data, not the client's. Demo
orgs use the demo rate card and playbooks below, labelled as demo; the
firm can copy the example playbooks as a starting point, marked "example"
until reviewed. Rates are never copied: a firm enters its own.
"""
from __future__ import annotations

import math
import uuid
from copy import deepcopy
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

PLAYBOOK_VERSION = "2026.10"

DEMO_RATE_CARD: Dict[str, Any] = {
    "currency": "USD",
    "roles": [
        {"role": "Salesforce consultant", "dayRate": 1200},
        {"role": "Solution architect", "dayRate": 1600},
        {"role": "Salesforce developer", "dayRate": 1100},
    ],
    "demo": True,
}

EXAMPLE_PLAYBOOKS: List[Dict[str, Any]] = [
    {
        "key": "licence-reclaim", "title": "Dormant licence reclaim",
        "codes": ["LICENSE_INACTIVE_USER", "LICENSE_NEVER_LOGGED_IN", "USER_DORMANT"],
        "sizeCodes": ["LICENSE_INACTIVE_USER", "LICENSE_NEVER_LOGGED_IN"], "itemLabel": "users",
        "baseDays": [1, 2], "perItemDays": [0.05, 0.1], "itemCap": 500,
        "roles": {"Salesforce consultant": 1.0}, "after": [],
        "steps": ["Confirm each user with their manager or the system owner",
                  "Freeze, then deactivate after the agreed notice period",
                  "Reassign owned records, queues and scheduled jobs"],
        "prerequisites": ["A named approver on the client side"],
        "risks": ["Integration or shared users that log in through the API only"],
    },
    {
        "key": "licence-rightsizing", "title": "Licence right-sizing at renewal",
        "codes": ["LICENSE_SEATS_UNUSED", "PSL_SEATS_UNUSED"], "sizeCodes": [], "itemLabel": "licence types",
        "baseDays": [2, 4], "perItemDays": [0, 0], "itemCap": None,
        "roles": {"Salesforce consultant": 0.5, "Solution architect": 0.5}, "after": ["licence-reclaim"],
        "steps": ["Recount seats after the reclaim", "Agree the renewal quantities with the client's procurement team"],
        "prerequisites": ["The contract's renewal date and terms"],
        "risks": ["Contract minimums or bundles that can't be reduced"],
    },
    {
        "key": "permission-cleanup", "title": "Permission model cleanup",
        "codes": ["PS_UNUSED", "ROLE_EMPTY", "STANDARD_PROFILE_IN_USE", "OVERPRIVILEGED_PROFILE"],
        "sizeCodes": ["PS_UNUSED", "ROLE_EMPTY", "OVERPRIVILEGED_PROFILE"], "itemLabel": "sets, roles or profiles",
        "baseDays": [3, 5], "perItemDays": [0.25, 0.5], "itemCap": 200,
        "roles": {"Solution architect": 0.4, "Salesforce consultant": 0.6}, "after": ["licence-reclaim"],
        "steps": ["Simulate each removal in What-if", "Retire unused sets and roles",
                  "Move users off unmodified standard profiles", "Narrow Modify All on sensitive objects"],
        "prerequisites": ["Sign-off from the system owner for each object"],
        "risks": ["Apex and flows that run in system context aren't covered by the simulation"],
    },
    {
        "key": "apex-coverage", "title": "Apex test coverage to the deployment gate",
        "codes": ["APEX_LOW_COVERAGE", "ORG_COVERAGE_BELOW_GATE", "APEX_COVERAGE_STALE"],
        "sizeCodes": ["APEX_LOW_COVERAGE"], "itemLabel": "classes or triggers",
        "baseDays": [1, 2], "perItemDays": [0.25, 0.75], "itemCap": 300,
        "roles": {"Salesforce developer": 0.8, "Solution architect": 0.2}, "after": [],
        "steps": ["Rerun all tests for current figures", "Write tests for the classes under 75%, lowest first"],
        "prerequisites": ["A sandbox refreshed from production"],
        "risks": ["Classes with no assertions that pass without testing anything"],
    },
    {
        "key": "data-storage", "title": "Data storage and field cleanup",
        "codes": ["STORAGE_WARNING", "CRITICAL_OBJECT_STALE", "CRITICAL_OBJECT_MOSTLY_EMPTY", "FIELDS_NEVER_POPULATED"],
        "sizeCodes": ["FIELDS_NEVER_POPULATED"], "itemLabel": "fields",
        "baseDays": [2, 4], "perItemDays": [0.1, 0.25], "itemCap": 500,
        "roles": {"Salesforce consultant": 0.7, "Salesforce developer": 0.3}, "after": [],
        "steps": ["Agree an archive policy for stale records", "Check each field's impact before deleting it"],
        "prerequisites": ["The client's record retention rules"],
        "risks": ["Fields read by integrations that don't show as dependencies"],
    },
]

UNPLANNED = "Findings without a playbook"


def example_playbooks() -> List[Dict[str, Any]]:
    """The example set as a firm's starting point, marked until reviewed."""
    return [{**deepcopy(p), "version": PLAYBOOK_VERSION, "example": True} for p in EXAMPLE_PLAYBOOKS]


def demo_playbooks() -> List[Dict[str, Any]]:
    return [{**deepcopy(p), "version": PLAYBOOK_VERSION, "example": True, "demo": True} for p in EXAMPLE_PLAYBOOKS]


def _half_down(x: float) -> float:
    return math.floor(x * 2 + 1e-9) / 2


def _half_up(x: float) -> float:
    return math.ceil(x * 2 - 1e-9) / 2


def validate_playbook(p: Dict[str, Any]) -> Optional[str]:
    if not str(p.get("key") or "").strip() or not str(p.get("title") or "").strip():
        return "Each playbook needs a key and a title."
    for field in ("baseDays", "perItemDays"):
        r = p.get(field)
        if not (isinstance(r, list) and len(r) == 2 and all(isinstance(v, (int, float)) and v >= 0 for v in r) and r[0] <= r[1]):
            return f"{p.get('title')}: {field} must be a low-high range of days."
    roles = p.get("roles") or {}
    if not roles or any(not isinstance(v, (int, float)) or v < 0 for v in roles.values()) or abs(sum(roles.values()) - 1) > 0.01:
        return f"{p.get('title')}: the role mix must add up to 100%."
    return None


def validate_rate_card(card: Dict[str, Any]) -> Optional[str]:
    roles = card.get("roles") or []
    names = [str(r.get("role") or "").strip() for r in roles]
    if any(not n for n in names) or len(set(names)) != len(names):
        return "Each role needs a unique name."
    if any(not isinstance(r.get("dayRate"), (int, float)) or r["dayRate"] <= 0 for r in roles):
        return "Day rates must be positive numbers."
    return None


def build_packages(findings: List[Dict[str, Any]], playbooks: List[Dict[str, Any]],
                   reviews: Dict[str, str]) -> List[Dict[str, Any]]:
    """The starting plan: one package per playbook that matches a finding,
    plus one for findings no playbook covers. `findings` are dicts with
    key and code; reviews map keys to review status."""
    by_code = {c: p for p in playbooks for c in p.get("codes") or []}
    groups: Dict[Optional[str], List[str]] = {}
    for f in findings:
        if reviews.get(f["key"]) == "not_useful":
            continue
        pb = by_code.get(f["code"])
        groups.setdefault(pb["key"] if pb else None, []).append(f["key"])
    ids = {k: f"pkg-{k}" if k else "pkg-unplanned" for k in groups}
    order = [p["key"] for p in playbooks if p["key"] in groups] + ([None] if None in groups else [])
    out = []
    for i, k in enumerate(order):
        pb = next((p for p in playbooks if p["key"] == k), None)
        out.append({"id": ids[k], "playbook": k, "title": pb["title"] if pb else UNPLANNED, "findingKeys": groups[k],
                    "included": True, "confirmed": None, "notes": "", "order": i, "roles": None,
                    "after": [ids[a] for a in (pb or {}).get("after") or [] if a in ids]})
    return out


def new_package(title: str, order: int) -> Dict[str, Any]:
    return {"id": f"pkg-{uuid.uuid4().hex[:8]}", "playbook": None, "title": title, "findingKeys": [], "included": True,
            "confirmed": None, "notes": "", "order": order, "roles": None, "after": []}


def inferred(pb: Optional[Dict[str, Any]], findings: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """Effort from the playbook and the findings' size, in half days."""
    if not pb:
        return None
    size_codes = pb.get("sizeCodes")
    size = sum(f["affected"] or 0 for f in findings if size_codes is None or f["code"] in size_codes)
    cap = pb.get("itemCap")
    n = min(size, cap) if cap else size
    (b_lo, b_hi), (i_lo, i_hi) = pb["baseDays"], pb["perItemDays"]
    return {"low": _half_down(b_lo + i_lo * n), "high": _half_up(b_hi + i_hi * n), "size": size,
            "itemLabel": pb.get("itemLabel"), "capped": bool(cap and size > cap)}


def rates(card: Dict[str, Any], overrides: Dict[str, Any]) -> Dict[str, float]:
    out = {r["role"]: float(r["dayRate"]) for r in card.get("roles") or []}
    out.update({k: float(v) for k, v in (overrides or {}).items() if isinstance(v, (int, float)) and v > 0})
    return out


def phases(packages: List[Dict[str, Any]]) -> Dict[str, int]:
    """Phase 1 has no dependencies; each package comes one phase after the
    latest it depends on. A cycle is broken by order."""
    by_id = {p["id"]: p for p in packages}
    out: Dict[str, int] = {}

    def phase(pid: str, seen: Tuple[str, ...]) -> int:
        if pid in out:
            return out[pid]
        deps = [d for d in by_id[pid].get("after") or [] if d in by_id and d not in seen and by_id[d].get("included", True)]
        out[pid] = 1 + max((phase(d, seen + (pid,)) for d in deps), default=0)
        return out[pid]

    for p in sorted(packages, key=lambda p: p.get("order", 0)):
        phase(p["id"], ())
    return out


def compute(packages: List[Dict[str, Any]], findings: Dict[str, Dict[str, Any]], playbooks: List[Dict[str, Any]],
            card: Dict[str, Any], overrides: Dict[str, Any], reviews: Dict[str, str]) -> Dict[str, Any]:
    """Each package with its findings, effort, price and phase; the totals;
    and the latest findings that aren't in any package."""
    pbs = {p["key"]: p for p in playbooks}
    rate = rates(card, overrides)
    ph = phases(packages)
    planned = {k for p in packages for k in p.get("findingKeys") or []}
    rows = []
    for p in sorted(packages, key=lambda p: (ph.get(p["id"], 1), p.get("order", 0))):
        fs = [{**findings[k], "present": True, "review": reviews.get(k)} if k in findings else
              {"key": k, "present": False, "title": "No longer found in the latest Health Report", "review": reviews.get(k)}
              for k in p.get("findingKeys") or []]
        present = [f for f in fs if f["present"]]
        pb = pbs.get(p.get("playbook") or "")
        inf = inferred(pb, present)
        conf = p.get("confirmed")
        effort = conf or inf
        mix = p.get("roles") or (pb or {}).get("roles") or {}
        missing = sorted(r for r in mix if r not in rate)
        blended = sum(share * rate[r] for r, share in mix.items() if r in rate) if mix and not missing else None
        price = ({"low": round(effort["low"] * blended), "high": round(effort["high"] * blended)}
                 if effort and blended is not None else None)
        rows.append({
            **p, "phase": ph.get(p["id"], 1), "findings": fs,
            "playbookTitle": pb["title"] if pb else None, "playbookExample": bool(pb and pb.get("example")),
            "playbookVersion": (pb or {}).get("version"),
            "steps": (pb or {}).get("steps") or [], "prerequisites": (pb or {}).get("prerequisites") or [],
            "risks": (pb or {}).get("risks") or [],
            "inferred": inf, "basis": "confirmed" if conf else "inferred" if inf else None,
            "effort": {"low": effort["low"], "high": effort["high"]} if effort else None,
            "roleMix": mix, "blendedRate": round(blended) if blended is not None else None,
            "missingRates": missing, "price": price,
            "savingsCents": sum(f.get("savingsCents") or 0 for f in present),
        })
    inc = [r for r in rows if r.get("included", True)]

    def total(rs: List[Dict[str, Any]], field: str, end: str) -> float:
        return sum((r[field] or {}).get(end, 0) for r in rs if r[field])

    by_basis = {b: [r for r in inc if r["basis"] == b] for b in ("inferred", "confirmed")}
    totals = {
        "packages": len(inc), "excluded": len(rows) - len(inc),
        "effort": {"low": total(inc, "effort", "low"), "high": total(inc, "effort", "high")},
        "inferred": {"low": total(by_basis["inferred"], "effort", "low"), "high": total(by_basis["inferred"], "effort", "high"),
                     "packages": len(by_basis["inferred"])},
        "confirmed": {"low": total(by_basis["confirmed"], "effort", "low"),
                      "high": total(by_basis["confirmed"], "effort", "high"), "packages": len(by_basis["confirmed"])},
        "unestimated": [r["title"] for r in inc if not r["effort"]],
        "price": {"low": total(inc, "price", "low"), "high": total(inc, "price", "high")},
        "unpriced": [r["title"] for r in inc if r["effort"] and not r["price"]],
        "savingsCents": sum(r["savingsCents"] for r in inc), "phases": max((r["phase"] for r in inc), default=0),
    }
    not_planned = [{**f, "review": reviews.get(k)} for k, f in findings.items() if k not in planned]
    return {"packages": rows, "totals": totals, "notInRoadmap": not_planned,
            "rates": [{"role": k, "dayRate": v, "override": k in (overrides or {})} for k, v in rate.items()],
            "currency": card.get("currency") or "USD"}


def clean_packages(packages: List[Dict[str, Any]], before: List[Dict[str, Any]], who: str) -> Tuple[List[Dict[str, Any]], Optional[str]]:
    """Validate an edited package list; stamp who confirmed effort and when."""
    prev = {p["id"]: p for p in before}
    ids = {str(p.get("id")) for p in packages}
    out = []
    for i, p in enumerate(packages):
        pid = str(p.get("id") or "")
        if not pid or not str(p.get("title") or "").strip():
            return [], "Each package needs an id and a title."
        conf = p.get("confirmed")
        if conf is not None:
            lo, hi = conf.get("low"), conf.get("high")
            if not all(isinstance(v, (int, float)) and v >= 0 for v in (lo, hi)) or lo > hi:
                return [], f"{p['title']}: confirmed effort must be a low-high range of days."
            old = (prev.get(pid) or {}).get("confirmed") or {}
            same = old.get("low") == lo and old.get("high") == hi
            conf = {"low": float(lo), "high": float(hi), "by": old.get("by") if same else who,
                    "at": old.get("at") if same else datetime.now(timezone.utc).isoformat()}
        roles = p.get("roles")
        if roles is not None and (not isinstance(roles, dict) or abs(sum(float(v) for v in roles.values()) - 1) > 0.01):
            return [], f"{p['title']}: the role mix must add up to 100%."
        out.append({"id": pid, "playbook": p.get("playbook"), "title": str(p["title"]).strip()[:120],
                    "findingKeys": [str(k) for k in p.get("findingKeys") or []], "included": bool(p.get("included", True)),
                    "confirmed": conf, "notes": str(p.get("notes") or "")[:4000], "order": int(p.get("order", i)),
                    "roles": roles, "after": [a for a in p.get("after") or [] if a in ids and a != pid]})
    return out, None
