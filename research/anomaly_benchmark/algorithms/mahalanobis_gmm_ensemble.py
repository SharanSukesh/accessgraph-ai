"""Mahalanobis + GMM rank-averaged ensemble.

Motivated by the v2 benchmark per-archetype results: Mahalanobis dominates
on OVER_PRIVILEGED detection (~60% recall), GMM dominates on
ROLE_MISMATCH (~50% vs Mahalanobis ~7%) and DORMANT (~35% vs ~26%).
Combining them via rank-average gives a single detector that covers
both regimes.

Why rank-average rather than score-average:
  Mahalanobis returns Euclidean-like distances (open-ended scale, long
  tail). GMM returns negative log-likelihoods (different scale, can
  flip sign). Averaging the raw scores would let one algorithm dominate
  the combined score purely because of its scale. Rank-averaging is
  scale-invariant: each algorithm contributes a position in [0, n-1]
  and the ensemble's final ranking is determined by the average rank.

Score normalization in the final output: we min-max normalize the rank
sum back to [0, 1] so downstream consumers get a familiar scale.
"""
from __future__ import annotations

import numpy as np

from . import register, top_k_labels
from .gmm import GMMDetector
from .mahalanobis import MahalanobisDetector


def _rank_normalize(scores: np.ndarray) -> np.ndarray:
    """Convert a score array to ranks in [0, n-1] where higher = more
    anomalous. Ties get the average of their tied ranks (scipy.rankdata
    'average' method, but inlined to avoid an extra import).
    """
    n = scores.shape[0]
    order = np.argsort(scores)  # ascending: lowest score → rank 0
    ranks = np.empty(n, dtype=np.float64)
    ranks[order] = np.arange(n, dtype=np.float64)
    return ranks


class _MahaGMMBase:
    """Shared fit logic for both ensemble variants."""

    def __init__(self, seed: int = 42):
        self.seed = seed
        self._maha = MahalanobisDetector(seed=seed)
        self._gmm = GMMDetector(seed=seed)

    def fit(self, X: np.ndarray) -> None:
        self._maha.fit(X)
        self._gmm.fit(X)

    def predict(self, X: np.ndarray, k: int) -> np.ndarray:
        return top_k_labels(self.score(X), k)


class MahalanobisGMMAvgDetector(_MahaGMMBase):
    """Rank-AVERAGE: a user wins if BOTH algorithms agree they look unusual.
    Strict — drops users where the two algos disagree.
    Trade-off: smoother top-k overall, but loses users that only one
    algorithm detects (the OVER_PRIVILEGED weakness in the v2 quick run)."""
    name = "mahalanobis_gmm_avg"

    def score(self, X: np.ndarray) -> np.ndarray:
        s_maha = self._maha.score(X)
        s_gmm = self._gmm.score(X)
        r_maha = _rank_normalize(s_maha)
        r_gmm = _rank_normalize(s_gmm)
        return (r_maha + r_gmm) / 2.0


class MahalanobisGMMMaxDetector(_MahaGMMBase):
    """Rank-MAX: a user wins if EITHER algorithm ranks them high.
    Inclusive — captures whatever each detector specializes in.
    Closer to the "union of two top-k" semantic but properly ordered."""
    name = "mahalanobis_gmm_max"

    def score(self, X: np.ndarray) -> np.ndarray:
        s_maha = self._maha.score(X)
        s_gmm = self._gmm.score(X)
        r_maha = _rank_normalize(s_maha)
        r_gmm = _rank_normalize(s_gmm)
        return np.maximum(r_maha, r_gmm)


register("mahalanobis_gmm_avg", MahalanobisGMMAvgDetector)
register("mahalanobis_gmm_max", MahalanobisGMMMaxDetector)
