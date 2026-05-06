"""Isolation Forest adapter (sklearn).

This is the production baseline. The benchmark runs IF with default
parameters AND with a contamination sweep (handled by the runner) so we
can answer "is contamination=0.2 (the production value) actually right?"
"""
from __future__ import annotations

import numpy as np
from sklearn.ensemble import IsolationForest

from . import Detector, register, top_k_labels


class IsolationForestDetector:
    name = "isolation_forest"

    def __init__(self, seed: int = 42, n_estimators: int = 100):
        self.seed = seed
        # contamination='auto' lets sklearn pick a reasonable default; we
        # control the actual k at predict time anyway.
        self._model = IsolationForest(
            n_estimators=n_estimators,
            contamination="auto",
            random_state=seed,
        )

    def fit(self, X: np.ndarray) -> None:
        self._model.fit(X)

    def score(self, X: np.ndarray) -> np.ndarray:
        # sklearn's score_samples: HIGHER = more normal. Negate for our
        # "higher = more anomalous" convention.
        return -self._model.score_samples(X)

    def predict(self, X: np.ndarray, k: int) -> np.ndarray:
        return top_k_labels(self.score(X), k)


register("isolation_forest", IsolationForestDetector)
