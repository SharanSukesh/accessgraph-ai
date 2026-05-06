"""kNN-based anomaly detection (PyOD KNN).

Anomaly score = distance to k-th nearest neighbor (or mean of distances
to k nearest). Density-aware; complements LOF which uses local density
ratios. Slower than tree-based methods on big orgs."""
from __future__ import annotations

from pyod.models.knn import KNN

from . import register
from ._pyod_base import _PyODAdapter


class KNNADDetector(_PyODAdapter):
    name = "knn_ad"

    def __init__(self, seed: int = 42, n_neighbors: int = 5):
        # method='largest' means use the k-th nearest distance as the score
        # (vs 'mean' or 'median'). 'largest' is the most strict — captures
        # the "this user is far from everyone" case.
        super().__init__(
            model=KNN(n_neighbors=n_neighbors, method="largest"),
            seed=seed,
        )


register("knn_ad", KNNADDetector)
