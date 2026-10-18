"""Priority Actions that come from the Health Report and Data Quality
rather than from anomalies: Apex coverage below the 75% deployment gate,
and critical objects (stale, mostly empty, fields never populated).

Two writers keep them current: the Health Report run replaces them, and
the anomaly-driven rebuild of Priority Actions (which clears the list)
re-derives them from the latest Health Report, so a sync never drops one.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy import delete, desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.models import (
    AnomalySeverity,
    DataQualityRun,
    ObjectQualityScore,
    OrgAnalysisSnapshot,
    Recommendation,
    RecommendationStatus,
    RecommendationTrack,
    RecommendationType,
)

# Priority Action types owned by this module (re-derived on every rebuild).
HEALTH_ACTION_TYPES = (RecommendationType.DEPLOYMENT_READINESS, RecommendationType.DATA_CLEANUP)
from app.services.replace_lock import lock_for_replace


def coverage_action(org_id: str, cov: Optional[Dict[str, Any]]) -> Optional[Recommendation]:
    if not cov or not cov.get("below_gate"):
        return None
    pct, gate = cov["org_wide_pct"], cov["gate_pct"]
    zeros = len(cov.get("zero_classes") or []) + len(cov.get("zero_triggers") or [])
    return Recommendation(
        organization_id=org_id,
        rec_type=RecommendationType.DEPLOYMENT_READINESS,
        track=RecommendationTrack.DEPLOYMENT,
        status=RecommendationStatus.PENDING,
        severity=AnomalySeverity.HIGH,
        target_entity_type="org",
        target_entity_id="org",
        title=f"Raise Apex test coverage from {pct:g}% to at least {gate:g}% before deploying Apex",
        description=(
            f"Org-wide coverage is {pct:g}%. Salesforce blocks production deployments that include Apex "
            f"below {gate:g}%, so any Apex change will fail to deploy until coverage is raised."
            + (f" {zeros} classes or triggers have no coverage at all." if zeros else "")
        ),
        rationale="Deployment readiness: coverage is a prerequisite for quoting and shipping Apex changes.",
        impact_summary={
            "org_wide_pct": pct,
            "gate_pct": gate,
            "below_gate_items": cov.get("below_gate_items"),
            "last_test_run": cov.get("last_test_run"),
        },
        affected_access={},
        generated_at=datetime.now(timezone.utc),
    )


MAX_DATA_ACTIONS = 10
_FLAG_SEVERITY = {"stale": AnomalySeverity.MEDIUM, "mostly_empty": AnomalySeverity.MEDIUM,
                  "never_populated": AnomalySeverity.LOW}
_FLAG_ACTION = {
    "stale": "archive or delete records nobody has touched",
    "mostly_empty": "decide which fields are still needed and back-fill or retire the rest",
    "never_populated": "remove unused fields (after checking reports, integrations and code)",
}


def data_actions(org_id: str, scores: List[ObjectQualityScore]) -> List[Recommendation]:
    """One Priority Action per critical object, worst first."""
    out: List[Recommendation] = []
    order = {"stale": 0, "mostly_empty": 1, "never_populated": 2}
    critical = [(s, (s.evidence or {}).get("critical", {}).get("flags") or []) for s in scores]
    critical = [(s, f) for s, f in critical if f]
    critical.sort(key=lambda sf: (min(order.get(f["code"], 9) for f in sf[1]), -sf[0].record_count))
    for score, flags in critical[:MAX_DATA_ACTIONS]:
        ev = score.evidence or {}
        labels = [f["label"].lower() for f in flags]
        caveats = [c for c in (ev.get("estimate_label"), ev.get("coverage_label")) if c]
        out.append(Recommendation(
            organization_id=org_id,
            rec_type=RecommendationType.DATA_CLEANUP,
            track=RecommendationTrack.DATA_QUALITY,
            status=RecommendationStatus.PENDING,
            severity=min((_FLAG_SEVERITY.get(f["code"], AnomalySeverity.LOW) for f in flags),
                         key=lambda sev: ["critical", "high", "medium", "low", "info"].index(sev.value)),
            target_entity_type="object",
            target_entity_id=(score.object_name or "")[:18],
            title=f"Clean up {score.object_label or score.object_name}: {', '.join(labels)}",
            description=" ".join(f["reason"] for f in flags) + (f" ({'; '.join(caveats)}.)" if caveats else ""),
            rationale="Data Quality: " + "; ".join(_FLAG_ACTION[f["code"]] for f in flags if f["code"] in _FLAG_ACTION) + ".",
            impact_summary={"object": score.object_name, "record_count": score.record_count,
                            "flags": [f["code"] for f in flags]},
            affected_access={},
            generated_at=datetime.now(timezone.utc),
        ))
    return out


async def _latest_dq_scores(db: AsyncSession, org_id: str, run_id: Optional[str] = None) -> List[ObjectQualityScore]:
    if run_id is None:
        run = (await db.execute(
            select(DataQualityRun).where(DataQualityRun.organization_id == org_id)
            .order_by(desc(DataQualityRun.snapshot_at)).limit(1)
        )).scalar_one_or_none()
        if run is None:
            return []
        run_id = run.id
    return list((await db.execute(
        select(ObjectQualityScore).where(ObjectQualityScore.run_id == run_id)
    )).scalars().all())


async def latest_health_actions(db: AsyncSession, org_id: str) -> List[Recommendation]:
    snap = (await db.execute(
        select(OrgAnalysisSnapshot).where(OrgAnalysisSnapshot.organization_id == org_id)
        .order_by(desc(OrgAnalysisSnapshot.snapshot_at)).limit(1)
    )).scalar_one_or_none()
    action = coverage_action(org_id, ((snap.metrics or {}) if snap else {}).get("code_coverage"))
    return ([action] if action else []) + data_actions(org_id, await _latest_dq_scores(db, org_id))


async def replace_data_actions(db: AsyncSession, org_id: str, run_id: str) -> None:
    await lock_for_replace(db, org_id, "recommendations")
    await db.execute(delete(Recommendation).where(
        Recommendation.organization_id == org_id,
        Recommendation.rec_type == RecommendationType.DATA_CLEANUP,
    ))
    db.add_all(data_actions(org_id, await _latest_dq_scores(db, org_id, run_id)))
    await db.commit()


async def replace_health_actions(db: AsyncSession, org_id: str, cov: Optional[Dict[str, Any]]) -> None:
    await lock_for_replace(db, org_id, "recommendations")
    await db.execute(delete(Recommendation).where(
        Recommendation.organization_id == org_id,
        Recommendation.rec_type == RecommendationType.DEPLOYMENT_READINESS,
    ))
    action = coverage_action(org_id, cov)
    if action:
        db.add(action)
    await db.commit()
