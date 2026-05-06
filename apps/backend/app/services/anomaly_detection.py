"""
Anomaly Detection Service

Uses a Mahalanobis-distance multivariate outlier detector + per-archetype
feature engineering. The detector was selected by the benchmark in
research/anomaly_benchmark/ (see REPORT.md): on synthetic Salesforce-org
data with planted ground-truth anomalies, Mahalanobis beat Isolation
Forest by AUC-PR Δ = +0.017, Wilcoxon Bonferroni-adjusted p = 0.0039,
and runs ~700x faster (0.3ms vs 219ms fit time).
"""
import logging
from collections import defaultdict
from datetime import datetime, timezone
from typing import Dict, List, Optional

try:
    import numpy as np
    import pandas as pd
    SKLEARN_AVAILABLE = True  # name kept for compat with downstream callers
except ImportError:
    SKLEARN_AVAILABLE = False
    np = None
    pd = None


# Fraction of users to flag as anomalies. Observed prevalence in real
# Salesforce orgs (and our synthetic benchmark) is 0.5–5%; 0.02 is a
# safe default that floors the low end of the prevalence range.
# (The previous IsolationForest used contamination=0.20 which was an
# order of magnitude too aggressive — see REPORT.md § 7.1.)
DEFAULT_ANOMALY_FRACTION = 0.02

# Sentinel for users with no recorded last-login (never logged in, or
# pre-v2 sync): treat them as maximally dormant. The detector then sees
# them as anomalously dormant if combined with elevated permissions —
# which is exactly the DORMANT_POWERFUL pattern.
NEVER_LOGGED_IN_DAYS = 9999

# Standard Salesforce object → primary business department mapping. Used
# by the cross_department_access_ratio feature to flag cross-domain
# over-reach (e.g., Sales user with HR object access). Custom objects
# are classified by prefix where possible, otherwise fall through.
_STANDARD_OBJECT_DEPARTMENT: Dict[str, str] = {
    # Sales
    "Account": "Sales", "Contact": "Sales", "Lead": "Sales",
    "Opportunity": "Sales", "OpportunityLineItem": "Sales",
    "Quote": "Sales", "QuoteLineItem": "Sales",
    "Pricebook2": "Sales", "PricebookEntry": "Sales",
    # Marketing
    "Campaign": "Marketing", "CampaignMember": "Marketing",
    # Support
    "Case": "Support", "CaseComment": "Support", "Solution": "Support",
    "WorkOrder": "Support", "ServiceAppointment": "Support",
    "ServiceResource": "Support", "ServiceContract": "Support",
    # Legal / Operations
    "Contract": "Legal", "Order": "Operations", "OrderItem": "Operations",
    "Asset": "Operations",
    # IT / Admin
    "User": "IT", "Profile": "IT", "PermissionSet": "IT",
    "PermissionSetGroup": "IT", "UserRole": "IT",
}

# Custom-object prefix → department. Conventional naming patterns we've
# seen across audits. Falls through to None for unknown prefixes.
_CUSTOM_PREFIX_DEPARTMENT: List[tuple] = [
    ("HR_", "HR"), ("Hr_", "HR"), ("Employee_", "HR"),
    ("Fin_", "Finance"), ("Finance_", "Finance"),
    ("Invoice", "Finance"), ("Payment", "Finance"),
    ("Legal_", "Legal"), ("Compliance_", "Legal"),
]


def _classify_object_department(object_name: str) -> Optional[str]:
    """Return the business department associated with an object, or None
    if it can't be classified. Used by the cross-department feature."""
    if object_name in _STANDARD_OBJECT_DEPARTMENT:
        return _STANDARD_OBJECT_DEPARTMENT[object_name]
    for prefix, dept in _CUSTOM_PREFIX_DEPARTMENT:
        if object_name.startswith(prefix):
            return dept
    return None


class _MahalanobisDetector:
    """Multivariate-distance anomaly detector.

    Fit estimates the centroid and the inverse covariance matrix of the
    feature data (with light regularization so even rank-deficient orgs
    are invertible). Score returns the per-row Mahalanobis distance —
    higher means more anomalous.

    Implementation lifted verbatim from
    research/anomaly_benchmark/algorithms/mahalanobis.py to keep
    apps/backend self-contained (no dependency on research/).
    """

    def __init__(self, regularization: float = 1e-4):
        self.regularization = regularization
        self._mean: Optional["np.ndarray"] = None
        self._inv_cov: Optional["np.ndarray"] = None

    def fit(self, X: "np.ndarray") -> None:
        self._mean = X.mean(axis=0)
        cov = np.cov(X, rowvar=False)
        n_features = cov.shape[0]
        cov = cov + self.regularization * np.eye(n_features)
        try:
            self._inv_cov = np.linalg.inv(cov)
        except np.linalg.LinAlgError:
            self._inv_cov = np.linalg.pinv(cov)

    def score(self, X: "np.ndarray") -> "np.ndarray":
        if self._mean is None or self._inv_cov is None:
            raise RuntimeError("fit() must be called before score()")
        diff = X - self._mean
        m2 = np.einsum("ij,jk,ik->i", diff, self._inv_cov, diff)
        return np.sqrt(np.maximum(m2, 0.0))

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

        # Phase 1: pull access for every user once. The unique-access feature
        # below needs an org-wide view of who has what; computing per-user
        # twice (once for unique counts, once for features) would be wasteful.
        all_user_access: Dict[str, tuple] = {}
        for user in users:
            try:
                obj_access = await self.access_service.get_user_object_access(
                    org_id, user.salesforce_id,
                )
                field_access = await self.access_service.get_user_field_access(
                    org_id, user.salesforce_id,
                )
            except Exception:  # noqa: BLE001 — best-effort feature extraction
                obj_access = {"objects": []}
                field_access = {"fields": []}
            all_user_access[user.salesforce_id] = (obj_access, field_access)

        # Phase 2: org-wide unique-access counts. For each (object, perm)
        # tuple, build the set of users with that grant; users who appear
        # in singleton sets get their unique_access_count incremented.
        # Closes the SOLE_ACCESS_RISK blind spot from REPORT.md § 7.2.
        unique_access_counts = self._compute_unique_access_counts(all_user_access)

        # Phase 3: per-user feature extraction (now O(1) work per user since
        # access is already loaded; previously each call re-queried).
        feature_data = []
        for user in users:
            obj_access, field_access = all_user_access[user.salesforce_id]
            unique_count = unique_access_counts.get(user.salesforce_id, 0)
            features = await self._extract_user_features(
                org_id, user,
                obj_access=obj_access,
                field_access=field_access,
                unique_access_count=unique_count,
            )
            feature_data.append(features)

        # Create DataFrame
        df = pd.DataFrame(feature_data)
        user_ids = df["user_id"].tolist()
        roles = df["role_id"].tolist()
        profiles = df["profile_id"].tolist()

        # Feature columns for ML. v2 = 13 features (was 10 in v1). The 3
        # additions close blind spots identified in REPORT.md § 7.2:
        # last_login → DORMANT_POWERFUL, cross_dept → ROLE_MISMATCH,
        # unique_access → SOLE_ACCESS_RISK.
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
            "last_login_days_ago",
            "cross_department_access_ratio",
            "unique_access_count",
        ]

        X = df[feature_cols].values

        # Run the Mahalanobis detector. Selected by the benchmark in
        # research/anomaly_benchmark/REPORT.md as the algorithm with the
        # best AUC-PR (statistically significant lead over Isolation Forest,
        # Wilcoxon Bonferroni-adjusted p = 0.0039) AND the fastest fit time
        # (~700x faster than IF). It's also parameter-free — no
        # `contamination` knob to mistune.
        detector = _MahalanobisDetector()
        detector.fit(X)
        raw_scores = detector.score(X)

        # Normalize to 0-1 so the rest of this method (severity bands,
        # `score > 0.5` threshold check) keeps working unchanged. Higher
        # = more anomalous in both the raw and normalized scores.
        score_min = raw_scores.min()
        score_max = raw_scores.max()
        anomaly_scores_norm = (raw_scores - score_min) / (
            score_max - score_min + 1e-10
        )

        # Mark the top-k highest-scoring users as ML-flagged anomalies.
        # k = floor(n_users * DEFAULT_ANOMALY_FRACTION), with a floor of 1
        # so we always flag at least one user when the org has any users.
        n_users = len(X)
        k = max(1, int(n_users * DEFAULT_ANOMALY_FRACTION))
        # argpartition is O(n) — cheaper than a full sort for big orgs.
        top_k_idx = set(np.argpartition(-raw_scores, k - 1)[:k].tolist())

        # Create anomaly records
        anomalies = []
        for idx, user in enumerate(users):
            score = float(anomaly_scores_norm[idx])
            is_anomaly = idx in top_k_idx

            # Compute peer stats for context
            peer_stats = await self._compute_peer_stats(
                org_id, user, df, feature_cols, idx
            )

            # Skip if this is the ONLY user with this profile (e.g., sole System Admin)
            if peer_stats.get("peer_count", 0) == 0:
                logger.info(f"Skipping {user.name} - no peers found (profile_id: {user.profile_id})")
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

    async def _extract_user_features(
        self,
        org_id: str,
        user: UserSnapshot,
        obj_access: Optional[Dict] = None,
        field_access: Optional[Dict] = None,
        unique_access_count: int = 0,
    ) -> Dict:
        """Extract ML features for user.

        v2 (13 features): the original 10 production features + 3 new ones
        that close archetype blind spots identified in REPORT.md § 7.2.

        Callers normally pass `obj_access` and `field_access` pre-loaded
        from `detect_anomalies` to avoid duplicate queries; the parameters
        default to None so the method still works standalone (e.g., in
        tests or one-off scripts), in which case it falls back to the
        access service for that user only.
        """
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

        # Lazy-load access if caller didn't pre-fetch (standalone path).
        if obj_access is None or field_access is None:
            try:
                obj_access = await self.access_service.get_user_object_access(org_id, user.salesforce_id)
                field_access = await self.access_service.get_user_field_access(org_id, user.salesforce_id)
            except Exception:  # noqa: BLE001
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

        # ----------------------------------------------------------------
        # v2 features
        # ----------------------------------------------------------------
        # last_login_days_ago: integer days since user last logged in.
        # Sentinel NEVER_LOGGED_IN_DAYS for null (never logged in / pre-v2 sync).
        if user.last_login_at is not None:
            now = datetime.now(timezone.utc)
            # Defensive against tz-naive values from older snapshot rows.
            last = user.last_login_at
            if last.tzinfo is None:
                last = last.replace(tzinfo=timezone.utc)
            last_login_days_ago = max(0, (now - last).days)
        else:
            last_login_days_ago = NEVER_LOGGED_IN_DAYS

        # cross_department_access_ratio: fraction of the user's accessible
        # objects/fields that belong to a department OTHER than their own.
        # Captures cross-domain over-reach (Sales user with HR/Finance access).
        user_dept = user.department
        cross_dept_count = 0
        classifiable_count = 0
        if user_dept:
            for obj in obj_access.get("objects", []):
                if not obj["access"].get("read"):
                    continue
                obj_dept = _classify_object_department(obj["object"])
                if obj_dept is None:
                    continue
                classifiable_count += 1
                if obj_dept != user_dept:
                    cross_dept_count += 1
            for f in field_access.get("fields", []):
                if not f.get("access", {}).get("read"):
                    continue
                obj_dept = _classify_object_department(f.get("objectName", ""))
                if obj_dept is None:
                    continue
                classifiable_count += 1
                if obj_dept != user_dept:
                    cross_dept_count += 1
        cross_department_access_ratio = (
            cross_dept_count / classifiable_count if classifiable_count > 0 else 0.0
        )

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
            # v2 features
            "last_login_days_ago": last_login_days_ago,
            "cross_department_access_ratio": cross_department_access_ratio,
            "unique_access_count": unique_access_count,
        }

    @staticmethod
    def _compute_unique_access_counts(
        all_user_access: Dict[str, tuple],
    ) -> Dict[str, int]:
        """Walk every user's effective access; count grants where they're
        the sole grantee in the org.

        all_user_access[sf_user_id] = (obj_access_dict, field_access_dict).
        Returns sf_user_id → count of singleton grants.
        """
        # (kind, identifier, perm_type) → set of sf_user_ids with that grant
        grants_by_users: Dict[tuple, set] = defaultdict(set)
        for sf_id, (obj_access, field_access) in all_user_access.items():
            for obj in obj_access.get("objects", []):
                obj_name = obj["object"]
                for perm_kind in ("read", "create", "edit", "delete"):
                    if obj["access"].get(perm_kind):
                        grants_by_users[("obj", obj_name, perm_kind)].add(sf_id)
            for f in field_access.get("fields", []):
                fid = f"{f.get('objectName', '')}.{f.get('fieldName', '')}"
                for perm_kind in ("read", "edit"):
                    if f.get("access", {}).get(perm_kind):
                        grants_by_users[("field", fid, perm_kind)].add(sf_id)

        counts: Dict[str, int] = {sf_id: 0 for sf_id in all_user_access}
        for user_set in grants_by_users.values():
            if len(user_set) == 1:
                counts[next(iter(user_set))] += 1
        return counts

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
