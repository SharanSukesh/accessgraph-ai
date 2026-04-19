"""
Risk Scoring Service
Transparent weighted risk model
"""
import logging
from datetime import datetime, timezone
from typing import Dict, List

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.models import RiskLevel, RiskScore, UserSnapshot
from app.services.effective_access import EffectiveAccessService

logger = logging.getLogger(__name__)


class RiskScoringService:
    """
    Calculate risk scores using transparent weighted model
    """

    def __init__(self, db: AsyncSession):
        self.db = db
        self.access_service = EffectiveAccessService(db)

        # Risk weights (configurable)
        self.weights = {
            "access_breadth": 0.20,
            "sensitive_objects": 0.30,
            "edit_delete_power": 0.25,
            "peer_deviation": 0.15,
            "unique_access": 0.10,
        }

        # Sensitive indicators
        self.sensitive_objects = ["Quote"]
        self.sensitive_fields = [
            "Account.AnnualRevenue",
            "Account.CreditScore__c",
            "Contact.SSN__c",
            "Opportunity.Amount",
            "Case.Internal_Severity__c",
        ]

    async def score_user_risk(self, org_id: str, user_sf_id: str) -> RiskScore:
        """
        Calculate risk score for user

        Returns:
            RiskScore object
        """
        # Get user
        result = await self.db.execute(
            select(UserSnapshot).where(
                UserSnapshot.organization_id == org_id,
                UserSnapshot.salesforce_id == user_sf_id,
            )
        )
        user = result.scalar_one_or_none()
        if not user:
            raise ValueError(f"User not found: {user_sf_id}")

        # Get access
        obj_access = await self.access_service.get_user_object_access(org_id, user_sf_id)
        field_access = await self.access_service.get_user_field_access(org_id, user_sf_id)

        # Calculate factor scores
        factors = []

        # 1. Access breadth
        breadth_score = self._score_access_breadth(obj_access, field_access)
        factors.append({
            "factor": "access_breadth",
            "score": breadth_score,
            "weight": self.weights["access_breadth"],
            "description": f"Access to {len(obj_access['objects'])} objects, {len(field_access['fields'])} fields",
        })

        # 2. Sensitive object access
        sensitive_obj_score = self._score_sensitive_objects(obj_access)
        factors.append({
            "factor": "sensitive_objects",
            "score": sensitive_obj_score,
            "weight": self.weights["sensitive_objects"],
            "description": f"Access to {self._count_sensitive_objects(obj_access)} sensitive objects",
        })

        # 3. Edit/delete power
        edit_delete_score = self._score_edit_delete(obj_access, field_access)
        factors.append({
            "factor": "edit_delete_power",
            "score": edit_delete_score,
            "weight": self.weights["edit_delete_power"],
            "description": f"Edit/delete permissions on {self._count_edit_delete(obj_access)} objects",
        })

        # Calculate weighted score
        total_score = sum(f["score"] * f["weight"] for f in factors) * 100

        # Determine risk level
        risk_level = self._determine_risk_level(total_score)

        # Generate reason text
        reason_text = self._generate_reason_text(factors, risk_level)

        # Create risk score
        risk_score = RiskScore(
            organization_id=org_id,
            entity_type="user",
            entity_id=user_sf_id,
            risk_score=total_score,
            risk_level=risk_level,
            factors=factors,
            reason_text=reason_text,
            calculated_at=datetime.now(timezone.utc),
        )

        self.db.add(risk_score)
        await self.db.commit()

        logger.info(f"Calculated risk score for user {user.name}: {total_score:.1f} ({risk_level})")
        return risk_score

    async def score_all_users(self, org_id: str) -> List[RiskScore]:
        """Score all users in org"""
        result = await self.db.execute(
            select(UserSnapshot).where(
                UserSnapshot.organization_id == org_id,
                UserSnapshot.is_active == True,
            )
        )
        users = result.scalars().all()

        scores = []
        for user in users:
            try:
                score = await self.score_user_risk(org_id, user.salesforce_id)
                scores.append(score)
            except Exception as e:
                logger.error(f"Failed to score user {user.name}: {e}")

        return scores

    def _score_access_breadth(self, obj_access: Dict, field_access: Dict) -> float:
        """Score based on breadth of access (0-1)"""
        num_objects = len(obj_access.get("objects", []))
        num_fields = len(field_access.get("fields", []))

        # Normalize (assumes max reasonable is 20 objects, 50 fields)
        obj_norm = min(num_objects / 20, 1.0)
        field_norm = min(num_fields / 50, 1.0)

        return (obj_norm + field_norm) / 2

    def _score_sensitive_objects(self, obj_access: Dict) -> float:
        """Score sensitive object access (0-1)"""
        sensitive_count = self._count_sensitive_objects(obj_access)
        sensitive_edit = sum(
            1 for obj in obj_access.get("objects", [])
            if obj["object"] in self.sensitive_objects and obj["access"]["edit"]
        )

        # High score if any edit on sensitive
        if sensitive_edit > 0:
            return 1.0
        elif sensitive_count > 0:
            return 0.6
        else:
            return 0.0

    def _score_edit_delete(self, obj_access: Dict, field_access: Dict) -> float:
        """Score edit/delete power (0-1)"""
        count = self._count_edit_delete(obj_access)

        # Count fields with edit access (handle both old and new format)
        field_edit = 0
        for f in field_access.get("fields", []):
            if isinstance(f, dict):
                if "access" in f and isinstance(f["access"], dict):
                    field_edit += 1 if f["access"].get("edit", False) else 0
                elif "canEdit" in f:
                    field_edit += 1 if f["canEdit"] else 0

        # Normalize
        obj_norm = min(count / 10, 1.0)
        field_norm = min(field_edit / 20, 1.0)

        return max(obj_norm, field_norm)

    def _count_sensitive_objects(self, obj_access: Dict) -> int:
        """Count sensitive object access"""
        return sum(
            1 for obj in obj_access.get("objects", [])
            if obj["object"] in self.sensitive_objects and obj["access"]["read"]
        )

    def _count_edit_delete(self, obj_access: Dict) -> int:
        """Count objects with edit or delete"""
        return sum(
            1 for obj in obj_access.get("objects", [])
            if obj["access"]["edit"] or obj["access"]["delete"]
        )

    def _determine_risk_level(self, score: float) -> RiskLevel:
        """Map score to risk level"""
        if score >= 75:
            return RiskLevel.CRITICAL
        elif score >= 50:
            return RiskLevel.HIGH
        elif score >= 25:
            return RiskLevel.MEDIUM
        else:
            return RiskLevel.LOW

    def _generate_reason_text(self, factors: List[Dict], risk_level: RiskLevel) -> str:
        """Generate human-readable risk explanation"""
        top_factors = sorted(factors, key=lambda f: f["score"] * f["weight"], reverse=True)[:3]

        lines = [f"Risk Level: {risk_level.value.upper()}"]
        lines.append("\nTop Contributing Factors:")

        for f in top_factors:
            contribution = f["score"] * f["weight"] * 100
            if contribution > 5:
                lines.append(f"  - {f['description']} (contributes {contribution:.1f} points)")

        return "\n".join(lines)
