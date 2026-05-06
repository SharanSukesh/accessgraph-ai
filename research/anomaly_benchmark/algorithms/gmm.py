"""Gaussian Mixture Model adapter (sklearn).

We fit a small mixture and use the per-row negative log-likelihood as the
anomaly score (low likelihood => high anomaly). The number of components
is fixed at 3 since 10-dimensional synthetic feature data doesn't usually
need more, and keeping it small avoids overfitting on small orgs.
"""
from __future__ import annotations

import numpy as np
from sklearn.mixture import GaussianMixture

from . import register, top_k_labels


class GMMDetector:
    name = "gmm"

    def __init__(self, seed: int = 42, n_components: int = 3):
        self.seed = seed
        self._model = GaussianMixture(
            n_components=n_components,
            covariance_type="full",
            random_state=seed,
            reg_covar=1e-4,  # numerical stability against rank-deficient orgs
        )

    def fit(self, X: np.ndarray) -> None:
        # GMM occasionally fails to converge on tiny orgs; fall back to a
        # diagonal covariance which is more robust.
        try:
            self._model.fit(X)
        except Exception:
            self._model = GaussianMixture(
                n_components=self._model.n_components,
                covariance_type="diag",
                random_state=self.seed,
                reg_covar=1e-3,
            )
            self._model.fit(X)

    def score(self, X: np.ndarray) -> np.ndarray:
        # score_samples returns log-likelihood (higher = more normal).
        # Negate for our convention.
        return -self._model.score_samples(X)

    def predict(self, X: np.ndarray, k: int) -> np.ndarray:
        return top_k_labels(self.score(X), k)


register("gmm", GMMDetector)
