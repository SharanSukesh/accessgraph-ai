"""Evidence on every finding, anomaly and recommendation (roadmap item 20).

One block per item, so a consultant can defend it in front of a client:

  source       the Salesforce objects or API it came from
  collected    when the data was read, and the snapshot (item 21) it reflects
  coverage     how complete the input was ("400 of 400 active users",
               "estimated: sampled 2,000 of 48,000 records", "records the
               integration user can see")
  confidence   confirmed (counted from complete reads) / inferred (a rule
               or model over complete reads, e.g. "likely unused") /
               sampled (from a sample or estimate) / unknown (an input
               wasn't read)
  permission   what the read needs, and whether Newton had it (it did when
               the data came back)
  methodology  a version per module, so a later change in method leaves old
               reports explainable

Worked out when an item is read, from the item and what Newton holds about
its run; nothing is stored per item. "Not measured" is never "nothing
found": confidence "unknown" says an input is missing.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, Optional

METHODOLOGY = {
    "health": "Health Report rules 2026.10",
    "anomaly": "Access anomaly rank and reasons 2026.10 (rank within peers, not a probability)",
    "session": "Session anomaly rules 2026.10 (LoginHistory)",
    "recommendation": "Priority Actions 2026.10",
    "data_quality": "Data Quality aggregate counts 2026.10",
}
CONFIG = "View Setup and Configuration (read)"
# Finding code -> (source, permission, confidence). Anything not listed falls back to its category.
FINDINGS: Dict[str, tuple] = {
    "LICENSE_INACTIVE_USER": ("User (IsActive, LastLoginDate), UserLicense", CONFIG, "confirmed"),
    "LICENSE_NEVER_LOGGED_IN": ("User (LastLoginDate), UserLicense", CONFIG, "confirmed"),
    "LICENSE_SEATS_UNUSED": ("UserLicense (TotalLicenses, UsedLicenses)", CONFIG, "confirmed"),
    "PSL_SEATS_UNUSED": ("PermissionSetLicense (TotalLicenses, UsedLicenses)", CONFIG, "confirmed"),
    "LICENSE_OVERSIZED": ("User, UserLicense, object permissions", CONFIG, "inferred"),
    "ORG_SUBSCRIPTION_UNUSED": ("Organization licences, User", CONFIG, "inferred"),
    "USER_DORMANT": ("User (LastLoginDate)", CONFIG, "confirmed"),
    "API_ENABLED_NO_USE": ("Profile and permission set system permissions, EventLogFile (API usage)", CONFIG, "inferred"),
    "API_REQUESTS_HOT": ("REST /limits (DailyApiRequests)", "API Enabled", "confirmed"),
    "STORAGE_WARNING": ("REST /limits (DataStorageMB)", "API Enabled", "confirmed"),
    "FILE_STORAGE_HOT": ("REST /limits (FileStorageMB)", "API Enabled", "confirmed"),
    "PER_OBJECT_STORAGE_HOT": ("Record counts per object (COUNT())", "Read on the object", "sampled"),
    "CUSTOM_OBJECT_EMPTY": ("Record counts per object (COUNT())", "Read on the object", "confirmed"),
    "STALE_OPPORTUNITY": ("Opportunity (COUNT() by LastModifiedDate)", "Read on Opportunity", "confirmed"),
    "ACCOUNT_OWNERSHIP_CONCENTRATION": ("Account (COUNT() by OwnerId)", "Read on Account", "confirmed"),
    "APEX_LOW_COVERAGE": ("ApexCodeCoverageAggregate (Tooling API)", "View Setup and Configuration; Author Apex not needed", "confirmed"),
    "APEX_COVERAGE_STALE": ("ApexCodeCoverageAggregate, ApexTestRunResult (Tooling API)", CONFIG, "confirmed"),
    "ORG_COVERAGE_BELOW_GATE": ("ApexOrgWideCoverage (Tooling API)", CONFIG, "confirmed"),
    "OWD_PUBLIC_ON_SENSITIVE": ("Organization-wide defaults (EntityDefinition sharing models)", CONFIG, "confirmed"),
    "SHARING_RULE_BLOAT": ("Sharing rules (Metadata)", CONFIG, "confirmed"),
    "MANUAL_SHARE_AVALANCHE": ("AccountShare, OpportunityShare (RowCause Manual)", "Read on the shares", "sampled"),
    "FLOW_AND_WORKFLOW_OVERLAP": ("FlowDefinitionView, WorkflowRule (Tooling API)", CONFIG, "inferred"),
    "TRIGGER_AND_FLOW_OVERLAP": ("ApexTrigger, FlowDefinitionView (Tooling API)", CONFIG, "inferred"),
    "TRIGGER_MULTI_PER_OBJECT": ("ApexTrigger (Tooling API)", CONFIG, "confirmed"),
    "FLOW_INACTIVE_BUT_INSTALLED": ("FlowDefinitionView (Tooling API)", CONFIG, "confirmed"),
    "VALIDATION_RULE_BLOAT": ("ValidationRule (Tooling API)", CONFIG, "confirmed"),
    "PS_UNUSED": ("PermissionSet, PermissionSetAssignment", CONFIG, "confirmed"),
    "PS_REDUNDANT_DUPLICATE": ("Permission set object and field permissions", CONFIG, "inferred"),
    "PSG_TRIVIAL": ("PermissionSetGroup, PermissionSetGroupComponent", CONFIG, "confirmed"),
    "PROFILE_UNUSED": ("Profile, User", CONFIG, "confirmed"),
    "STANDARD_PROFILE_IN_USE": ("Profile, User", CONFIG, "confirmed"),
    "OVERPRIVILEGED_PROFILE": ("Profile system permissions, User", CONFIG, "inferred"),
    "ROLE_EMPTY": ("UserRole, User", CONFIG, "confirmed"),
    "ROLE_HIERARCHY_TOO_DEEP": ("UserRole", CONFIG, "confirmed"),
    "GROUP_EMPTY": ("Group, GroupMember", CONFIG, "confirmed"),
    "CRITICAL_OBJECT_STALE": ("Data Quality: record counts by LastModifiedDate", "Read on the object", "confirmed"),
    "CRITICAL_OBJECT_MOSTLY_EMPTY": ("Data Quality: COUNT(field) per field", "Read on the object and fields", "confirmed"),
    "FIELDS_NEVER_POPULATED": ("Data Quality: COUNT(field) per field", "Read on the object and fields", "confirmed"),
}
CATEGORY_FALLBACK = {
    "license_waste": ("User, UserLicense", CONFIG, "inferred"),
    "config_bloat": ("Profiles, permission sets and their permissions", CONFIG, "confirmed"),
    "automation_hygiene": ("Flows, Apex and workflow (Tooling API)", CONFIG, "confirmed"),
    "sharing_posture": ("Sharing settings and shares", CONFIG, "confirmed"),
    "storage_limit": ("REST /limits", "API Enabled", "confirmed"),
    "data_quality": ("Data Quality aggregate counts", "Read on the objects", "confirmed"),
    "user_activity": ("User, LoginHistory", CONFIG, "inferred"),
    "predictive": ("Newton's projection over synced data", CONFIG, "inferred"),
}
RECOMMENDATION_SOURCES = {
    "permission_removal": "Effective access (profiles, sets, groups) and usage signals",
    "access_review": "Effective access and anomaly ranks",
    "psg_migration": "PermissionSetAssignment",
    "role_simplification": "UserRole",
    "account_cleanup": "Account ownership counts",
    "under_permissioned": "Effective access compared with peers",
    "grant_for_equity": "Equity analysis over effective access",
    "deployment_readiness": "Apex code coverage (Tooling API)",
    "data_cleanup": "Data Quality aggregate counts",
}


def _iso(v: Optional[datetime]) -> Optional[str]:
    return v.isoformat() if v else None


class EvidenceContext:
    """What Newton holds about an org's runs, loaded once per request."""

    def __init__(self) -> None:
        self.snapshots: list = []  # (taken_at, id, label, seq)
        self.active_users: Optional[int] = None
        self.users_scored: Optional[int] = None
        self.record_coverage: Optional[Dict[str, Any]] = None
        self.dq_estimated: Dict[str, str] = {}  # object -> estimate label
        self.login_history_read: Optional[bool] = None

    def snapshot_at(self, when: Optional[datetime]) -> Optional[Dict[str, Any]]:
        """The snapshot the item was computed from: the latest taken at or before it."""
        if not self.snapshots:
            return None
        if when is None:
            taken, sid, label, seq = self.snapshots[-1]
        else:
            w = when.replace(tzinfo=None)
            earlier = [s for s in self.snapshots if s[0].replace(tzinfo=None) <= w]
            if not earlier:
                return None
            taken, sid, label, seq = earlier[-1]
        return {"id": sid, "takenAt": _iso(taken), "label": label or f"Snapshot {seq}"}


async def load_context(db: Any, org_id: str) -> EvidenceContext:
    from sqlalchemy import desc, func, select

    from app.domain.models import AccessAnomaly, DataQualityRun, ObjectQualityScore, OrgSnapshot, RiskScore, SyncJob, SyncStatus, UserSnapshot

    ctx = EvidenceContext()
    ctx.snapshots = [(s.taken_at, s.id, s.label, s.seq) for s in (await db.execute(
        select(OrgSnapshot).where(OrgSnapshot.organization_id == org_id).order_by(OrgSnapshot.seq))).scalars()]
    ctx.active_users = (await db.execute(select(func.count()).select_from(UserSnapshot).where(
        UserSnapshot.organization_id == org_id, UserSnapshot.is_active.is_(True)))).scalar()
    ctx.users_scored = (await db.execute(select(func.count(func.distinct(RiskScore.entity_id))).where(
        RiskScore.organization_id == org_id, RiskScore.entity_type == "user"))).scalar()
    job = (await db.execute(select(SyncJob).where(SyncJob.organization_id == org_id, SyncJob.status == SyncStatus.COMPLETED)
                            .order_by(desc(SyncJob.completed_at)).limit(1))).scalar_one_or_none()
    ctx.record_coverage = ((job.sync_metadata or {}).get("record_coverage") if job else None)
    run = (await db.execute(select(DataQualityRun).where(DataQualityRun.organization_id == org_id)
                            .order_by(desc(DataQualityRun.snapshot_at)).limit(1))).scalar_one_or_none()
    if run is not None:
        for s in (await db.execute(select(ObjectQualityScore).where(ObjectQualityScore.run_id == run.id))).scalars():
            if (s.evidence or {}).get("estimated"):
                ctx.dq_estimated[s.object_name] = (s.evidence or {}).get("estimate_label") or "estimated"
    ctx.login_history_read = (await db.execute(select(func.count()).select_from(AccessAnomaly).where(
        AccessAnomaly.organization_id == org_id, AccessAnomaly.category == "session"))).scalar() > 0
    return ctx


def _coverage_users(ctx: EvidenceContext) -> str:
    if ctx.active_users is None:
        return "Users not read"
    return f"{ctx.users_scored or 0:,} of {ctx.active_users:,} active users scored"


def _records_note(ctx: EvidenceContext) -> Optional[str]:
    from app.services.record_coverage import summarize
    summary = summarize(ctx.record_coverage)
    return None if summary["complete"] else summary["label"]


def for_finding(f: Any, ctx: EvidenceContext, run_at: Optional[datetime]) -> Dict[str, Any]:
    category = str(getattr(f.category, "value", f.category))
    source, permission, confidence = FINDINGS.get(f.code) or CATEGORY_FALLBACK.get(category, ("Synced data", CONFIG, "confirmed"))
    coverage = []
    obj = (f.evidence or {}).get("object") if isinstance(f.evidence, dict) else None
    if obj and obj in ctx.dq_estimated:
        confidence = "sampled"
        coverage.append(f"{obj}: {ctx.dq_estimated[obj]}")
    if category in ("license_waste", "user_activity"):
        coverage.append(_coverage_users(ctx))
    note = _records_note(ctx)
    if note and category in ("sharing_posture", "data_quality"):
        coverage.append(note)
    return {"source": source, "collectedAt": _iso(run_at or getattr(f, "created_at", None)),
            "snapshot": ctx.snapshot_at(run_at or getattr(f, "created_at", None)),
            "coverage": coverage or ["Complete: every record of the source was read"],
            "confidence": confidence, "permission": {"needed": permission, "had": True},
            "methodology": METHODOLOGY["data_quality" if category == "data_quality" else "health"]}


def for_anomaly(a: Any, ctx: EvidenceContext) -> Dict[str, Any]:
    session = (a.category or "") == "session"
    return {"source": "LoginHistory, LoginGeo" if session else
            "Effective access (profiles, permission sets, groups) compared with peers in the same role and profile",
            "collectedAt": _iso(a.detected_at), "snapshot": ctx.snapshot_at(a.detected_at),
            "coverage": ["LoginHistory read for the window" if session else _coverage_users(ctx)],
            "confidence": "inferred",
            "permission": {"needed": "View All Users (LoginHistory)" if session else CONFIG, "had": True},
            "methodology": METHODOLOGY["session" if session else "anomaly"]}


def for_recommendation(r: Any, ctx: EvidenceContext) -> Dict[str, Any]:
    kind = str(getattr(r.rec_type, "value", r.rec_type))
    coverage = [_coverage_users(ctx)] if kind not in ("deployment_readiness", "data_cleanup") else []
    target = r.target_entity_id if kind == "data_cleanup" else None
    confidence = "sampled" if target and target in ctx.dq_estimated else "inferred"
    if target and target in ctx.dq_estimated:
        coverage.append(f"{target}: {ctx.dq_estimated[target]}")
    return {"source": RECOMMENDATION_SOURCES.get(kind, "Synced data"), "collectedAt": _iso(r.generated_at),
            "snapshot": ctx.snapshot_at(r.generated_at), "coverage": coverage or ["Complete"],
            "confidence": confidence, "permission": {"needed": CONFIG, "had": True},
            "methodology": METHODOLOGY["recommendation"]}


def review_key(kind: str, item: Any) -> str:
    """A key that stays the same when the analysis runs again."""
    if kind == "finding":
        ev = item.evidence if isinstance(item.evidence, dict) else {}
        # Seat findings come one per licence, under the same code.
        part = ev.get("object") or ev.get("entity") or ev.get("developer_key") or ev.get("developer_name") or ""
        return f"finding:{item.code}:{part}"
    if kind == "anomaly":
        kind_of = (item.peer_stats or {}).get("anomaly_type") or item.category or ""
        return f"anomaly:{item.user_id}:{kind_of}"
    return f"recommendation:{getattr(item.rec_type, 'value', item.rec_type)}:{item.target_entity_id}"
