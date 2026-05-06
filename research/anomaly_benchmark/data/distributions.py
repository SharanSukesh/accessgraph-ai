"""Sampling helpers for synthetic Salesforce orgs.

Distributions chosen to roughly match what we've observed in real Salesforce
orgs the engineering team has audited. They are not meant to be perfect
reproductions — they are meant to produce data with the same shape (heavy
tails, sparse FLS, bimodal admin/non-admin breadth) so the benchmark
exercises the same statistical regime production faces.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Tuple

import numpy as np


# -----------------------------------------------------------------------------
# Profile catalog. The names are intentionally ordinary so the planted
# anomalies (e.g., "Sales user with HR access") feel realistic.
# `seniority` ∈ {"junior", "mid", "senior", "admin"}. Used by the
# OVER_PRIVILEGED archetype to detect "junior profile + senior PS" mismatches.
# -----------------------------------------------------------------------------
@dataclass(frozen=True)
class ProfileSpec:
    name: str
    department: str
    seniority: str  # junior | mid | senior | admin


PROFILE_CATALOG: List[ProfileSpec] = [
    ProfileSpec("Standard User", "Sales", "junior"),
    ProfileSpec("Sales Rep", "Sales", "junior"),
    ProfileSpec("Sales Manager", "Sales", "mid"),
    ProfileSpec("Sales Director", "Sales", "senior"),
    ProfileSpec("Support Agent", "Support", "junior"),
    ProfileSpec("Support Manager", "Support", "mid"),
    ProfileSpec("Marketing User", "Marketing", "junior"),
    ProfileSpec("Marketing Manager", "Marketing", "mid"),
    ProfileSpec("Finance Analyst", "Finance", "mid"),
    ProfileSpec("Finance Director", "Finance", "senior"),
    ProfileSpec("HR Specialist", "HR", "mid"),
    ProfileSpec("HR Director", "HR", "senior"),
    ProfileSpec("IT Operations", "IT", "mid"),
    ProfileSpec("System Administrator", "IT", "admin"),
    ProfileSpec("Read Only", "Sales", "junior"),
]


# -----------------------------------------------------------------------------
# Per-profile baseline access. The benchmark needs each profile to have a
# distinct "shape" of permissions so that anomalies (cross-domain access,
# excessive PS counts) are detectable signal rather than noise.
# Values are means used by sample_user_features below; planted anomalies
# perturb these.
# -----------------------------------------------------------------------------
@dataclass(frozen=True)
class ProfileBaseline:
    mean_permission_sets: float
    mean_permission_set_groups: float
    mean_objects_read: float
    mean_objects_edit: float
    mean_objects_delete: float
    mean_fields_read: float
    mean_fields_edit: float
    mean_sensitive_objects: float
    mean_sensitive_fields: float


# Indexed by seniority for simplicity. Department-specific tweaks happen
# in sample_user_features (e.g., HR/Finance get more sensitive_* baseline).
SENIORITY_BASELINES: Dict[str, ProfileBaseline] = {
    "junior": ProfileBaseline(
        mean_permission_sets=1.5,
        mean_permission_set_groups=0.3,
        mean_objects_read=8,
        mean_objects_edit=3,
        mean_objects_delete=0.5,
        mean_fields_read=15,
        mean_fields_edit=5,
        mean_sensitive_objects=0.5,
        mean_sensitive_fields=1,
    ),
    "mid": ProfileBaseline(
        mean_permission_sets=3,
        mean_permission_set_groups=1,
        mean_objects_read=18,
        mean_objects_edit=10,
        mean_objects_delete=2,
        mean_fields_read=40,
        mean_fields_edit=20,
        mean_sensitive_objects=2,
        mean_sensitive_fields=4,
    ),
    "senior": ProfileBaseline(
        mean_permission_sets=5,
        mean_permission_set_groups=2,
        mean_objects_read=30,
        mean_objects_edit=20,
        mean_objects_delete=8,
        mean_fields_read=80,
        mean_fields_edit=50,
        mean_sensitive_objects=5,
        mean_sensitive_fields=10,
    ),
    "admin": ProfileBaseline(
        mean_permission_sets=8,
        mean_permission_set_groups=3,
        mean_objects_read=120,
        mean_objects_edit=100,
        mean_objects_delete=80,
        mean_fields_read=400,
        mean_fields_edit=300,
        mean_sensitive_objects=15,
        mean_sensitive_fields=40,
    ),
}


# -----------------------------------------------------------------------------
# User-count and profile-mix sampling per persona.
# -----------------------------------------------------------------------------
@dataclass(frozen=True)
class PersonaSpec:
    name: str
    n_users_range: Tuple[int, int]   # inclusive
    n_profiles_used: int             # how many profiles from catalog this persona uses
    anomaly_prevalence_range: Tuple[float, float]  # fraction of users planted as anomalies


PERSONAS: Dict[str, PersonaSpec] = {
    "small_business": PersonaSpec(
        name="small_business",
        n_users_range=(25, 100),
        n_profiles_used=5,
        anomaly_prevalence_range=(0.02, 0.05),
    ),
    "mid_market": PersonaSpec(
        name="mid_market",
        n_users_range=(200, 1000),
        n_profiles_used=10,
        anomaly_prevalence_range=(0.01, 0.03),
    ),
    "enterprise": PersonaSpec(
        name="enterprise",
        n_users_range=(2000, 10000),
        n_profiles_used=15,
        anomaly_prevalence_range=(0.005, 0.02),
    ),
}


def sample_profile_membership(
    rng: np.random.Generator,
    n_users: int,
    profiles: List[ProfileSpec],
) -> List[ProfileSpec]:
    """Assign each user a profile. Pareto-like: a few profiles concentrate
    most users, long tail of role-specific profiles.

    We pick weights from a Zipf-like distribution over the profile list so
    the largest profile gets ~30% of users, second ~15%, and so on.
    """
    n_profiles = len(profiles)
    # Zipf weights: rank^(-1.2) roughly matches what we see in real orgs.
    weights = 1.0 / (np.arange(1, n_profiles + 1) ** 1.2)
    weights = weights / weights.sum()
    indices = rng.choice(n_profiles, size=n_users, p=weights)
    return [profiles[i] for i in indices]


def sample_ps_count(rng: np.random.Generator, mean: float) -> int:
    """Permission set count per user follows a negative-binomial-like shape:
    most users 1-3 PSes, heavy upper tail of accumulators. We use a Poisson
    + small probability of geometric tail draw."""
    base = rng.poisson(mean)
    # ~10% chance of a heavier tail draw simulating "permission accumulators"
    # in normal orgs (without being a planted anomaly). Adds realism noise.
    if rng.random() < 0.10:
        base += rng.geometric(p=0.5)
    return int(base)


def sample_object_count(rng: np.random.Generator, mean: float) -> int:
    """Object permissions per user. Bimodal: most users cluster around mean,
    a few outliers (admins) are 5x. We approximate with a Poisson and an
    occasional 5x multiplier."""
    base = rng.poisson(mean)
    if rng.random() < 0.05:
        base = int(base * 5)
    return max(0, int(base))


def sample_field_count(rng: np.random.Generator, mean: float) -> int:
    """Field permissions per user. Same distribution shape as object count."""
    return sample_object_count(rng, mean)


def compute_breadth_score(
    objects_edit: int,
    objects_delete: int,
    fields_edit: int,
    sensitive_fields: int,
) -> float:
    """Mirror the breadth score formula from production's
    _extract_user_features (anomaly_detection.py:179-239):

        breadth = edit + delete*2 + field_edit + sensitive_fields*3
    """
    return float(objects_edit + 2 * objects_delete + fields_edit + 3 * sensitive_fields)


def sample_last_login_days_ago(rng: np.random.Generator) -> int:
    """Most active users logged in within the last week. Long tail of users
    who haven't logged in in months — a small fraction of those will be
    planted as the DORMANT_POWERFUL archetype."""
    # Log-normal so the distribution has a real fat tail.
    return int(rng.lognormal(mean=1.5, sigma=1.5))
