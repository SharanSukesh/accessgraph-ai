"""Local Outlier Factor adapter (sklearn)."""
from __future__ import annotations

import numpy as np
from sklearn.neighbors import LocalOutlierFactor

from . import register, top_k_labels


class LOFDetector:
    name = "lof"

    def __init__(self, seed: int = 42, n_neighbors: int = 20):
        self.seed = seed
        # novelty=True lets us score new data with the trained model
        # (rather than score only the training set).
        self._model = LocalOutlierFactor(
            n_neighbors=n_neighbors,
            novelty=True,
        )

    def fit(self, X: np.ndarray) -> None:
        # LOF doesn't take a random_state — it's deterministic given the
        # neighborhood graph. seed is stored on self for protocol parity.
        self._model.fit(X)

    def score(self, X: np.ndarray) -> np.ndarray:
        # score_samples: higher = more normal (matches sklearn convention).
        # Negate for our convention.
        return -self._model.score_samples(X)

    def predict(self, X: np.ndarray, k: int) -> np.ndarray:
        return top_k_labels(self.score(X), k)


register("lof", LOFDetector)
