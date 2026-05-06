# Research

Self-contained research artifacts for AccessGraph AI. Lives outside `apps/`
so its dependencies (PyOD, PyTorch, Jupyter) don't bloat the production
Docker image.

## anomaly_benchmark

Benchmarks 12 anomaly detection algorithms on a synthetic Salesforce-org
dataset with planted ground-truth anomalies. Produces a publishable-rigor
report identifying the best algorithm for production use.

```bash
cd research/anomaly_benchmark
pip install -r requirements.txt
# Generate one synthetic org for inspection
python -m research.anomaly_benchmark.data.generator --persona mid_market --seed 42
# Run the full benchmark (~2 hours on a laptop CPU)
python -m research.anomaly_benchmark.experiment --algo all --personas all --seeds 10
# Open the analysis notebook
jupyter lab research/anomaly_benchmark/analysis.ipynb
```

See `anomaly_benchmark/REPORT.md` for the final results once the benchmark
has run.
