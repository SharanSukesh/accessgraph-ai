"""Collect everything the client report can show, from what Newton has
already computed for the org. Every section is optional: a module that
hasn't been run simply leaves its field empty and the report skips it.
No Salesforce calls happen here.
"""
from __future__ import annotations

from collections import Counter
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Dict, List, Optional

from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.models import (
    AccessAnomaly,
    AutomationSprawlRun,
    ComplianceScorecardRun,
    DataQualityRun,
    IntegrationSprawlRun,
    LicenseFitRun,
    ObjectQualityScore,
    OrgAnalysisSnapshot,
    PackageSprawlRun,
    ReportSprawlRun,
    RiskScore,
    UserSnapshot,
)

RISK_LEVELS = ["critical", "high", "medium", "low"]


@dataclass
class ReportContext:
    history: List[Dict[str, Any]] = field(default_factory=list)
    risk_counts: Dict[str, int] = field(default_factory=dict)
    top_risk_users: List[Dict[str, Any]] = field(default_factory=list)
    anomaly_counts: Dict[str, int] = field(default_factory=dict)
    anomaly_by_category: Dict[str, int] = field(default_factory=dict)
    data_quality: Optional[Dict[str, Any]] = None
    compliance: List[Dict[str, Any]] = field(default_factory=list)
    automation: Optional[AutomationSprawlRun] = None
    reports: Optional[ReportSprawlRun] = None
    packages: Optional[PackageSprawlRun] = None
    integrations: Optional[IntegrationSprawlRun] = None
    license_fit: Optional[LicenseFitRun] = None


def _value(enum_or_str: Any) -> str:
    return str(getattr(enum_or_str, "value", enum_or_str) or "").lower()


async def _latest(db: AsyncSession, model, org_id: str):
    return (
        await db.execute(
            select(model)
            .where(model.organization_id == org_id)
            .order_by(desc(model.snapshot_at))
            .limit(1)
        )
    ).scalar_one_or_none()


async def gather_report_context(
    db: AsyncSession, org_id: str, snapshot: OrgAnalysisSnapshot
) -> ReportContext:
    ctx = ReportContext()

    history = (
        await db.execute(
            select(OrgAnalysisSnapshot)
            .where(
                OrgAnalysisSnapshot.organization_id == org_id,
                OrgAnalysisSnapshot.snapshot_at <= snapshot.snapshot_at,
            )
            .order_by(desc(OrgAnalysisSnapshot.snapshot_at))
            .limit(8)
        )
    ).scalars().all()
    for snap in reversed(history):
        score = (snap.metrics or {}).get("org_health_score")
        if score is not None:
            ctx.history.append({
                "at": snap.snapshot_at,
                "score": float(score),
                "findings": snap.findings_count,
            })

    # Latest risk score per user.
    latest_per_user = (
        select(RiskScore.entity_id, func.max(RiskScore.calculated_at).label("at"))
        .where(RiskScore.organization_id == org_id, RiskScore.entity_type == "user")
        .group_by(RiskScore.entity_id)
        .subquery()
    )
    risks = (
        await db.execute(
            select(RiskScore).join(
                latest_per_user,
                (RiskScore.entity_id == latest_per_user.c.entity_id)
                & (RiskScore.calculated_at == latest_per_user.c.at),
            ).where(RiskScore.organization_id == org_id)
        )
    ).scalars().all()
    if risks:
        ctx.risk_counts = dict(Counter(_value(r.risk_level) for r in risks))
        top = sorted(risks, key=lambda r: r.risk_score or 0, reverse=True)[:10]
        names = {
            u.salesforce_id: u
            for u in (
                await db.execute(
                    select(UserSnapshot).where(
                        UserSnapshot.organization_id == org_id,
                        UserSnapshot.salesforce_id.in_([r.entity_id for r in top]),
                    )
                )
            ).scalars().all()
        }
        for r in top:
            user = names.get(r.entity_id)
            ctx.top_risk_users.append({
                "name": (user.name if user else None) or r.entity_id,
                "title": user.title if user else None,
                "score": r.risk_score or 0,
                "level": _value(r.risk_level),
                "reason": r.reason_text,
            })

    anomalies = (
        await db.execute(select(AccessAnomaly).where(AccessAnomaly.organization_id == org_id))
    ).scalars().all()
    if anomalies:
        ctx.anomaly_counts = dict(Counter(_value(a.severity) for a in anomalies))
        ctx.anomaly_by_category = dict(Counter(_value(a.category) or "access" for a in anomalies))

    dq = await _latest(db, DataQualityRun, org_id)
    if dq is not None and dq.objects_analyzed:
        worst = (
            await db.execute(
                select(ObjectQualityScore)
                .where(ObjectQualityScore.run_id == dq.id, ObjectQualityScore.record_count > 0)
                .order_by(ObjectQualityScore.score.asc())
                .limit(6)
            )
        ).scalars().all()
        ctx.data_quality = {
            "avg_score": dq.avg_score,
            "avg_completeness": dq.avg_completeness,
            "avg_duplicate_pct": dq.avg_duplicate_pct,
            "avg_staleness_pct": dq.avg_staleness_pct,
            "objects_analyzed": dq.objects_analyzed,
            "worst": [
                {"label": o.object_label or o.object_name, "score": o.score, "records": o.record_count}
                for o in worst
            ],
        }

    latest_by_framework: Dict[str, ComplianceScorecardRun] = {}
    for run in (
        await db.execute(
            select(ComplianceScorecardRun)
            .where(ComplianceScorecardRun.organization_id == org_id)
            .order_by(desc(ComplianceScorecardRun.snapshot_at))
        )
    ).scalars().all():
        latest_by_framework.setdefault(run.framework, run)
    ctx.compliance = [
        {
            "framework": fw.upper().replace("SOC2", "SOC 2").replace("PCI", "PCI DSS"),
            "score_pct": run.score_pct,
            "passed": run.controls_passed,
            "failed": run.controls_failed,
            "na": run.controls_not_applicable,
        }
        for fw, run in sorted(latest_by_framework.items())
    ]

    ctx.automation = await _latest(db, AutomationSprawlRun, org_id)
    ctx.reports = await _latest(db, ReportSprawlRun, org_id)
    ctx.packages = await _latest(db, PackageSprawlRun, org_id)
    ctx.integrations = await _latest(db, IntegrationSprawlRun, org_id)
    ctx.license_fit = await _latest(db, LicenseFitRun, org_id)
    return ctx


def short_date(dt: Optional[datetime]) -> str:
    return dt.strftime("%b %d") if dt else ""
