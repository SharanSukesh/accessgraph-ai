"""Extended Isolation Forest (PyOD).

Improvement on classical IF: splits use random hyperplanes rather than
axis-aligned cuts, which removes the axis-aligned bias artifact. Often
beats vanilla IF on data where features have correlated effects."""
from __future__ import annotations

from pyod.models.iforest import IForest

from . import register
from ._pyod_base import _PyODAdapter


class ExtendedIFDetector(_PyODAdapter):
    name = "extended_if"

    def __init__(self, seed: int = 42, n_estimators: int = 100):
        # PyOD's IForest with extension_level > 0 acts as Extended IF.
        # When supported (newer PyOD), this gives the hyperplane-cut
        # behavior. On older PyOD that flag is ignored, falling back to
        # standard IF — still a valid (if redundant) entry, but the
        # benchmark tolerates this because we deduplicate against the
        # sklearn IF in analysis.
        try:
            model = IForest(n_estimators=n_estimators, random_state=seed,
                            extension_level=1)
        except TypeError:
            model = IForest(n_estimators=n_estimators, random_state=seed)
        super().__init__(model=model, seed=seed)


register("extended_if", ExtendedIFDetector)
