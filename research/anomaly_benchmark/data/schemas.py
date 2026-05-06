"""Dataclasses for synthetic Salesforce orgs.

Schema mirrors the 10-feature input that production's anomaly detector
consumes (apps/backend/app/services/anomaly_detection.py:179-239) so we
can flow synthetic data through the same algorithms without conversion.

We carry ground-truth anomaly labels alongside features. The detector NEVER
sees these — they're only used to score predictions during evaluation.
"""
from __future__ import annotations

from dataclasses import dataclass, field, asdict
from datetime import datetime
from enum import Enum
from typing import List, Optional

import numpy as np


# Anomaly archetypes we plant. The detector doesn't see these — they're
# only used by the evaluation harness to compute per-archetype recall.
class AnomalyArchetype(str, Enum):
    OVER_PRIVILEGED = "over_privileged"
    DORMANT_POWERFUL = "dormant_but_powerful"
    ROLE_MISMATCH = "role_mismatch"
    PERMISSION_ACCUMULATOR = "permission_accumulator"
    SOLE_ACCESS_RISK = "sole_access_risk"


@dataclass
class SyntheticUser:
    """One synthetic user with a flat feature vector + ground-truth label.

    Feature names match production's _extract_user_features exactly so
    we can feed this straight into the same algorithms.
    """
    user_id: str
    profile_name: str
    role_name: Optional[str]
    department: Optional[str]
    is_active: bool
    last_login_days_ago: int  # used by dormant-but-powerful archetype

    # The 13 features used by the v2 benchmark. The first 10 mirror what
    # production currently computes; the last 3 close blind spots
    # identified in REPORT.md § 7.2:
    #   - last_login_days_ago         → unlocks DORMANT_POWERFUL
    #   - cross_department_access_ratio → unlocks ROLE_MISMATCH
    #   - unique_access_count         → unlocks SOLE_ACCESS_RISK
    num_permission_sets: int
    num_permission_set_groups: int
    num_objects_read: int
    num_objects_edit: int
    num_objects_delete: int
    num_fields_read: int
    num_fields_edit: int
    num_sensitive_objects: int
    num_sensitive_fields: int
    permission_breadth_score: float

    # New v2 features. Defaults make these backward-compatible for any
    # callers that don't set them yet (production hasn't shipped them yet).
    cross_department_access_ratio: float = 0.0
    unique_access_count: int = 0

    # Ground-truth label. NEVER used during fit/predict.
    is_anomaly: bool = False
    anomaly_archetype: Optional[AnomalyArchetype] = None
    # Free-text justification for why this user was planted. Useful when
    # debugging false negatives in REPORT.md.
    anomaly_note: Optional[str] = None

    def feature_vector(self) -> np.ndarray:
        """Return the 13 features in canonical order. The order here
        defines the column ordering for the entire benchmark — don't
        reorder without updating algorithms/feature ablation too."""
        return np.array([
            self.num_permission_sets,
            self.num_permission_set_groups,
            self.num_objects_read,
            self.num_objects_edit,
            self.num_objects_delete,
            self.num_fields_read,
            self.num_fields_edit,
            self.num_sensitive_objects,
            self.num_sensitive_fields,
            self.permission_breadth_score,
            float(self.last_login_days_ago),
            self.cross_department_access_ratio,
            float(self.unique_access_count),
        ], dtype=np.float64)


# Module-level constant so callers (algorithms, ablation, plots) refer
# to a single source of truth.
FEATURE_NAMES: tuple[str, ...] = (
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
)


@dataclass
class SyntheticOrg:
    """A complete synthetic Salesforce org. Datasets passed to the benchmark
    are built from these — feature_matrix() produces the X array, labels()
    produces the y array."""
    org_id: str
    persona: str  # "small_business" | "mid_market" | "enterprise"
    seed: int
    generated_at: datetime
    users: List[SyntheticUser] = field(default_factory=list)

    def feature_matrix(self) -> np.ndarray:
        """Stack user feature vectors into a (n_users, 10) array, ordered
        as FEATURE_NAMES."""
        if not self.users:
            return np.empty((0, len(FEATURE_NAMES)), dtype=np.float64)
        return np.vstack([u.feature_vector() for u in self.users])

    def labels(self) -> np.ndarray:
        """1 = anomaly, 0 = normal. (n_users,) int array."""
        return np.array([1 if u.is_anomaly else 0 for u in self.users], dtype=np.int64)

    def archetype_labels(self) -> List[Optional[AnomalyArchetype]]:
        """Per-user archetype label (None for non-anomalies). Same length
        as users; used by per-archetype-recall computation."""
        return [u.anomaly_archetype for u in self.users]

    def n_anomalies(self) -> int:
        return int(sum(u.is_anomaly for u in self.users))

    def to_dict(self) -> dict:
        """Round-trippable dict for JSON dumping (e.g. for inspection)."""
        return {
            "org_id": self.org_id,
            "persona": self.persona,
            "seed": self.seed,
            "generated_at": self.generated_at.isoformat(),
            "n_users": len(self.users),
            "n_anomalies": self.n_anomalies(),
            "users": [asdict(u) for u in self.users],
        }
