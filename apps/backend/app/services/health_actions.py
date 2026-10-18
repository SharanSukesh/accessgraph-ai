"""Priority Actions that come from the Health Report rather than from
anomalies: today, Apex coverage below the 75% deployment gate.

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
    OrgAnalysisSnapshot,
    Recommendation,
    RecommendationStatus,
    RecommendationTrack,
    RecommendationType,
)

# Priority Action types owned by this module (re-derived on every rebuild).
HEALTH_ACTION_TYPES = (RecommendationType.DEPLOYMENT_READINESS,)
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


async def latest_health_actions(db: AsyncSession, org_id: str) -> List[Recommendation]:
    snap = (await db.execute(
        select(OrgAnalysisSnapshot).where(OrgAnalysisSnapshot.organization_id == org_id)
        .order_by(desc(OrgAnalysisSnapshot.snapshot_at)).limit(1)
    )).scalar_one_or_none()
    action = coverage_action(org_id, ((snap.metrics or {}) if snap else {}).get("code_coverage"))
    return [action] if action else []


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
