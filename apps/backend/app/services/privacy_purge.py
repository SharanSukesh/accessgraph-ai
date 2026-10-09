"""Bring already-stored data in line with an org's privacy level.

Runs from PUT /orgs/{id}/privacy/mode inside the request's session, after
the new level is set and before commit, so it never commits itself. Each
step keys off a capability (privacy_mode.allows), not a mode name, like
the pull sites do. Loosening a level changes nothing here; the next sync
pulls what the new level allows.

Returned counts are keyed "<table>_deleted" / "<table>_updated".
"""
from __future__ import annotations

import copy
import re
from typing import Any, Dict, Iterable, List, Optional, Set

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.models import (
    AccessAnomaly,
    AccountShareSnapshot,
    AccountTeamMemberSnapshot,
    AutomationInventoryItem,
    ChangeAuditEvent,
    ChangeAuditRun,
    ComplianceScorecardRun,
    DataQualityRun,
    EquitySnapshot,
    InstalledPackage,
    LicenseFitAssessment,
    LicenseFitRun,
    ObjectQualityScore,
    OpportunityShareSnapshot,
    OpportunityTeamMemberSnapshot,
    OrgAnalysisSnapshot,
    OrgFinding,
    Recommendation,
    RecommendationTrack,
    ReportInventoryItem,
    RestructureMove,
    RestructurePlan,
    RestructurePreservationConstraint,
    RestructureRun,
    RiskScore,
    SalesforceConnection,
    UserSnapshot,
    VIPDesignation,
)
from app.services import privacy_mode as privacy

SENIOR_LEADER = "Senior leader"
UNKNOWN_ALIAS = privacy.user_alias("", None)
_ALIAS = re.compile(r"User [0-9A-F]{6}|User \(unknown\)")

# Org Analyzer findings and metrics computed from record counts.
AGGREGATE_FINDING_CODES = {
    "PER_OBJECT_STORAGE_HOT",
    "CUSTOM_OBJECT_EMPTY",
    "STALE_OPPORTUNITY",
    "ACCOUNT_OWNERSHIP_CONCENTRATION",
}
AGGREGATE_METRIC_KEYS = (
    "sobject_record_counts",
    "total_accounts",
    "stale_open_opportunities_count",
)

# Every org-scoped table is either handled here or listed as holding
# nothing a tighter level removes (Newton staff, audit and config,
# Salesforce configuration, replay protection, app-level integration
# usage). tests/test_privacy_modes.py fails on a table in neither set.
HANDLED_TABLES = {
    "users_snapshot", "access_anomalies", "risk_scores", "recommendations",
    "equity_snapshots", "vip_designations", "license_fit_runs",
    "license_fit_assessments", "change_audit_runs", "change_audit_events",
    "account_share_snapshots", "opportunity_share_snapshots",
    "account_team_member_snapshots", "opportunity_team_member_snapshots",
    "restructure_runs", "restructure_moves", "restructure_plans",
    "restructure_preservation_constraints", "data_quality_runs",
    "object_quality_scores", "org_analysis_snapshots", "org_findings",
    "installed_packages", "report_inventory_items", "automation_inventory_items",
    "compliance_scorecard_runs", "salesforce_connections",
}
UNAFFECTED_TABLES = {
    "audit_logs", "org_users", "org_access_grants", "sync_jobs", "brand_settings",
    "license_price_book", "org_analyzer_runs", "deeplink_redemptions",
    "roles_snapshot", "profiles_snapshot", "permission_sets_snapshot",
    "permission_set_assignments_snapshot", "permission_set_groups_snapshot",
    "permission_set_group_components_snapshot", "object_permissions_snapshot",
    "field_permissions_snapshot", "group_snapshots", "group_member_snapshots",
    "organization_wide_default_snapshots", "sharing_rule_snapshots",
    "package_sprawl_runs", "report_sprawl_runs", "automation_sprawl_runs",
    "integration_sprawl_runs", "integration_inventory_items",
}

# Shape of a person inside a JSON evidence blob: a Salesforce user id
# (005 prefix) next to identifying fields.
_PERSON_ID_KEYS = ("id", "user_id", "owner_id", "sf_id", "user_sf_id")
_PERSON_NAME_KEYS = ("name", "label", "owner_name", "user_name")
_PERSON_DROP_KEYS = ("username", "email", "user_username", "owner_email")


async def enforce_privacy_mode(db: AsyncSession, org: Any) -> Dict[str, int]:
    if privacy.mode_of(org) == privacy.FULL:
        return {}
    purge = _Purge(db, org)
    await purge.run()
    return purge.counts()


class _Purge:
    def __init__(self, db: AsyncSession, org: Any):
        self.db = db
        self.org = org
        self.org_id = org.id
        self.deleted: Dict[str, int] = {}
        self.updated: Dict[str, Set[str]] = {}
        # Identifying text (names, usernames, emails) -> alias, used to
        # rewrite free text and JSON that mention a person.
        self.names: Dict[str, str] = {}
        self._pattern: Optional[re.Pattern] = None

    def allows(self, capability: str) -> bool:
        return privacy.allows(self.org, capability)

    def counts(self) -> Dict[str, int]:
        out = {f"{t}_deleted": n for t, n in self.deleted.items() if n}
        out.update({f"{t}_updated": len(ids) for t, ids in self.updated.items() if ids})
        return out

    async def run(self) -> None:
        keep_identity = self.allows(privacy.USER_IDENTITY)
        if not keep_identity:
            await self._collect_names()

        await self._delete_disallowed()

        if not keep_identity:
            await self._mask_users()
            await self._mask_change_audit()
            await self._mask_license_fit()
            await self._mask_inventory_owners()
            await self._mask_connected_as()
            await self._scrub_findings()
            await self._scrub_remaining_text()
            await self._clear_graph()
        if not self.allows(privacy.AUDIT_TEXT):
            await self._drop_audit_text()

    # ------------------------------------------------------------ helpers

    async def _rows(self, model, *where) -> List[Any]:
        result = await self.db.execute(
            select(model).where(model.organization_id == self.org_id, *where)
        )
        return list(result.scalars().all())

    async def _delete(self, model, *where) -> None:
        result = await self.db.execute(
            delete(model)
            .where(model.organization_id == self.org_id, *where)
            .execution_options(synchronize_session=False)
        )
        table = model.__tablename__
        self.deleted[table] = self.deleted.get(table, 0) + (result.rowcount or 0)

    def _set(self, row: Any, **values: Any) -> None:
        changed = False
        for column, value in values.items():
            if getattr(row, column) != value:
                setattr(row, column, value)
                changed = True
        if changed:
            self.updated.setdefault(row.__tablename__, set()).add(row.id)

    def _alias(self, sf_user_id: Optional[str]) -> str:
        return privacy.user_alias(self.org_id, sf_user_id)

    def _actor_alias(self, name: Optional[str]) -> Optional[str]:
        """Alias for a stored actor name whose user id isn't at hand."""
        if not name:
            return None
        if _ALIAS.fullmatch(name):
            return name
        return self.names.get(name, UNKNOWN_ALIAS)

    def _remember(self, sf_user_id: Optional[str], *texts: Optional[str]) -> None:
        alias = self._alias(sf_user_id)
        for text in texts:
            if text and len(text) >= 3 and text != alias and not _ALIAS.fullmatch(text):
                self.names[text] = alias

    def _scrub(self, value: Any) -> Any:
        """Replace every known name / username / email in text or JSON."""
        if self._pattern is None:
            return value
        if isinstance(value, str):
            return self._pattern.sub(lambda m: self.names[m.group(0)], value)
        if isinstance(value, list):
            return [self._scrub(v) for v in value]
        if isinstance(value, dict):
            return {self._scrub(k): self._scrub(v) for k, v in value.items()}
        return value

    def _scrub_people(self, value: Any) -> Any:
        """_scrub, plus any {id: 005..., name/email/...} dict becomes the
        alias with username and email dropped, even for a name we never
        saw in users_snapshot."""
        if isinstance(value, list):
            return [self._scrub_people(v) for v in value]
        if not isinstance(value, dict):
            return self._scrub(value)
        out = {k: self._scrub_people(v) for k, v in value.items()}
        user_id = next(
            (
                value[k] for k in _PERSON_ID_KEYS
                if isinstance(value.get(k), str) and value[k].startswith("005")
            ),
            None,
        )
        if user_id and any(k in value for k in _PERSON_NAME_KEYS + _PERSON_DROP_KEYS):
            alias = self._alias(user_id)
            for k in _PERSON_NAME_KEYS:
                if k in out:
                    out[k] = alias
            for k in _PERSON_DROP_KEYS:
                out.pop(k, None)
        return out

    # ------------------------------------------------------- name catalogue

    async def _collect_names(self) -> None:
        for u in await self._rows(UserSnapshot):
            self._remember(u.salesforce_id, u.name, u.username, u.email)
        for e in await self._rows(ChangeAuditEvent):
            if e.actor_id:
                self._remember(e.actor_id, e.actor_name)
        for a in await self._rows(LicenseFitAssessment):
            self._remember(a.user_sf_id, a.user_name, a.user_username)
        for model in (ReportInventoryItem, AutomationInventoryItem):
            for item in await self._rows(model):
                if item.owner_sf_id and item.owner_name:
                    self._remember(item.owner_sf_id, item.owner_name)
        for conn in await self._rows(SalesforceConnection):
            posture = conn.connected_as or {}
            if posture.get("user_id"):
                self._remember(posture["user_id"], posture.get("name"), posture.get("username"))
        if self.names:
            keys = sorted(self.names, key=len, reverse=True)
            self._pattern = re.compile(
                r"(?<![\w@.])(?:" + "|".join(map(re.escape, keys)) + r")(?![\w@])"
            )

    # ------------------------------------------------------------ deletes

    async def _delete_disallowed(self) -> None:
        if not self.allows(privacy.LOGIN_DETAIL):
            # Session anomalies carry city / device detail; they come
            # back without it on the next analysis.
            await self._delete(AccessAnomaly, AccessAnomaly.category == "session")

        if not self.allows(privacy.USER_IDENTITY):
            # Equity output names people in titles and raw metrics and is
            # cheap to regenerate from the masked snapshot.
            await self._delete(Recommendation, Recommendation.track == RecommendationTrack.EQUITY)
            await self._delete(EquitySnapshot)

        if not self.allows(privacy.USER_RECORDS):
            for model in (
                AccessAnomaly,
                RiskScore,
                Recommendation,
                LicenseFitAssessment,
                LicenseFitRun,
                VIPDesignation,
                RestructurePreservationConstraint,
                RestructurePlan,
                RestructureMove,
                RestructureRun,
                UserSnapshot,
            ):
                await self._delete(model)

        if not self.allows(privacy.AUDIT_TRAIL):
            await self._delete(ChangeAuditEvent)
            await self._delete(ChangeAuditRun)

        if not self.allows(privacy.RECORD_SHARES):
            for model in (
                AccountShareSnapshot,
                OpportunityShareSnapshot,
                AccountTeamMemberSnapshot,
                OpportunityTeamMemberSnapshot,
            ):
                await self._delete(model)

        if not self.allows(privacy.RECORD_AGGREGATES):
            await self._delete(ObjectQualityScore)
            await self._delete(DataQualityRun)
            await self._strip_aggregates()

    async def _strip_aggregates(self) -> None:
        snapshots = {s.id: s for s in await self._rows(OrgAnalysisSnapshot)}
        for snap in snapshots.values():
            metrics = dict(snap.metrics or {})
            for key in AGGREGATE_METRIC_KEYS:
                metrics.pop(key, None)
            self._set(snap, metrics=metrics)

        findings = await self._rows(OrgFinding, OrgFinding.code.in_(sorted(AGGREGATE_FINDING_CODES)))
        for f in findings:
            snap = snapshots.get(f.snapshot_id)
            if snap is None:
                continue
            by_sev = dict(snap.findings_by_severity or {})
            by_cat = dict(snap.findings_by_category or {})
            sev, cat = f.severity.value, f.category.value
            by_sev[sev] = max(0, by_sev.get(sev, 0) - 1)
            by_cat[cat] = max(0, by_cat.get(cat, 0) - 1)
            self._set(
                snap,
                findings_count=max(0, (snap.findings_count or 0) - 1),
                findings_by_severity=by_sev,
                findings_by_category=by_cat,
            )
        if findings:
            await self._delete(OrgFinding, OrgFinding.id.in_([f.id for f in findings]))

        for pkg in await self._rows(InstalledPackage):
            evidence = copy.deepcopy(pkg.evidence or {})
            if "record_counts_by_object" in evidence:
                evidence["record_counts_by_object"] = {}
            if isinstance(evidence.get("reasoning"), dict):
                evidence["reasoning"]["record_count_total"] = None
            self._set(pkg, record_count_total=None, evidence=evidence)

    # ------------------------------------------------------------ masking

    async def _mask_users(self) -> None:
        for u in await self._rows(UserSnapshot):
            record = dict(u.raw_data or {})
            for key, value in (
                ("Id", u.salesforce_id),
                ("IsActive", u.is_active),
                ("UserType", u.user_type),
                ("ProfileId", u.profile_id),
                ("UserRoleId", u.user_role_id),
                ("ManagerId", u.manager_id),
                ("DelegatedApproverId", u.delegated_approver_id),
                ("Department", u.department),
                ("Title", u.title),
            ):
                record.setdefault(key, value)
            masked = privacy.mask_user_record(self.org_id, record)
            # An already-masked title must survive a second pass.
            if u.title == SENIOR_LEADER:
                masked["Title"] = SENIOR_LEADER
            self._set(
                u,
                name=masked["Name"],
                username=masked["Username"],
                email=None,
                title=masked["Title"],
                raw_data=masked,
            )

    async def _mask_change_audit(self) -> None:
        for e in await self._rows(ChangeAuditEvent):
            actor = self._alias(e.actor_id) if e.actor_id else self._actor_alias(e.actor_name)
            self._set(e, actor_name=actor, delegate_user=None, notes=self._scrub(e.notes))
        for run in await self._rows(ChangeAuditRun):
            self._set(run, rollups=self._mask_rollups(run.rollups))

    def _mask_rollups(self, rollups: Optional[Dict[str, Any]]) -> Dict[str, Any]:
        r = copy.deepcopy(rollups or {})
        if isinstance(r.get("by_actor"), dict):
            merged: Dict[str, int] = {}
            for name, n in r["by_actor"].items():
                key = self._actor_alias(name) or UNKNOWN_ALIAS
                merged[key] = merged.get(key, 0) + n
            r["by_actor"] = merged
        for row in r.get("top_actors_detailed") or []:
            if isinstance(row, dict):
                row["name"] = self._actor_alias(row.get("name"))
        if isinstance(r.get("new_actors"), list):
            r["new_actors"] = sorted({self._actor_alias(n) for n in r["new_actors"] if n})
        for burst in r.get("bursts") or []:
            if isinstance(burst, dict):
                burst["actor"] = self._actor_alias(burst.get("actor"))
                burst["sample_displays"] = self._scrub(burst.get("sample_displays") or [])
        for entry in (r.get("component_activity") or {}).values():
            for row in (entry or {}).get("top") or []:
                if isinstance(row, dict):
                    row["actor"] = None
        return r

    async def _mask_license_fit(self) -> None:
        for a in await self._rows(LicenseFitAssessment):
            alias = self._alias(a.user_sf_id)
            title = (a.user_title or "").lower()
            if a.user_title == SENIOR_LEADER or any(t in title for t in privacy.SENIOR_TITLE_TERMS):
                masked_title = SENIOR_LEADER
            else:
                masked_title = None
            self._set(
                a,
                user_name=alias,
                user_username=f"{alias.split()[-1].lower()}@masked.newton",
                user_title=masked_title,
                evidence=self._scrub_people(a.evidence),
            )

    async def _mask_inventory_owners(self) -> None:
        keep_owner = self.allows(privacy.USER_RECORDS)
        for model in (ReportInventoryItem, AutomationInventoryItem):
            for item in await self._rows(model):
                owner = None
                if keep_owner and item.owner_name:
                    owner = self._alias(item.owner_sf_id) if item.owner_sf_id else UNKNOWN_ALIAS
                self._set(item, owner_name=owner, evidence=self._scrub(item.evidence))

    async def _mask_connected_as(self) -> None:
        for conn in await self._rows(SalesforceConnection):
            posture = dict(conn.connected_as or {})
            if not posture.get("name") and not posture.get("username"):
                continue
            posture["name"] = self._alias(posture.get("user_id"))
            posture["username"] = None
            self._set(conn, connected_as=posture)

    async def _scrub_findings(self) -> None:
        for f in await self._rows(OrgFinding):
            self._set(
                f,
                title=self._scrub(f.title),
                description=self._scrub(f.description),
                recommended_action=self._scrub(f.recommended_action),
                evidence=self._scrub_people(f.evidence),
            )
        for snap in await self._rows(OrgAnalysisSnapshot):
            self._set(snap, executive_summary=self._scrub(snap.executive_summary))

    async def _scrub_remaining_text(self) -> None:
        """Free text written while names were visible (recommendation
        titles, risk reasons, restructure rationale, consultant notes)."""
        if self._pattern is None:
            return
        targets: Iterable = (
            (Recommendation, ("title", "description", "rationale", "impact_summary", "affected_access")),
            (RiskScore, ("reason_text", "factors")),
            (AccessAnomaly, ("reasons", "features", "peer_stats")),
            (RestructureMove, ("primary_component_name", "rationale", "consultant_notes")),
            (RestructurePlan, ("notes",)),
            (RestructurePreservationConstraint, ("reason",)),
            (VIPDesignation, ("note",)),
            (ComplianceScorecardRun, ("results",)),
        )
        for model, columns in targets:
            for row in await self._rows(model):
                self._set(row, **{c: self._scrub(getattr(row, c)) for c in columns})

    async def _drop_audit_text(self) -> None:
        for e in await self._rows(ChangeAuditEvent):
            # display is NOT NULL; an empty string is the "withheld" value.
            self._set(e, display="", delegate_user=None)
        for run in await self._rows(ChangeAuditRun):
            rollups = copy.deepcopy(run.rollups or {})
            for burst in rollups.get("bursts") or []:
                if isinstance(burst, dict):
                    burst["sample_displays"] = []
            self._set(run, rollups=rollups)

    async def _clear_graph(self) -> None:
        # The graph copy holds user names and emails; the next build reads
        # the masked snapshot.
        from app.services.data_retention import _clear_graph

        if await _clear_graph(self.org_id):
            self.deleted["graph_store"] = 1
