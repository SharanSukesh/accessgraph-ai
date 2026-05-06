"""Mahalanobis-distance baseline.

Multivariate distance from the centroid, weighted by the inverse covariance
matrix. Classic textbook anomaly detector — included as a sanity baseline:
if a more sophisticated algorithm can't beat this, the data isn't actually
discriminable.
"""
from __future__ import annotations

import numpy as np
from scipy.spatial.distance import mahalanobis

from . import register, top_k_labels


class MahalanobisDetector:
    name = "mahalanobis"

    def __init__(self, seed: int = 42, regularization: float = 1e-4):
        self.seed = seed
        self.regularization = regularization
        self._mean: np.ndarray | None = None
        self._inv_cov: np.ndarray | None = None

    def fit(self, X: np.ndarray) -> None:
        self._mean = X.mean(axis=0)
        cov = np.cov(X, rowvar=False)
        # Regularize so even rank-deficient feature sets are invertible.
        n_features = cov.shape[0]
        cov = cov + self.regularization * np.eye(n_features)
        try:
            self._inv_cov = np.linalg.inv(cov)
        except np.linalg.LinAlgError:
            # Fallback: pseudo-inverse if the covariance is still singular.
            self._inv_cov = np.linalg.pinv(cov)

    def score(self, X: np.ndarray) -> np.ndarray:
        if self._mean is None or self._inv_cov is None:
            raise RuntimeError("fit() must be called before score()")
        # Vectorized Mahalanobis: sqrt((x-mean) @ inv_cov @ (x-mean))
        diff = X - self._mean
        # Per-row quadratic form: einsum is the readable + fast way.
        m2 = np.einsum("ij,jk,ik->i", diff, self._inv_cov, diff)
        # Numerical safety: clamp tiny negatives that arise from float math.
        return np.sqrt(np.maximum(m2, 0.0))

    def predict(self, X: np.ndarray, k: int) -> np.ndarray:
        return top_k_labels(self.score(X), k)


register("mahalanobis", MahalanobisDetector)
