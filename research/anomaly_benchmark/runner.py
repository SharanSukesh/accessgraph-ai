"""Single-experiment runner.

Given a (algorithm, dataset, seed) tuple, fits the algorithm, scores the
dataset, computes all metrics, and returns a flat dict suitable for
appending to the results parquet.

Time measurements are wall-clock (perf_counter), separated into fit-time
and score-time so we can report inference latency separately from training
cost in the final report.
"""
from __future__ import annotations

import time
import warnings
from dataclasses import dataclass, asdict
from typing import Any, Dict

import numpy as np

from .algorithms import get as get_detector
from .data.schemas import SyntheticOrg
from .metrics import (
    auc_pr,
    auc_roc,
    f1_at_k,
    per_archetype_recall,
    precision_at_k,
    recall_at_k,
)


@dataclass
class RunResult:
    """One row of benchmark results. Mirrors the parquet schema."""
    # identity
    algo: str
    dataset_id: str
    persona: str
    seed: int
    n_users: int
    n_anomalies: int
    # metrics
    precision_at_k: float
    recall_at_k: float
    f1_at_k: float
    auc_roc: float
    auc_pr: float
    # timing (seconds)
    fit_seconds: float
    score_seconds: float
    # per-archetype recall, flattened with prefix
    recall_over_privileged: float
    recall_dormant_but_powerful: float
    recall_role_mismatch: float
    recall_permission_accumulator: float
    recall_sole_access_risk: float
    # error tracking
    failed: bool
    error_message: str

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


def run_experiment(
    algo_name: str,
    org: SyntheticOrg,
    seed: int,
) -> RunResult:
    """Fit an algorithm on one synthetic org, score, compute all metrics.

    Wraps everything in try/except so a single algorithm crashing on a
    pathological org doesn't kill the whole sweep — failures get recorded
    with `failed=True` and the error message.
    """
    X = org.feature_matrix()
    y = org.labels()
    archetypes = org.archetype_labels()
    n_users = len(org.users)
    n_anomalies = int(y.sum())
    k = max(1, n_anomalies)  # use ground-truth count as the precision@k threshold

    # Defaults so we can construct a RunResult even on failure
    fit_seconds = 0.0
    score_seconds = 0.0
    metrics_zero = dict(
        precision_at_k=0.0, recall_at_k=0.0, f1_at_k=0.0,
        auc_roc=0.5, auc_pr=0.0,
        recall_over_privileged=0.0,
        recall_dormant_but_powerful=0.0,
        recall_role_mismatch=0.0,
        recall_permission_accumulator=0.0,
        recall_sole_access_risk=0.0,
    )

    failed = False
    error_message = ""

    try:
        detector = get_detector(algo_name, seed=seed)

        # Fit
        t0 = time.perf_counter()
        with warnings.catch_warnings():
            # Suppress sklearn convergence warnings — they're noise at scale.
            warnings.simplefilter("ignore")
            detector.fit(X)
        fit_seconds = time.perf_counter() - t0

        # Score
        t0 = time.perf_counter()
        scores = detector.score(X)
        score_seconds = time.perf_counter() - t0

        # Metrics
        metrics = dict(
            precision_at_k=precision_at_k(y, scores, k),
            recall_at_k=recall_at_k(y, scores, k),
            f1_at_k=f1_at_k(y, scores, k),
            auc_roc=auc_roc(y, scores),
            auc_pr=auc_pr(y, scores),
        )
        per_arch = per_archetype_recall(y, scores, archetypes, k)
        # Map archetype enum-values to RunResult field names
        metrics.update({
            "recall_over_privileged": per_arch.get("over_privileged", 0.0),
            "recall_dormant_but_powerful": per_arch.get("dormant_but_powerful", 0.0),
            "recall_role_mismatch": per_arch.get("role_mismatch", 0.0),
            "recall_permission_accumulator": per_arch.get("permission_accumulator", 0.0),
            "recall_sole_access_risk": per_arch.get("sole_access_risk", 0.0),
        })

    except Exception as e:
        failed = True
        error_message = f"{type(e).__name__}: {e}"
        metrics = metrics_zero

    return RunResult(
        algo=algo_name,
        dataset_id=org.org_id,
        persona=org.persona,
        seed=seed,
        n_users=n_users,
        n_anomalies=n_anomalies,
        fit_seconds=fit_seconds,
        score_seconds=score_seconds,
        failed=failed,
        error_message=error_message,
        **metrics,
    )
