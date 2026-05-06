"""Statistical helpers for the benchmark report.

These are the primitives the analysis notebook builds the result tables
and significance heatmaps from. Everything is intentionally framework-light
(numpy + scipy) so the notebook stays portable.
"""
from __future__ import annotations

from typing import Iterable, List, Sequence, Tuple

import numpy as np
import pandas as pd
from scipy import stats


def bootstrap_ci(
    values: Sequence[float],
    n_resamples: int = 10_000,
    confidence: float = 0.95,
    seed: int = 42,
) -> Tuple[float, float, float]:
    """Bootstrap confidence interval for the mean of `values`.

    Returns (mean, lower_bound, upper_bound) at the requested confidence
    level. We use the percentile method — simple and well-behaved for
    bounded metrics like precision/recall.
    """
    arr = np.asarray(list(values), dtype=np.float64)
    if arr.size == 0:
        return (0.0, 0.0, 0.0)
    rng = np.random.default_rng(seed)
    n = arr.size
    means = np.empty(n_resamples, dtype=np.float64)
    for i in range(n_resamples):
        means[i] = arr[rng.integers(0, n, size=n)].mean()
    alpha = 1 - confidence
    lo = float(np.quantile(means, alpha / 2))
    hi = float(np.quantile(means, 1 - alpha / 2))
    return (float(arr.mean()), lo, hi)


def wilcoxon_paired(
    a: Sequence[float],
    b: Sequence[float],
) -> Tuple[float, float]:
    """Wilcoxon signed-rank test on paired samples (a vs b).

    Returns (statistic, p_value). The two samples must be paired — same
    length, same dataset/seed at each index. Tests the null hypothesis
    that the median of (a - b) is 0.

    If all paired differences are zero, scipy raises; we catch it and
    return (0, 1.0) to signal "no measurable difference."
    """
    a_arr = np.asarray(list(a), dtype=np.float64)
    b_arr = np.asarray(list(b), dtype=np.float64)
    if a_arr.shape != b_arr.shape:
        raise ValueError(f"Length mismatch: {a_arr.shape} vs {b_arr.shape}")
    diffs = a_arr - b_arr
    if np.allclose(diffs, 0):
        return (0.0, 1.0)
    try:
        result = stats.wilcoxon(a_arr, b_arr, zero_method="zsplit")
        return (float(result.statistic), float(result.pvalue))
    except ValueError:
        # All-zero differences edge case (rare but possible after the
        # zero-mass check above).
        return (0.0, 1.0)


def bonferroni_correct(p_values: Iterable[float], n_comparisons: int) -> List[float]:
    """Bonferroni-corrected p-values: clip(p * n_comparisons, 0, 1).

    The corrected p represents the family-wise error rate when running
    `n_comparisons` simultaneous tests. Conservative but the standard
    choice for the pairwise-algorithm matrix in a benchmark paper.
    """
    return [min(1.0, max(0.0, p * n_comparisons)) for p in p_values]


def pairwise_significance(
    df: pd.DataFrame,
    metric: str,
    pair_keys: Sequence[str] = ("dataset_id", "seed"),
) -> pd.DataFrame:
    """Build the full pairwise significance matrix for one metric.

    For each ordered pair (algo_A, algo_B), compute Wilcoxon paired-test
    p-value comparing algo_A's metric values against algo_B's, paired by
    `pair_keys`. Apply Bonferroni correction across all pairs.

    Returns a DataFrame with columns:
        algo_a, algo_b, mean_diff, raw_p, adj_p, n_pairs

    `mean_diff` is mean(metric[a]) - mean(metric[b]); positive means a
    beats b on this metric.
    """
    algos = sorted(df["algo"].unique())
    rows: List[dict] = []

    # Pivot to (pair_keys × algo) so we can pair samples easily
    wide = df.pivot_table(
        index=list(pair_keys), columns="algo", values=metric, aggfunc="first"
    )

    pairs = [(a, b) for a in algos for b in algos if a != b]
    raw_ps: List[float] = []
    cached: List[Tuple[str, str, float, float, int]] = []

    for a, b in pairs:
        # Drop rows where either column is NaN (algo failed on that pair)
        sub = wide[[a, b]].dropna()
        if sub.empty:
            cached.append((a, b, 0.0, 1.0, 0))
            raw_ps.append(1.0)
            continue
        a_vals = sub[a].to_numpy()
        b_vals = sub[b].to_numpy()
        _, raw_p = wilcoxon_paired(a_vals, b_vals)
        mean_diff = float(a_vals.mean() - b_vals.mean())
        cached.append((a, b, mean_diff, raw_p, len(sub)))
        raw_ps.append(raw_p)

    n_comparisons = len(pairs)
    adj_ps = bonferroni_correct(raw_ps, n_comparisons)

    for (a, b, mean_diff, raw_p, n_pairs), adj_p in zip(cached, adj_ps):
        rows.append({
            "algo_a": a,
            "algo_b": b,
            "mean_diff": mean_diff,
            "raw_p": raw_p,
            "adj_p": adj_p,
            "n_pairs": n_pairs,
        })

    return pd.DataFrame(rows)


def summary_table(
    df: pd.DataFrame,
    metric: str,
    confidence: float = 0.95,
    seed: int = 42,
) -> pd.DataFrame:
    """Per-algorithm summary: mean, std, 95% bootstrap CI, n_runs.

    Returns DataFrame indexed by algo, sorted by mean descending.
    """
    rows: List[dict] = []
    for algo, group in df.groupby("algo"):
        vals = group[metric].dropna().to_numpy()
        mean, lo, hi = bootstrap_ci(
            vals, n_resamples=10_000, confidence=confidence, seed=seed,
        )
        rows.append({
            "algo": algo,
            "n_runs": len(vals),
            "mean": mean,
            "ci_lower": lo,
            "ci_upper": hi,
            "std": float(vals.std()) if len(vals) else 0.0,
        })
    return (
        pd.DataFrame(rows)
        .set_index("algo")
        .sort_values("mean", ascending=False)
    )
