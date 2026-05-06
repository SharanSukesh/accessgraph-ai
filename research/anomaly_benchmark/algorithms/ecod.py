"""ECOD (Empirical CDF Outlier Detection). Parameter-free, fast.

Model-free baseline: estimates each feature's empirical CDF, then sums
log-tail probabilities across features for each row. State of the art
for tabular anomaly detection per recent literature; very competitive
with iForest and runs in O(n log n)."""
from __future__ import annotations

from pyod.models.ecod import ECOD

from . import register
from ._pyod_base import _PyODAdapter


class ECODDetector(_PyODAdapter):
    name = "ecod"

    def __init__(self, seed: int = 42):
        super().__init__(model=ECOD(), seed=seed)


register("ecod", ECODDetector)
