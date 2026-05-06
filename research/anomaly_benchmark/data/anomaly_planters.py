"""Plants ground-truth anomalies into a clean synthetic org.

Each archetype function takes the org plus an RNG and mutates one specific
"normal" user into a planted anomaly. The function returns a label so the
evaluation harness can score per-archetype recall.

We deliberately keep planters simple and surgical — each modifies a small
number of features in a way that mirrors a real-world risk pattern.
Planters do NOT know about each other; the orchestrator in generator.py
samples how many of each archetype to plant per org.
"""
from __future__ import annotations

from typing import List, Optional

import numpy as np

from .schemas import AnomalyArchetype, SyntheticUser
from .distributions import (
    PROFILE_CATALOG,
    SENIORITY_BASELINES,
    compute_breadth_score,
)


def _find_first_normal(users: List[SyntheticUser], predicate) -> Optional[int]:
    """Return the index of the first user matching `predicate` that hasn't
    already been planted. Returns None if no candidates exist."""
    for i, u in enumerate(users):
        if not u.is_anomaly and predicate(u):
            return i
    return None


def plant_over_privileged(
    users: List[SyntheticUser],
    rng: np.random.Generator,
) -> bool:
    """Junior-profile user assigned a senior-level set of permissions.

    Mutation: pick a junior-profile user and bump their permission counts
    to admin-tier baseline. They keep the junior profile name (the
    mismatch is the signal).
    """
    idx = _find_first_normal(users, lambda u: any(
        p.name == u.profile_name and p.seniority == "junior"
        for p in PROFILE_CATALOG
    ))
    if idx is None:
        return False
    u = users[idx]
    admin_baseline = SENIORITY_BASELINES["admin"]
    u.num_permission_sets = int(admin_baseline.mean_permission_sets * rng.uniform(0.9, 1.3))
    u.num_objects_edit = int(admin_baseline.mean_objects_edit * rng.uniform(0.9, 1.2))
    u.num_objects_delete = int(admin_baseline.mean_objects_delete * rng.uniform(0.9, 1.2))
    u.num_fields_edit = int(admin_baseline.mean_fields_edit * rng.uniform(0.9, 1.2))
    u.num_sensitive_fields = int(admin_baseline.mean_sensitive_fields * rng.uniform(0.9, 1.3))
    u.permission_breadth_score = compute_breadth_score(
        u.num_objects_edit, u.num_objects_delete,
        u.num_fields_edit, u.num_sensitive_fields,
    )
    u.is_anomaly = True
    u.anomaly_archetype = AnomalyArchetype.OVER_PRIVILEGED
    u.anomaly_note = (
        f"Junior-profile user ({u.profile_name}) carries admin-tier "
        f"permission counts: {u.num_permission_sets} PSes, "
        f"{u.num_objects_delete} delete grants."
    )
    return True


def plant_dormant_powerful(
    users: List[SyntheticUser],
    rng: np.random.Generator,
) -> bool:
    """User hasn't logged in in 90+ days but has Modify-All-Data-tier rights.

    Mutation: pick a senior/admin user, set last_login_days_ago to a large
    value. Their permissions stay; the inactivity is the new signal.
    """
    idx = _find_first_normal(users, lambda u: any(
        p.name == u.profile_name and p.seniority in ("senior", "admin")
        for p in PROFILE_CATALOG
    ))
    if idx is None:
        return False
    u = users[idx]
    u.last_login_days_ago = int(rng.integers(low=90, high=400))
    u.is_anomaly = True
    u.anomaly_archetype = AnomalyArchetype.DORMANT_POWERFUL
    u.anomaly_note = (
        f"User has not logged in for {u.last_login_days_ago} days but "
        f"retains {u.num_objects_delete} delete grants and "
        f"{u.num_sensitive_objects} sensitive-object accesses."
    )
    # last_login_days_ago is now a v2 feature, so the detector CAN see this
    # archetype. The v1 benchmark (10 features) showed all algorithms blind
    # to dormant accounts; v2 should fix it.
    return True


def plant_role_mismatch(
    users: List[SyntheticUser],
    rng: np.random.Generator,
) -> bool:
    """Sales user with HR/Finance object-level access (cross-domain over-reach).

    Mutation: pick a Sales user, bump their sensitive_objects + sensitive_fields
    counts to Finance-Director-tier values.
    """
    idx = _find_first_normal(users, lambda u: any(
        p.name == u.profile_name and p.department == "Sales"
        for p in PROFILE_CATALOG
    ))
    if idx is None:
        return False
    u = users[idx]
    senior_baseline = SENIORITY_BASELINES["senior"]
    u.num_sensitive_objects = max(
        u.num_sensitive_objects + int(senior_baseline.mean_sensitive_objects),
        int(senior_baseline.mean_sensitive_objects * 1.5),
    )
    u.num_sensitive_fields = max(
        u.num_sensitive_fields + int(senior_baseline.mean_sensitive_fields),
        int(senior_baseline.mean_sensitive_fields * 1.5),
    )
    u.permission_breadth_score = compute_breadth_score(
        u.num_objects_edit, u.num_objects_delete,
        u.num_fields_edit, u.num_sensitive_fields,
    )
    # The v2 cross_department_access_ratio feature is what makes this
    # archetype detectable. Sales user with 60-80% of their access in
    # other departments — that's the signal. Without this feature
    # ROLE_MISMATCH was essentially invisible to every algorithm in v1.
    u.cross_department_access_ratio = float(rng.uniform(0.6, 0.85))
    u.is_anomaly = True
    u.anomaly_archetype = AnomalyArchetype.ROLE_MISMATCH
    u.anomaly_note = (
        f"Sales user ({u.profile_name}) has {u.num_sensitive_objects} "
        f"sensitive-object grants and {u.num_sensitive_fields} sensitive "
        f"field grants — typical of Finance/HR seniority, not Sales. "
        f"{int(u.cross_department_access_ratio * 100)}% of their access "
        f"is outside their own department."
    )
    return True


def plant_permission_accumulator(
    users: List[SyntheticUser],
    rng: np.random.Generator,
) -> bool:
    """User with 5x peer-median PS assignments due to ad-hoc grants.

    Mutation: pick any user, multiply their permission set counts by ~5x
    while keeping object/field perms unchanged. Their baseline behavior
    looks normal except for the PS count explosion.
    """
    idx = _find_first_normal(users, lambda u: True)
    if idx is None:
        return False
    u = users[idx]
    multiplier = float(rng.uniform(4.5, 6.5))
    u.num_permission_sets = max(int(u.num_permission_sets * multiplier), 8)
    u.num_permission_set_groups = max(
        int(u.num_permission_set_groups * (multiplier / 2)), 2,
    )
    u.is_anomaly = True
    u.anomaly_archetype = AnomalyArchetype.PERMISSION_ACCUMULATOR
    u.anomaly_note = (
        f"User has {u.num_permission_sets} permission sets, "
        f"~{multiplier:.1f}x the typical count for their profile."
    )
    return True


def plant_sole_access_risk(
    users: List[SyntheticUser],
    rng: np.random.Generator,
) -> bool:
    """User is the only one with delete on a sensitive object.

    Mutation: pick a user that already has some delete access, push their
    delete grants higher AND their sensitive-object access higher. We can't
    enforce uniqueness across the org cheaply in synthetic data, so the
    feature signal is "unusually high delete + sensitive count" which
    correlates strongly with the real risk pattern.
    """
    idx = _find_first_normal(users, lambda u: u.num_objects_delete > 0)
    if idx is None:
        # Fallback: pick any user and add delete access.
        idx = _find_first_normal(users, lambda u: True)
        if idx is None:
            return False
    u = users[idx]
    u.num_objects_delete = max(u.num_objects_delete, 5) + int(rng.integers(low=3, high=10))
    u.num_sensitive_objects = max(u.num_sensitive_objects, 3) + int(rng.integers(low=2, high=6))
    u.permission_breadth_score = compute_breadth_score(
        u.num_objects_edit, u.num_objects_delete,
        u.num_fields_edit, u.num_sensitive_fields,
    )
    # v2: explicit unique_access_count makes this archetype detectable.
    # Sole-access users have 3-8 grants where they're the ONLY user in
    # the org with that permission. Normal users have 0-1.
    u.unique_access_count = int(rng.integers(low=3, high=9))
    u.is_anomaly = True
    u.anomaly_archetype = AnomalyArchetype.SOLE_ACCESS_RISK
    u.anomaly_note = (
        f"User has {u.num_objects_delete} delete grants on "
        f"{u.num_sensitive_objects} sensitive objects, with "
        f"{u.unique_access_count} grants unique to this user in the org "
        f"— sole custodian of access that should have a backup grantee."
    )
    return True


# Registry: (archetype, planter_fn). Used by generator.py to plant
# according to the persona's anomaly prevalence.
PLANTERS = [
    (AnomalyArchetype.OVER_PRIVILEGED, plant_over_privileged),
    (AnomalyArchetype.DORMANT_POWERFUL, plant_dormant_powerful),
    (AnomalyArchetype.ROLE_MISMATCH, plant_role_mismatch),
    (AnomalyArchetype.PERMISSION_ACCUMULATOR, plant_permission_accumulator),
    (AnomalyArchetype.SOLE_ACCESS_RISK, plant_sole_access_risk),
]
