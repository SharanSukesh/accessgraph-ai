"""Export a trained policy from PyTorch state-dict → numpy .npz.

The production backend runs inference with numpy alone (no torch in
Railway image), so this script is the bridge: load the .pt checkpoint,
read each parameter tensor, save them all to a single .npz with
descriptive keys the inference adapter knows how to consume.

Round-trip validation lives in apps/backend/tests so a stale export
doesn't silently degrade equity recommendations in production.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np
import torch


def export_state_dict(checkpoint_path: Path, out_path: Path) -> None:
    ckpt = torch.load(checkpoint_path, map_location="cpu", weights_only=False)
    state = ckpt["state_dict"]
    arrays = {k: v.detach().cpu().numpy() for k, v in state.items()}
    arrays["__args__"] = np.array(str(ckpt.get("args", {})))
    arrays["__episode__"] = np.array(int(ckpt.get("episode", -1)))
    out_path.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(out_path, **arrays)
    print(f"Exported {len(arrays)} arrays to {out_path}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--in", dest="in_path", default="research/rl_solution/checkpoints/best.pt")
    parser.add_argument("--out", default="research/rl_solution/artifacts/policy_v1.npz")
    args = parser.parse_args()
    in_path = Path(args.in_path)
    if not in_path.exists():
        print(f"Checkpoint not found: {in_path}", file=sys.stderr)
        return 1
    export_state_dict(in_path, Path(args.out))
    return 0


if __name__ == "__main__":
    sys.exit(main())
