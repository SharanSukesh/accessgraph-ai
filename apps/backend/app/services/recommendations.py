"""
Recommendation Engine
Rule-based recommendations for access optimization
"""
import logging
from datetime import datetime, timezone
from typing import List

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.models import (
    AccessAnomaly,
    AnomalySeverity,
    Recommendation,
    RecommendationStatus,
    RecommendationType,
    UserSnapshot,
)

logger = logging.getLogger(__name__)


class RecommendationEngine:
    """
    Generate access recommendations
    """

    def __init__(self, db: AsyncSession):
        self.db = db

    async def generate_recommendations(self, org_id: str) -> List[Recommendation]:
        """
        Generate all recommendations for org

        Returns:
            List of recommendations
        """
        logger.info(f"Generating recommendations for org: {org_id}")

        recommendations = []

        # Get anomalies
        result = await self.db.execute(
            select(AccessAnomaly).where(AccessAnomaly.organization_id == org_id)
        )
        anomalies = result.scalars().all()

        # Generate recs from anomalies
        for anomaly in anomalies:
            recs = await self._recommendations_from_anomaly(org_id, anomaly)
            recommendations.extend(recs)

        # Persist
        if recommendations:
            self.db.add_all(recommendations)
            await self.db.commit()

        logger.info(f"Generated {len(recommendations)} recommendations")
        return recommendations

    async def _recommendations_from_anomaly(
        self, org_id: str, anomaly: AccessAnomaly
    ) -> List[Recommendation]:
        """Generate recommendations for an anomaly"""
        recs = []

        # Get user
        result = await self.db.execute(
            select(UserSnapshot).where(
                UserSnapshot.organization_id == org_id,
                UserSnapshot.salesforce_id == anomaly.user_id,
            )
        )
        user = result.scalar_one_or_none()
        if not user:
            return recs

        features = anomaly.features
        reasons = anomaly.reasons
        peer_stats = anomaly.peer_stats

        # Rule 1: Excessive direct permission sets → PSG migration
        if features.get("num_permission_sets", 0) > 3:
            rec = Recommendation(
                organization_id=org_id,
                rec_type=RecommendationType.PSG_MIGRATION,
                status=RecommendationStatus.PENDING,
                severity=AnomalySeverity.MEDIUM if anomaly.severity in [AnomalySeverity.HIGH, AnomalySeverity.CRITICAL] else AnomalySeverity.LOW,
                target_entity_type="user",
                target_entity_id=user.salesforce_id,
                title=f"Review permission set assignments for {user.name}",
                description=f"User has {features['num_permission_sets']} direct permission set assignments. Consider consolidating into Permission Set Groups for easier management.",
                rationale=f"Peers typically use {int(peer_stats.get('peer_medians', {}).get('num_permission_sets', 0))} permission sets. Multiple direct assignments increase management complexity.",
                impact_summary={
                    "affected_permission_sets": features.get("num_permission_sets", 0),
                    "management_improvement": "high",
                },
                affected_access={},
                generated_at=datetime.now(timezone.utc),
            )
            recs.append(rec)

        # Rule 2: High edit/delete permissions → Access review
        if features.get("num_objects_edit", 0) > peer_stats.get("peer_medians", {}).get("num_objects_edit", 0) * 2:
            rec = Recommendation(
                organization_id=org_id,
                rec_type=RecommendationType.ACCESS_REVIEW,
                status=RecommendationStatus.PENDING,
                severity=AnomalySeverity.HIGH if anomaly.severity == AnomalySeverity.CRITICAL else AnomalySeverity.MEDIUM,
                target_entity_type="user",
                target_entity_id=user.salesforce_id,
                title=f"Review broad edit permissions for {user.name}",
                description=f"User has edit access to {features['num_objects_edit']} objects, significantly higher than peer median of {int(peer_stats.get('peer_medians', {}).get('num_objects_edit', 0))}.",
                rationale="Excessive edit permissions increase risk of unauthorized data modification. Consider least-privilege principle.",
                impact_summary={
                    "objects_with_edit": features.get("num_objects_edit", 0),
                    "peer_median": int(peer_stats.get("peer_medians", {}).get("num_objects_edit", 0)),
                    "deviation_percent": int(peer_stats.get("deviations", {}).get("num_objects_edit", 0) * 100),
                },
                affected_access={},
                generated_at=datetime.now(timezone.utc),
            )
            recs.append(rec)

        # Rule 3: Sensitive field access → Permission removal
        if features.get("num_sensitive_fields", 0) > 0 and user.department in ["Support", "HR"]:
            rec = Recommendation(
                organization_id=org_id,
                rec_type=RecommendationType.PERMISSION_REMOVAL,
                status=RecommendationStatus.PENDING,
                severity=AnomalySeverity.HIGH,
                target_entity_type="user",
                target_entity_id=user.salesforce_id,
                title=f"Remove sensitive field access for {user.name}",
                description=f"User in {user.department} department has access to {features['num_sensitive_fields']} sensitive fields, which is unusual for this role.",
                rationale="Sensitive fields like SSN, Credit Score should be restricted to necessary roles only.",
                impact_summary={
                    "sensitive_fields": features.get("num_sensitive_fields", 0),
                    "department": user.department,
                },
                affected_access={},
                generated_at=datetime.now(timezone.utc),
            )
            recs.append(rec)

        # Rule 4: Unique delete access → Access review
        if features.get("num_objects_delete", 0) > 0 and peer_stats.get("peer_medians", {}).get("num_objects_delete", 0) == 0:
            rec = Recommendation(
                organization_id=org_id,
                rec_type=RecommendationType.ACCESS_REVIEW,
                status=RecommendationStatus.PENDING,
                severity=AnomalySeverity.HIGH,
                target_entity_type="user",
                target_entity_id=user.salesforce_id,
                title=f"Review unique delete permissions for {user.name}",
                description=f"User has delete access to {features['num_objects_delete']} objects while peers have none. This is a unique permission pattern.",
                rationale="Delete permissions should be carefully controlled and reviewed regularly.",
                impact_summary={
                    "objects_with_delete": features.get("num_objects_delete", 0),
                    "peer_median": 0,
                    "uniqueness": "high",
                },
                affected_access={},
                generated_at=datetime.now(timezone.utc),
            )
            recs.append(rec)

        return recs
