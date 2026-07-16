"""
Anomaly Detection Service

Uses a Mahalanobis + GMM rank-average ensemble + per-archetype feature
engineering (13 features). The detector was selected by the v2 benchmark
in research/anomaly_benchmark/REPORT.md: on synthetic Salesforce-org
data with planted ground-truth anomalies and the v2 13-feature schema,
the ensemble beats single Mahalanobis by AUC-PR Δ = +0.028 (Wilcoxon
Bonferroni-adjusted p = 0.0104).

Trade-off documented in REPORT.md § 7: the ensemble loses some
OVER_PRIVILEGED recall vs single Mahalanobis (10% vs 32%) but gains
across the other four archetypes, especially SOLE_ACCESS_RISK (56% vs
45%) and ROLE_MISMATCH (35% vs 7%). A v3 follow-up exploring weighted
or 3-way ensembles is staged in REPORT.md § 8.
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
    """Multivariate-distance anomaly detector. One of two members of the
    production ensemble below; also used standalone in tests.

    Fit estimates the centroid and the inverse covariance matrix of the
    feature data (with light regularization so even rank-deficient orgs
    are invertible). Score returns the per-row Mahalanobis distance —
    higher means more anomalous.
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


class _GMMDetector:
    """Gaussian Mixture Model anomaly detector. Other ensemble member.

    Fits a small mixture (3 components by default) and uses negative
    log-likelihood as the anomaly score. Models multimodal cluster
    structure that single-Gaussian Mahalanobis can't — particularly
    effective at ROLE_MISMATCH and PERMISSION_ACCUMULATOR archetypes
    per the v2 benchmark.

    sklearn's GaussianMixture is the underlying solver; we wrap it for
    interface parity with the rest of the production detector code.
    """

    def __init__(self, n_components: int = 3, seed: int = 42):
        self.n_components = n_components
        self.seed = seed
        self._model = None  # lazy-imported sklearn GMM

    def fit(self, X: "np.ndarray") -> None:
        # Lazy import so missing sklearn doesn't break module load.
        from sklearn.mixture import GaussianMixture
        try:
            self._model = GaussianMixture(
                n_components=self.n_components,
                covariance_type="full",
                random_state=self.seed,
                reg_covar=1e-4,
            )
            self._model.fit(X)
        except Exception:  # noqa: BLE001 — fall back to diagonal covariance
            self._model = GaussianMixture(
                n_components=self.n_components,
                covariance_type="diag",
                random_state=self.seed,
                reg_covar=1e-3,
            )
            self._model.fit(X)

    def score(self, X: "np.ndarray") -> "np.ndarray":
        if self._model is None:
            raise RuntimeError("fit() must be called before score()")
        # GMM.score_samples returns log-likelihood (higher = more normal).
        # Negate so higher = more anomalous, matching our convention.
        return -self._model.score_samples(X)


class _MahalanobisGMMAvgDetector:
    """Production v2 detector: rank-average ensemble of Mahalanobis + GMM.

    Selected by the v2 benchmark (research/anomaly_benchmark/REPORT.md):
    AUC-PR 0.362 vs 0.334 for single Mahalanobis (Δ=+0.028, Wilcoxon
    Bonferroni adj_p=0.0104). Wins on every archetype except
    OVER_PRIVILEGED, where it loses some signal vs single Mahalanobis
    due to rank-averaging diluting the strongest member.

    Why rank-average rather than score-average:
      Mahalanobis returns Euclidean-like distances (open-ended scale).
      GMM returns negative log-likelihoods (different scale, different
      sign behavior). Averaging the raw scores would let one member
      dominate purely because of scale. Rank-averaging is scale-invariant:
      each member contributes a position in [0, n-1] and the ensemble's
      ordering is determined by the average rank.
    """

    def __init__(self, regularization: float = 1e-4, gmm_components: int = 3, seed: int = 42):
        self._maha = _MahalanobisDetector(regularization=regularization)
        self._gmm = _GMMDetector(n_components=gmm_components, seed=seed)

    def fit(self, X: "np.ndarray") -> None:
        self._maha.fit(X)
        self._gmm.fit(X)

    def score(self, X: "np.ndarray") -> "np.ndarray":
        s_maha = self._maha.score(X)
        s_gmm = self._gmm.score(X)
        # Rank-normalize each member into [0, n-1] (higher = more anomalous),
        # then average. ties get the natural argsort tie-break which is fine
        # for our k-of-n top-flag use case.
        n = s_maha.shape[0]

        def to_ranks(scores: "np.ndarray") -> "np.ndarray":
            order = np.argsort(scores)
            ranks = np.empty(n, dtype=np.float64)
            ranks[order] = np.arange(n, dtype=np.float64)
            return ranks

        return (to_ranks(s_maha) + to_ranks(s_gmm)) / 2.0

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.models import (
    AccessAnomaly,
    AnomalySeverity,
    FieldPermissionSnapshot,
    ObjectPermissionSnapshot,
    PermissionSetAssignmentSnapshot,
    SalesforceConnection,
    UserSnapshot,
)
from app.salesforce.client import SalesforceAPIClient
from app.services.effective_access import EffectiveAccessService
from sqlalchemy import desc

logger = logging.getLogger(__name__)


class AnomalyDetectionService:
    """
    Detect access anomalies using ML and peer comparison
    """

    def __init__(self, db: AsyncSession):
        self.db = db
        self.access_service = EffectiveAccessService(db)

    async def _build_sf_client(self, org_id: str) -> Optional[SalesforceAPIClient]:
        """Build a live SalesforceAPIClient for org_id from the stored
        OAuth connection. Returns None if the org has no connection yet
        (freshly signed-up org that hasn't finished OAuth); callers
        should skip live-data detectors in that case.
        """
        row = await self.db.execute(
            select(SalesforceConnection)
            .where(SalesforceConnection.organization_id == org_id)
            .order_by(desc(SalesforceConnection.created_at))
            .limit(1)
        )
        conn = row.scalar_one_or_none()
        if conn is None:
            logger.info(
                "org %s has no SalesforceConnection — session-anomaly "
                "detection skipped.", org_id,
            )
            return None
        return SalesforceAPIClient(
            instance_url=conn.instance_url,
            access_token=conn.access_token,
        )

    async def detect_session_anomalies_for_org(
        self, org_id: str,
    ) -> List[AccessAnomaly]:
        """Convenience: build the SF client from stored OAuth + run the
        session detector. Returns [] silently if no connection exists.
        """
        sf_client = await self._build_sf_client(org_id)
        if sf_client is None:
            return []
        return await self.detect_session_anomalies(org_id, sf_client)

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

        # Delete old ACCESS anomalies for this org to prevent duplicates.
        # Scoped to category="access" so a re-run of the access detector
        # does not wipe out session-anomaly rows (which have their own
        # separate detector + delete step in detect_session_anomalies).
        from sqlalchemy import delete
        await self.db.execute(
            delete(AccessAnomaly).where(
                AccessAnomaly.organization_id == org_id,
                AccessAnomaly.category == "access",
            )
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

        # Run the v2 production detector: Mahalanobis + GMM rank-average
        # ensemble. Selected by the v2 benchmark (research/anomaly_benchmark/
        # REPORT.md): AUC-PR 0.362 vs single Mahalanobis 0.334 (Δ=+0.028,
        # Wilcoxon Bonferroni adj_p=0.0104). The ensemble inherits GMM's
        # multimodal modeling for cluster-aware anomalies while keeping
        # Mahalanobis's per-archetype coverage on most other types.
        detector = _MahalanobisGMMAvgDetector()
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
                    category="access",
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

    # ------------------------------------------------------------------
    # Session anomalies (Roadmap #6)
    # ------------------------------------------------------------------
    # Rule-based detector over Salesforce LoginHistory + LoginGeo. Distinct
    # from the ML detector above (which scores users on permission-shape
    # features) — this one scores login events on temporal + geographic
    # patterns to catch account takeover, impossible travel, and dormant-
    # user re-activation. Records land in the same access_anomalies table
    # tagged category="session" so the Anomalies UI can filter them.
    #
    # Rules v1 (all degrade cleanly when their input signal is missing):
    #   1. IMPOSSIBLE_TRAVEL — two successful logins for the same user
    #      from different Countries within 4 hours.
    #   2. NEW_COUNTRY       — first-ever login from Country X in the last
    #      30 days, when the user has prior logins from any other country.
    #   3. NEW_DEVICE        — (Browser, Platform) pair the user has never
    #      logged in from before.
    #   4. DORMANT_REACTIVATION — user had no successful login for ≥60d,
    #      then a successful login in the last 7d.
    #   5. BRUTE_FORCE_SUCCESS — ≥5 failed logins within 30 min followed
    #      by a successful login for the same user.

    async def detect_session_anomalies(
        self, org_id: str, sf_client,
    ) -> List[AccessAnomaly]:
        """Rule-based session-anomaly detector. Requires a live
        SalesforceAPIClient for the org (LoginHistory + LoginGeo pulls
        run at detection time — no separate snapshot table).

        Best-effort throughout: missing LoginGeo just disables the
        country-based rules; a per-user rule failure is logged and
        skipped, not raised.
        """
        logger.info(f"Running session-anomaly detection for org: {org_id}")

        from sqlalchemy import delete
        # Wipe prior session-anomaly rows only. Access-anomaly rows are
        # untouched — they're managed by detect_anomalies().
        await self.db.execute(
            delete(AccessAnomaly).where(
                AccessAnomaly.organization_id == org_id,
                AccessAnomaly.category == "session",
            )
        )
        await self.db.commit()

        # Pull the 90-day window. Session anomalies are inherently
        # short-horizon (impossible travel, brute force) or recent-versus-
        # historical (new country, dormant reactivation), so 90 days
        # gives us a reasonable baseline without inflating API cost.
        try:
            history = await sf_client.get_login_history(since_days=90)
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "LoginHistory fetch failed for org %s: %s — session "
                "anomaly detection skipped.", org_id, exc,
            )
            return []
        if not history:
            logger.info("No LoginHistory rows for org %s.", org_id)
            return []

        try:
            geo_rows = await sf_client.get_login_geo(since_days=90)
        except Exception as exc:  # noqa: BLE001
            logger.info(
                "LoginGeo unavailable for org %s (%s) — country rules skipped.",
                org_id, exc,
            )
            geo_rows = []

        # Index geo by LoginHistoryId so per-login country lookup is O(1).
        geo_by_login_id: Dict[str, Dict] = {}
        for g in geo_rows:
            lid = g.get("LoginHistoryId")
            if lid:
                geo_by_login_id[lid] = g

        # Group logins by user (successful only for most rules; failed
        # kept separately for brute-force).
        def _parse_ts(iso: Optional[str]) -> Optional[datetime]:
            if not iso:
                return None
            try:
                # SF returns ISO 8601 with Z suffix.
                return datetime.fromisoformat(iso.replace("Z", "+00:00"))
            except (ValueError, AttributeError):
                return None

        by_user_success: Dict[str, List[Dict]] = defaultdict(list)
        by_user_failed: Dict[str, List[Dict]] = defaultdict(list)
        for row in history:
            uid = row.get("UserId")
            if not uid:
                continue
            ts = _parse_ts(row.get("LoginTime"))
            if ts is None:
                continue
            enriched = dict(row)
            enriched["_ts"] = ts
            enriched["_geo"] = geo_by_login_id.get(row.get("Id"))
            if (row.get("Status") or "").lower() == "success":
                by_user_success[uid].append(enriched)
            else:
                by_user_failed[uid].append(enriched)

        # Load the users we've synced so we can attach names (also lets us
        # filter out session anomalies for users we don't have a record
        # for — those would show up in the UI as "unknown user").
        user_result = await self.db.execute(
            select(UserSnapshot).where(
                UserSnapshot.organization_id == org_id,
                UserSnapshot.is_active == True,  # noqa: E712
            )
        )
        active_user_ids = {u.salesforce_id for u in user_result.scalars().all()}

        anomalies: List[AccessAnomaly] = []
        now = datetime.now(timezone.utc)
        # Sort per-user by time (ascending) so window comparisons work
        # left-to-right and "prior" vs "recent" splits are stable.
        for uid, successes in by_user_success.items():
            if uid not in active_user_ids:
                continue
            successes.sort(key=lambda r: r["_ts"])

            per_user_findings: List[str] = []
            per_user_features: Dict = {
                "login_count_90d": len(successes),
                "failed_count_90d": len(by_user_failed.get(uid, [])),
            }
            highest_severity_score = 0.0

            # --- Rule 1: Impossible travel -----------------------------
            # Two successful logins from different countries within 4h.
            IMPOSSIBLE_TRAVEL_HOURS = 4
            for i in range(1, len(successes)):
                prev, curr = successes[i - 1], successes[i]
                prev_geo, curr_geo = prev.get("_geo"), curr.get("_geo")
                if not (prev_geo and curr_geo):
                    continue
                prev_country = prev_geo.get("Country")
                curr_country = curr_geo.get("Country")
                if not (prev_country and curr_country):
                    continue
                if prev_country == curr_country:
                    continue
                gap_hours = (curr["_ts"] - prev["_ts"]).total_seconds() / 3600.0
                if 0 < gap_hours <= IMPOSSIBLE_TRAVEL_HOURS:
                    per_user_findings.append(
                        f"Impossible travel: login from "
                        f"{prev_geo.get('City') or prev_country}, {prev_country} "
                        f"then {curr_geo.get('City') or curr_country}, {curr_country} "
                        f"only {gap_hours:.1f}h apart."
                    )
                    per_user_features["impossible_travel"] = True
                    highest_severity_score = max(highest_severity_score, 0.95)
                    break

            # --- Rule 2: New country (last 30 days) --------------------
            cutoff_30d = now - _timedelta_days(30)
            countries_prior: set = set()
            countries_recent: set = set()
            for s in successes:
                geo = s.get("_geo")
                if not geo:
                    continue
                country = geo.get("Country")
                if not country:
                    continue
                if s["_ts"] < cutoff_30d:
                    countries_prior.add(country)
                else:
                    countries_recent.add(country)
            new_countries = countries_recent - countries_prior
            # Only fire if user had historical activity from OTHER
            # countries — otherwise a user's first-ever login trivially
            # counts as "new" and floods the feed.
            if new_countries and countries_prior:
                for c in sorted(new_countries):
                    per_user_findings.append(
                        f"New country: first login from {c} in the last 30 days "
                        f"(previously seen from {', '.join(sorted(countries_prior)) or 'no other country'})."
                    )
                per_user_features["new_countries"] = sorted(new_countries)
                highest_severity_score = max(highest_severity_score, 0.75)

            # --- Rule 3: New device (Browser, Platform) ---------------
            devices_prior: set = set()
            devices_recent: set = set()
            for s in successes:
                dev = (s.get("Browser") or "unknown", s.get("Platform") or "unknown")
                if s["_ts"] < cutoff_30d:
                    devices_prior.add(dev)
                else:
                    devices_recent.add(dev)
            new_devices = devices_recent - devices_prior
            if new_devices and devices_prior:
                for browser, platform in sorted(new_devices):
                    if browser == "unknown" and platform == "unknown":
                        continue
                    per_user_findings.append(
                        f"New device: {browser} on {platform} — not seen in "
                        "the prior 60 days for this user."
                    )
                per_user_features["new_devices"] = [
                    f"{b}/{p}" for b, p in sorted(new_devices)
                ]
                highest_severity_score = max(highest_severity_score, 0.55)

            # --- Rule 4: Dormant reactivation --------------------------
            # Last successful login before the recent-week window, then a
            # successful login in the last 7 days after a >=60d gap.
            cutoff_7d = now - _timedelta_days(7)
            cutoff_60d = now - _timedelta_days(60)
            recent_logins = [s for s in successes if s["_ts"] >= cutoff_7d]
            older_logins = [s for s in successes if s["_ts"] < cutoff_7d]
            if recent_logins and older_logins:
                last_older = older_logins[-1]["_ts"]
                if last_older < cutoff_60d:
                    dormant_days = (recent_logins[0]["_ts"] - last_older).days
                    per_user_findings.append(
                        f"Dormant reactivation: no logins for {dormant_days} days, "
                        f"then a successful login in the last week."
                    )
                    per_user_features["dormant_days"] = dormant_days
                    highest_severity_score = max(highest_severity_score, 0.7)

            # --- Rule 5: Brute-force success --------------------------
            # 5+ failures within 30 min followed by a success.
            BRUTE_FAILURES = 5
            BRUTE_WINDOW_MIN = 30
            failures = sorted(
                by_user_failed.get(uid, []), key=lambda r: r["_ts"],
            )
            if failures and successes:
                for succ in successes:
                    window_start = succ["_ts"] - _timedelta_minutes(BRUTE_WINDOW_MIN)
                    recent_fails = [
                        f for f in failures
                        if window_start <= f["_ts"] < succ["_ts"]
                    ]
                    if len(recent_fails) >= BRUTE_FAILURES:
                        per_user_findings.append(
                            f"Brute-force success: {len(recent_fails)} failed "
                            f"logins in the {BRUTE_WINDOW_MIN} minutes before a "
                            f"successful login on "
                            f"{succ['_ts'].strftime('%Y-%m-%d %H:%M UTC')}."
                        )
                        per_user_features["brute_force_failure_count"] = len(recent_fails)
                        highest_severity_score = max(highest_severity_score, 0.9)
                        break

            if not per_user_findings:
                continue

            severity = self._determine_severity(
                highest_severity_score, len(per_user_findings),
            )
            anomaly = AccessAnomaly(
                organization_id=org_id,
                user_id=uid,
                anomaly_score=highest_severity_score,
                severity=severity,
                reasons=per_user_findings[:5],
                features=per_user_features,
                peer_stats={},
                detected_at=now,
                category="session",
            )
            anomalies.append(anomaly)

        if anomalies:
            self.db.add_all(anomalies)
            await self.db.commit()

        logger.info(f"Detected {len(anomalies)} session anomalies")
        return anomalies


def _timedelta_days(n: int):
    from datetime import timedelta
    return timedelta(days=n)


def _timedelta_minutes(n: int):
    from datetime import timedelta
    return timedelta(minutes=n)
