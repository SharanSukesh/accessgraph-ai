"""COPOD (Copula-Based Outlier Detection). Parameter-free.

Models the joint distribution via empirical copulas; very competitive
with ECOD. Different theoretical foundation, similar runtime profile."""
from __future__ import annotations

from pyod.models.copod import COPOD

from . import register
from ._pyod_base import _PyODAdapter


class COPODDetector(_PyODAdapter):
    name = "copod"

    def __init__(self, seed: int = 42):
        super().__init__(model=COPOD(), seed=seed)


register("copod", COPODDetector)
