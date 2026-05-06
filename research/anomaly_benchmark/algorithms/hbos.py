"""HBOS (Histogram-Based Outlier Score). Fastest in the benchmark.

Independence assumption between features (no joint structure modeled);
each feature gets its own histogram, anomaly score is sum of inverse
log-frequencies. Useful baseline showing what you can do with very
little compute."""
from __future__ import annotations

from pyod.models.hbos import HBOS

from . import register
from ._pyod_base import _PyODAdapter


class HBOSDetector(_PyODAdapter):
    name = "hbos"

    def __init__(self, seed: int = 42, n_bins: int = 10):
        super().__init__(model=HBOS(n_bins=n_bins), seed=seed)


register("hbos", HBOSDetector)
