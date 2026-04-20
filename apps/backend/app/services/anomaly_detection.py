"""
Anomaly Detection Service
Uses IsolationForest and feature engineering for access anomalies
"""
import logging
from collections import defaultdict
from datetime import datetime, timezone
from typing import Dict, List, Optional

try:
    import numpy as np
    import pandas as pd
    from sklearn.ensemble import IsolationForest
    SKLEARN_AVAILABLE = True
except ImportError:
    SKLEARN_AVAILABLE = False
    np = None
    pd = None
    IsolationForest = None

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.models import (
    AccessAnomaly,
    AnomalySeverity,
    FieldPermissionSnapshot,
    ObjectPermissionSnapshot,
    PermissionSetAssignmentSnapshot,
    UserSnapshot,
)
from app.services.effective_access import EffectiveAccessService

logger = logging.getLogger(__name__)


class AnomalyDetectionService:
    """
    Detect access anomalies using ML and peer comparison
    """

    def __init__(self, db: AsyncSession):
        self.db = db
        self.access_service = EffectiveAccessService(db)

        # Sensitive indicators (would come from config in production)
        self.sensitive_objects = ["Quote"]
        self.sensitive_fields = [
            "Account.AnnualRevenue",
            "Account.CreditScore__c",
            "Contact.SSN__c",
            "Opportunity.Amount",
            "Case.Internal_Severity__c",
        ]

    async def detect_anomalies(self, org_id: str) -> List[AccessAnomaly]:
        """
        Run anomaly detection for all users in org

        Returns:
            List of detected anomalies
        """
        if not SKLEARN_AVAILABLE:
            logger.warning(
                "scikit-learn not available - anomaly detection disabled. "
                "Install with: pip install scikit-learn numpy pandas"
            )
            return []

        logger.info(f"Running anomaly detection for org: {org_id}")

        # Delete old anomalies for this org to prevent duplicates
        from sqlalchemy import delete
        await self.db.execute(
            delete(AccessAnomaly).where(AccessAnomaly.organization_id == org_id)
        )
        await self.db.commit()

        # Load users
        result = await self.db.execute(
            select(UserSnapshot).where(
                UserSnapshot.organization_id == org_id,
                UserSnapshot.is_active == True,
            )
        )
        users = result.scalars().all()

        if len(users) < 2:
            logger.warning("Not enough users for anomaly detection")
            return []

        # Extract features for all users
        feature_data = []
        for user in users:
            features = await self._extract_user_features(org_id, user)
            feature_data.append(features)

        # Create DataFrame
        df = pd.DataFrame(feature_data)
        user_ids = df["user_id"].tolist()
        roles = df["role_id"].tolist()
        profiles = df["profile_id"].tolist()

        # Feature columns for ML
        feature_cols = [
            "num_permission_sets",
            "num_permission_set_groups",
            "num_objects_read",
            "num_objects_edit",
            "num_objects_delete",
            "num_fields_read",
            "num_fields_edit",
            "num_sensitive_objects",
            "num_sensitive_fields",
            "permission_breadth_score",
        ]

        X = df[feature_cols].values

        # Run IsolationForest
        clf = IsolationForest(contamination=0.2, random_state=42)
        scores = clf.fit_predict(X)
        anomaly_scores = clf.score_samples(X)

        # Normalize scores to 0-1 (lower is more anomalous)
        anomaly_scores_norm = (anomaly_scores - anomaly_scores.min()) / (
            anomaly_scores.max() - anomaly_scores.min() + 1e-10
        )
        anomaly_scores_norm = 1 - anomaly_scores_norm  # Invert so higher = more anomalous

        # Create anomaly records
        anomalies = []
        for idx, user in enumerate(users):
            score = float(anomaly_scores_norm[idx])
            is_anomaly = scores[idx] == -1

            # Compute peer stats for context
            peer_stats = await self._compute_peer_stats(
                org_id, user, df, feature_cols, idx
            )

            # Skip if this is the ONLY user with this profile (e.g., sole System Admin)
            if peer_stats.get("peer_count", 0) == 0:
                logger.info(f"Skipping {user.name} - no peers found (likely sole {user.profile})")
                continue

            # Only flag if anomaly score is significant OR flagged by ML
            if score > 0.5 or is_anomaly:
                # Generate context-aware reasons with peer comparison details
                reasons = self._generate_reasons(feature_data[idx], peer_stats)

                # Skip if no significant deviations found
                if not reasons or len(reasons) == 0:
                    continue

                # Determine severity
                severity = self._determine_severity(score, len(reasons))

                anomaly = AccessAnomaly(
                    organization_id=org_id,
                    user_id=user.salesforce_id,
                    anomaly_score=score,
                    severity=severity,
                    reasons=reasons,
                    features=feature_data[idx],
                    peer_stats=peer_stats,
                    detected_at=datetime.now(timezone.utc),
                )
                anomalies.append(anomaly)

        # Persist
        if anomalies:
            self.db.add_all(anomalies)
            await self.db.commit()

        logger.info(f"Detected {len(anomalies)} anomalies")
        return anomalies

    async def _extract_user_features(self, org_id: str, user: UserSnapshot) -> Dict:
        """Extract ML features for user"""
        # Permission set assignments
        result = await self.db.execute(
            select(PermissionSetAssignmentSnapshot).where(
                PermissionSetAssignmentSnapshot.organization_id == org_id,
                PermissionSetAssignmentSnapshot.assignee_id == user.salesforce_id,
            )
        )
        assignments = result.scalars().all()

        num_ps = len([a for a in assignments if not a.permission_set_id.startswith("0PG")])
        num_psg = len([a for a in assignments if a.permission_set_id.startswith("0PG")])

        # Get effective access
        try:
            obj_access = await self.access_service.get_user_object_access(org_id, user.salesforce_id)
            field_access = await self.access_service.get_user_field_access(org_id, user.salesforce_id)
        except:
            obj_access = {"objects": []}
            field_access = {"fields": []}

        # Count permissions by type
        num_obj_read = sum(1 for obj in obj_access.get("objects", []) if obj["access"]["read"])
        num_obj_edit = sum(1 for obj in obj_access.get("objects", []) if obj["access"]["edit"])
        num_obj_delete = sum(1 for obj in obj_access.get("objects", []) if obj["access"]["delete"])

        num_field_read = sum(1 for f in field_access.get("fields", []) if f["access"]["read"])
        num_field_edit = sum(1 for f in field_access.get("fields", []) if f["access"]["edit"])

        # Sensitive access
        num_sensitive_objs = sum(
            1 for obj in obj_access.get("objects", [])
            if obj["object"] in self.sensitive_objects and obj["access"]["read"]
        )

        num_sensitive_fields = sum(
            1 for f in field_access.get("fields", [])
            if f"{f.get('objectName', '')}.{f.get('fieldName', '')}" in self.sensitive_fields and f.get("access", {}).get("read", False)
        )

        # Breadth score
        breadth_score = num_obj_edit + num_obj_delete * 2 + num_field_edit + num_sensitive_fields * 3

        return {
            "user_id": user.salesforce_id,
            "user_name": user.name,
            "role_id": user.user_role_id,
            "profile_id": user.profile_id,
            "department": user.department,
            "num_permission_sets": num_ps,
            "num_permission_set_groups": num_psg,
            "num_objects_read": num_obj_read,
            "num_objects_edit": num_obj_edit,
            "num_objects_delete": num_obj_delete,
            "num_fields_read": num_field_read,
            "num_fields_edit": num_field_edit,
            "num_sensitive_objects": num_sensitive_objs,
            "num_sensitive_fields": num_sensitive_fields,
            "permission_breadth_score": breadth_score,
        }

    async def _compute_peer_stats(
        self, org_id: str, user: UserSnapshot, df: pd.DataFrame, feature_cols: List[str], user_idx: int
    ) -> Dict:
        """Compute peer comparison statistics"""
        # Primary peer group: same role
        role_peers = df[df["role_id"] == user.user_role_id]

        if len(role_peers) > 1:
            peer_group = "role"
            peers = role_peers
        else:
            # Fallback to profile
            peers = df[df["profile_id"] == user.profile_id]
            peer_group = "profile" if len(peers) > 1 else "org"

        # Exclude self
        peers = peers[peers["user_id"] != user.salesforce_id]

        if len(peers) == 0:
            return {"peer_group": "none", "peer_count": 0}

        # Compute stats
        user_features = df.iloc[user_idx][feature_cols]
        peer_medians = peers[feature_cols].median()
        peer_means = peers[feature_cols].mean()

        deviations = {}
        for col in feature_cols:
            user_val = user_features[col]
            peer_median = peer_medians[col]
            if peer_median > 0:
                deviation = (user_val - peer_median) / peer_median
            else:
                deviation = user_val - peer_median
            deviations[col] = float(deviation)

        return {
            "peer_group": peer_group,
            "peer_count": len(peers),
            "peer_medians": {col: float(peer_medians[col]) for col in feature_cols},
            "deviations": deviations,
        }

    def _generate_reasons(self, features: Dict, peer_stats: Dict) -> List[str]:
        """Generate context-aware anomaly reasons with peer comparison details"""
        reasons = []

        if peer_stats.get("peer_count", 0) == 0:
            return []  # Return empty - will be skipped by caller

        # Build peer context string
        peer_count = peer_stats.get("peer_count", 0)
        peer_type = peer_stats.get("peer_type", "organization")
        peer_context = f"Compared to {peer_count} peers with the same {peer_type}"

        deviations = peer_stats.get("deviations", {})
        medians = peer_stats.get("peer_medians", {})

        # Check significant deviations with context
        if deviations.get("num_permission_sets", 0) > 2.0:
            user_val = features["num_permission_sets"]
            peer_val = medians.get("num_permission_sets", 0)
            reasons.append(
                f"Has {user_val} permission sets vs peer median of {int(peer_val)}. {peer_context}, this user has {int((user_val/max(peer_val, 1) - 1) * 100)}% more permission sets than typical."
            )

        if deviations.get("num_objects_edit", 0) > 1.5:
            user_val = features["num_objects_edit"]
            peer_val = medians.get("num_objects_edit", 0)
            reasons.append(
                f"Can edit {user_val} objects vs peer median of {int(peer_val)}. {peer_context}, this is {int((user_val/max(peer_val, 1) - 1) * 100)}% more edit access."
            )

        if deviations.get("num_objects_delete", 0) > 1.0 and features["num_objects_delete"] > 0:
            user_val = features["num_objects_delete"]
            peer_val = medians.get("num_objects_delete", 0)
            reasons.append(
                f"Can delete from {user_val} objects vs peer median of {int(peer_val)}. {peer_context}, this elevated delete access is unusual."
            )

        if features["num_sensitive_fields"] > medians.get("num_sensitive_fields", 0) and features["num_sensitive_fields"] > 0:
            user_val = features["num_sensitive_fields"]
            peer_val = medians.get("num_sensitive_fields", 0)
            reasons.append(
                f"Accesses {user_val} sensitive fields vs peer median of {int(peer_val)}. {peer_context}, this sensitive data access requires review."
            )

        if features["num_sensitive_objects"] > medians.get("num_sensitive_objects", 0) and features["num_sensitive_objects"] > 0:
            user_val = features["num_sensitive_objects"]
            peer_val = medians.get("num_sensitive_objects", 0)
            reasons.append(
                f"Accesses {user_val} sensitive objects vs peer median of {int(peer_val)}. {peer_context}, unusual sensitive object access detected."
            )

        return reasons[:5]  # Top 5 most significant reasons

    def _determine_severity(self, score: float, num_reasons: int) -> AnomalySeverity:
        """Determine severity level"""
        if score >= 0.9 or num_reasons >= 4:
            return AnomalySeverity.CRITICAL
        elif score >= 0.75 or num_reasons >= 3:
            return AnomalySeverity.HIGH
        elif score >= 0.6 or num_reasons >= 2:
            return AnomalySeverity.MEDIUM
        elif score >= 0.5:
            return AnomalySeverity.LOW
        else:
            return AnomalySeverity.INFO
