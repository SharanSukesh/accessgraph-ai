"""One-screen views over what Newton already holds (Config Workbook parity
rows #26, #27 and #28). Nothing here calls Salesforce.

  limits_rows        #27: every limit from the latest Health Report run's
                     REST /limits read, used and % used, with a status:
                     healthy below WARNING_PCT, warning, critical from
                     CRITICAL_PCT
  security_summary   #26: health score, users holding the most powerful
                     system permissions, flagged access anomalies,
                     high-blast setup changes, org-wide defaults that open
                     records, compliance indicators, each linking to its
                     module; what wasn't read says so
  logins_by_profile  #28: per profile, active users and how many logged in
                     within 30 and 90 days or never (from each user's last
                     login, no LoginHistory read)
  component_counts   #28: how much configuration the org has, from the sync
"""
from __future__ import annotations

import re
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

WARNING_PCT = 75.0
CRITICAL_PCT = 90.0
# Readable names for limits whose API names don't read well split (REST API Developer Guide, "Limits").
LIMIT_LABELS = {
    "DailyApiRequests": "API requests (24 hours)", "DataStorageMB": "Data storage (MB)",
    "FileStorageMB": "File storage (MB)", "DailyAsyncApexExecutions": "Async Apex executions (24 hours)",
    "DailyBulkApiBatches": "Bulk API batches (24 hours)", "DailyBulkV2QueryJobs": "Bulk API 2.0 query jobs (24 hours)",
    "DailyStreamingApiEvents": "Streaming API events (24 hours)", "HourlyPublishedPlatformEvents": "Platform events published (hour)",
    "DailyDeliveredPlatformEvents": "Platform events delivered (24 hours)", "SingleEmail": "Single emails (day)",
    "MassEmail": "Mass emails (day)", "DailyWorkflowEmails": "Workflow emails (day)",
    "HourlyAsyncReportRuns": "Async report runs (hour)", "HourlyDashboardRefreshes": "Dashboard refreshes (hour)",
    "HourlyTimeBasedWorkflow": "Time-based workflow (hour)", "ConcurrentAsyncGetReportInstances": "Concurrent async reports",
    "StreamingApiConcurrentClients": "Streaming API concurrent clients", "HourlyODataCallout": "OData callouts (hour)",
    "DailyAnalyticsDataflowJobExecutions": "CRM Analytics dataflow runs (day)",
}
ADMIN_PERMISSIONS = [  # shown on the security summary, most powerful first
    ("ModifyAllData", "Modify All Data"), ("ViewAllData", "View All Data"), ("ManageUsers", "Manage Users"),
    ("CustomizeApplication", "Customize Application"), ("AuthorApex", "Author Apex"),
]


def _label(name: str) -> str:
    return LIMIT_LABELS.get(name) or re.sub(r"(?<=[a-z0-9])(?=[A-Z])", " ", name)


def limits_rows(org_limits: Optional[Dict[str, Any]]) -> List[Dict[str, Any]]:
    rows = []
    for name, entry in (org_limits or {}).items():
        if not isinstance(entry, dict) or entry.get("Max") is None or entry.get("Remaining") is None:
            continue
        mx, rem = int(entry["Max"]), int(entry["Remaining"])
        used = max(mx - rem, 0)
        pct = round(used / mx * 100, 1) if mx else None
        status = ("not_applicable" if pct is None else "critical" if pct >= CRITICAL_PCT
                  else "warning" if pct >= WARNING_PCT else "healthy")
        rows.append({"name": name, "label": _label(name), "max": mx, "remaining": rem, "used": used, "pct": pct,
                     "status": status})
    return sorted(rows, key=lambda r: (-(r["pct"] or -1), r["label"].lower()))


def logins_by_profile(users: List[Any], profiles: Dict[str, str], now: Optional[datetime] = None) -> List[Dict[str, Any]]:
    now = now or datetime.now(timezone.utc)
    stats: Dict[str, Dict[str, int]] = defaultdict(lambda: {"active": 0, "last30": 0, "last90": 0, "never": 0})
    for u in users:
        if not u.is_active:
            continue
        s = stats[u.profile_id or ""]
        s["active"] += 1
        last = u.last_login_at
        if last is None:
            s["never"] += 1
            continue
        if last.tzinfo is None:
            last = last.replace(tzinfo=timezone.utc)
        if now - last <= timedelta(days=30):
            s["last30"] += 1
        if now - last <= timedelta(days=90):
            s["last90"] += 1
    rows = [{"profileId": pid, "profile": profiles.get(pid) or "(no profile)", **s,
             "notIn90": s["active"] - s["last90"] - s["never"]} for pid, s in stats.items()]
    return sorted(rows, key=lambda r: (-r["active"], r["profile"].lower()))


def component_counts(schema: Optional[Dict[str, Any]], ui: Optional[Dict[str, Any]], docs: Optional[Dict[str, Any]],
                     db_counts: Dict[str, Optional[int]]) -> List[Dict[str, Any]]:
    """[{key, label, count (None when not read), href}] in reading order."""
    objects = (schema or {}).get("objects") if schema else None
    fields = None if objects is None else [f for o in objects.values() for f in (o.get("fields") or {})]

    def n(v: Any) -> Optional[int]:
        return None if v is None else len(v)

    flows = (ui or {}).get("flows") if ui else None
    rows = [
        ("objects", "Objects", n(objects), "objects"),
        ("custom_objects", "Custom objects", None if objects is None else sum(1 for k in objects if k.endswith("__c")), "objects"),
        ("fields", "Fields", n(fields), "fields"),
        ("custom_fields", "Custom fields", None if fields is None else sum(1 for f in fields if f.endswith("__c")), "cleanup"),
        ("validation_rules", "Validation rules", n((docs or {}).get("validation_rules")) if docs else None, None),
        ("flows", "Flows", n(flows), None),
        ("active_flows", "Active flows", None if flows is None else sum(1 for f in flows if f.get("active")), None),
        ("apex_classes", "Apex classes", n((docs or {}).get("apex_classes")) if docs else n((ui or {}).get("apex_classes")), None),
        ("apex_triggers", "Apex triggers", n((docs or {}).get("apex_triggers")) if docs else None, None),
        ("layouts", "Page layouts", n((ui or {}).get("layouts")) if ui else None, None),
        ("record_pages", "Lightning record pages", n((ui or {}).get("flexipages")) if ui else None, None),
        ("record_types", "Record types", n((ui or {}).get("record_types")) if ui else None, None),
        ("profiles", "Profiles", db_counts.get("profiles"), "profiles"),
        ("permission_sets", "Permission sets", db_counts.get("permission_sets"), "permission-sets"),
        ("permission_set_groups", "Permission set groups", db_counts.get("permission_set_groups"), "permission-set-groups"),
        ("roles", "Roles", db_counts.get("roles"), "reporting-graph?view=roles"),
        ("active_users", "Active users", db_counts.get("active_users"), "users"),
        ("custom_permissions", "Custom permissions", n((docs or {}).get("custom_permissions")) if docs else None, None),
        ("visualforce", "Visualforce pages and components", n((docs or {}).get("visualforce")) if docs else None, None),
        ("lightning_components", "Lightning components", n((docs or {}).get("lightning_components")) if docs else None, None),
    ]
    return [{"key": k, "label": label, "count": c, "href": href} for k, label, c, href in rows]


async def load_overview_inputs(db: Any, org_id: str) -> Dict[str, Any]:
    from sqlalchemy import func, select

    from app.api.routes.ui_access import latest_ui_access
    from app.domain.models import (PermissionSetGroupSnapshot, PermissionSetSnapshot, ProfileSnapshot, RoleSnapshot,
                                   UserSnapshot)
    from app.services.org_docs import latest_org_docs
    from app.services.schema_metadata import latest_schema

    async def count(model, *where) -> int:
        return (await db.execute(select(func.count()).select_from(model).where(
            model.organization_id == org_id, *where))).scalar() or 0

    db_counts = {
        "profiles": await count(ProfileSnapshot),
        "permission_sets": await count(PermissionSetSnapshot, PermissionSetSnapshot.is_owned_by_profile.is_(False)),
        "permission_set_groups": await count(PermissionSetGroupSnapshot),
        "roles": await count(RoleSnapshot),
        "active_users": await count(UserSnapshot, UserSnapshot.is_active.is_(True)),
    }
    return {"schema": await latest_schema(db, org_id), "ui": await latest_ui_access(db, org_id),
            "docs": await latest_org_docs(db, org_id), "db_counts": db_counts}


async def admin_holders(db: Any, org_id: str) -> Dict[str, List[Dict[str, Any]]]:
    """Permission API name -> active users holding it (through profile, sets and groups, muting applied)."""
    from app.services.risk_scoring import RiskScoringService

    ctx = await RiskScoringService(db)._load_org_context(org_id)
    out: Dict[str, List[Dict[str, Any]]] = {p: [] for p, _ in ADMIN_PERMISSIONS}
    for u in ctx.active_users:
        held = ctx.access(u).sys_perms
        for perm, _ in ADMIN_PERMISSIONS:
            if perm in held:
                out[perm].append({"salesforceUserId": u.salesforce_id, "name": u.name or u.username,
                                  "profile": ctx.profile_names.get(u.profile_id or ""), "via": [
                                      s.get("label") or s.get("name") or "" for s in held[perm]][:5]})
    return out


async def security_summary(db: Any, org_id: str) -> Dict[str, Any]:
    from sqlalchemy import desc, func, select

    from app.domain.models import (AccessAnomaly, ChangeAuditRun, ComplianceScorecardRun, OrganizationWideDefaultSnapshot,
                                   OrgAnalysisSnapshot, Organization)
    from app.services import privacy_mode

    org = await db.get(Organization, org_id)
    users_ok = privacy_mode.allows(org, privacy_mode.USER_RECORDS) if org is not None else False
    out: Dict[str, Any] = {"usersAllowed": users_ok}

    snap = (await db.execute(select(OrgAnalysisSnapshot).where(OrgAnalysisSnapshot.organization_id == org_id)
                             .order_by(desc(OrgAnalysisSnapshot.snapshot_at)).limit(1))).scalar_one_or_none()
    out["health"] = None if snap is None else {
        "score": (snap.metrics or {}).get("org_health_score"), "findings": snap.findings_count,
        "critical": (snap.findings_by_severity or {}).get("critical", 0), "at": snap.snapshot_at.isoformat()}
    limits = limits_rows(snap.org_limits if snap is not None else None)
    out["limits"] = None if snap is None else {
        "total": len(limits), "warning": sum(r["status"] == "warning" for r in limits),
        "critical": sum(r["status"] == "critical" for r in limits)}

    if users_ok:
        holders = await admin_holders(db, org_id)
        out["admins"] = [{"permission": p, "label": label, "users": len(holders[p]),
                          "preview": [h["name"] for h in holders[p][:5]]} for p, label in ADMIN_PERMISSIONS]
    else:
        out["admins"] = None

    rows = (await db.execute(select(AccessAnomaly.category, AccessAnomaly.severity, func.count()).where(
        AccessAnomaly.organization_id == org_id).group_by(AccessAnomaly.category, AccessAnomaly.severity))).all()
    out["anomalies"] = None if not users_ok else {
        "total": sum(n for _, _, n in rows),
        "highOrCritical": sum(n for _, sev, n in rows if str(getattr(sev, "value", sev)).lower() in ("high", "critical")),
        "session": sum(n for cat, _, n in rows if (cat or "") == "session")}

    run = (await db.execute(select(ChangeAuditRun).where(ChangeAuditRun.organization_id == org_id)
                            .order_by(desc(ChangeAuditRun.snapshot_at)).limit(1))).scalar_one_or_none()
    out["changes"] = None if run is None else {
        "events": run.events_ingested, "highBlast": run.high_blast_count, "since": run.since.isoformat(),
        "at": run.snapshot_at.isoformat()}

    owd = (await db.execute(select(OrganizationWideDefaultSnapshot).where(
        OrganizationWideDefaultSnapshot.organization_id == org_id))).scalars().all()
    latest: Dict[str, Any] = {}
    for o in owd:
        if o.sobject_type not in latest or o.snapshot_date > latest[o.sobject_type].snapshot_date:
            latest[o.sobject_type] = o
    public = sorted(o.sobject_type for o in latest.values()
                    if (o.internal_sharing_model or "").lower() not in ("private", "controlledbyparent", "none"))
    out["sharing"] = None if not latest else {"objects": len(latest), "public": public}

    comp = (await db.execute(select(ComplianceScorecardRun).where(ComplianceScorecardRun.organization_id == org_id)
                             .order_by(desc(ComplianceScorecardRun.snapshot_at)))).scalars().all()
    seen: Dict[str, Any] = {}
    for c in comp:
        seen.setdefault(c.framework, c)
    out["compliance"] = [{"framework": c.framework, "failed": c.controls_failed, "total": c.controls_total,
                          "scorePct": c.score_pct} for c in sorted(seen.values(), key=lambda c: c.framework)] or None
    return out
