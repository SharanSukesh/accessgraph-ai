"""Unit tests for _MahalanobisDetector — the production anomaly detection
core, swapped in from Isolation Forest based on the benchmark in
research/anomaly_benchmark/REPORT.md.

These are intentionally narrow: they exercise the detector with controlled
feature matrices so the assertions are about the ML core, not the wider
service layer (DB queries, peer comparison). The wider service has no
tests today; adding those is a follow-up, but at least the new ML core
is now covered.
"""
from __future__ import annotations

import numpy as np
import pytest

from app.services.anomaly_detection import (
    DEFAULT_ANOMALY_FRACTION,
    NEVER_LOGGED_IN_DAYS,
    _MahalanobisDetector,
    _classify_object_department,
)
from app.services.anomaly_detection import AnomalyDetectionService


def test_detector_flags_obvious_outlier_above_normal_users():
    """30 normal users sampled from N(0, I), one user shifted by 10 sigma.
    The outlier must score higher than every normal user."""
    rng = np.random.default_rng(seed=42)
    X_normal = rng.standard_normal((30, 10))
    X_outlier = rng.standard_normal((1, 10)) + 10.0
    X = np.vstack([X_normal, X_outlier])

    detector = _MahalanobisDetector()
    detector.fit(X)
    scores = detector.score(X)

    outlier_idx = 30
    assert scores[outlier_idx] > scores[:outlier_idx].max(), (
        f"Outlier score {scores[outlier_idx]:.3f} should beat "
        f"max normal score {scores[:outlier_idx].max():.3f}"
    )


def test_detector_score_ordering_is_stable_under_seed():
    """Same data → same scores. Required for the benchmark's
    reproducibility claim and for deterministic production behavior."""
    rng = np.random.default_rng(seed=7)
    X = rng.standard_normal((50, 10))

    a = _MahalanobisDetector()
    a.fit(X)
    sa = a.score(X)

    b = _MahalanobisDetector()
    b.fit(X)
    sb = b.score(X)

    np.testing.assert_array_equal(sa, sb)


def test_detector_handles_rank_deficient_features():
    """If every user has the same value in some feature column (rank-
    deficient covariance), the regularization fallback should keep the
    detector from blowing up. This is a real production scenario for
    small orgs where everyone has 0 PSGs."""
    rng = np.random.default_rng(seed=3)
    X = rng.standard_normal((20, 10))
    # Force column 1 (num_permission_set_groups) to be all zeros.
    X[:, 1] = 0.0

    detector = _MahalanobisDetector()
    detector.fit(X)
    scores = detector.score(X)

    assert np.all(np.isfinite(scores)), "Scores must not contain NaN/inf"
    assert scores.shape == (20,)


def test_detector_score_higher_means_more_anomalous():
    """The contract: higher score = more anomalous. The downstream
    severity logic depends on this convention."""
    rng = np.random.default_rng(seed=1)
    n_normal = 40
    X_normal = rng.standard_normal((n_normal, 10))
    # Three "anomalies" at progressively larger distances from the centroid.
    X_anomaly = np.array([
        [3.0] * 10,    # mild outlier
        [6.0] * 10,    # moderate
        [12.0] * 10,   # extreme
    ])
    X = np.vstack([X_normal, X_anomaly])

    detector = _MahalanobisDetector()
    detector.fit(X)
    scores = detector.score(X)

    # Scores for the three planted anomalies should be strictly increasing.
    assert scores[n_normal] < scores[n_normal + 1] < scores[n_normal + 2], (
        f"Mahalanobis distance must increase with feature offset: "
        f"got {scores[n_normal]:.2f} < {scores[n_normal+1]:.2f} < "
        f"{scores[n_normal+2]:.2f}"
    )


def test_detector_score_before_fit_raises():
    """Calling score() before fit() must raise — silent failure here
    would let bugs propagate into the production sync pipeline."""
    detector = _MahalanobisDetector()
    with pytest.raises(RuntimeError):
        detector.score(np.zeros((5, 10)))


def test_default_anomaly_fraction_in_realistic_range():
    """The configured anomaly fraction should match the prevalence
    range observed in real Salesforce orgs (0.5–5%). 20% (the previous
    value) was an order of magnitude wrong."""
    assert 0.005 <= DEFAULT_ANOMALY_FRACTION <= 0.05, (
        f"DEFAULT_ANOMALY_FRACTION={DEFAULT_ANOMALY_FRACTION} is outside "
        f"the observed [0.005, 0.05] range from REPORT.md"
    )


def test_detector_top_k_includes_planted_anomaly_in_realistic_org():
    """End-to-end the public contract: among 100 users with one planted
    over-privileged anomaly, top-2 (k = floor(100 * 0.02) = 2) must
    include the anomaly. Reflects how production uses the scores."""
    rng = np.random.default_rng(seed=99)
    n_users = 100
    n_features = 10
    # 99 normal users with realistic baseline access counts
    X = rng.poisson(lam=5.0, size=(n_users, n_features)).astype(float)
    # Plant an over-privileged anomaly at index 50 with admin-tier counts
    X[50] = np.array([8, 3, 120, 100, 80, 400, 300, 15, 40, 600], dtype=float)

    detector = _MahalanobisDetector()
    detector.fit(X)
    scores = detector.score(X)
    # Top-k = ceil(n * 0.02). For n=100 this is 2.
    k = max(1, int(n_users * DEFAULT_ANOMALY_FRACTION))
    top_k = set(np.argpartition(-scores, k - 1)[:k].tolist())
    assert 50 in top_k, (
        f"Planted anomaly (idx=50) must be in top-{k} flagged users; "
        f"top-{k} were {sorted(top_k)} with scores "
        f"{[round(scores[i], 2) for i in sorted(top_k)]}"
    )


# ---------------------------------------------------------------------------
# v2 feature helpers — added with the 10 → 13 feature expansion.
# ---------------------------------------------------------------------------


def test_classify_object_department_known_objects():
    """Standard SF objects should map to their canonical departments.
    The cross_department_access_ratio feature is only useful if the
    object→department classifier knows the common ones."""
    assert _classify_object_department("Account") == "Sales"
    assert _classify_object_department("Opportunity") == "Sales"
    assert _classify_object_department("Case") == "Support"
    assert _classify_object_department("Contract") == "Legal"
    assert _classify_object_department("PermissionSet") == "IT"


def test_classify_object_department_custom_prefixes():
    """Custom objects should be classified by prefix when standard
    naming patterns apply, so HR_Employee__c → 'HR' even though it's
    not in the standard map."""
    assert _classify_object_department("HR_Employee__c") == "HR"
    assert _classify_object_department("Fin_Invoice__c") == "Finance"
    assert _classify_object_department("Finance_Payment__c") == "Finance"


def test_classify_object_department_unknown_returns_none():
    """Unclassifiable objects must return None so they don't pollute the
    cross-department ratio with arbitrary assignments."""
    assert _classify_object_department("Custom_Unknown__c") is None
    assert _classify_object_department("MyRandomObj__c") is None


def test_never_logged_in_sentinel_is_high_enough_to_flag_dormancy():
    """The sentinel for users who have never logged in should be high
    enough that combined with any non-zero permissions, dormancy stands
    out. Anything < ~365 wouldn't meaningfully discriminate."""
    assert NEVER_LOGGED_IN_DAYS >= 365


def test_compute_unique_access_counts_singleton_grants():
    """Users who are the sole grantee of any (object, perm) tuple should
    have their unique_access_count incremented by 1 per such grant."""
    # Three users:
    #   alice: sole Read on HR_Employee, shares Read on Account with bob
    #   bob:   shares Read on Account with alice
    #   carol: sole Edit on Contract
    all_user_access = {
        "alice": (
            {"objects": [
                {"object": "HR_Employee__c", "access": {"read": True, "create": False, "edit": False, "delete": False}},
                {"object": "Account",         "access": {"read": True, "create": False, "edit": False, "delete": False}},
            ]},
            {"fields": []},
        ),
        "bob": (
            {"objects": [
                {"object": "Account",         "access": {"read": True, "create": False, "edit": False, "delete": False}},
            ]},
            {"fields": []},
        ),
        "carol": (
            {"objects": [
                {"object": "Contract",        "access": {"read": True, "create": False, "edit": True, "delete": False}},
            ]},
            {"fields": []},
        ),
    }
    counts = AnomalyDetectionService._compute_unique_access_counts(all_user_access)
    # alice has 1 unique grant (HR_Employee__c read)
    assert counts["alice"] == 1
    # bob shares everything → 0 unique
    assert counts["bob"] == 0
    # carol has 2 unique grants (Contract read AND Contract edit — she's the only one)
    assert counts["carol"] == 2


def test_compute_unique_access_counts_field_grants():
    """Field-level grants count toward unique_access_count too."""
    all_user_access = {
        "u1": (
            {"objects": []},
            {"fields": [
                {"objectName": "Account", "fieldName": "AnnualRevenue",
                 "access": {"read": True, "edit": False}},
            ]},
        ),
        "u2": (
            {"objects": []},
            {"fields": [
                {"objectName": "Account", "fieldName": "OtherField",
                 "access": {"read": True, "edit": False}},
            ]},
        ),
    }
    counts = AnomalyDetectionService._compute_unique_access_counts(all_user_access)
    assert counts["u1"] == 1
    assert counts["u2"] == 1


def test_compute_unique_access_counts_handles_empty_org():
    """Empty input must return an empty dict, not crash."""
    counts = AnomalyDetectionService._compute_unique_access_counts({})
    assert counts == {}
