"""Org Analyzer Service — consulting-grade org-health diagnostics.

Fourth analysis track alongside Anomaly, Risk, Equity. Runs a broad
matrix of rules across license waste, configuration bloat, automation
hygiene, sharing posture, storage/limit risk, data quality, user
activity, and predictive trends. Surfaces findings via the existing
snapshot+drilldown pattern (mirrors EquityRecommendationService).

v1 is purely additive — no existing service or table is mutated. The
analyzer reads from snapshots we already sync plus a handful of
read-only SF REST/Tooling calls (limits, global describe, ApexClass,
ApexTrigger, FlowDefinitionView, ValidationRule, LoginHistory).

Entrypoint:
    service = OrgAnalyzerService(db, org_id)
    snapshot = await service.run(actor_email=...)
"""
from __future__ import annotations

import logging
import time
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.models import (
    AccountShareSnapshot,
    FieldPermissionSnapshot,
    FindingCategory,
    FindingSeverity,
    GroupMemberSnapshot,
    GroupSnapshot,
    LicensePriceBook,
    ObjectPermissionSnapshot,
    OpportunityShareSnapshot,
    OrgAnalysisSnapshot,
    OrgAnalyzerRun,
    OrgFinding,
    OrganizationWideDefaultSnapshot,
    PermissionSetAssignmentSnapshot,
    PermissionSetGroupComponentSnapshot,
    PermissionSetGroupSnapshot,
    PermissionSetSnapshot,
    ProfileSnapshot,
    RoleSnapshot,
    SharingRuleSnapshot,
    UserSnapshot,
)
from app.services.salesforce_sync import SalesforceSyncService


logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Defaults — overridable per-org via the license_price_book table.
# ---------------------------------------------------------------------------

DEFAULT_PRICE_BOOK_CENTS: Dict[str, int] = {
    # Salesforce Enterprise list price ~$165/user/mo as of 2026.
    "Salesforce": 16500,
    "Platform": 2500,
    "Sales Cloud — Permission Set License": 0,
    "Field Service": 15000,
    "Service Cloud": 16500,
    "Community / Experience Cloud Login": 500,
}

# SKUs that ship free with every Salesforce edition. Surplus seats here
# carry $0 cost so they're noise on the report — skip them entirely
# rather than flooding the findings list with HIGH-severity zero-dollar
# items. Match is case-insensitive substring against the MasterLabel.
#
# Sources: Salesforce Help "Standard User Licenses", "Communities Licenses",
# and "Authenticated Website License" pages. List intentionally inclusive
# so we err on the side of suppression.
KNOWN_FREE_SKU_PATTERNS: tuple = (
    "chatter free",
    "chatter external",
    "identity",                  # First 10 are free; rare to bill higher
    "high volume customer portal",
    "customer portal manager custom",
    "authenticated website",
    "external apps login",
    "external apps",
    "lightning external apps",
    "customer community login",  # Per-login billed but flagging as free
    "guest user",
    "platform light",
    "company communities",
    "sites",
    "site.com",
)


def _is_known_free_sku(label: str) -> bool:
    """Case-insensitive substring match against the bundled-license list."""
    if not label:
        return False
    needle = label.strip().lower()
    return any(p in needle for p in KNOWN_FREE_SKU_PATTERNS)

# Sensitive objects where Public Read/Write OWD is a red flag.
SENSITIVE_OBJECTS = {
    "Account", "Opportunity", "Case", "Contact", "Lead",
    "Contract", "Order", "Quote",
}

# Standard out-of-box profiles — using these unmodified is a best-practice
# violation in any non-trivial org.
STANDARD_PROFILE_NAMES = {
    "Standard User",
    "System Administrator",
    "Standard Platform User",
    "Read Only",
    "Marketing User",
    "Solution Manager",
    "Contract Manager",
}

# How many sample rows of evidence to attach per finding so the dashboard
# can render a table without blowing up payload sizes.
EVIDENCE_SAMPLE_CAP = 50

# Per-object record-count budget — global describe might surface 600+
# sObjects; we count records on at most this many to stay polite with
# the org's API limit.
COUNT_SOBJECT_CAP = 40


# ---------------------------------------------------------------------------
# In-memory context loaded once per run so each rule can read without
# round-tripping the DB.
# ---------------------------------------------------------------------------


@dataclass
class AnalyzerContext:
    org_id: str
    actor_email: Optional[str]

    users: List[UserSnapshot] = field(default_factory=list)
    profiles: List[ProfileSnapshot] = field(default_factory=list)
    roles: List[RoleSnapshot] = field(default_factory=list)
    permission_sets: List[PermissionSetSnapshot] = field(default_factory=list)
    assignments: List[PermissionSetAssignmentSnapshot] = field(default_factory=list)
    psgs: List[PermissionSetGroupSnapshot] = field(default_factory=list)
    psg_components: List[PermissionSetGroupComponentSnapshot] = field(default_factory=list)
    object_perms: List[ObjectPermissionSnapshot] = field(default_factory=list)
    field_perms: List[FieldPermissionSnapshot] = field(default_factory=list)
    groups: List[GroupSnapshot] = field(default_factory=list)
    group_members: List[GroupMemberSnapshot] = field(default_factory=list)
    account_shares: List[AccountShareSnapshot] = field(default_factory=list)
    opportunity_shares: List[OpportunityShareSnapshot] = field(default_factory=list)
    sharing_rules: List[SharingRuleSnapshot] = field(default_factory=list)
    owds: List[OrganizationWideDefaultSnapshot] = field(default_factory=list)

    # Per-license monthly cost in cents (already merged with defaults).
    price_book: Dict[str, int] = field(default_factory=dict)

    # SF live data (only fetched if a working sf_client is available)
    org_limits: Dict[str, Any] = field(default_factory=dict)
    sobject_index: List[Dict[str, Any]] = field(default_factory=list)
    sobject_record_counts: Dict[str, int] = field(default_factory=dict)
    apex_classes: List[Dict[str, Any]] = field(default_factory=list)
    apex_triggers: List[Dict[str, Any]] = field(default_factory=list)
    apex_coverage: List[Dict[str, Any]] = field(default_factory=list)
    flows: List[Dict[str, Any]] = field(default_factory=list)
    workflow_rules: List[Dict[str, Any]] = field(default_factory=list)
    validation_rules: List[Dict[str, Any]] = field(default_factory=list)
    login_history: List[Dict[str, Any]] = field(default_factory=list)
    user_licenses: List[Dict[str, Any]] = field(default_factory=list)
    permission_set_licenses: List[Dict[str, Any]] = field(default_factory=list)
    stale_opportunities_count: Optional[int] = None
    top_account_owners: List[Dict[str, Any]] = field(default_factory=list)
    total_account_count: Optional[int] = None


@dataclass
class FindingDraft:
    """In-memory representation of a finding before it's persisted.

    Stays a dataclass (not an ORM row) so the rule code can mutate /
    inspect / cap evidence without an in-flight session attached.
    """
    category: FindingCategory
    code: str
    severity: FindingSeverity
    title: str
    description: str
    recommended_action: Optional[str] = None
    affected_count: int = 0
    estimated_annual_savings_cents: Optional[int] = None
    evidence: Dict[str, Any] = field(default_factory=dict)
    sf_setup_deeplink: Optional[str] = None


# ---------------------------------------------------------------------------
# Service
# ---------------------------------------------------------------------------


class OrgAnalyzerService:
    def __init__(self, db: AsyncSession, org_id: str):
        self.db = db
        self.org_id = org_id

    # ---------------------------------------------------------------- run

    async def run(self, actor_email: Optional[str] = None) -> OrgAnalysisSnapshot:
        """Pull live + snapshot data, run every rule, persist results.

        Always logs a row in `org_analyzer_runs` even on failure so the
        admin can see why the dashboard didn't refresh.
        """
        started_at = datetime.now(timezone.utc)
        run_row = OrgAnalyzerRun(
            organization_id=self.org_id,
            started_at=started_at,
            status="running",
            actor_email=actor_email,
        )
        self.db.add(run_row)
        await self.db.flush()

        start_ts = time.monotonic()
        try:
            ctx = await self._load_context(actor_email)
            await self._fetch_live_salesforce_data(ctx)
            findings = self._run_all_rules(ctx)
            snapshot = await self._persist(ctx, findings, started_at, start_ts)
            run_row.snapshot_id = snapshot.id
            run_row.status = "completed"
            run_row.ended_at = datetime.now(timezone.utc)
            await self.db.commit()
            return snapshot
        except Exception as e:
            logger.exception("Org analyzer run failed for org %s", self.org_id)
            run_row.status = "failed"
            run_row.ended_at = datetime.now(timezone.utc)
            run_row.error = str(e)[:2000]
            await self.db.commit()
            raise

    # --------------------------------------------------------- load_context

    async def _load_context(self, actor_email: Optional[str]) -> AnalyzerContext:
        ctx = AnalyzerContext(org_id=self.org_id, actor_email=actor_email)

        async def _q(model):
            r = await self.db.execute(
                select(model).where(model.organization_id == self.org_id)
            )
            return list(r.scalars().all())

        ctx.users = await _q(UserSnapshot)
        ctx.profiles = await _q(ProfileSnapshot)
        ctx.roles = await _q(RoleSnapshot)
        ctx.permission_sets = await _q(PermissionSetSnapshot)
        ctx.assignments = await _q(PermissionSetAssignmentSnapshot)
        ctx.psgs = await _q(PermissionSetGroupSnapshot)
        ctx.psg_components = await _q(PermissionSetGroupComponentSnapshot)
        ctx.object_perms = await _q(ObjectPermissionSnapshot)
        ctx.field_perms = await _q(FieldPermissionSnapshot)
        ctx.groups = await _q(GroupSnapshot)
        ctx.group_members = await _q(GroupMemberSnapshot)
        ctx.account_shares = await _q(AccountShareSnapshot)
        ctx.opportunity_shares = await _q(OpportunityShareSnapshot)
        ctx.sharing_rules = await _q(SharingRuleSnapshot)
        ctx.owds = await _q(OrganizationWideDefaultSnapshot)

        ctx.price_book = await self._load_price_book()
        return ctx

    async def _load_price_book(self) -> Dict[str, int]:
        result = await self.db.execute(
            select(LicensePriceBook).where(
                LicensePriceBook.organization_id == self.org_id
            )
        )
        rows = list(result.scalars().all())
        merged: Dict[str, int] = dict(DEFAULT_PRICE_BOOK_CENTS)
        for r in rows:
            merged[r.license_name] = int(r.monthly_cost_cents)
        return merged

    # -------------------------------------------------- fetch_live_data

    async def _fetch_live_salesforce_data(self, ctx: AnalyzerContext) -> None:
        """Pull /limits, global describe, Tooling API queries. Best-effort —
        any single failure short-circuits THAT call but doesn't fail the
        whole run."""
        try:
            sync_service = SalesforceSyncService(self.db, self.org_id)
            sf_client = await sync_service._refresh_access_token()
        except Exception as e:
            logger.warning(
                "Could not obtain SF client for live analyzer calls: %s. "
                "Snapshot-only rules will still run.", e,
            )
            return

        # /limits
        try:
            ctx.org_limits = await sf_client.get_org_limits()
        except Exception as e:
            logger.warning("get_org_limits failed: %s", e)

        # Global describe — used to enumerate custom objects + decide which
        # sObjects are worth counting records on.
        try:
            ctx.sobject_index = await sf_client.list_all_sobjects()
        except Exception as e:
            logger.warning("list_all_sobjects failed: %s", e)

        # Per-object record counts. Cap to keep API budget tight.
        candidates = self._select_objects_to_count(ctx.sobject_index)
        for name in candidates[:COUNT_SOBJECT_CAP]:
            count = await sf_client.count_sobject(name)
            if count is not None:
                ctx.sobject_record_counts[name] = count

        # Tooling API queries. Each wrapped — entitlement varies by edition.
        for label, soql, target in [
            (
                "ApexClass",
                "SELECT Id, Name, ApiVersion, Status, LengthWithoutComments FROM ApexClass",
                "apex_classes",
            ),
            (
                "ApexTrigger",
                "SELECT Id, Name, TableEnumOrId, Status, UsageBeforeInsert, "
                "UsageBeforeUpdate, UsageBeforeDelete, UsageAfterInsert, "
                "UsageAfterUpdate, UsageAfterDelete FROM ApexTrigger",
                "apex_triggers",
            ),
            (
                "FlowDefinitionView",
                "SELECT Id, ApiName, Label, ProcessType, IsActive, ActiveVersionId, "
                "TriggerType, TriggerObjectOrEventLabel FROM FlowDefinitionView",
                "flows",
            ),
            (
                "WorkflowRule",
                "SELECT Id, Name, TableEnumOrId FROM WorkflowRule WHERE "
                "NamespacePrefix = NULL",
                "workflow_rules",
            ),
            (
                "ValidationRule",
                "SELECT Id, ValidationName, EntityDefinition.QualifiedApiName, "
                "Active FROM ValidationRule",
                "validation_rules",
            ),
        ]:
            try:
                rows = await sf_client.query_tooling(soql)
                setattr(ctx, target, rows)
            except Exception as e:
                logger.warning("Tooling query %s failed: %s", label, e)

        # ApexCodeCoverageAggregate
        try:
            ctx.apex_coverage = await sf_client.get_apex_coverage()
        except Exception as e:
            logger.warning("get_apex_coverage failed: %s", e)

        # LoginHistory (last 90 days)
        try:
            ctx.login_history = await sf_client.get_login_history(since_days=90)
        except Exception as e:
            logger.warning("get_login_history failed: %s", e)

        # License inventory — actual SKUs in this org, drives both the
        # LICENSE_SEATS_UNUSED finding and the price-book auto-population.
        try:
            ctx.user_licenses = await sf_client.get_user_licenses()
        except Exception as e:
            logger.warning("get_user_licenses failed: %s", e)
        try:
            ctx.permission_set_licenses = await sf_client.get_permission_set_licenses()
        except Exception as e:
            logger.warning("get_permission_set_licenses failed: %s", e)

        # Sales-ops signals
        try:
            ctx.stale_opportunities_count = await sf_client.count_stale_opportunities(60)
        except Exception as e:
            logger.warning("count_stale_opportunities failed: %s", e)
        try:
            ctx.top_account_owners = await sf_client.top_account_owners(limit=10)
            ctx.total_account_count = await sf_client.total_account_count()
        except Exception as e:
            logger.warning("top_account_owners failed: %s", e)

    @staticmethod
    def _select_objects_to_count(sobjects: List[Dict[str, Any]]) -> List[str]:
        """Choose which sObjects to run SELECT COUNT() on.

        Heuristic: all custom objects ('__c'), plus the canonical standard
        objects most orgs care about. Limit to queryable + non-system to
        avoid wasting API on Compound/External/System sObjects.
        """
        chosen: List[str] = []
        standard = {
            "Account", "Contact", "Lead", "Opportunity", "Case",
            "Campaign", "Task", "Event", "User", "EmailMessage", "Attachment",
        }
        for o in sobjects:
            if not o.get("queryable"):
                continue
            name = o.get("name")
            if not name:
                continue
            if name in standard or name.endswith("__c"):
                chosen.append(name)
        return chosen

    # ---------------------------------------------------------- run_rules

    def _run_all_rules(self, ctx: AnalyzerContext) -> List[FindingDraft]:
        findings: List[FindingDraft] = []
        rule_methods = [
            self._analyze_licenses,
            self._analyze_configuration,
            self._analyze_automation,
            self._analyze_sharing,
            self._analyze_limits,
            self._analyze_data_quality,
            self._analyze_activity,
            self._analyze_predictive,
        ]
        for method in rule_methods:
            try:
                findings.extend(method(ctx))
            except Exception as e:
                logger.exception("Rule %s crashed: %s", method.__name__, e)
        return findings

    # =====================================================================
    # Rule categories
    # =====================================================================

    # ----------------------- 1. license & feature waste

    def _analyze_licenses(self, ctx: AnalyzerContext) -> List[FindingDraft]:
        out: List[FindingDraft] = []
        now = datetime.now(timezone.utc)
        salesforce_price = ctx.price_book.get("Salesforce", 16500)

        inactive_users: List[Dict[str, Any]] = []
        never_logged_in: List[Dict[str, Any]] = []
        dormant_users: List[Dict[str, Any]] = []

        for u in ctx.users:
            if not u.is_active:
                continue
            last_login = u.last_login_at
            created = u.created_at
            evidence_row = {
                "id": u.salesforce_id,
                "name": u.name or u.username,
                "email": u.email,
                "department": u.department,
                "last_login_at": last_login.isoformat() if last_login else None,
            }
            if last_login is None:
                if created and (now - _ensure_aware(created)).days >= 30:
                    never_logged_in.append(evidence_row)
            else:
                days_since = (now - _ensure_aware(last_login)).days
                if days_since >= 90:
                    inactive_users.append(evidence_row)
                elif days_since >= 30:
                    dormant_users.append(evidence_row)

        if inactive_users:
            n = len(inactive_users)
            annual = salesforce_price * 12 * n
            out.append(FindingDraft(
                category=FindingCategory.LICENSE_WASTE,
                code="LICENSE_INACTIVE_USER",
                severity=_severity_for_count(n, [1, 5, 20, 50]),
                title=f"{n} active users haven't logged in for 90+ days",
                description=(
                    "These users are still consuming a paid Salesforce license "
                    "but have not logged in for at least 90 days. Deactivating "
                    "them frees the license seat immediately and reduces audit "
                    "surface area."
                ),
                recommended_action=(
                    "Confirm with the user's manager, then deactivate via "
                    "Setup → Users. Reassign records first if needed."
                ),
                affected_count=n,
                estimated_annual_savings_cents=annual,
                evidence={
                    "sample": inactive_users[:EVIDENCE_SAMPLE_CAP],
                    "cost_calculation": _cost_calc(
                        formula=f"{n} inactive users × ${salesforce_price/100:.2f}/mo × 12 months",
                        per_unit_monthly_cents=salesforce_price,
                        unit_count=n,
                        total_annual_cents=annual,
                        license_name="Salesforce",
                    ),
                },
                sf_setup_deeplink="/lightning/setup/ManageUsers/home",
            ))

        if never_logged_in:
            n = len(never_logged_in)
            annual = salesforce_price * 12 * n
            out.append(FindingDraft(
                category=FindingCategory.LICENSE_WASTE,
                code="LICENSE_NEVER_LOGGED_IN",
                severity=_severity_for_count(n, [1, 3, 10, 25]),
                title=f"{n} active users have never logged in",
                description=(
                    "Active users with NULL LastLoginDate and account-age over "
                    "30 days. They're consuming licenses without ever using "
                    "the product. Likely candidates for deactivation or "
                    "onboarding follow-up."
                ),
                recommended_action="Reach out to confirm onboarding status, then deactivate or unblock as appropriate.",
                affected_count=n,
                estimated_annual_savings_cents=annual,
                evidence={
                    "sample": never_logged_in[:EVIDENCE_SAMPLE_CAP],
                    "cost_calculation": _cost_calc(
                        formula=f"{n} never-logged-in users × ${salesforce_price/100:.2f}/mo × 12 months",
                        per_unit_monthly_cents=salesforce_price,
                        unit_count=n,
                        total_annual_cents=annual,
                        license_name="Salesforce",
                    ),
                },
                sf_setup_deeplink="/lightning/setup/ManageUsers/home",
            ))

        # LICENSE_OVERSIZED — Standard user type but no Sales/Service object
        # access. Candidate for downgrade to Platform license (~$25/mo).
        platform_price = ctx.price_book.get("Platform", 2500)
        cost_delta = max(salesforce_price - platform_price, 0)
        sales_objects = {"Opportunity", "Lead", "Campaign", "Quote", "Order"}

        user_parent_ids: Dict[str, set] = defaultdict(set)
        for a in ctx.assignments:
            user_parent_ids[a.assignee_id].add(a.permission_set_id)
        profile_by_id = {p.salesforce_id: p for p in ctx.profiles}

        # ObjectPermission parent_id can be a profile-owned PS or a real PS.
        # We accumulate sales-object grants per (parent_id).
        sales_grants_by_parent: Dict[str, bool] = defaultdict(bool)
        for op in ctx.object_perms:
            if op.sobject_type in sales_objects and op.permissions_read:
                sales_grants_by_parent[op.parent_id] = True

        oversized_candidates: List[Dict[str, Any]] = []
        for u in ctx.users:
            if not u.is_active or u.user_type not in (None, "Standard"):
                continue
            user_parents = user_parent_ids.get(u.salesforce_id, set())
            # Include the profile's profile-owned PS too if any
            for parent_id in list(user_parents) + ([u.profile_id] if u.profile_id else []):
                if parent_id in sales_grants_by_parent:
                    break
            else:
                # No parent granted any sales-object — candidate for downgrade
                oversized_candidates.append({
                    "id": u.salesforce_id,
                    "name": u.name or u.username,
                    "profile": (profile_by_id.get(u.profile_id).name
                                if u.profile_id and u.profile_id in profile_by_id
                                else None),
                })

        if oversized_candidates and cost_delta > 0:
            n = len(oversized_candidates)
            annual = cost_delta * 12 * n
            out.append(FindingDraft(
                category=FindingCategory.LICENSE_WASTE,
                code="LICENSE_OVERSIZED",
                severity=_severity_for_count(n, [1, 5, 20, 50]),
                title=f"{n} users may be over-licensed",
                description=(
                    "These users hold a full Salesforce license but have no "
                    "read access to Sales/Service objects (Opportunity, Lead, "
                    "Campaign, Quote, Order). They are candidates for "
                    "downgrade to a Platform license."
                ),
                recommended_action=(
                    "Review each user's actual usage. If they only need "
                    "custom-app or Service-Console access, switch their "
                    "license at Setup → Users → <user> → User License."
                ),
                affected_count=n,
                estimated_annual_savings_cents=annual,
                evidence={
                    "sample": oversized_candidates[:EVIDENCE_SAMPLE_CAP],
                    "cost_calculation": _cost_calc(
                        formula=(
                            f"{n} users × (${salesforce_price/100:.2f} Salesforce – "
                            f"${platform_price/100:.2f} Platform) × 12 months"
                        ),
                        per_unit_monthly_cents=cost_delta,
                        unit_count=n,
                        total_annual_cents=annual,
                        license_name="Salesforce → Platform downgrade",
                    ),
                },
                sf_setup_deeplink="/lightning/setup/ManageUsers/home",
            ))

        # LICENSE_SEATS_UNUSED — purchased but unassigned seats. Biggest
        # single dollar finding in most orgs when the SKU is actually
        # billed. Heuristics:
        #   - Skip SKUs in KNOWN_FREE_SKU_PATTERNS (Chatter Free, External
        #     Apps Login, Identity, etc.) — they ship at $0/mo with the
        #     base license so surplus carries no cost.
        #   - For SKUs we DO bill for but the user hasn't put a price on
        #     yet, emit as INFO (not HIGH) with a prompt to set the price.
        #   - For SKUs with a real price, severity scales with annual
        #     savings (small surplus on $165/mo license still beats a
        #     huge surplus on a near-zero one).
        for ul in ctx.user_licenses:
            if (ul.get("Status") or "").lower() not in ("", "active"):
                continue
            total = int(ul.get("TotalLicenses") or 0)
            used = int(ul.get("UsedLicenses") or 0)
            if total <= 0:
                continue
            surplus = total - used
            if surplus <= 0:
                continue
            sku = ul.get("Name") or ul.get("MasterLabel") or "Unknown"
            label = ul.get("MasterLabel") or sku
            if _is_known_free_sku(label) or _is_known_free_sku(sku):
                # Bundled / free — nothing to bill the customer for.
                continue
            monthly = (
                ctx.price_book.get(label)
                or ctx.price_book.get(sku)
                or 0
            )
            annual = monthly * 12 * surplus if monthly else None
            evidence: Dict[str, Any] = {
                "license_name": label,
                "developer_key": sku,
                "total_purchased": total,
                "used": used,
                "surplus": surplus,
                "utilization_pct": round(used / total * 100, 1) if total else 0,
            }
            if monthly:
                # Severity by annualised dollars: $50k+ critical, $10k+ high,
                # $1k+ medium, rest low. Avoids the old "4999 free seats =
                # HIGH" trap.
                annual_dollars = (annual or 0) / 100
                sev = (
                    FindingSeverity.CRITICAL if annual_dollars >= 50_000
                    else FindingSeverity.HIGH if annual_dollars >= 10_000
                    else FindingSeverity.MEDIUM if annual_dollars >= 1_000
                    else FindingSeverity.LOW
                )
                evidence["cost_calculation"] = _cost_calc(
                    formula=(
                        f"{surplus} surplus {label} seats × "
                        f"${monthly/100:.2f}/mo × 12 months"
                    ),
                    per_unit_monthly_cents=monthly,
                    unit_count=surplus,
                    total_annual_cents=annual,
                    license_name=label,
                )
            else:
                # Unknown SKU with no price set — surface it quietly so the
                # consultant can fill in the price book to unlock real $
                # impact. Don't make it look like a critical issue.
                sev = FindingSeverity.INFO
                evidence["pricing_note"] = (
                    "No monthly cost set for this SKU in the price book. "
                    "Set a price in the Price book tab to surface dollar impact."
                )

            out.append(FindingDraft(
                category=FindingCategory.LICENSE_WASTE,
                code="LICENSE_SEATS_UNUSED",
                severity=sev,
                title=(
                    f"{surplus} unused {label} seats "
                    f"({used}/{total} assigned)"
                ),
                description=(
                    f"This org has purchased {total} {label} seats but "
                    f"only {used} are currently assigned. The {surplus} "
                    "surplus seats renew every year regardless of use. "
                    + (
                        "If they're not part of an imminent hiring plan, "
                        "they're prime candidates to remove at renewal."
                        if monthly else
                        "Set the monthly cost for this SKU in the Price "
                        "book tab to estimate the renewal-time savings."
                    )
                ),
                recommended_action=(
                    "Compare against 12-month hiring forecast. If unused "
                    "at renewal, drop the seat count or convert to a "
                    "lighter license type."
                ),
                affected_count=surplus,
                estimated_annual_savings_cents=annual,
                evidence=evidence,
                sf_setup_deeplink="/lightning/setup/CompanyResourceDisk/home",
            ))

        # Permission-Set Licenses: most ship free with the base license,
        # so we ONLY emit findings when the consultant has explicitly
        # priced the SKU (price > 0). Otherwise the report is noise.
        for psl in ctx.permission_set_licenses:
            if (psl.get("Status") or "").lower() not in ("", "active"):
                continue
            total = int(psl.get("TotalLicenses") or 0)
            used = int(psl.get("UsedLicenses") or 0)
            if total <= 0:
                continue
            surplus = total - used
            if surplus < 5:
                continue
            label = psl.get("MasterLabel") or psl.get("DeveloperName") or "PSL"
            if _is_known_free_sku(label):
                continue
            monthly = ctx.price_book.get(label) or 0
            if not monthly:
                # PSLs default to free — don't fabricate a finding. The
                # consultant can override the price book to surface one.
                continue
            annual = monthly * 12 * surplus
            evidence = {
                "license_name": label,
                "developer_name": psl.get("DeveloperName"),
                "total_purchased": total,
                "used": used,
                "surplus": surplus,
                "cost_calculation": _cost_calc(
                    formula=(
                        f"{surplus} surplus {label} PSL seats × "
                        f"${monthly/100:.2f}/mo × 12 months"
                    ),
                    per_unit_monthly_cents=monthly,
                    unit_count=surplus,
                    total_annual_cents=annual,
                    license_name=label,
                ),
            }
            annual_dollars = annual / 100
            sev = (
                FindingSeverity.HIGH if annual_dollars >= 10_000
                else FindingSeverity.MEDIUM if annual_dollars >= 1_000
                else FindingSeverity.LOW
            )
            out.append(FindingDraft(
                category=FindingCategory.LICENSE_WASTE,
                code="PSL_SEATS_UNUSED",
                severity=sev,
                title=f"{surplus} unused {label} permission-set licenses",
                description=(
                    f"{used}/{total} {label} PSLs assigned. You've priced "
                    f"this SKU at ${monthly/100:.2f}/mo, so the surplus "
                    "represents real renewal-time savings."
                ),
                recommended_action="Verify the assignment trend with the customer and reduce seat count at renewal if appropriate.",
                affected_count=surplus,
                estimated_annual_savings_cents=annual,
                evidence=evidence,
            ))

        return out

    # ----------------------- 2. configuration bloat / redundancy

    def _analyze_configuration(self, ctx: AnalyzerContext) -> List[FindingDraft]:
        out: List[FindingDraft] = []

        # PROFILE_UNUSED
        active_user_profile_ids = {u.profile_id for u in ctx.users if u.is_active and u.profile_id}
        unused_profiles = [
            p for p in ctx.profiles if p.salesforce_id not in active_user_profile_ids
        ]
        if unused_profiles:
            n = len(unused_profiles)
            out.append(FindingDraft(
                category=FindingCategory.CONFIG_BLOAT,
                code="PROFILE_UNUSED",
                severity=_severity_for_count(n, [1, 3, 10, 25]),
                title=f"{n} profiles have zero active users",
                description=(
                    "Profiles with no active assignees clutter the Setup UI "
                    "and accumulate stale permission grants. Removing them "
                    "tightens audit posture without affecting any user."
                ),
                recommended_action="Review each profile's history. If truly unused, delete via Setup → Profiles.",
                affected_count=n,
                evidence={
                    "sample": [
                        {"id": p.salesforce_id, "name": p.name}
                        for p in unused_profiles[:EVIDENCE_SAMPLE_CAP]
                    ]
                },
                sf_setup_deeplink="/lightning/setup/Profiles/home",
            ))

        # PS_UNUSED
        assigned_ps_ids = {a.permission_set_id for a in ctx.assignments}
        # Skip profile-owned PSes — they're not directly assignable.
        unused_ps = [
            p for p in ctx.permission_sets
            if not p.is_owned_by_profile and p.salesforce_id not in assigned_ps_ids
        ]
        if unused_ps:
            n = len(unused_ps)
            out.append(FindingDraft(
                category=FindingCategory.CONFIG_BLOAT,
                code="PS_UNUSED",
                severity=_severity_for_count(n, [1, 5, 20, 50]),
                title=f"{n} permission sets have zero assignees",
                description=(
                    "Permission sets with no users assigned. Often left over "
                    "from past projects or org migrations."
                ),
                recommended_action="Verify with admins, then delete via Setup → Permission Sets.",
                affected_count=n,
                evidence={
                    "sample": [
                        {"id": p.salesforce_id, "label": p.label, "name": p.name}
                        for p in unused_ps[:EVIDENCE_SAMPLE_CAP]
                    ]
                },
                sf_setup_deeplink="/lightning/setup/PermSets/home",
            ))

        # PS_REDUNDANT_DUPLICATE — pairs of PSes with identical Object+Field grants
        ps_signature: Dict[str, Tuple[frozenset, frozenset]] = {}
        for ps in ctx.permission_sets:
            if ps.is_owned_by_profile:
                continue
            obj_grants = frozenset(
                (op.sobject_type, op.permissions_read, op.permissions_create,
                 op.permissions_edit, op.permissions_delete)
                for op in ctx.object_perms
                if op.parent_id == ps.salesforce_id
            )
            field_grants = frozenset(
                (fp.sobject_type, fp.field, fp.permissions_read, fp.permissions_edit)
                for fp in ctx.field_perms
                if fp.parent_id == ps.salesforce_id
            )
            ps_signature[ps.salesforce_id] = (obj_grants, field_grants)

        sig_to_ids: Dict[Tuple[frozenset, frozenset], List[str]] = defaultdict(list)
        for ps_id, sig in ps_signature.items():
            # Skip the empty signature — almost every PS would dupe trivially.
            if not sig[0] and not sig[1]:
                continue
            sig_to_ids[sig].append(ps_id)
        dup_groups = [ids for ids in sig_to_ids.values() if len(ids) > 1]
        if dup_groups:
            ps_by_id = {p.salesforce_id: p for p in ctx.permission_sets}
            sample = []
            for group in dup_groups[:10]:
                sample.append({
                    "group": [
                        {"id": pid, "label": ps_by_id[pid].label if pid in ps_by_id else pid}
                        for pid in group
                    ]
                })
            total = sum(len(g) - 1 for g in dup_groups)
            out.append(FindingDraft(
                category=FindingCategory.CONFIG_BLOAT,
                code="PS_REDUNDANT_DUPLICATE",
                severity=_severity_for_count(total, [1, 3, 10, 20]),
                title=f"{len(dup_groups)} groups of duplicate permission sets",
                description=(
                    "These permission sets grant identical object + field "
                    "permissions. Keeping duplicates makes the access model "
                    "harder to reason about and audit."
                ),
                recommended_action=(
                    "Pick one canonical PS per group, reassign users from "
                    "the duplicates, then delete the duplicates."
                ),
                affected_count=total,
                evidence={"groups": sample},
                sf_setup_deeplink="/lightning/setup/PermSets/home",
            ))

        # PSG_TRIVIAL
        psg_component_count: Dict[str, int] = defaultdict(int)
        for c in ctx.psg_components:
            psg_component_count[c.permission_set_group_id] += 1
        trivial_psgs = [
            psg for psg in ctx.psgs
            if psg_component_count.get(psg.salesforce_id, 0) <= 1
        ]
        if trivial_psgs:
            n = len(trivial_psgs)
            out.append(FindingDraft(
                category=FindingCategory.CONFIG_BLOAT,
                code="PSG_TRIVIAL",
                severity=FindingSeverity.LOW,
                title=f"{n} Permission Set Groups contain ≤1 component",
                description=(
                    "PSGs are designed to bundle multiple permission sets. "
                    "A group with one or zero components adds management "
                    "overhead without leverage."
                ),
                recommended_action="Replace the PSG with direct PS assignment, or expand the PSG with additional PSes.",
                affected_count=n,
                evidence={
                    "sample": [
                        {"id": p.salesforce_id, "label": p.master_label or p.developer_name}
                        for p in trivial_psgs[:EVIDENCE_SAMPLE_CAP]
                    ]
                },
                sf_setup_deeplink="/lightning/setup/PermSetGroups/home",
            ))

        # GROUP_EMPTY
        group_member_count: Dict[str, int] = defaultdict(int)
        for gm in ctx.group_members:
            group_member_count[gm.group_id] += 1
        empty_groups = [
            g for g in ctx.groups
            if group_member_count.get(g.salesforce_id, 0) == 0
        ]
        if empty_groups:
            n = len(empty_groups)
            out.append(FindingDraft(
                category=FindingCategory.CONFIG_BLOAT,
                code="GROUP_EMPTY",
                severity=FindingSeverity.LOW,
                title=f"{n} Public Groups / Queues have zero members",
                description=(
                    "Groups with no members can't share records with "
                    "anyone — they're dead-weight in sharing-rule lookups."
                ),
                recommended_action="Confirm with the group owner, then delete via Setup → Public Groups or Queues.",
                affected_count=n,
                evidence={
                    "sample": [
                        {"id": g.salesforce_id, "name": g.name, "type": g.group_type}
                        for g in empty_groups[:EVIDENCE_SAMPLE_CAP]
                    ]
                },
                sf_setup_deeplink="/lightning/setup/PublicGroups/home",
            ))

        # ROLE_EMPTY
        users_with_role = {u.user_role_id for u in ctx.users if u.is_active and u.user_role_id}
        empty_roles = [r for r in ctx.roles if r.salesforce_id not in users_with_role]
        if empty_roles:
            n = len(empty_roles)
            out.append(FindingDraft(
                category=FindingCategory.CONFIG_BLOAT,
                code="ROLE_EMPTY",
                severity=FindingSeverity.INFO,
                title=f"{n} user roles have no assigned users",
                description=(
                    "Dead branches in the role hierarchy. Don't affect "
                    "functionality but clutter the picker and inflate the "
                    "tree depth used by record-visibility rules."
                ),
                recommended_action="Audit the hierarchy and remove unused roles via Setup → Roles.",
                affected_count=n,
                evidence={
                    "sample": [
                        {"id": r.salesforce_id, "name": r.name}
                        for r in empty_roles[:EVIDENCE_SAMPLE_CAP]
                    ]
                },
                sf_setup_deeplink="/lightning/setup/Roles/home",
            ))

        # ROLE_HIERARCHY_TOO_DEEP — Salesforce best practice caps roles
        # at ~10 levels; performance and record-visibility recalc costs
        # scale poorly past that. Compute depth via BFS from roots.
        roles_by_id = {r.salesforce_id: r for r in ctx.roles}
        max_depth = 0
        deep_branches: List[Dict[str, Any]] = []
        for r in ctx.roles:
            depth = 0
            current = r.parent_role_id
            seen: set = set()
            while current and depth < 64 and current not in seen:
                seen.add(current)
                depth += 1
                parent = roles_by_id.get(current)
                if parent is None:
                    break
                current = parent.parent_role_id
            if depth >= 6:
                deep_branches.append({
                    "id": r.salesforce_id, "name": r.name, "depth": depth,
                })
            if depth > max_depth:
                max_depth = depth
        if deep_branches:
            n = len(deep_branches)
            deep_branches.sort(key=lambda r: -r["depth"])
            out.append(FindingDraft(
                category=FindingCategory.CONFIG_BLOAT,
                code="ROLE_HIERARCHY_TOO_DEEP",
                severity=FindingSeverity.MEDIUM if max_depth >= 8 else FindingSeverity.LOW,
                title=(
                    f"Role hierarchy is {max_depth + 1} levels deep "
                    f"({n} roles ≥ 6 hops from root)"
                ),
                description=(
                    "Deep role hierarchies inflate sharing-recalc time "
                    "and make record-visibility hard to reason about. "
                    "Salesforce best practice is to keep depth ≤ 5 by "
                    "favouring sharing rules + Account Teams over "
                    "hierarchy depth."
                ),
                recommended_action="Flatten by merging mid-tier roles, or shift some access into sharing rules.",
                affected_count=n,
                evidence={
                    "max_depth_levels": max_depth + 1,
                    "deep_roles": deep_branches[:EVIDENCE_SAMPLE_CAP],
                },
                sf_setup_deeplink="/lightning/setup/Roles/home",
            ))

        # STANDARD_PROFILE_IN_USE
        profile_by_id = {p.salesforce_id: p for p in ctx.profiles}
        std_profile_users = []
        for u in ctx.users:
            if not u.is_active or not u.profile_id:
                continue
            prof = profile_by_id.get(u.profile_id)
            if prof and prof.name in STANDARD_PROFILE_NAMES:
                std_profile_users.append({
                    "id": u.salesforce_id, "name": u.name, "profile": prof.name,
                })
        if std_profile_users:
            n = len(std_profile_users)
            out.append(FindingDraft(
                category=FindingCategory.CONFIG_BLOAT,
                code="STANDARD_PROFILE_IN_USE",
                severity=FindingSeverity.MEDIUM if n > 10 else FindingSeverity.LOW,
                title=f"{n} active users are on an unmodified standard profile",
                description=(
                    "Out-of-box Standard profiles can't be customised "
                    "safely and bundle broad permissions. Best practice is "
                    "to clone the profile, lock down what you don't need, "
                    "and assign the clone."
                ),
                recommended_action="Clone the standard profile, restrict it for your org, then reassign the listed users.",
                affected_count=n,
                evidence={"sample": std_profile_users[:EVIDENCE_SAMPLE_CAP]},
                sf_setup_deeplink="/lightning/setup/Profiles/home",
            ))

        return out

    # ----------------------- 3. automation hygiene (Tooling API)

    def _analyze_automation(self, ctx: AnalyzerContext) -> List[FindingDraft]:
        out: List[FindingDraft] = []
        if not (ctx.apex_triggers or ctx.flows or ctx.workflow_rules
                or ctx.apex_coverage or ctx.validation_rules):
            return out

        # TRIGGER_MULTI_PER_OBJECT
        triggers_by_obj: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
        for t in ctx.apex_triggers:
            if t.get("Status") not in (None, "Active"):
                continue
            obj = t.get("TableEnumOrId") or "Unknown"
            triggers_by_obj[obj].append(t)
        multi_trigger_objs = {
            obj: rows for obj, rows in triggers_by_obj.items() if len(rows) > 1
        }
        if multi_trigger_objs:
            n = sum(len(rows) for rows in multi_trigger_objs.values())
            out.append(FindingDraft(
                category=FindingCategory.AUTOMATION_HYGIENE,
                code="TRIGGER_MULTI_PER_OBJECT",
                severity=_severity_for_count(len(multi_trigger_objs), [1, 2, 5, 10]),
                title=f"{len(multi_trigger_objs)} objects have multiple active triggers",
                description=(
                    "Multiple Apex triggers on the same object create "
                    "ordering uncertainty and recursion risk. The community "
                    "best-practice is one trigger per object delegating "
                    "to a handler class."
                ),
                recommended_action="Refactor to a single trigger per object using a trigger handler pattern.",
                affected_count=n,
                evidence={
                    "objects": [
                        {
                            "object": obj,
                            "triggers": [
                                {"id": r.get("Id"), "name": r.get("Name")}
                                for r in rows
                            ],
                        }
                        for obj, rows in list(multi_trigger_objs.items())[:25]
                    ]
                },
                sf_setup_deeplink="/lightning/setup/ApexTriggers/home",
            ))

        # FLOW_AND_WORKFLOW_OVERLAP + TRIGGER_AND_FLOW_OVERLAP
        active_flows_by_obj: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
        for f in ctx.flows:
            if not f.get("IsActive"):
                continue
            obj = f.get("TriggerObjectOrEventLabel")
            if not obj:
                continue
            active_flows_by_obj[obj].append(f)

        wf_by_obj: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
        for w in ctx.workflow_rules:
            obj = w.get("TableEnumOrId")
            if obj:
                wf_by_obj[obj].append(w)

        overlap_workflow = sorted(
            set(active_flows_by_obj.keys()) & set(wf_by_obj.keys())
        )
        if overlap_workflow:
            out.append(FindingDraft(
                category=FindingCategory.AUTOMATION_HYGIENE,
                code="FLOW_AND_WORKFLOW_OVERLAP",
                severity=FindingSeverity.MEDIUM,
                title=f"{len(overlap_workflow)} objects use both Flow and Workflow Rules",
                description=(
                    "Legacy Workflow Rules executing alongside record-"
                    "triggered Flows is a common source of subtle ordering "
                    "bugs. Salesforce has marked Workflow Rules for "
                    "retirement; consolidating into Flow is the path "
                    "forward."
                ),
                recommended_action="Migrate the listed Workflow Rules into the existing Flows for each object.",
                affected_count=len(overlap_workflow),
                evidence={"objects": overlap_workflow[:EVIDENCE_SAMPLE_CAP]},
                sf_setup_deeplink="/lightning/setup/WorkflowRules/home",
            ))

        overlap_trigger = sorted(
            set(active_flows_by_obj.keys()) & set(triggers_by_obj.keys())
        )
        if overlap_trigger:
            out.append(FindingDraft(
                category=FindingCategory.AUTOMATION_HYGIENE,
                code="TRIGGER_AND_FLOW_OVERLAP",
                severity=FindingSeverity.MEDIUM,
                title=f"{len(overlap_trigger)} objects use both Apex triggers and record-triggered Flows",
                description=(
                    "Triggers and Flows on the same object execute in a "
                    "specific (but counter-intuitive) order. Mixing them "
                    "often breaks assumptions made by either side."
                ),
                recommended_action="Audit each object's Flow + trigger and decide on one as the source of truth.",
                affected_count=len(overlap_trigger),
                evidence={"objects": overlap_trigger[:EVIDENCE_SAMPLE_CAP]},
                sf_setup_deeplink="/lightning/setup/Flows/home",
            ))

        # APEX_LOW_COVERAGE
        class_by_id = {c.get("Id"): c for c in ctx.apex_classes}
        low_cov = []
        for cov in ctx.apex_coverage:
            covered = cov.get("NumLinesCovered") or 0
            uncovered = cov.get("NumLinesUncovered") or 0
            total = covered + uncovered
            if total == 0:
                continue
            ratio = covered / total
            if ratio < 0.75:
                cls = class_by_id.get(cov.get("ApexClassOrTriggerId"), {})
                low_cov.append({
                    "id": cov.get("ApexClassOrTriggerId"),
                    "name": cls.get("Name") or cov.get("ApexClassOrTriggerId"),
                    "coverage_pct": round(ratio * 100, 1),
                })
        if low_cov:
            n = len(low_cov)
            out.append(FindingDraft(
                category=FindingCategory.AUTOMATION_HYGIENE,
                code="APEX_LOW_COVERAGE",
                severity=_severity_for_count(n, [1, 3, 10, 25]),
                title=f"{n} Apex classes/triggers have <75% test coverage",
                description=(
                    "Salesforce requires 75% org-wide coverage for "
                    "production deploys. Classes below the threshold are "
                    "deploy-blockers and an indication of inadequate test "
                    "discipline."
                ),
                recommended_action="Add unit tests to bring each class above 75% coverage. Prioritise the lowest-coverage classes.",
                affected_count=n,
                evidence={"sample": sorted(low_cov, key=lambda r: r["coverage_pct"])[:EVIDENCE_SAMPLE_CAP]},
                sf_setup_deeplink="/lightning/setup/ApexClasses/home",
            ))

        # FLOW_INACTIVE_BUT_INSTALLED
        inactive_flows = [
            f for f in ctx.flows
            if not f.get("IsActive") and not f.get("ActiveVersionId")
        ]
        if inactive_flows:
            n = len(inactive_flows)
            out.append(FindingDraft(
                category=FindingCategory.AUTOMATION_HYGIENE,
                code="FLOW_INACTIVE_BUT_INSTALLED",
                severity=FindingSeverity.LOW,
                title=f"{n} Flow definitions have no active version",
                description=(
                    "Inactive flows with draft-only versions clutter the "
                    "Setup UI and confuse developers expecting them to "
                    "fire."
                ),
                recommended_action="Activate, delete, or move these flows to managed packages.",
                affected_count=n,
                evidence={
                    "sample": [
                        {"id": f.get("Id"), "label": f.get("Label") or f.get("ApiName")}
                        for f in inactive_flows[:EVIDENCE_SAMPLE_CAP]
                    ]
                },
                sf_setup_deeplink="/lightning/setup/Flows/home",
            ))

        # VALIDATION_RULE_BLOAT
        vr_by_obj: Dict[str, int] = defaultdict(int)
        for vr in ctx.validation_rules:
            if not vr.get("Active"):
                continue
            ent = vr.get("EntityDefinition") or {}
            obj = ent.get("QualifiedApiName") if isinstance(ent, dict) else None
            if obj:
                vr_by_obj[obj] += 1
        bloated = {obj: n for obj, n in vr_by_obj.items() if n > 10}
        if bloated:
            out.append(FindingDraft(
                category=FindingCategory.AUTOMATION_HYGIENE,
                code="VALIDATION_RULE_BLOAT",
                severity=FindingSeverity.MEDIUM,
                title=f"{len(bloated)} objects have >10 active validation rules",
                description=(
                    "Objects with many validation rules cumulatively impose "
                    "save-time overhead and are notoriously hard to "
                    "consolidate. Often there's overlap that can be merged."
                ),
                recommended_action="Audit each over-validated object for redundant or replaceable rules; consider moving complex logic into Flows.",
                affected_count=len(bloated),
                evidence={"objects": sorted(bloated.items(), key=lambda x: -x[1])[:EVIDENCE_SAMPLE_CAP]},
                sf_setup_deeplink="/lightning/setup/ObjectManager/home",
            ))

        return out

    # ----------------------- 4. sharing & security posture

    def _analyze_sharing(self, ctx: AnalyzerContext) -> List[FindingDraft]:
        out: List[FindingDraft] = []

        # OWD_PUBLIC_ON_SENSITIVE
        public_owds = []
        for owd in ctx.owds:
            internal = owd.internal_sharing_model or ""
            if owd.sobject_type in SENSITIVE_OBJECTS and internal in {
                "Read", "ReadWrite", "ReadWriteTransfer", "FullAccess",
            }:
                public_owds.append({
                    "object": owd.sobject_type,
                    "internal_sharing_model": internal,
                    "external_sharing_model": owd.external_sharing_model,
                })
        if public_owds:
            out.append(FindingDraft(
                category=FindingCategory.SHARING_POSTURE,
                code="OWD_PUBLIC_ON_SENSITIVE",
                severity=FindingSeverity.HIGH,
                title=f"{len(public_owds)} sensitive objects have Public OWD",
                description=(
                    "Sensitive objects (Account, Opportunity, Case, "
                    "Contact, Lead) with Public Read or Public Read/Write "
                    "OWD expose every record to every user. Tighten to "
                    "Private and use sharing rules / role hierarchy "
                    "intentionally."
                ),
                recommended_action="Set OWD to Private and re-introduce broad sharing via deliberate sharing rules.",
                affected_count=len(public_owds),
                evidence={"objects": public_owds},
                sf_setup_deeplink="/lightning/setup/SecuritySharing/home",
            ))

        # MANUAL_SHARE_AVALANCHE
        if len(ctx.account_shares) > 10000:
            out.append(FindingDraft(
                category=FindingCategory.SHARING_POSTURE,
                code="MANUAL_SHARE_AVALANCHE",
                severity=FindingSeverity.MEDIUM,
                title=f"{len(ctx.account_shares):,} manual Account shares",
                description=(
                    "Very high manual-share counts usually indicate a "
                    "sharing model that's compensating for missing "
                    "hierarchy or sharing-rule design. Manual shares are "
                    "fragile and expensive to maintain."
                ),
                recommended_action="Audit how these manual shares accumulate. Consider broader sharing rules, role-hierarchy adjustments, or account teams.",
                affected_count=len(ctx.account_shares),
                evidence={"count": len(ctx.account_shares)},
            ))
        if len(ctx.opportunity_shares) > 10000:
            out.append(FindingDraft(
                category=FindingCategory.SHARING_POSTURE,
                code="MANUAL_SHARE_AVALANCHE",
                severity=FindingSeverity.MEDIUM,
                title=f"{len(ctx.opportunity_shares):,} manual Opportunity shares",
                description=(
                    "Same pattern as Account shares — manual shares at "
                    "this scale indicate a structural sharing-model gap."
                ),
                recommended_action="Audit and consolidate via sharing rules or opportunity teams.",
                affected_count=len(ctx.opportunity_shares),
                evidence={"count": len(ctx.opportunity_shares)},
            ))

        # SHARING_RULE_BLOAT
        sr_by_obj: Dict[str, int] = defaultdict(int)
        for r in ctx.sharing_rules:
            sr_by_obj[r.sobject_type] += 1
        bloated_sr = {obj: n for obj, n in sr_by_obj.items() if n > 10}
        if bloated_sr:
            out.append(FindingDraft(
                category=FindingCategory.SHARING_POSTURE,
                code="SHARING_RULE_BLOAT",
                severity=FindingSeverity.MEDIUM,
                title=f"{len(bloated_sr)} objects have >10 sharing rules",
                description=(
                    "Each criteria-based sharing rule fires on every "
                    "record save. Objects with many rules can hit recalc "
                    "limits during sharing-recalc operations."
                ),
                recommended_action="Consolidate overlapping rules; consider Apex managed sharing for advanced cases.",
                affected_count=len(bloated_sr),
                evidence={"objects": sorted(bloated_sr.items(), key=lambda x: -x[1])},
                sf_setup_deeplink="/lightning/setup/SecuritySharing/home",
            ))

        # OVERPRIVILEGED_PROFILE
        # ObjectPermission rows carry ViewAllRecords / ModifyAllRecords flags.
        # If a profile-owned PS has both ModifyAllRecords on >1 sensitive
        # object, treat the profile as over-privileged.
        ps_profile_owner: Dict[str, str] = {
            p.salesforce_id: p.profile_id for p in ctx.permission_sets
            if p.is_owned_by_profile and p.profile_id
        }
        profile_modify_all_count: Dict[str, int] = defaultdict(int)
        for op in ctx.object_perms:
            if op.permissions_modify_all_records and op.sobject_type in SENSITIVE_OBJECTS:
                owner_profile = ps_profile_owner.get(op.parent_id)
                if owner_profile:
                    profile_modify_all_count[owner_profile] += 1
        op_profiles = [
            pid for pid, n in profile_modify_all_count.items() if n >= 2
        ]
        if op_profiles:
            profile_by_id = {p.salesforce_id: p for p in ctx.profiles}
            profile_user_count: Dict[str, int] = defaultdict(int)
            for u in ctx.users:
                if u.is_active and u.profile_id:
                    profile_user_count[u.profile_id] += 1
            sample = []
            for pid in op_profiles:
                if pid in profile_by_id and profile_user_count.get(pid, 0) > 1:
                    sample.append({
                        "id": pid,
                        "name": profile_by_id[pid].name,
                        "active_user_count": profile_user_count[pid],
                        "modify_all_on_sensitive": profile_modify_all_count[pid],
                    })
            if sample:
                out.append(FindingDraft(
                    category=FindingCategory.SHARING_POSTURE,
                    code="OVERPRIVILEGED_PROFILE",
                    severity=FindingSeverity.HIGH,
                    title=f"{len(sample)} profiles grant Modify All on multiple sensitive objects",
                    description=(
                        "These profiles grant Modify All Records on two or "
                        "more sensitive objects, to more than one active "
                        "user. Concentrating that much power in a profile "
                        "(vs. an explicit PSG) is a security anti-pattern."
                    ),
                    recommended_action="Move Modify All grants out of the profile and into a sparingly-assigned PSG.",
                    affected_count=len(sample),
                    evidence={"profiles": sample},
                    sf_setup_deeplink="/lightning/setup/Profiles/home",
                ))

        # API_ENABLED_NO_USE
        if ctx.login_history:
            api_apps = {"REST API", "SOAP Partner", "SOAP Enterprise",
                        "Salesforce CLI", "Connected App", "Bulk API"}
            api_users_who_used = {
                row.get("UserId")
                for row in ctx.login_history
                if (row.get("Application") or "") in api_apps
            }
            # PS-level API-Enabled flag — we surface in PermissionSetSnapshot.raw_data
            api_perm_ps_ids = set()
            for ps in ctx.permission_sets:
                raw = ps.raw_data or {}
                if isinstance(raw, dict) and raw.get("PermissionsApiEnabled") is True:
                    api_perm_ps_ids.add(ps.salesforce_id)
            api_enabled_users = {
                a.assignee_id for a in ctx.assignments
                if a.permission_set_id in api_perm_ps_ids
            }
            stale = [
                u for u in ctx.users
                if u.is_active and u.salesforce_id in api_enabled_users
                and u.salesforce_id not in api_users_who_used
            ]
            if stale:
                n = len(stale)
                out.append(FindingDraft(
                    category=FindingCategory.SHARING_POSTURE,
                    code="API_ENABLED_NO_USE",
                    severity=FindingSeverity.MEDIUM,
                    title=f"{n} users have API Enabled but no API logins in 90 days",
                    description=(
                        "API Enabled is a powerful permission. Users who "
                        "don't actually use the API should not hold it — "
                        "removing it tightens audit posture."
                    ),
                    recommended_action="Remove API Enabled from the listed users' PS assignments; re-grant on demand.",
                    affected_count=n,
                    evidence={
                        "sample": [
                            {"id": u.salesforce_id, "name": u.name}
                            for u in stale[:EVIDENCE_SAMPLE_CAP]
                        ]
                    },
                ))

        return out

    # ----------------------- 5. storage & limit risk

    def _analyze_limits(self, ctx: AnalyzerContext) -> List[FindingDraft]:
        out: List[FindingDraft] = []
        if not ctx.org_limits:
            return out

        def _ratio_remaining(name: str) -> Optional[float]:
            entry = ctx.org_limits.get(name) or {}
            mx, rem = entry.get("Max"), entry.get("Remaining")
            if not mx or rem is None:
                return None
            return rem / mx

        storage_pct = _ratio_remaining("DataStorageMB")
        if storage_pct is not None:
            used = 1 - storage_pct
            entry = ctx.org_limits["DataStorageMB"]
            severity = (
                FindingSeverity.CRITICAL if storage_pct < 0.10
                else FindingSeverity.HIGH if storage_pct < 0.25
                else FindingSeverity.INFO
            )
            if severity != FindingSeverity.INFO:
                out.append(FindingDraft(
                    category=FindingCategory.STORAGE_LIMIT,
                    code="STORAGE_WARNING" if severity == FindingSeverity.HIGH else "STORAGE_CRITICAL",
                    severity=severity,
                    title=f"Data storage {round(used * 100)}% used",
                    description=(
                        f"{entry.get('Max') - entry.get('Remaining')} of "
                        f"{entry.get('Max')} MB used. Salesforce overage "
                        "billing applies once you exceed your allocation."
                    ),
                    recommended_action="Archive historical records to Big Objects / external storage. Compress attachments to Files.",
                    affected_count=1,
                    evidence={"data_storage_mb": entry, "used_pct": round(used * 100, 1)},
                    sf_setup_deeplink="/lightning/setup/CompanyResourceDisk/home",
                ))

        file_pct = _ratio_remaining("FileStorageMB")
        if file_pct is not None and file_pct < 0.25:
            entry = ctx.org_limits["FileStorageMB"]
            out.append(FindingDraft(
                category=FindingCategory.STORAGE_LIMIT,
                code="FILE_STORAGE_HOT" if file_pct >= 0.10 else "FILE_STORAGE_CRITICAL",
                severity=FindingSeverity.HIGH if file_pct < 0.10 else FindingSeverity.MEDIUM,
                title=f"File storage {round((1 - file_pct) * 100)}% used",
                description="File storage is filling up. Old Attachments and Files are usually the culprit.",
                recommended_action="Audit large files; offload old attachments to external storage; convert Attachments → Files.",
                affected_count=1,
                evidence={"file_storage_mb": entry},
            ))

        api_pct = _ratio_remaining("DailyApiRequests")
        if api_pct is not None and api_pct < 0.20:
            entry = ctx.org_limits["DailyApiRequests"]
            out.append(FindingDraft(
                category=FindingCategory.STORAGE_LIMIT,
                code="API_REQUESTS_HOT",
                severity=FindingSeverity.HIGH if api_pct < 0.10 else FindingSeverity.MEDIUM,
                title=f"Daily API request budget {round((1 - api_pct) * 100)}% consumed",
                description="High API consumption can lead to mid-day cutoffs for integrations and Apex callouts.",
                recommended_action="Identify heavy API consumers (often unbatched integrations) and switch them to Bulk API or rate-limit them.",
                affected_count=1,
                evidence={"daily_api_requests": entry},
            ))

        # PER_OBJECT_STORAGE_HOT
        if ctx.sobject_record_counts:
            top = sorted(
                ctx.sobject_record_counts.items(), key=lambda x: -x[1]
            )[:5]
            if top and top[0][1] > 100000:
                out.append(FindingDraft(
                    category=FindingCategory.STORAGE_LIMIT,
                    code="PER_OBJECT_STORAGE_HOT",
                    severity=FindingSeverity.MEDIUM,
                    title="Top record-count contributors",
                    description=(
                        "Largest objects in this org by record count. "
                        "Often the right candidates for archival to Big "
                        "Objects or external storage."
                    ),
                    recommended_action="Build an archival pipeline for the largest objects; consider record-deletion policies.",
                    affected_count=sum(c for _, c in top),
                    evidence={"top_objects": [{"object": n, "count": c} for n, c in top]},
                ))

        return out

    # ----------------------- 6. data quality / object health

    def _analyze_data_quality(self, ctx: AnalyzerContext) -> List[FindingDraft]:
        out: List[FindingDraft] = []

        # CUSTOM_OBJECT_EMPTY
        custom_empty = []
        for name, count in ctx.sobject_record_counts.items():
            if name.endswith("__c") and count == 0:
                custom_empty.append({"object": name, "count": count})
        if custom_empty:
            out.append(FindingDraft(
                category=FindingCategory.DATA_QUALITY,
                code="CUSTOM_OBJECT_EMPTY",
                severity=FindingSeverity.LOW,
                title=f"{len(custom_empty)} custom objects have zero records",
                description=(
                    "Custom objects designed but never used. They're free "
                    "to keep, but they clutter the object manager and "
                    "page-layout pickers, and add ETL maintenance cost."
                ),
                recommended_action="Decide whether each empty custom object is still part of the roadmap. If not, delete it.",
                affected_count=len(custom_empty),
                evidence={"objects": custom_empty[:EVIDENCE_SAMPLE_CAP]},
                sf_setup_deeplink="/lightning/setup/ObjectManager/home",
            ))

        # STALE_OPPORTUNITY — open pipeline that hasn't moved in 60+ days
        # is a forecast-accuracy problem the consultant can quantify.
        if ctx.stale_opportunities_count and ctx.stale_opportunities_count > 0:
            stale_n = ctx.stale_opportunities_count
            sev = (
                FindingSeverity.HIGH if stale_n >= 200
                else FindingSeverity.MEDIUM if stale_n >= 50
                else FindingSeverity.LOW
            )
            out.append(FindingDraft(
                category=FindingCategory.DATA_QUALITY,
                code="STALE_OPPORTUNITY",
                severity=sev,
                title=f"{stale_n} open opportunities not modified in 60+ days",
                description=(
                    "Open pipeline that hasn't moved in two months is "
                    "almost always inflating the forecast. Either close-"
                    "lost or push the close-date out — but don't leave "
                    "them as silent drag on win-rate reports."
                ),
                recommended_action=(
                    "Add a List View filter 'Open, LastModifiedDate "
                    "< 60d ago' and triage with the deal owners."
                ),
                affected_count=stale_n,
                evidence={"open_stale_count": stale_n, "stale_days_threshold": 60},
                sf_setup_deeplink="/lightning/o/Opportunity/list",
            ))

        # ACCOUNT_OWNERSHIP_CONCENTRATION — top owners holding > 50% of
        # accounts is a key-person risk + a sales-ops rebalance hook.
        if ctx.top_account_owners and ctx.total_account_count:
            top5 = ctx.top_account_owners[:5]
            top5_total = sum(int(r.get("cnt") or 0) for r in top5)
            denom = max(ctx.total_account_count, 1)
            pct = top5_total / denom
            if pct >= 0.50:
                user_by_id = {u.salesforce_id: u for u in ctx.users}
                evidence_top = []
                for r in top5:
                    owner_id = r.get("OwnerId")
                    cnt = int(r.get("cnt") or 0)
                    evidence_top.append({
                        "owner_id": owner_id,
                        "owner_name": (
                            user_by_id.get(owner_id).name
                            if owner_id and owner_id in user_by_id
                            else owner_id
                        ),
                        "account_count": cnt,
                        "share_of_org_pct": round(cnt / denom * 100, 1),
                    })
                out.append(FindingDraft(
                    category=FindingCategory.DATA_QUALITY,
                    code="ACCOUNT_OWNERSHIP_CONCENTRATION",
                    severity=FindingSeverity.HIGH if pct >= 0.70 else FindingSeverity.MEDIUM,
                    title=(
                        f"Top 5 owners hold {round(pct * 100)}% of "
                        f"{ctx.total_account_count} accounts"
                    ),
                    description=(
                        "Highly concentrated ownership creates key-person "
                        "risk (departure = pipeline disruption) and "
                        "skews reporting toward a small handful of reps. "
                        "Rebalancing improves coverage + retention "
                        "telemetry."
                    ),
                    recommended_action="Run a coverage analysis with sales-ops and reassign accounts to underloaded reps.",
                    affected_count=top5_total,
                    evidence={
                        "top_owners": evidence_top,
                        "total_accounts_in_org": ctx.total_account_count,
                        "top5_share_pct": round(pct * 100, 1),
                    },
                    sf_setup_deeplink="/lightning/o/Account/list",
                ))

        return out

    # ----------------------- 7. user activity

    def _analyze_activity(self, ctx: AnalyzerContext) -> List[FindingDraft]:
        out: List[FindingDraft] = []
        now = datetime.now(timezone.utc)

        dormant = []
        for u in ctx.users:
            if not u.is_active or u.last_login_at is None:
                continue
            days = (now - _ensure_aware(u.last_login_at)).days
            if 30 <= days < 90:
                dormant.append({
                    "id": u.salesforce_id,
                    "name": u.name,
                    "days_since_login": days,
                })
        if dormant:
            n = len(dormant)
            out.append(FindingDraft(
                category=FindingCategory.USER_ACTIVITY,
                code="USER_DORMANT",
                severity=FindingSeverity.INFO,
                title=f"{n} users last logged in 30–89 days ago",
                description=(
                    "Early warning tier. These users aren't license-waste "
                    "yet but they're trending dormant — worth a check-in "
                    "before the 90-day deactivation finding fires."
                ),
                recommended_action="Manager check-in or training nudge to keep activity above the 90-day threshold.",
                affected_count=n,
                evidence={"sample": dormant[:EVIDENCE_SAMPLE_CAP]},
            ))

        return out

    # ----------------------- 8. predictive

    def _analyze_predictive(self, ctx: AnalyzerContext) -> List[FindingDraft]:
        # v1 placeholder — the storage-extrapolation rule needs ≥ 2 history
        # snapshots ≥ 14 days apart. On first run we don't have that yet,
        # so this category ships empty and fills in once more snapshots
        # exist. Stub kept so the route can still surface "predictive"
        # cleanly and we don't have to redeploy to enable it.
        return []

    # =====================================================================
    # Persistence
    # =====================================================================

    async def _persist(
        self,
        ctx: AnalyzerContext,
        drafts: List[FindingDraft],
        started_at: datetime,
        start_ts: float,
    ) -> OrgAnalysisSnapshot:
        by_sev = defaultdict(int)
        by_cat = defaultdict(int)
        total_savings = 0
        for d in drafts:
            by_sev[d.severity.value] += 1
            by_cat[d.category.value] += 1
            total_savings += d.estimated_annual_savings_cents or 0

        # Org Health Score: 100 minus weighted severity counts, floored at 0.
        # Critical hits 5x harder than Medium, High 3x, Low 1x; Info ignored.
        # The 'rubric' field is persisted so the dashboard can explain the
        # number without having to re-derive it client-side.
        weights = {"critical": 15, "high": 8, "medium": 3, "low": 1, "info": 0}
        deduction = sum(weights[s] * c for s, c in by_sev.items() if s in weights)
        health_score = max(0, 100 - deduction)

        # License utilization (purchased vs assigned) — one of the most
        # talkable numbers for a consultant. Computed from the actual
        # UserLicense / PSL rows pulled live.
        license_utilization = []
        for ul in ctx.user_licenses:
            total = int(ul.get("TotalLicenses") or 0)
            used = int(ul.get("UsedLicenses") or 0)
            if total <= 0:
                continue
            license_utilization.append({
                "license_name": ul.get("MasterLabel") or ul.get("Name"),
                "developer_key": ul.get("Name"),
                "total": total,
                "used": used,
                "utilization_pct": round(used / total * 100, 1),
                "kind": "user",
            })
        for psl in ctx.permission_set_licenses:
            total = int(psl.get("TotalLicenses") or 0)
            used = int(psl.get("UsedLicenses") or 0)
            if total <= 0:
                continue
            license_utilization.append({
                "license_name": psl.get("MasterLabel") or psl.get("DeveloperName"),
                "developer_key": psl.get("DeveloperName"),
                "total": total,
                "used": used,
                "utilization_pct": round(used / total * 100, 1),
                "kind": "permission_set",
            })

        metrics: Dict[str, Any] = {
            "org_health_score": health_score,
            "org_health_rubric": {
                "starting_score": 100,
                "weights": weights,
                "deduction": deduction,
            },
            "total_active_users": sum(1 for u in ctx.users if u.is_active),
            "total_profiles": len(ctx.profiles),
            "total_permission_sets": len(ctx.permission_sets),
            "total_permission_set_groups": len(ctx.psgs),
            "total_roles": len(ctx.roles),
            "total_account_shares": len(ctx.account_shares),
            "total_opportunity_shares": len(ctx.opportunity_shares),
            "total_apex_classes": len(ctx.apex_classes),
            "total_apex_triggers": len(ctx.apex_triggers),
            "total_flows": len(ctx.flows),
            "total_workflow_rules": len(ctx.workflow_rules),
            "total_validation_rules": len(ctx.validation_rules),
            "total_accounts": ctx.total_account_count,
            "stale_open_opportunities_count": ctx.stale_opportunities_count,
            "sobject_record_counts": ctx.sobject_record_counts,
            "license_utilization": license_utilization,
        }

        snapshot = OrgAnalysisSnapshot(
            organization_id=self.org_id,
            snapshot_at=started_at,
            findings_count=len(drafts),
            findings_by_severity=dict(by_sev),
            findings_by_category=dict(by_cat),
            total_estimated_annual_savings_cents=total_savings,
            org_limits=ctx.org_limits,
            metrics=metrics,
            duration_ms=int((time.monotonic() - start_ts) * 1000),
        )
        self.db.add(snapshot)
        await self.db.flush()

        for d in drafts:
            self.db.add(OrgFinding(
                organization_id=self.org_id,
                snapshot_id=snapshot.id,
                category=d.category,
                code=d.code,
                severity=d.severity,
                title=d.title,
                description=d.description,
                recommended_action=d.recommended_action,
                affected_count=d.affected_count,
                estimated_annual_savings_cents=d.estimated_annual_savings_cents,
                evidence=d.evidence,
                sf_setup_deeplink=d.sf_setup_deeplink,
            ))

        return snapshot


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------


def _ensure_aware(dt: datetime) -> datetime:
    """SQLAlchemy may hand us naive datetimes depending on driver; normalize."""
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def _cost_calc(
    formula: str,
    per_unit_monthly_cents: int,
    unit_count: int,
    total_annual_cents: int,
    license_name: Optional[str] = None,
) -> Dict[str, Any]:
    """Structured cost-calculation evidence so the drill-down panel can
    render 'how we got this number' instead of just a black-box dollar
    figure. Lives in evidence.cost_calculation."""
    return {
        "formula": formula,
        "per_unit_monthly_cents": per_unit_monthly_cents,
        "unit_count": unit_count,
        "total_annual_cents": total_annual_cents,
        "license_name": license_name,
    }


_SEVERITY_LADDER = [
    FindingSeverity.INFO,
    FindingSeverity.LOW,
    FindingSeverity.MEDIUM,
    FindingSeverity.HIGH,
    FindingSeverity.CRITICAL,
]


def _severity_for_count(count: int, thresholds: List[int]) -> FindingSeverity:
    """Map a finding count to a severity via ascending thresholds.

    `thresholds` is e.g. [1, 5, 20, 50] meaning:
      count >= 1  → LOW
      count >= 5  → MEDIUM
      count >= 20 → HIGH
      count >= 50 → CRITICAL
    """
    sev = FindingSeverity.INFO
    for i, t in enumerate(thresholds):
        if count >= t and i + 1 < len(_SEVERITY_LADDER):
            sev = _SEVERITY_LADDER[i + 1]
    return sev
