"""Robust z-score baseline using the median and median absolute deviation.

Per-feature robust standardization, then take the max absolute z-score per
row as the anomaly score. The "max" rule means a row is anomalous if ANY
single feature is way off — captures the "this user has 30 PSes when
everyone else has 3" signal cleanly.

Doesn't model feature interactions (Mahalanobis does). Included as the
simplest, most interpretable baseline — if a complex detector loses to
this, the complexity isn't earning its keep.
"""
from __future__ import annotations

import numpy as np

from . import register, top_k_labels


class ZScoreMADDetector:
    name = "zscore_mad"

    def __init__(self, seed: int = 42):
        self.seed = seed
        self._median: np.ndarray | None = None
        self._mad: np.ndarray | None = None

    def fit(self, X: np.ndarray) -> None:
        self._median = np.median(X, axis=0)
        # 1.4826 scales MAD to be a consistent estimator of the std for
        # Gaussian-distributed data. floor at a tiny value so features
        # with zero spread don't blow up the z-score.
        self._mad = 1.4826 * np.median(np.abs(X - self._median), axis=0) + 1e-9

    def score(self, X: np.ndarray) -> np.ndarray:
        if self._median is None or self._mad is None:
            raise RuntimeError("fit() must be called before score()")
        z = np.abs((X - self._median) / self._mad)
        # Take the max z-score across features for each row.
        return z.max(axis=1)

    def predict(self, X: np.ndarray, k: int) -> np.ndarray:
        return top_k_labels(self.score(X), k)


register("zscore_mad", ZScoreMADDetector)
