"""AutoEncoder anomaly detection (PyOD, PyTorch backend).

Trains a small dense AutoEncoder (10 → 8 → 4 → 8 → 10) on the org's
feature matrix. Anomaly score = reconstruction error per row. Anomalies
have high reconstruction error because the AE learned to compress the
majority pattern.

Compute footprint is small enough to run on a laptop CPU even for
enterprise-tier orgs (~10k users)."""
from __future__ import annotations

from pyod.models.auto_encoder import AutoEncoder

from . import register
from ._pyod_base import _PyODAdapter


class AutoEncoderDetector(_PyODAdapter):
    name = "autoencoder"

    def __init__(self, seed: int = 42, epoch_num: int = 30):
        # Small dense AE suitable for 10-feature input. Bigger nets just
        # overfit on this scale of data.
        # PyOD's AutoEncoder uses PyTorch under the hood. The hidden_neuron_list
        # describes the encoder shape (decoder is mirrored automatically).
        try:
            model = AutoEncoder(
                hidden_neuron_list=[8, 4],
                epoch_num=epoch_num,
                batch_size=32,
                random_state=seed,
                verbose=0,
            )
        except TypeError:
            # Older PyOD signatures used different kwarg names
            model = AutoEncoder(
                hidden_neurons=[8, 4, 8],
                epochs=epoch_num,
                batch_size=32,
                random_state=seed,
                verbose=0,
            )
        super().__init__(model=model, seed=seed)


register("autoencoder", AutoEncoderDetector)
