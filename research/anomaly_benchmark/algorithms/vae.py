"""Variational AutoEncoder anomaly detection (PyOD, PyTorch backend).

Probabilistic AE: anomaly score combines reconstruction error and KL
divergence from the latent prior. Often more robust than vanilla AE on
small datasets because the variational regularizer prevents overfit."""
from __future__ import annotations

from pyod.models.vae import VAE

from . import register
from ._pyod_base import _PyODAdapter


class VAEDetector(_PyODAdapter):
    name = "vae"

    def __init__(self, seed: int = 42, epoch_num: int = 30):
        try:
            model = VAE(
                encoder_neuron_list=[8, 4],
                decoder_neuron_list=[4, 8],
                latent_dim=2,
                epoch_num=epoch_num,
                batch_size=32,
                random_state=seed,
                verbose=0,
            )
        except TypeError:
            # Older PyOD VAE signature
            model = VAE(
                encoder_neurons=[8, 4],
                decoder_neurons=[4, 8],
                latent_dim=2,
                epochs=epoch_num,
                batch_size=32,
                random_state=seed,
                verbose=0,
            )
        super().__init__(model=model, seed=seed)


register("vae", VAEDetector)
