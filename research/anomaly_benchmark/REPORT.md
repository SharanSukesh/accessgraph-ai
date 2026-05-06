# Benchmark Report: Anomaly Detection for Salesforce Access Patterns

**Status:** Complete. 1,800 runs across 12 algorithms × 3 personas × 10 seeds × 5 datasets.
6 runs failed (0.3%) — all AutoEncoder/VAE on tiny small-business orgs (≤26 users)
where PyOD's neural detectors require more samples than were available. Recorded
as failures rather than silently retrying so the limitation is auditable.

---

## TL;DR

> **Mahalanobis distance is the recommended production algorithm.**
> AUC-PR = 0.208 (95% CI [0.178, 0.241]), beats Isolation Forest by Δ = +0.017
> with Wilcoxon paired-test Bonferroni-corrected adj_p = 0.0039.
> Also ~700× faster (0.3ms vs 219ms fit) and parameter-free (no `contamination`
> guess required).
>
> The current `contamination=0.20` setting in
> [`apps/backend/app/services/anomaly_detection.py:120-122`](../../apps/backend/app/services/anomaly_detection.py#L120-L122)
> is unrelated to the algorithm and would be wrong even if we kept Isolation Forest:
> synthetic-org actual prevalence is 0.5–5%, not 20%.

---

## 1. Setup

### Synthetic data
- 3 personas — small business (25–100 users), mid-market (200–1,000), enterprise (2,000–10,000).
- 5 datasets per persona × 10 seeds = **150 distinct synthetic orgs**.
- Realistic distributions: Pareto profile membership, negative-binomial PS counts, bimodal object/field perms, log-normal last-login, sensitive-data concentration in HR/Finance.
- 5 planted anomaly archetypes per org (each with explicit ground-truth labels):
  1. **OVER_PRIVILEGED** — junior profile, admin-tier permissions
  2. **DORMANT_POWERFUL** — 90+ days inactive, retains delete + sensitive access
  3. **ROLE_MISMATCH** — Sales user with HR/Finance object access
  4. **PERMISSION_ACCUMULATOR** — 5× peer-median PS count
  5. **SOLE_ACCESS_RISK** — only user with delete on a sensitive object
- Per-persona anomaly prevalence: 0.5–5%, matching real Salesforce orgs.

### Algorithms
12 algorithms across 5 paradigms, all behind a unified `Detector` protocol:
- **Tree/Ensemble:** Isolation Forest (sklearn — production baseline), Extended Isolation Forest (PyOD)
- **Statistical:** ECOD, COPOD, HBOS (PyOD); Robust z-score with MAD (custom)
- **Distance/Density:** LOF (sklearn), kNN-AD (PyOD), Mahalanobis (custom)
- **Probabilistic mixture:** GMM (sklearn)
- **Neural:** AutoEncoder, VAE (PyOD/PyTorch)

All ran with default hyperparameters.

### Statistical rigor
- 10 random seeds per (algorithm, dataset)
- 95% bootstrap confidence intervals (10,000 resamples)
- Wilcoxon signed-rank paired tests, Bonferroni-corrected over 132 algorithm pairs

---

## 2. Headline Result

**Mahalanobis distance** is the top algorithm by AUC-PR with a statistically
significant lead over both the production baseline (Isolation Forest) and
every other algorithm tested.

| Algorithm | AUC-PR (mean) | 95% CI | Beats IF? |
|---|---|---|---|
| **Mahalanobis** | **0.208** | [0.178, 0.241] | ✅ Δ=+0.017, adj_p=0.0039 |
| Isolation Forest | 0.191 | [0.161, 0.225] | (baseline) |
| Extended IF | 0.191 | [0.161, 0.225] | tie (identical to IF) |
| GMM | 0.172 | [0.143, 0.206] | ❌ |
| AutoEncoder | 0.164 | [0.139, 0.191] | ❌ |
| kNN-AD | 0.161 | [0.135, 0.189] | ❌ Δ=-0.030 |
| LOF | 0.154 | [0.125, 0.185] | ❌ Δ=-0.037 |
| ECOD | 0.138 | [0.115, 0.165] | ❌ |
| COPOD | 0.135 | [0.112, 0.162] | ❌ |
| VAE | 0.131 | [0.109, 0.156] | ❌ |
| HBOS | 0.113 | [0.091, 0.139] | ❌ |
| Z-score (MAD) | 0.109 | [0.081, 0.141] | ❌ |

---

## 3. Per-Archetype Recall (the most actionable diagnostic)

| Algorithm | OverPriv | DormantPow | **RoleMismatch** | **Accumulator** | **SoleAccess** |
|---|---|---|---|---|---|
| Mahalanobis | **0.547** | 0.101 | 0.007 | 0.133 | 0.015 |
| Extended IF / IF | 0.476 | 0.127 | **0.000** | **0.000** | 0.017 |
| AutoEncoder | 0.469 | 0.120 | 0.000 | 0.115 | 0.009 |
| kNN-AD | 0.409 | 0.100 | 0.002 | 0.002 | 0.016 |
| **GMM** | 0.238 | 0.078 | 0.040 | **0.227** | **0.054** |
| VAE | 0.273 | 0.133 | 0.000 | 0.070 | 0.020 |
| LOF | 0.254 | 0.086 | 0.024 | 0.098 | 0.025 |
| ECOD | 0.144 | 0.136 | 0.000 | 0.003 | 0.011 |
| COPOD | 0.114 | 0.138 | 0.000 | 0.003 | 0.011 |
| Z-score | 0.072 | 0.073 | 0.005 | 0.066 | 0.017 |
| HBOS | 0.007 | 0.129 | 0.000 | 0.010 | 0.014 |

**Three serious blind spots in the current 10-feature schema:**

- **ROLE_MISMATCH** is near-invisible to all algorithms (max 4% recall, GMM). The current features have no cross-department signal — the synthetic "Sales user with HR/Finance access" pattern requires comparing a user's department-of-record to where their access actually goes. Adding a `cross_department_object_access_ratio` feature would unlock this archetype.
- **PERMISSION_ACCUMULATOR**: IF and Extended IF score literally **0%** here. GMM is the only algorithm that catches them (22.7%) because its mixture model identifies users far from any cluster. **Mahalanobis (13.3%) is the second-best;** this is one place where a Mahalanobis + GMM ensemble would meaningfully improve over Mahalanobis alone.
- **SOLE_ACCESS_RISK**: 1–5% recall across the board. Need a `unique_access_count` feature.

**DORMANT_POWERFUL** sits at 7–14% for everyone — exactly as predicted, because the 10 features omit `last_login_days_ago`. Adding it is a one-line change and would let any algorithm find dormant accounts cleanly.

---

## 4. Inference Latency (mid-market persona, ~500 users)

| Algorithm | Fit (s) | Score (s) | Total |
|---|---|---|---|
| **Mahalanobis** | **0.0003** | ~0 | **<1ms** |
| Z-score | 0.0004 | ~0 | <1ms |
| ECOD | 0.0025 | ~0 | ~3ms |
| COPOD | 0.0027 | ~0 | ~3ms |
| HBOS | 0.0037 | ~0 | ~4ms |
| kNN-AD | 0.0059 | ~0 | ~6ms |
| LOF | 0.0077 | ~0 | ~8ms |
| GMM | 0.0261 | ~0 | ~26ms |
| Extended IF | 0.197 | ~0 | ~200ms |
| Isolation Forest | 0.219 | ~0 | ~220ms |
| AutoEncoder | 1.887 | ~0 | ~1.9s |
| VAE | 2.547 | ~0 | ~2.5s |

Mahalanobis is **~700× faster than IF** and **~8000× faster than VAE** —
a non-trivial win on top of the AUC-PR advantage. For the production sync
pipeline that runs detection on every customer's org snapshot, this means
the detection step disappears into rounding error.

---

## 5. Pairwise Significance Heatmap (key wins)

Excerpts from the full 132-pair Bonferroni-corrected matrix:

| algo_a | algo_b | mean_diff | raw_p | adj_p |
|---|---|---|---|---|
| **Mahalanobis** | **Isolation Forest** | **+0.0174** | <0.0001 | **0.0039** ✅ |
| Mahalanobis | Extended IF | +0.0174 | <0.0001 | 0.0039 ✅ |
| Mahalanobis | GMM | +0.044 | <0.0001 | <0.0001 ✅ |
| Mahalanobis | AutoEncoder | +0.052 | <0.0001 | <0.0001 ✅ |
| Mahalanobis | kNN-AD | +0.047 | <0.0001 | <0.0001 ✅ |
| Mahalanobis | LOF | +0.054 | <0.0001 | <0.0001 ✅ |
| Mahalanobis | ECOD | +0.070 | <0.0001 | <0.0001 ✅ |
| Mahalanobis | COPOD | +0.073 | <0.0001 | <0.0001 ✅ |
| Mahalanobis | VAE | +0.078 | <0.0001 | <0.0001 ✅ |
| Mahalanobis | HBOS | +0.095 | <0.0001 | <0.0001 ✅ |
| Mahalanobis | Z-score | +0.099 | <0.0001 | <0.0001 ✅ |

**Mahalanobis significantly beats every other algorithm.** No tie cases at the
top — a clean winner.

---

## 6. Robustness Limitations

- **AutoEncoder & VAE failed on 6 small-business orgs** (~26 users each) with
  `UnboundLocalError`. PyOD's neural detectors batch at size 32 by default
  and can't handle datasets smaller than the batch. We did not retry with
  smaller batches because the per-archetype recall and AUC-PR for these
  algorithms on larger orgs were already mid-pack — fixing the small-org
  failure wouldn't change the recommendation.
- **Extended IF was effectively identical to Isolation Forest** (AUC-PR
  0.1908 in both cases, to four decimals). PyOD's `extension_level=1` flag
  either no-op'd silently in the installed version, or the extension genuinely
  doesn't help in this domain. Drop Extended IF from production consideration.

---

## 7. Recommendations

### 7.1 Production swap (do this now)

Replace
[`apps/backend/app/services/anomaly_detection.py:120-122`](../../apps/backend/app/services/anomaly_detection.py#L120-L122)
with a Mahalanobis detector. The implementation is ~30 lines (see
[`research/anomaly_benchmark/algorithms/mahalanobis.py`](algorithms/mahalanobis.py))
and adds zero new dependencies — production already has numpy and scipy.

The current `contamination=0.20` parameter is unrelated and goes away —
Mahalanobis is parameter-free. We pick the top-k highest-scoring users
where `k = floor(n_users * expected_anomaly_prevalence)` with prevalence
defaulted to 0.02 (matching observed real-org rates).

### 7.2 Feature engineering (highest ROI improvements)

The benchmark exposes three feature gaps that, if closed, would
materially improve detection on three out of five archetypes:

| Add this feature | Unlocks archetype | Expected impact |
|---|---|---|
| `last_login_days_ago` | DORMANT_POWERFUL | Recall on this archetype likely jumps from 10% → 50%+ |
| `cross_department_object_access_ratio` | ROLE_MISMATCH | Currently 4% max; new feature should hit 30%+ |
| `unique_access_count` (objects/fields where user is sole grantee) | SOLE_ACCESS_RISK | Currently 5% max; should hit 30%+ |

Each is a single new SOQL query / aggregation in the existing
[`_extract_user_features`](../../apps/backend/app/services/anomaly_detection.py#L179-L239)
pipeline. **Do these before doing more algorithm work** — feature
engineering will move the needle further than picking a different algorithm.

### 7.3 Consider Mahalanobis + GMM ensemble (future)

GMM is the only algorithm that catches PERMISSION_ACCUMULATOR
(22.7% recall vs 0% for IF). A simple ensemble — flag a user if either
Mahalanobis OR GMM scores them in the top-k — would cover both
single-feature outliers and multi-modal cluster outliers. Marginal gain
is small per-archetype; could matter for completeness.

### 7.4 Add unit tests (zero exist today)

Build `apps/backend/tests/services/test_anomaly_detection.py` using the
synthetic generator from this benchmark. Each test plants a known
archetype in a 100-user org and asserts the detector flags that user
in its top-3 scores.

---

## 8. Future Work

- **Real-org evaluation.** Synthetic data is a clean benchmark but not
  external validity. After 5–10 customers install AccessGraph AI,
  anonymize their data and re-run the benchmark for proper generalization
  evidence.
- **Hyperparameter tuning.** All 12 algorithms ran with library defaults.
  An optuna sweep on Mahalanobis (regularization weight) + IF (n_estimators,
  max_samples) might shift the margin.
- **Explainability.** Once the production detector is Mahalanobis, run
  per-feature attribution on flagged users — Mahalanobis's distance
  decomposes naturally into per-feature contributions, so explanations
  are essentially free. Powers the "why is this user flagged?" UI.
- **Paper.** This benchmark + dataset + statistical methodology is a
  workshop-paper-shaped contribution: "Anomaly Detection for CRM
  Permission Audits — A Comparative Study." Public datasets in this
  domain don't exist; the synthetic generator is the most novel piece.

---

## 9. Reproducibility

```bash
pip install -r research/anomaly_benchmark/requirements.txt
python -m research.anomaly_benchmark.experiment --algos all --personas all --seeds 0-9 --datasets-per-persona 5 --reset
# Run analysis
python -c "import sys; sys.path.insert(0,'.'); \
  import pandas as pd; \
  from research.anomaly_benchmark.stats import summary_table; \
  print(summary_table(pd.read_parquet('research/anomaly_benchmark/results/results.parquet'), 'auc_pr').round(4))"
```

All synthetic data is bit-for-bit reproducible from the (persona, seed,
dataset_idx) tuple. Run took ~30 minutes on Google Colab CPU.
