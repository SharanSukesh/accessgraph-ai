"""Tests for the synthetic-org generator. Verifies each archetype can be
planted, feature schema matches production, and distributions are roughly
sane."""
from __future__ import annotations

import numpy as np
import pytest

from research.anomaly_benchmark.data.generator import generate_org
from research.anomaly_benchmark.data.schemas import (
    AnomalyArchetype,
    FEATURE_NAMES,
)


def test_generate_org_small_business_seed_42_is_reproducible():
    """Same seed → same org. Required for the benchmark's reproducibility
    claims to hold."""
    a = generate_org(persona="small_business", seed=42)
    b = generate_org(persona="small_business", seed=42)
    assert a.org_id == b.org_id
    assert len(a.users) == len(b.users)
    assert a.n_anomalies() == b.n_anomalies()
    # Feature matrices identical
    np.testing.assert_array_equal(a.feature_matrix(), b.feature_matrix())


def test_generate_org_different_seeds_produce_different_orgs():
    a = generate_org(persona="small_business", seed=42)
    b = generate_org(persona="small_business", seed=43)
    assert a.feature_matrix().shape != b.feature_matrix().shape \
        or not np.array_equal(a.feature_matrix(), b.feature_matrix())


def test_feature_matrix_has_10_columns_in_canonical_order():
    org = generate_org(persona="mid_market", seed=1)
    X = org.feature_matrix()
    assert X.shape[1] == 10
    assert len(FEATURE_NAMES) == 10
    # Spot check column order: num_permission_sets is column 0, breadth is col 9.
    assert FEATURE_NAMES[0] == "num_permission_sets"
    assert FEATURE_NAMES[-1] == "permission_breadth_score"


def test_at_least_one_anomaly_planted():
    """Every persona should produce at least one anomaly given a reasonable
    user count."""
    for persona in ("small_business", "mid_market", "enterprise"):
        org = generate_org(persona=persona, seed=7)
        assert org.n_anomalies() >= 1, f"{persona} produced no anomalies"


def test_each_archetype_can_be_planted():
    """Across many random seeds, every archetype should appear at least
    once. If one never appears, its planter has a bug or is gated by an
    impossible precondition."""
    seen: set[AnomalyArchetype] = set()
    for seed in range(50):
        org = generate_org(persona="mid_market", seed=seed)
        for u in org.users:
            if u.anomaly_archetype is not None:
                seen.add(u.anomaly_archetype)
        if len(seen) == len(AnomalyArchetype):
            break
    missing = set(AnomalyArchetype) - seen
    assert not missing, f"Archetypes never planted across 50 seeds: {missing}"


def test_anomaly_count_roughly_matches_prevalence():
    """Generate a mid-market org with explicit prevalence and verify the
    number of planted anomalies is within a tolerance of n_users * prevalence."""
    org = generate_org(
        persona="mid_market", seed=11, n_users=500, anomaly_prevalence=0.02,
    )
    expected = 500 * 0.02
    assert abs(org.n_anomalies() - expected) <= 3, (
        f"Expected ~{expected} anomalies, got {org.n_anomalies()}"
    )


def test_normal_users_outnumber_anomalies():
    org = generate_org(persona="small_business", seed=2, n_users=80)
    n_normal = sum(1 for u in org.users if not u.is_anomaly)
    assert n_normal >= 0.85 * len(org.users), (
        "Normal users should be the overwhelming majority"
    )


def test_labels_array_matches_users():
    org = generate_org(persona="small_business", seed=3)
    y = org.labels()
    assert y.shape == (len(org.users),)
    assert int(y.sum()) == org.n_anomalies()
    # Labels are 0/1 only.
    assert set(y.tolist()).issubset({0, 1})


def test_dormant_powerful_user_has_high_last_login_days():
    """The dormant archetype must mutate last_login_days_ago into a high
    value — otherwise the planter isn't doing its job."""
    found = False
    for seed in range(50):
        org = generate_org(persona="enterprise", seed=seed)
        for u in org.users:
            if u.anomaly_archetype == AnomalyArchetype.DORMANT_POWERFUL:
                assert u.last_login_days_ago >= 90, (
                    f"Dormant user has last_login_days_ago={u.last_login_days_ago}; "
                    f"expected >= 90"
                )
                found = True
                break
        if found:
            break
    assert found, "DORMANT_POWERFUL never planted across 50 seeds"


def test_over_privileged_user_keeps_junior_profile():
    """The OVER_PRIVILEGED mutation should keep the user's junior profile
    name — the mismatch is part of the signal."""
    found = False
    junior_names = {
        "Standard User", "Sales Rep", "Support Agent", "Marketing User", "Read Only",
    }
    for seed in range(50):
        org = generate_org(persona="enterprise", seed=seed)
        for u in org.users:
            if u.anomaly_archetype == AnomalyArchetype.OVER_PRIVILEGED:
                assert u.profile_name in junior_names, (
                    f"OVER_PRIVILEGED user has profile_name={u.profile_name}; "
                    f"expected one of {junior_names}"
                )
                found = True
                break
        if found:
            break
    assert found, "OVER_PRIVILEGED never planted across 50 seeds"


def test_persona_user_counts_in_range():
    """Sanity check that user counts respect persona ranges."""
    small = generate_org(persona="small_business", seed=1)
    mid = generate_org(persona="mid_market", seed=1)
    enterprise = generate_org(persona="enterprise", seed=1)
    assert 25 <= len(small.users) <= 100
    assert 200 <= len(mid.users) <= 1000
    assert 2000 <= len(enterprise.users) <= 10000


def test_invalid_persona_raises():
    with pytest.raises(ValueError):
        generate_org(persona="not_a_persona", seed=1)


def test_to_dict_round_trip_basic_keys():
    """Smoke test: to_dict produces JSON-serializable output with the
    expected top-level keys."""
    import json
    org = generate_org(persona="small_business", seed=99)
    d = org.to_dict()
    json.dumps(d, default=str)  # must be serializable
    assert d["persona"] == "small_business"
    assert d["seed"] == 99
    assert d["n_users"] == len(org.users)
    assert d["n_anomalies"] == org.n_anomalies()
    assert len(d["users"]) == len(org.users)
