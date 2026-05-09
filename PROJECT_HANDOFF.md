# AccessGraph AI — Handoff for RL extension

You (the new Claude Code instance) are picking up an existing project. The
human is going to add a reinforcement-learning component on top of what's
already built, driven by a research paper they'll share next. **Read this
file end-to-end before you start.**

The goal of this doc is so you don't (a) duplicate work that's already done,
(b) break the production pipeline, or (c) try to redesign things that are
already shipped and working in production.

---

## 1. What AccessGraph AI is

A B2B SaaS analytics tool for Salesforce permissions. Customers connect
their Salesforce org via OAuth; we sync their access metadata; we detect
anomalies (over-privileged users, dormant-but-powerful, role mismatches,
permission accumulators, sole-access risks); we generate recommendations.

Distribution model: **direct via blog / LinkedIn — NOT AppExchange.** The
human decided not to pay AppExchange listing fees. There's a managed 2GP
Salesforce package (`accessgraphai` namespace) that customers install
directly via deep link.

Production:
- Backend: Railway → `api.accessgraphai.com`
- Frontend: Vercel → `app.accessgraphai.com`
- DB: PostgreSQL on Railway, Alembic-managed migrations
- Salesforce package: managed 2GP, version v1.4.0-1

---

## 2. Repo layout

```
apps/
  backend/                  FastAPI + SQLAlchemy + Alembic + Postgres
  frontend/                 Next.js 14 (App Router) + TanStack Query + TS
salesforce-package/         Managed 2GP package, namespace `accessgraphai`
research/
  anomaly_benchmark/        Synthetic-data generator + 14-algo benchmark
  paper_bundle/             Self-contained paper bundle for Deep Research
.claude/                    Claude Code settings; ignore for the most part
```

The **research/** directory is intentionally separate from apps/backend/ to
keep heavy ML deps (PyTorch, PyOD, etc.) out of the production Docker image.
**Do the same for the RL solution** — put it under `research/rl_solution/`
or similar, and only call into it from `apps/backend/` if you need to ship
inference to production. Training stays in research/.

---

## 3. The data flow (sync → detection → recs)

Critical to understand before designing the RL piece. Source files in
parens.

1. **OAuth.** User authenticates via Salesforce OAuth 2.0 with PKCE.
   Supports both `login.salesforce.com` (production orgs) and
   `test.salesforce.com` (sandbox/scratch) via `?env=sandbox` query param.
   ([apps/backend/app/api/routes/auth.py](apps/backend/app/api/routes/auth.py),
   [apps/frontend/src/lib/auth/AuthContext.tsx](apps/frontend/src/lib/auth/AuthContext.tsx))

2. **Sync trigger.** User clicks "Sync from Salesforce" in the sidebar →
   POST `/orgs/{id}/sync` → spawns an asyncio background task. Returns
   immediately; the actual sync runs 1-2 minutes.
   ([apps/frontend/src/components/layout/Sidebar.tsx](apps/frontend/src/components/layout/Sidebar.tsx),
   [apps/backend/app/api/routes/orgs.py](apps/backend/app/api/routes/orgs.py))

3. **Extraction.** `SalesforceAPIClient` pulls from SF REST API (v62.0):
   Users, Roles, Profiles, PermissionSets (incl. ~30 high-value
   `Permissions*` fields), PSAssignments, PSGroups, Object/FieldPermissions,
   Groups + Members, AccountShares, OpportunityShares, OWDs, SharingRules.
   ([apps/backend/app/salesforce/client.py](apps/backend/app/salesforce/client.py))

   The PS query has a **resilient fallback**: if the rich Permissions* query
   returns 400 (some field unsupported in this org's API version), it
   retries with just core fields. Don't break this.

4. **Persistence.** `snapshot.py` writes to UserSnapshot,
   ProfileSnapshot, PermissionSetSnapshot, ObjectPermissionSnapshot,
   FieldPermissionSnapshot, etc. Each snapshot row is timestamped
   (`captured_at`) — historical snapshots are preserved.
   ([apps/backend/app/ingestion/snapshot.py](apps/backend/app/ingestion/snapshot.py))

5. **Post-sync analysis** runs automatically:
   ([apps/backend/app/ingestion/orchestrator.py:225-251](apps/backend/app/ingestion/orchestrator.py))
   - **Anomaly detection** → AccessAnomaly rows
   - **Risk scoring** → RiskScore rows
   - **Recommendations** → Recommendation rows

---

## 4. Anomaly detection (v2, in production)

**Algorithm**: Mahalanobis + Gaussian-Mixture rank-average ensemble.
Each detector fits on the per-org user feature matrix, ranks users by
anomaly score independently, and the two ranks are averaged.

**Why this**: Selected after benchmarking 14 algorithms across 5 paradigms
(tree/ensemble, statistical, distance, mixture, neural). Beats Isolation
Forest on AUC-PR by +0.143 (65% relative), Wilcoxon p < 0.0001 with
Bonferroni correction. See [research/anomaly_benchmark/REPORT.md](research/anomaly_benchmark/REPORT.md).

**Features (13 total)** — these are also your candidate state variables
if the RL paper's state is per-user:

```
num_permission_sets
num_permission_set_groups
num_objects_read
num_objects_edit
num_objects_delete
num_fields_read
num_fields_edit
num_sensitive_objects
num_sensitive_fields
permission_breadth_score
last_login_days_ago               # v2: closes DORMANT_BUT_POWERFUL gap
cross_department_access_ratio     # v2: closes ROLE_MISMATCH gap
unique_access_count               # v2: closes SOLE_ACCESS gap
```

**Service file**: [apps/backend/app/services/anomaly_detection.py](apps/backend/app/services/anomaly_detection.py)

**5 anomaly archetypes** (planted as ground truth in the synthetic
generator — these are your reward signal candidates for RL):

1. `OVER_PRIVILEGED` — junior profile but assigned senior PS
2. `DORMANT_BUT_POWERFUL` — last login 90+ days ago + ModifyAllData/etc.
3. `ROLE_MISMATCH` — Sales user with HR/Finance access
4. `PERMISSION_ACCUMULATOR` — 5x peer-median PS assignments
5. `SOLE_ACCESS` — only user with delete on a sensitive object

---

## 5. Recommendation engine (existing)

Rule-based, runs after anomaly detection.
[apps/backend/app/services/recommendations.py](apps/backend/app/services/recommendations.py)

Output: `Recommendation` rows per (user, action) — e.g., "revoke PS X from
user Y because they haven't logged in in 120 days and have ModifyAllData."

**This is the most likely surface for RL augmentation.** The paper's RL
agent probably proposes a sequence of access changes; mapping that onto
the existing recommendations table (status: pending → applied → ignored)
gives you a clean integration without rewriting the persistence layer.

---

## 6. Synthetic data — your RL training ground

This is the most important part for the RL build. **You don't need real
customer data to train and evaluate.** [research/anomaly_benchmark/data/](research/anomaly_benchmark/data/)
generates realistic Salesforce orgs with planted ground-truth anomalies.

**Personas** (size distribution):
- Small business: 25-100 users, 3-5 profiles, 10-25 PSes
- Mid-market: 200-1,000 users, 8-15 profiles, 50-150 PSes
- Enterprise: 2,000-10,000 users, 20-50 profiles, 200-800 PSes

**Realistic distributions** modeled:
- Profile membership: Pareto / power-law
- PS count per user: Negative binomial
- Object permission breadth: bimodal (regular users 5-15, admins 50+)
- Field-level overrides: sparse (~5% of fields)

**Generate one org**:
```bash
python -m research.anomaly_benchmark.data.generator --persona mid_market --seed 42
```

**Generate the full benchmark dataset**:
```bash
python -m research.anomaly_benchmark.experiment --algo all --personas all --seeds 10
```

**For RL specifically**: the generator returns `SyntheticOrg` with
`SyntheticUser[]` where each user has `is_anomaly: bool` and
`anomaly_type: str | None`. That's your ground-truth oracle for shaping
rewards. Your environment's `step()` function would mutate the org
(grant/revoke permissions); the reward function compares the new org's
anomaly load to the old one's, weighted by the user's productivity needs.

---

## 7. Where RL likely slots in (suggested integration patterns)

The human will share a paper. Until you read it, here are the three most
likely shapes — pick the one that matches:

**Shape A — Offline policy from logged data.** State = user feature
vector. Action = revoke / keep / escalate-to-review for each PS the user
holds. Reward = anomaly score reduction minus productivity proxy. Train
on synthetic orgs, evaluate via off-policy estimation.
- Add: `research/rl_solution/policy.py`, `research/rl_solution/env.py`
- Inference call: new endpoint `/orgs/{id}/rl/recommendations` that
  returns the policy's top-k actions for currently-flagged users.

**Shape B — Sequential access optimization.** MDP per org. State = full
permission graph. Action = atomic permission change. Trajectory = a series
of access rearrangements that drive the org from initial state to a
"least-privilege equivalent" state.
- Add: `research/rl_solution/agent.py` (PPO/SAC/whatever the paper uses)
- Inference: batch job that proposes a multi-step rearrangement plan,
  surfaced in the UI as an ordered checklist.

**Shape C — Multi-agent / scheduling.** State = org snapshot + open
recommendation queue. Action = which recommendation to surface to which
admin. Reward = admin acts on it (proxied by anomaly resolution rate).
- Add: a recommendation-prioritization layer on top of existing
  Recommendation rows. Doesn't change the rule engine; just reorders.

**All three are additive.** None require modifying the existing detector
or rule engine. Pick whichever the paper actually describes.

---

## 8. What NOT to touch (production safety)

The following code paths are stable in production and the human has
explicitly asked that they be preserved:

- [apps/backend/app/services/anomaly_detection.py](apps/backend/app/services/anomaly_detection.py) — production detector, do not replace
- [apps/backend/app/services/risk_scoring.py](apps/backend/app/services/risk_scoring.py)
- [apps/backend/app/services/recommendations.py](apps/backend/app/services/recommendations.py) — you can ADD a prioritizer that consumes its output, but don't rewrite the rule engine
- [apps/backend/app/salesforce/client.py](apps/backend/app/salesforce/client.py) — sync code is fragile; don't touch unless you have to
- [apps/backend/app/ingestion/](apps/backend/app/ingestion/)
- [salesforce-package/](salesforce-package/) — managed package; only modify if the paper actually requires changes that propagate to the SF org
- Alembic migrations — only ADD new ones; never edit existing

**Adding new Python deps to `apps/backend/requirements.txt`**: ask first.
Railway image bloat matters. PyTorch, gym, stable-baselines, etc. should
go in `research/rl_solution/requirements.txt`, NOT the backend.

---

## 9. Recent commits (so you know what was just fixed and shouldn't redo)

```
2f21da8 docs: stop calling the production detector IsolationForest
7732d02 fix: anomaly score badge rendered raw float (0.9999...)
6c4600e feat: sandbox/scratch toggle on login page
17b1c3c fix: PermissionSet SOQL 400 — bumped API to v62 + resilient fallback
1315d93 fix: API client missing credentials:"include" → 401 on /auth/me
0ea9c10 fix: web app sync spinner stops after ~1s
87b40ea fix: audit middleware FK violations on non-UUID org IDs
efbfabe feat: v2 production swap to Mahalanobis+GMM ensemble + paper bundle
1ac7bc3 feat: production v2 features close DORMANT/ROLE/SOLE archetype gaps
4c48588 feat: swap production anomaly detector from IF to Mahalanobis
76b3584 feat: anomaly detection algorithm benchmark (research/anomaly_benchmark)
```

Run `git log --oneline -50` for more.

---

## 10. Key data models

[apps/backend/app/domain/models.py](apps/backend/app/domain/models.py) is
the source of truth. Highlights:

- `Organization`, `OrgConnection` — connection metadata, encrypted OAuth tokens
- `UserSnapshot` — includes `last_login_at` (added in v2)
- `ProfileSnapshot`, `PermissionSetSnapshot` (with `ps_type`), `PSGroupSnapshot`
- `ObjectPermissionSnapshot`, `FieldPermissionSnapshot`
- `AccessAnomaly` — detector output. Severity enum: Info/Low/Medium/High/Critical
- `RiskScore`, `Recommendation` — analysis outputs
- `AuditLog` — written for sensitive endpoints; FK to `organizations.id` requires UUID
- `DeeplinkRedemption` — idempotent deeplink handling for SF package quick actions

---

## 11. Operational commands

```bash
# Backend dev
cd apps/backend
uvicorn app.main:app --reload

# Frontend dev (port 3000)
cd apps/frontend
npm run dev

# Type-check frontend
cd apps/frontend && npx tsc --noEmit -p tsconfig.json

# Run a migration
cd apps/backend && alembic upgrade head

# Generate new migration (after model change)
cd apps/backend && alembic revision --autogenerate -m "description"

# Generate one synthetic org
python -m research.anomaly_benchmark.data.generator --persona mid_market --seed 42

# Run the full anomaly benchmark
python -m research.anomaly_benchmark.experiment --algo all --personas all --seeds 10

# Inspect a sync job's status
curl -sS "https://api.accessgraphai.com/orgs/{org_id}/sync-jobs"
```

---

## 12. The collaboration style the human prefers

From recent sessions:

- **Show plans before implementing** for any non-trivial change. They've
  said "discuss first, then code." For RL especially — propose the
  state/action/reward formulation and integration shape before writing.
- **Concise text replies** outside tool calls. No long preambles, no
  trailing summaries the diff already shows.
- **Don't add comments** unless they explain a non-obvious why. No code
  narration.
- **Don't add backwards-compat shims** unless asked. They prefer clean
  changes; if you remove something, remove it.
- **Frontend changes**: when changing UI, type-check before claiming done.
- **No emojis** in code, files, or chat unless asked.

---

## 13. The first thing you should do

1. **Confirm you read this file.** One sentence is fine.
2. **Ask the human to share the research paper.** Don't start sketching
   until you've read it.
3. After reading the paper, **write a short (under 1 page) plan** that
   answers:
   - What does the paper's MDP/POMDP look like? (state, action, reward,
     transition)
   - Which integration shape (A/B/C from §7 above, or something else)
     does the paper imply?
   - What's the minimum-viable training loop on the synthetic generator?
   - What's the proposed inference path back into production?
   - What deps are needed and why they go in research/, not backend/?
4. **Get the human's go-ahead on the plan** before writing code.

Welcome aboard.
