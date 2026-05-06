"""Anomaly-detection algorithm adapters under a unified Detector protocol.

Every adapter exposes the same interface:

    detector = SomeDetector(seed=42)
    detector.fit(X)
    scores = detector.score(X)               # higher = more anomalous
    labels = detector.predict(X, k=10)       # 1 for top-k flagged, 0 otherwise

The runner consumes this interface; nothing else cares about the underlying
library (sklearn vs PyOD vs custom). To add a new algorithm, write a new
adapter file and register it in `_REGISTRY` below.
"""
from __future__ import annotations

from typing import Callable, Dict, Optional, Protocol, Tuple

import numpy as np


class Detector(Protocol):
    """Common surface every algorithm exposes.

    Conventions:
      - `seed` is set in __init__; algorithms must respect it for repro.
      - `fit(X)` builds whatever internal state the algo needs from X
        (an unsupervised n_users × n_features matrix).
      - `score(X)` returns a 1-D array of anomaly scores in the SAME ORDER
        as X, where HIGHER means MORE ANOMALOUS. Adapters normalize the
        sign for sklearn algos that natively return "lower = more anomalous".
      - `predict(X, k)` returns a 1-D 0/1 int array marking the top-k
        highest-scoring rows as anomalies (1) and the rest as normal (0).
        Used for Precision@k / Recall@k computation.
    """
    seed: int

    def fit(self, X: np.ndarray) -> None: ...
    def score(self, X: np.ndarray) -> np.ndarray: ...
    def predict(self, X: np.ndarray, k: int) -> np.ndarray: ...


def top_k_labels(scores: np.ndarray, k: int) -> np.ndarray:
    """Mark the top-k highest-scoring rows as 1, rest as 0.

    Used by every adapter's predict() so the contamination-vs-k contract
    is consistent across the benchmark. We pick by score rank rather than
    by score threshold to avoid algorithm-specific scale issues.
    """
    n = scores.shape[0]
    k = max(0, min(k, n))
    if k == 0:
        return np.zeros(n, dtype=np.int64)
    # argpartition is O(n) — cheaper than a full sort for large n.
    threshold_idx = np.argpartition(-scores, k - 1)[:k]
    labels = np.zeros(n, dtype=np.int64)
    labels[threshold_idx] = 1
    return labels


# Registry of (id -> factory). Filled below by the per-algorithm modules
# importing themselves into this dict. We keep imports lazy so missing
# optional deps (pyod, torch) don't crash the entire benchmark when only
# some algorithms are requested.
_REGISTRY: Dict[str, Callable[..., Detector]] = {}


def register(name: str, factory: Callable[..., Detector]) -> None:
    """Register a Detector factory under a stable id."""
    if name in _REGISTRY:
        raise ValueError(f"Detector '{name}' already registered")
    _REGISTRY[name] = factory


def get(name: str, seed: int = 42) -> Detector:
    """Instantiate a registered detector by id. Triggers lazy imports if
    the registry is missing the requested algorithm."""
    if name not in _REGISTRY:
        _import_all()
    if name not in _REGISTRY:
        raise KeyError(
            f"Unknown detector '{name}'. Available: {sorted(_REGISTRY)}"
        )
    return _REGISTRY[name](seed=seed)


def available() -> Tuple[str, ...]:
    """Return ids of all algorithms currently importable in this environment.

    We trigger imports via _import_all() but tolerate ImportError for
    optional-dep algorithms (pyod, torch).
    """
    _import_all()
    return tuple(sorted(_REGISTRY))


def _import_all() -> None:
    """Eagerly import every adapter module so its register() side-effect fires.

    Optional-dep adapters (pyod-based, torch-based) are wrapped in try/except
    so a missing library only loses those algorithms, not the whole module."""
    # Always-available (sklearn + numpy + scipy)
    from . import isolation_forest  # noqa: F401
    from . import lof                # noqa: F401
    from . import gmm                # noqa: F401
    from . import mahalanobis        # noqa: F401
    from . import zscore_mad         # noqa: F401

    # PyOD-based: optional
    for mod in ("ecod", "copod", "hbos", "knn_ad", "extended_if"):
        try:
            __import__(f"{__name__}.{mod}")
        except ImportError:
            pass

    # PyTorch-based (still goes through PyOD): optional
    for mod in ("autoencoder", "vae"):
        try:
            __import__(f"{__name__}.{mod}")
        except ImportError:
            pass
