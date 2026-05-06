"""Evaluation metrics for the anomaly benchmark.

All functions take y_true (0/1 ground-truth) and either y_score or y_pred,
return a float. We treat label 1 = anomaly (positive class).
"""
from __future__ import annotations

import numpy as np
from sklearn.metrics import roc_auc_score, average_precision_score


def precision_at_k(y_true: np.ndarray, y_score: np.ndarray, k: int) -> float:
    """Of the top-k highest-scoring rows, what fraction are true anomalies?

    Returns 0.0 when k=0 to avoid division by zero. The benchmark almost
    always sets k = n_true_anomalies for a clean precision/recall pair.
    """
    if k <= 0:
        return 0.0
    n = y_true.shape[0]
    k = min(k, n)
    top_k_idx = np.argpartition(-y_score, k - 1)[:k]
    return float(y_true[top_k_idx].sum() / k)


def recall_at_k(y_true: np.ndarray, y_score: np.ndarray, k: int) -> float:
    """Of all true anomalies, what fraction are in the top-k flagged rows?

    Returns 0.0 when there are no true anomalies (the metric is undefined
    in that case; 0.0 is a safe default that won't pollute averages).
    """
    n_anomalies = int(y_true.sum())
    if n_anomalies == 0 or k <= 0:
        return 0.0
    n = y_true.shape[0]
    k = min(k, n)
    top_k_idx = np.argpartition(-y_score, k - 1)[:k]
    return float(y_true[top_k_idx].sum() / n_anomalies)


def f1_at_k(y_true: np.ndarray, y_score: np.ndarray, k: int) -> float:
    """Harmonic mean of precision@k and recall@k."""
    p = precision_at_k(y_true, y_score, k)
    r = recall_at_k(y_true, y_score, k)
    if p + r == 0:
        return 0.0
    return 2 * p * r / (p + r)


def auc_roc(y_true: np.ndarray, y_score: np.ndarray) -> float:
    """Area under ROC curve. Standard threshold-free metric.

    Returns 0.5 (chance) when there's no class diversity (all 0s or all 1s).
    """
    if len(set(y_true.tolist())) < 2:
        return 0.5
    return float(roc_auc_score(y_true, y_score))


def auc_pr(y_true: np.ndarray, y_score: np.ndarray) -> float:
    """Area under precision-recall curve (= average precision).

    Better than AUC-ROC for highly imbalanced data, which is our regime
    (anomalies are <5% of users). Returns 0.0 if no positive class.
    """
    if int(y_true.sum()) == 0:
        return 0.0
    return float(average_precision_score(y_true, y_score))


def per_archetype_recall(
    y_true: np.ndarray,
    y_score: np.ndarray,
    archetype_labels: list,  # length n; None for non-anomalies, archetype enum otherwise
    k: int,
) -> dict:
    """Recall computed separately for each anomaly archetype.

    Reveals whether a detector is good at one type but blind to another.
    Returns {archetype_name: recall_float}.
    """
    n = y_true.shape[0]
    k = min(k, n)
    top_k_idx = set(np.argpartition(-y_score, k - 1)[:k].tolist())

    # Group user indices by archetype
    by_archetype: dict[str, list[int]] = {}
    for i, a in enumerate(archetype_labels):
        if a is None:
            continue
        # Accept both Enum instances and string values
        name = a.value if hasattr(a, "value") else str(a)
        by_archetype.setdefault(name, []).append(i)

    return {
        name: (
            sum(1 for i in idxs if i in top_k_idx) / len(idxs)
            if idxs else 0.0
        )
        for name, idxs in by_archetype.items()
    }
