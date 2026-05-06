"""Top-level synthetic-org generator.

Usage as a library:
    from research.anomaly_benchmark.data.generator import generate_org
    org = generate_org(persona="mid_market", seed=42)

Usage from CLI (for inspection):
    python -m research.anomaly_benchmark.data.generator --persona mid_market --seed 42 \
        --out /tmp/org.json
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from typing import List

import numpy as np

from .schemas import SyntheticOrg, SyntheticUser
from .distributions import (
    PERSONAS,
    PROFILE_CATALOG,
    SENIORITY_BASELINES,
    compute_breadth_score,
    sample_field_count,
    sample_last_login_days_ago,
    sample_object_count,
    sample_profile_membership,
    sample_ps_count,
)
from .anomaly_planters import PLANTERS


def _generate_normal_user(
    rng: np.random.Generator,
    user_idx: int,
    profile,
) -> SyntheticUser:
    """Sample one "normal" user given a profile assignment.

    Departments with sensitive-data exposure (HR, Finance) get bumped
    sensitive_* baselines so role-mismatch anomalies are more discriminable.
    """
    baseline = SENIORITY_BASELINES[profile.seniority]

    num_ps = sample_ps_count(rng, baseline.mean_permission_sets)
    num_psg = sample_ps_count(rng, baseline.mean_permission_set_groups)
    num_obj_read = sample_object_count(rng, baseline.mean_objects_read)
    num_obj_edit = sample_object_count(rng, baseline.mean_objects_edit)
    num_obj_delete = sample_object_count(rng, baseline.mean_objects_delete)
    num_field_read = sample_field_count(rng, baseline.mean_fields_read)
    num_field_edit = sample_field_count(rng, baseline.mean_fields_edit)

    # Sensitive baselines biased upward for HR/Finance.
    sensitive_multiplier = 2.0 if profile.department in ("HR", "Finance") else 1.0
    num_sensitive_objects = sample_object_count(
        rng, baseline.mean_sensitive_objects * sensitive_multiplier,
    )
    num_sensitive_fields = sample_field_count(
        rng, baseline.mean_sensitive_fields * sensitive_multiplier,
    )

    breadth = compute_breadth_score(
        num_obj_edit, num_obj_delete, num_field_edit, num_sensitive_fields,
    )

    return SyntheticUser(
        user_id=f"u{user_idx:06d}",
        profile_name=profile.name,
        role_name=f"{profile.department}-{profile.seniority}",
        department=profile.department,
        is_active=True,
        last_login_days_ago=sample_last_login_days_ago(rng),
        num_permission_sets=num_ps,
        num_permission_set_groups=num_psg,
        num_objects_read=num_obj_read,
        num_objects_edit=num_obj_edit,
        num_objects_delete=num_obj_delete,
        num_fields_read=num_field_read,
        num_fields_edit=num_field_edit,
        num_sensitive_objects=num_sensitive_objects,
        num_sensitive_fields=num_sensitive_fields,
        permission_breadth_score=breadth,
    )


def generate_org(
    persona: str,
    seed: int,
    n_users: int | None = None,
    anomaly_prevalence: float | None = None,
) -> SyntheticOrg:
    """Generate one synthetic org for the benchmark.

    Args:
        persona: one of "small_business", "mid_market", "enterprise"
        seed: RNG seed for reproducibility
        n_users: explicit override; otherwise sampled from persona's range
        anomaly_prevalence: explicit override (fraction); otherwise sampled

    Returns: SyntheticOrg with users + planted anomalies.
    """
    if persona not in PERSONAS:
        raise ValueError(f"Unknown persona: {persona}. Use one of {list(PERSONAS)}.")
    spec = PERSONAS[persona]
    rng = np.random.default_rng(seed)

    if n_users is None:
        n_users = int(rng.integers(spec.n_users_range[0], spec.n_users_range[1] + 1))
    if anomaly_prevalence is None:
        anomaly_prevalence = float(rng.uniform(*spec.anomaly_prevalence_range))

    # Step 1: pick the slice of profiles this persona uses (top-N from catalog).
    # Larger personas use more profiles. We always include System Administrator
    # so each org has at least one admin-tier user available.
    catalog_slice = list(PROFILE_CATALOG[: spec.n_profiles_used])
    if not any(p.name == "System Administrator" for p in catalog_slice):
        catalog_slice.append(
            next(p for p in PROFILE_CATALOG if p.name == "System Administrator")
        )

    # Step 2: assign profiles to users via Pareto-like weighting.
    profile_assignments = sample_profile_membership(rng, n_users, catalog_slice)

    # Step 3: generate normal users.
    users: List[SyntheticUser] = [
        _generate_normal_user(rng, i, profile_assignments[i])
        for i in range(n_users)
    ]

    # Step 4: plant anomalies. Round-robin across archetypes so the benchmark
    # has at least 1 of each (when there's enough budget), then top up by
    # sampling archetypes uniformly.
    n_anomalies_target = max(1, int(n_users * anomaly_prevalence))
    archetype_order: List[int] = list(range(len(PLANTERS)))
    rng.shuffle(archetype_order)
    planted = 0
    archetype_idx = 0
    safety_counter = 0
    while planted < n_anomalies_target and safety_counter < n_anomalies_target * 3:
        archetype, planter = PLANTERS[archetype_order[archetype_idx % len(PLANTERS)]]
        if planter(users, rng):
            planted += 1
        archetype_idx += 1
        safety_counter += 1

    return SyntheticOrg(
        org_id=f"{persona}-{seed:08d}",
        persona=persona,
        seed=seed,
        generated_at=datetime.now(timezone.utc),
        users=users,
    )


def _cli() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--persona", required=True, choices=list(PERSONAS))
    p.add_argument("--seed", type=int, default=42)
    p.add_argument("--n-users", type=int, default=None)
    p.add_argument("--prevalence", type=float, default=None,
                   help="Anomaly prevalence as a fraction (e.g., 0.02 = 2%)")
    p.add_argument("--out", default=None, help="Write JSON to file (default: stdout)")
    args = p.parse_args()

    org = generate_org(
        persona=args.persona,
        seed=args.seed,
        n_users=args.n_users,
        anomaly_prevalence=args.prevalence,
    )
    payload = json.dumps(org.to_dict(), indent=2, default=str)
    if args.out:
        with open(args.out, "w") as f:
            f.write(payload)
        print(f"Wrote {args.out}: {len(org.users)} users, {org.n_anomalies()} anomalies")
    else:
        print(payload)
    return 0


if __name__ == "__main__":
    sys.exit(_cli())
