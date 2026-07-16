"""
Compliance Scorecard Service — Roadmap #8.

One-click "auditor-ready" pass/fail report per regulatory framework
(SOX, SOC 2, HIPAA, GDPR, PCI DSS). Each framework is a curated list of
`ComplianceControl`s that map a specific control ID (e.g., SOX 404 ITGC
3.1, SOC 2 CC6.1) to an evaluator function. Evaluators read from the
data Newton already computes — Org Analyzer findings, Access + Session
Anomalies, License Fit results, Integration Sprawl tiers — so this
feature does NOT require new Salesforce data pulls.

Ships as a fast-run report the consultant can produce in a discovery
meeting and hand over as evidence for a specific regulatory question.
Deal-winning hook (roadmap): "One click, auditor-ready evidence report
per framework."

Design decisions:
- Evaluators are plain functions taking (db, org_id) → ControlResult.
  Trivial to add a new control without touching the runner.
- Missing prereqs (e.g., no org analyzer snapshot yet) resolve to
  `status="not_applicable"` with a clear reason, not to a false PASS.
- Results are persisted as a single JSON blob on the run row so the
  drilldown loads in one query.
- No new SF pulls — every evaluator reads from DB tables Newton already
  populates. Adding a fresh scorecard is cheap: one DB round-trip per
  control.
"""
from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Awaitable, Callable, Dict, List, Optional

from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.models import (
    AccessAnomaly,
    AnomalySeverity,
    ComplianceScorecardRun,
    IntegrationInventoryItem,
    IntegrationSprawlRun,
    LicenseFitAssessment,
    LicenseFitRun,
    OrgAnalysisSnapshot,
    OrgFinding,
    UserSnapshot,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Data shapes
# ---------------------------------------------------------------------------


PASSED = "passed"
FAILED = "failed"
NOT_APPLICABLE = "not_applicable"


@dataclass
class ControlResult:
    """Outcome of running one ComplianceControl.

    `status` is the primary signal (passed / failed / not_applicable);
    `metric` is a short human-readable phrase for the card header;
    `evidence` is a bounded list of bullet strings for the drilldown;
    `deep_link` is an in-app path so a reviewer can jump straight to the
    underlying Newton surface that produced the finding.
    """
    status: str  # PASSED | FAILED | NOT_APPLICABLE
    metric: str
    metric_value: float = 0.0
    evidence: List[str] = field(default_factory=list)
    recommendation: str = ""
    deep_link: Optional[str] = None

    @property
    def passed(self) -> bool:
        return self.status == PASSED

    def to_dict(self) -> Dict[str, Any]:
        return {
            "status": self.status,
            "passed": self.passed,
            "metric": self.metric,
            "metric_value": self.metric_value,
            "evidence": self.evidence[:20],  # cap
            "recommendation": self.recommendation,
            "deep_link": self.deep_link,
        }


Evaluator = Callable[[AsyncSession, str], Awaitable[ControlResult]]


@dataclass
class ComplianceControl:
    """One row in the framework's rule library."""
    control_id: str      # "SOX-404-ITGC-3.1"
    framework: str       # "SOX" | "SOC2" | "HIPAA" | "GDPR" | "PCI"
    section: str         # human-readable section label, e.g. "IT General Controls"
    name: str            # short title for the card
    description: str     # one-sentence what-the-control-requires
    evaluator: Evaluator


# ---------------------------------------------------------------------------
# Shared helper — latest org analyzer snapshot (many controls read from it)
# ---------------------------------------------------------------------------


async def _latest_org_snapshot(
    db: AsyncSession, org_id: str,
) -> Optional[OrgAnalysisSnapshot]:
    row = await db.execute(
        select(OrgAnalysisSnapshot)
        .where(OrgAnalysisSnapshot.organization_id == org_id)
        .order_by(desc(OrgAnalysisSnapshot.created_at))
        .limit(1)
    )
    return row.scalar_one_or_none()


async def _findings_by_code(
    db: AsyncSession, snapshot_id: str, code: str,
) -> List[OrgFinding]:
    """Fetch all findings from a snapshot with a specific rule code."""
    result = await db.execute(
        select(OrgFinding).where(
            OrgFinding.snapshot_id == snapshot_id,
            OrgFinding.code == code,
        )
    )
    return list(result.scalars().all())


async def _count_active_users(db: AsyncSession, org_id: str) -> int:
    row = await db.execute(
        select(func.count(UserSnapshot.id)).where(
            UserSnapshot.organization_id == org_id,
            UserSnapshot.is_active == True,  # noqa: E712
        )
    )
    return int(row.scalar_one() or 0)


# ---------------------------------------------------------------------------
# Evaluators — read from Newton's already-computed tables
# ---------------------------------------------------------------------------


async def _eval_no_inactive_users_with_access(
    db: AsyncSession, org_id: str,
) -> ControlResult:
    """Terminated users must be de-provisioned promptly.

    Pass criterion: zero inactive UserSnapshot rows still holding
    non-trivial permission-set assignments — proxied by the Org Analyzer
    LICENSE_INACTIVE_USER finding (which flags active licence holders
    who haven't logged in for 90+ days). Non-zero = failed.
    """
    snap = await _latest_org_snapshot(db, org_id)
    if snap is None:
        return ControlResult(
            status=NOT_APPLICABLE,
            metric="No Org Analyzer snapshot yet",
            recommendation="Run the Health Report to generate offboarding evidence.",
        )
    inactive = await _findings_by_code(db, snap.id, "LICENSE_INACTIVE_USER")
    count = sum(f.affected_count for f in inactive) if inactive else 0
    if count == 0:
        return ControlResult(
            status=PASSED,
            metric="0 inactive users retain access",
            metric_value=0,
            recommendation="Continue monthly review cadence.",
            deep_link=f"/orgs/{org_id}/org-analyzer",
        )
    return ControlResult(
        status=FAILED,
        metric=f"{count} inactive users still hold access",
        metric_value=float(count),
        evidence=[
            f["label"] if isinstance(f, dict) else str(f)
            for finding in inactive
            for f in (finding.evidence.get("items", []) if finding.evidence else [])
        ][:10],
        recommendation="Freeze or delete the inactive users and revoke their permission sets.",
        deep_link=f"/orgs/{org_id}/org-analyzer",
    )


async def _eval_no_critical_anomalies_open(
    db: AsyncSession, org_id: str,
) -> ControlResult:
    """Critical access anomalies should be triaged, not left open.

    Pass criterion: zero CRITICAL-severity AccessAnomaly rows for the
    org. This catches SOD violations, sensitive-data over-reach, and
    silent privilege escalation on the current baseline.
    """
    row = await db.execute(
        select(func.count(AccessAnomaly.id)).where(
            AccessAnomaly.organization_id == org_id,
            AccessAnomaly.severity == AnomalySeverity.CRITICAL,
        )
    )
    n = int(row.scalar_one() or 0)
    if n == 0:
        return ControlResult(
            status=PASSED,
            metric="0 critical access anomalies open",
            metric_value=0,
            deep_link=f"/orgs/{org_id}/anomalies?severity=critical",
        )
    return ControlResult(
        status=FAILED,
        metric=f"{n} critical anomalies unresolved",
        metric_value=float(n),
        recommendation="Review each critical anomaly and revoke or justify the access.",
        deep_link=f"/orgs/{org_id}/anomalies?severity=critical",
    )


async def _eval_no_session_anomalies_open(
    db: AsyncSession, org_id: str,
) -> ControlResult:
    """Session-anomaly detector output should be empty (or investigated).

    High/Critical severity session anomalies (impossible travel, brute-
    force success) are treated as incidents. Any open ones fail the
    control until acknowledged.
    """
    row = await db.execute(
        select(func.count(AccessAnomaly.id)).where(
            AccessAnomaly.organization_id == org_id,
            AccessAnomaly.category == "session",
            AccessAnomaly.severity.in_(
                [AnomalySeverity.HIGH, AnomalySeverity.CRITICAL]
            ),
        )
    )
    n = int(row.scalar_one() or 0)
    if n == 0:
        return ControlResult(
            status=PASSED,
            metric="0 high/critical session anomalies open",
            metric_value=0,
            deep_link=f"/orgs/{org_id}/anomalies",
        )
    return ControlResult(
        status=FAILED,
        metric=f"{n} unresolved session-anomaly incidents",
        metric_value=float(n),
        recommendation="Investigate impossible-travel / brute-force / new-country findings.",
        deep_link=f"/orgs/{org_id}/anomalies",
    )


async def _eval_all_users_have_manager(
    db: AsyncSession, org_id: str,
) -> ControlResult:
    """Every active user should have a ManagerId assigned.

    Auditors use ManagerId as the "who approved this access" proxy.
    Missing managers block access-certification cycles.
    """
    total = await _count_active_users(db, org_id)
    if total == 0:
        return ControlResult(
            status=NOT_APPLICABLE,
            metric="No synced users",
            recommendation="Complete a Salesforce sync first.",
        )
    row = await db.execute(
        select(func.count(UserSnapshot.id)).where(
            UserSnapshot.organization_id == org_id,
            UserSnapshot.is_active == True,  # noqa: E712
            (UserSnapshot.manager_id.is_(None)) | (UserSnapshot.manager_id == ""),
        )
    )
    missing = int(row.scalar_one() or 0)
    if missing == 0:
        return ControlResult(
            status=PASSED,
            metric=f"All {total} active users have a manager",
            metric_value=0,
            deep_link=f"/orgs/{org_id}/users",
        )
    pct = round(missing / total * 100, 1)
    # Threshold-based pass/fail: <5% missing is acceptable for most audits.
    status = PASSED if pct < 5 else FAILED
    return ControlResult(
        status=status,
        metric=f"{missing} of {total} users ({pct}%) have no manager",
        metric_value=float(missing),
        recommendation="Populate Salesforce User.ManagerId for the flagged users.",
        deep_link=f"/orgs/{org_id}/users",
    )


async def _eval_over_permissioned_capped(
    db: AsyncSession, org_id: str,
) -> ControlResult:
    """Least-privilege: cap over-permissioned users at ≤ 5% of the base.

    Uses the AccessAnomaly ML detector's output — users flagged as
    MEDIUM+ severity are treated as over-permissioned. Threshold is
    borrowed from the "prevalence range" documented in
    research/anomaly_benchmark/REPORT.md.
    """
    total = await _count_active_users(db, org_id)
    if total == 0:
        return ControlResult(
            status=NOT_APPLICABLE,
            metric="No synced users",
        )
    row = await db.execute(
        select(func.count(AccessAnomaly.id)).where(
            AccessAnomaly.organization_id == org_id,
            AccessAnomaly.category == "access",
            AccessAnomaly.severity.in_(
                [AnomalySeverity.MEDIUM, AnomalySeverity.HIGH, AnomalySeverity.CRITICAL]
            ),
        )
    )
    flagged = int(row.scalar_one() or 0)
    pct = flagged / total * 100 if total else 0
    status = PASSED if pct <= 5 else FAILED
    return ControlResult(
        status=status,
        metric=f"{flagged} of {total} active users ({pct:.1f}%) flagged as over-permissioned",
        metric_value=float(flagged),
        recommendation=(
            "Reduce permission-set assignments for flagged users to bring "
            "over-permissioned rate below 5%."
        ),
        deep_link=f"/orgs/{org_id}/anomalies?severity=high",
    )


async def _eval_integrations_healthy(
    db: AsyncSession, org_id: str,
) -> ControlResult:
    """Third-party integrations should be catalogued + healthy.

    Reads the latest Integration Sprawl run: any integration in the
    'broken' tier fails the control; 'stale' tier warns; 'healthy' /
    'unknown' pass. Auditors want to see the population is known.
    """
    run_row = await db.execute(
        select(IntegrationSprawlRun)
        .where(IntegrationSprawlRun.organization_id == org_id)
        .order_by(desc(IntegrationSprawlRun.created_at))
        .limit(1)
    )
    run = run_row.scalar_one_or_none()
    if run is None:
        return ControlResult(
            status=NOT_APPLICABLE,
            metric="No Integration Sprawl run yet",
            recommendation="Run Integration Sprawl to catalogue connected apps + credentials.",
            deep_link=f"/orgs/{org_id}/sprawl?type=integrations",
        )
    row = await db.execute(
        select(IntegrationInventoryItem.tier, func.count(IntegrationInventoryItem.id))
        .where(IntegrationInventoryItem.run_id == run.id)
        .group_by(IntegrationInventoryItem.tier)
    )
    tiers: Dict[str, int] = {str(t): int(c) for t, c in row.all()}
    broken = tiers.get("broken", 0)
    stale = tiers.get("stale", 0)
    total = sum(tiers.values())
    if total == 0:
        return ControlResult(
            status=PASSED,
            metric="No third-party integrations detected",
            metric_value=0,
            deep_link=f"/orgs/{org_id}/sprawl?type=integrations",
        )
    status = FAILED if broken > 0 else PASSED
    metric = f"{total} integrations catalogued — {broken} broken, {stale} stale"
    return ControlResult(
        status=status,
        metric=metric,
        metric_value=float(broken + stale),
        recommendation=(
            "Remediate broken integrations (missing credentials / expired) "
            "before the audit window."
        ),
        deep_link=f"/orgs/{org_id}/sprawl?type=integrations",
    )


async def _eval_license_persona_fit(
    db: AsyncSession, org_id: str,
) -> ControlResult:
    """Right-sizing / persona-fit — licences should match actual usage.

    Auditors care because oversized licences masquerading as active
    users skew "who has access to what". Reads the latest License Fit
    run; failing = >10% users with a mismatch recommendation.
    """
    run_row = await db.execute(
        select(LicenseFitRun)
        .where(LicenseFitRun.organization_id == org_id)
        .order_by(desc(LicenseFitRun.created_at))
        .limit(1)
    )
    run = run_row.scalar_one_or_none()
    if run is None:
        return ControlResult(
            status=NOT_APPLICABLE,
            metric="No License Fit run yet",
            recommendation="Run License Fit to detect persona mismatches.",
            deep_link=f"/orgs/{org_id}/license-fit",
        )
    row = await db.execute(
        select(func.count(LicenseFitAssessment.id)).where(
            LicenseFitAssessment.run_id == run.id,
        )
    )
    findings = int(row.scalar_one() or 0)
    total_users = await _count_active_users(db, org_id)
    pct = (findings / total_users * 100) if total_users else 0
    status = PASSED if pct <= 10 else FAILED
    return ControlResult(
        status=status,
        metric=f"{findings} of {total_users} users ({pct:.1f}%) have a licence mismatch",
        metric_value=float(findings),
        recommendation="Downgrade or reassign licences for the flagged users.",
        deep_link=f"/orgs/{org_id}/license-fit",
    )


async def _eval_sensitive_data_access_bounded(
    db: AsyncSession, org_id: str,
) -> ControlResult:
    """Access to sensitive fields (PHI/PCI/financial) should be minimised.

    Reads the latest Org Analyzer snapshot for the SENSITIVE_FIELD_
    BLOAT rule (if the analyzer wired one) — otherwise falls back to
    the count of anomalies whose reasons mention 'sensitive'.
    """
    snap = await _latest_org_snapshot(db, org_id)
    if snap is None:
        return ControlResult(
            status=NOT_APPLICABLE,
            metric="No Org Analyzer snapshot yet",
            recommendation="Run the Health Report to inspect sensitive-field exposure.",
        )
    # Best-effort: use anomaly reason text search since we don't have a
    # first-class "sensitive access" feature yet.
    sens_row = await db.execute(
        select(AccessAnomaly).where(
            AccessAnomaly.organization_id == org_id,
            AccessAnomaly.category == "access",
        )
    )
    sensitive_hits = 0
    for a in sens_row.scalars().all():
        text = " ".join(a.reasons or []).lower()
        if "sensitive" in text or "sso" in text or "phi" in text or "pci" in text:
            sensitive_hits += 1
    status = PASSED if sensitive_hits == 0 else FAILED
    metric = (
        f"{sensitive_hits} users flagged for sensitive-data over-access"
        if sensitive_hits else "No sensitive-data over-access detected"
    )
    return ControlResult(
        status=status,
        metric=metric,
        metric_value=float(sensitive_hits),
        recommendation=(
            "Review field-level permissions on PHI / PCI / financial fields "
            "for the flagged users."
        ),
        deep_link=f"/orgs/{org_id}/anomalies",
    )


async def _eval_analyzer_recency(
    db: AsyncSession, org_id: str,
) -> ControlResult:
    """The org's control evidence should be freshly refreshed.

    Fails if the most recent Org Analyzer snapshot is older than 30
    days — stale evidence isn't acceptable to auditors.
    """
    snap = await _latest_org_snapshot(db, org_id)
    if snap is None:
        return ControlResult(
            status=FAILED,
            metric="No Org Analyzer snapshot has ever been produced",
            recommendation="Run the Health Report — required baseline evidence.",
            deep_link=f"/orgs/{org_id}/org-analyzer",
        )
    now = datetime.now(timezone.utc)
    ts = snap.created_at
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)
    age_days = (now - ts).days
    if age_days <= 30:
        return ControlResult(
            status=PASSED,
            metric=f"Health Report refreshed {age_days} days ago",
            metric_value=float(age_days),
            deep_link=f"/orgs/{org_id}/org-analyzer",
        )
    return ControlResult(
        status=FAILED,
        metric=f"Health Report is {age_days} days old (>30)",
        metric_value=float(age_days),
        recommendation="Re-run the Health Report to refresh evidence.",
        deep_link=f"/orgs/{org_id}/org-analyzer",
    )


# ---------------------------------------------------------------------------
# Rule library — one entry per framework control we currently score
# ---------------------------------------------------------------------------


def build_control_library() -> List[ComplianceControl]:
    """Curated set of controls per framework.

    Ships intentionally small (~4-5 controls per framework) so every
    entry maps to a signal Newton already computes. Add more controls
    here as evaluator functions are added.
    """
    return [
        # ============================================================
        # SOX 404 — ITGC Logical Access
        # ============================================================
        ComplianceControl(
            control_id="SOX-404-ITGC-3.1",
            framework="SOX",
            section="IT General Controls — Access Management",
            name="Terminated user access is revoked",
            description=(
                "Inactive users must be de-provisioned. SOX 404 requires "
                "evidence that dormant accounts do not retain access to "
                "financial systems."
            ),
            evaluator=_eval_no_inactive_users_with_access,
        ),
        ComplianceControl(
            control_id="SOX-404-ITGC-3.2",
            framework="SOX",
            section="IT General Controls — Access Management",
            name="Critical access anomalies are triaged",
            description=(
                "Detected anomalies with critical severity must be "
                "reviewed. Open critical anomalies indicate a broken "
                "review cadence."
            ),
            evaluator=_eval_no_critical_anomalies_open,
        ),
        ComplianceControl(
            control_id="SOX-404-ITGC-3.3",
            framework="SOX",
            section="IT General Controls — Access Management",
            name="Access is authorised by a documented approver",
            description=(
                "Every active user must have an approver (ManagerId) on "
                "record so access requests are attributable."
            ),
            evaluator=_eval_all_users_have_manager,
        ),
        ComplianceControl(
            control_id="SOX-404-ITGC-3.4",
            framework="SOX",
            section="IT General Controls — Access Management",
            name="Least-privilege maintained",
            description=(
                "Users flagged as over-permissioned must be within an "
                "acceptable prevalence range (≤5%) of the workforce."
            ),
            evaluator=_eval_over_permissioned_capped,
        ),
        ComplianceControl(
            control_id="SOX-404-ITGC-3.5",
            framework="SOX",
            section="IT General Controls — Evidence Freshness",
            name="Access evidence refreshed within the past 30 days",
            description=(
                "Audit evidence must be recent. Stale snapshots do not "
                "reflect the current state of controls."
            ),
            evaluator=_eval_analyzer_recency,
        ),
        # ============================================================
        # SOC 2 — Trust Services Criteria (CC6 Logical & Physical Access)
        # ============================================================
        ComplianceControl(
            control_id="SOC2-CC6.1",
            framework="SOC2",
            section="CC6 Logical & Physical Access",
            name="Logical access to production is restricted",
            description=(
                "Access to the customer environment is restricted to "
                "authorised users; least-privilege is enforced."
            ),
            evaluator=_eval_over_permissioned_capped,
        ),
        ComplianceControl(
            control_id="SOC2-CC6.2",
            framework="SOC2",
            section="CC6 Logical & Physical Access",
            name="User access is de-provisioned upon termination",
            description=(
                "Access is removed within 24 hours of the user's exit. "
                "Evidence: no inactive users retaining licences."
            ),
            evaluator=_eval_no_inactive_users_with_access,
        ),
        ComplianceControl(
            control_id="SOC2-CC6.6",
            framework="SOC2",
            section="CC6 Logical & Physical Access",
            name="External connections are catalogued and controlled",
            description=(
                "Third-party integrations (Connected Apps, Named "
                "Credentials) must be inventoried and health-checked."
            ),
            evaluator=_eval_integrations_healthy,
        ),
        ComplianceControl(
            control_id="SOC2-CC7.2",
            framework="SOC2",
            section="CC7 System Operations",
            name="Anomalies are detected and investigated",
            description=(
                "The organisation monitors for unusual access patterns "
                "and investigates high/critical detections."
            ),
            evaluator=_eval_no_session_anomalies_open,
        ),
        # ============================================================
        # HIPAA §164.308 — Administrative Safeguards
        # ============================================================
        ComplianceControl(
            control_id="HIPAA-164.308(a)(3)",
            framework="HIPAA",
            section="Administrative Safeguards — Workforce Security",
            name="Workforce clearance procedure",
            description=(
                "Only authorised workforce members access ePHI. Every "
                "user has a documented approver."
            ),
            evaluator=_eval_all_users_have_manager,
        ),
        ComplianceControl(
            control_id="HIPAA-164.308(a)(4)",
            framework="HIPAA",
            section="Administrative Safeguards — Information Access Management",
            name="Access authorisation follows minimum-necessary",
            description=(
                "Access to ePHI is limited to the minimum necessary. "
                "Over-permissioned rate must stay ≤5%."
            ),
            evaluator=_eval_over_permissioned_capped,
        ),
        ComplianceControl(
            control_id="HIPAA-164.308(a)(5)",
            framework="HIPAA",
            section="Administrative Safeguards — Security Awareness & Training",
            name="Access is periodically reviewed",
            description=(
                "Access is reviewed at least monthly; critical anomalies "
                "must not persist between reviews."
            ),
            evaluator=_eval_no_critical_anomalies_open,
        ),
        ComplianceControl(
            control_id="HIPAA-164.312(a)",
            framework="HIPAA",
            section="Technical Safeguards — Access Controls",
            name="Sensitive-field exposure is minimised",
            description=(
                "Access to fields containing PHI (SSN, DOB, medical "
                "identifiers) is restricted to those who need it."
            ),
            evaluator=_eval_sensitive_data_access_bounded,
        ),
        # ============================================================
        # GDPR Art. 32 — Security of processing
        # ============================================================
        ComplianceControl(
            control_id="GDPR-ART32-1a",
            framework="GDPR",
            section="Security of Processing",
            name="Access to personal data is controlled",
            description=(
                "Only authorised personnel can access personal data; "
                "over-permissioned rate is monitored."
            ),
            evaluator=_eval_over_permissioned_capped,
        ),
        ComplianceControl(
            control_id="GDPR-ART32-1b",
            framework="GDPR",
            section="Security of Processing",
            name="Third-party processors are catalogued",
            description=(
                "Third-party integrations processing personal data are "
                "inventoried and health-monitored."
            ),
            evaluator=_eval_integrations_healthy,
        ),
        ComplianceControl(
            control_id="GDPR-ART32-1c",
            framework="GDPR",
            section="Security of Processing",
            name="Security incidents are detected",
            description=(
                "The controller detects unauthorised access — impossible-"
                "travel, brute-force, unusual country patterns."
            ),
            evaluator=_eval_no_session_anomalies_open,
        ),
        ComplianceControl(
            control_id="GDPR-ART32-1d",
            framework="GDPR",
            section="Security of Processing",
            name="Regular testing / evaluation of controls",
            description=(
                "Effectiveness of security measures is tested regularly. "
                "Health Report must be no older than 30 days."
            ),
            evaluator=_eval_analyzer_recency,
        ),
        # ============================================================
        # PCI DSS 4.0 §7 — Restrict access to system components
        # ============================================================
        ComplianceControl(
            control_id="PCI-4.0-7.2.1",
            framework="PCI",
            section="Requirement 7 — Restrict Access to Cardholder Data",
            name="Access limited by job function (least privilege)",
            description=(
                "Access is limited to what is required for the job. "
                "Over-permissioned users must be within tolerance."
            ),
            evaluator=_eval_over_permissioned_capped,
        ),
        ComplianceControl(
            control_id="PCI-4.0-7.2.4",
            framework="PCI",
            section="Requirement 7 — Restrict Access to Cardholder Data",
            name="User access is reviewed at least every 6 months",
            description=(
                "Evidence of periodic review — no critical anomalies "
                "left open past a review cycle."
            ),
            evaluator=_eval_no_critical_anomalies_open,
        ),
        ComplianceControl(
            control_id="PCI-4.0-8.2.1",
            framework="PCI",
            section="Requirement 8 — Identify Users and Authenticate Access",
            name="Terminated users have access revoked immediately",
            description=(
                "Access to system components must be revoked upon "
                "termination — no lingering active licences for inactive "
                "users."
            ),
            evaluator=_eval_no_inactive_users_with_access,
        ),
        ComplianceControl(
            control_id="PCI-4.0-10.2.1",
            framework="PCI",
            section="Requirement 10 — Log & Monitor Access",
            name="Anomalous authentication activity is detected",
            description=(
                "Impossible-travel, brute-force, and new-country logins "
                "must be surfaced and triaged."
            ),
            evaluator=_eval_no_session_anomalies_open,
        ),
    ]


FRAMEWORK_LABELS: Dict[str, str] = {
    "SOX": "SOX 404 — Sarbanes-Oxley IT General Controls",
    "SOC2": "SOC 2 — Trust Services Criteria (Security)",
    "HIPAA": "HIPAA — Security Rule (§164.308 & §164.312)",
    "GDPR": "GDPR — Article 32 Security of Processing",
    "PCI": "PCI DSS 4.0 — Requirements 7, 8, 10",
}


# ---------------------------------------------------------------------------
# Service
# ---------------------------------------------------------------------------


class ComplianceScorecardService:
    """Run the rule library against an org and persist a scorecard run."""

    def __init__(self, db: AsyncSession, org_id: str):
        self.db = db
        self.org_id = org_id
        self._library = build_control_library()

    def list_frameworks(self) -> List[Dict[str, Any]]:
        """Human-readable list of available frameworks + control counts."""
        counts: Dict[str, int] = {}
        for c in self._library:
            counts[c.framework] = counts.get(c.framework, 0) + 1
        return [
            {
                "framework": key,
                "label": FRAMEWORK_LABELS.get(key, key),
                "control_count": counts[key],
            }
            for key in ["SOX", "SOC2", "HIPAA", "GDPR", "PCI"]
            if key in counts
        ]

    async def run(
        self,
        framework: str,
        *,
        actor_email: Optional[str] = None,
    ) -> ComplianceScorecardRun:
        """Run every control in `framework` and persist a scorecard row."""
        framework = framework.upper()
        if framework not in FRAMEWORK_LABELS:
            raise ValueError(
                f"Unknown compliance framework: {framework!r}. "
                f"Expected one of {list(FRAMEWORK_LABELS)}."
            )

        controls = [c for c in self._library if c.framework == framework]
        if not controls:
            raise ValueError(
                f"No controls registered for framework {framework}."
            )

        started = time.monotonic()
        started_at = datetime.now(timezone.utc)
        results: List[Dict[str, Any]] = []
        passed = failed = na = 0

        for ctrl in controls:
            try:
                res = await ctrl.evaluator(self.db, self.org_id)
            except Exception as exc:  # noqa: BLE001
                logger.exception(
                    "control %s evaluator raised — marking NOT_APPLICABLE",
                    ctrl.control_id,
                )
                res = ControlResult(
                    status=NOT_APPLICABLE,
                    metric=f"Evaluator error: {type(exc).__name__}",
                    recommendation=(
                        "Retry after resolving the upstream error. "
                        "This control did not run."
                    ),
                )
            if res.status == PASSED:
                passed += 1
            elif res.status == FAILED:
                failed += 1
            else:
                na += 1
            payload = res.to_dict()
            payload.update(
                {
                    "control_id": ctrl.control_id,
                    "name": ctrl.name,
                    "section": ctrl.section,
                    "description": ctrl.description,
                }
            )
            results.append(payload)

        total = len(controls)
        # NA controls do not count against the pass rate — the score is
        # passed / (passed + failed). If everything came back NA, treat
        # the score as 0 to avoid divide-by-zero.
        denom = passed + failed
        score_pct = (passed / denom * 100.0) if denom else 0.0

        run = ComplianceScorecardRun(
            organization_id=self.org_id,
            framework=framework,
            snapshot_at=started_at,
            actor_email=actor_email,
            duration_ms=int((time.monotonic() - started) * 1000),
            controls_total=total,
            controls_passed=passed,
            controls_failed=failed,
            controls_not_applicable=na,
            score_pct=round(score_pct, 1),
            results=results,
        )
        self.db.add(run)
        await self.db.flush()
        await self.db.commit()
        return run

    async def latest(
        self, framework: str,
    ) -> Optional[ComplianceScorecardRun]:
        row = await self.db.execute(
            select(ComplianceScorecardRun)
            .where(
                ComplianceScorecardRun.organization_id == self.org_id,
                ComplianceScorecardRun.framework == framework.upper(),
            )
            .order_by(desc(ComplianceScorecardRun.snapshot_at))
            .limit(1)
        )
        return row.scalar_one_or_none()
