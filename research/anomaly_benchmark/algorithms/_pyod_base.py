"""Common base for PyOD-backed adapters. PyOD's BaseDetector already gives
us decision_function (higher = more anomalous), so the adapter is almost
a one-liner — but keeping it in one place ensures consistent error handling
when PyOD isn't installed."""
from __future__ import annotations

from typing import Any

import numpy as np

from . import top_k_labels


class _PyODAdapter:
    """Wraps any PyOD detector instance under our Detector protocol."""

    name: str = "pyod_base"

    def __init__(self, model: Any, seed: int = 42):
        self.seed = seed
        self._model = model  # PyOD BaseDetector instance, already configured

    def fit(self, X: np.ndarray) -> None:
        self._model.fit(X)

    def score(self, X: np.ndarray) -> np.ndarray:
        # PyOD convention: decision_function returns higher = more anomalous.
        # Same convention as us, no sign flip needed.
        return np.asarray(self._model.decision_function(X))

    def predict(self, X: np.ndarray, k: int) -> np.ndarray:
        return top_k_labels(self.score(X), k)
