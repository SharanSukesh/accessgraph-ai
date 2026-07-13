# GAEA / Equity Feature — Technical Dossier

A comprehensive reference for the equity feature: the paper's theory, the
RL training pipeline, how the paper abstractions map onto Salesforce
data, the production inference path, an honest grade of the current
state, and concrete fixes for the identified shortcomings. Written to be
self-contained — a future engineer or a future Claude conversation can
pick this up cold and know what the feature is, how it works, and what
still needs doing.

---

## §0 — Invariants (read this first)

**Any future work on the equity feature must satisfy these four rules.**
They exist because the feature spans backend, frontend, and RL research
code, and the paper's theoretical contribution is easy to accidentally
break by "simplifying" one piece.

### 1. Do not touch other features

Equity work is self-contained to these files. If a proposed change
requires modifying anything outside this list, treat it as a
cross-cutting concern and get explicit review.

**Backend (services + routes + models):**
- `apps/backend/app/services/equity_recommendations.py`
- `apps/backend/app/services/equity_diagnostic.py`
- `apps/backend/app/api/routes/equity.py`
- `apps/backend/app/domain/models.py` — only the `EquitySnapshot`,
  `Recommendation`, `VIPDesignation` classes; do not touch other models
- `apps/backend/app/ingestion/snapshot.py` + `salesforce_sync.py` —
  read-only unless the fix explicitly needs new SF fields on
  `UserSnapshot`

**Frontend:**
- `apps/frontend/src/app/orgs/[orgId]/equity/page.tsx`
- `apps/frontend/src/lib/api/hooks/useEquity.ts`

**Research + training:**
- `research/rl_solution/**` (everything)
- `research/anomaly_benchmark/data/generator.py` — read-only from
  equity's perspective; owned by the anomaly-detection track

**Do not modify** during an equity iteration: sync orchestration,
org-analyzer, recommendations service (only equity-track recs get
touched), auth, ingestion snapshot logic beyond field-add. If the fix
requires a new column on a shared table, coordinate with the owner of
that table before shipping.

### 2. Preserve theoretical soundness

Every fix must remain consistent with the GAEA paper's core objects.
These are not implementation details — they are the paper's contribution
and losing them means we lose the differentiator.

- **Multi-relation graph with weighted edges** — the graph carries
  distinct edge types with distinct semantic weights. Do not collapse
  all edges to a single unweighted adjacency.
- **VIP set R** — defined by the union heuristic in
  `_build_graph` (managers-in-data ∪ top-2-role-tree-users ∪
  name-pattern-match ∪ pinned `VIPDesignation`). New signals may
  join the union; existing signals may not be silently dropped.
- **Utility(user)** — inverse shortest-path cost to the nearest VIP
  through the multi-relation graph. Do not swap for degree centrality,
  PageRank, or anything else without a defensible reason.
- **Group-level Gini as the disparity signal** — `Equity Index = 1 −
  Gini(per_group_utilities)`. Do not substitute a Manhattan-distance
  proxy, an L2 penalty, or a "% of groups above threshold" metric.
- **Reward = Δmin(group_utility) − λ · disparity** — the training
  reward shape is the paper's §III-C contribution. Changes to reward
  shaping require retraining and a documented rationale.

New edge types must have defensible weights (justify why 0.7 vs 0.5).
New grouping tiers must produce meaningful cohorts (never a random hash
bucket). The greedy fallback (GECI) must remain a valid inference path
even if we retrain the policy.

### 3. AI/ML application must remain theoretically sound

The PPO training loop, the R-GCN architecture, and the reward shape are
the paper's contribution. Do not:

- Swap R-GCN for a decision tree "because it's simpler."
- Swap PPO for behavior cloning "because it trains faster."
- Replace the Gini objective with an L2 penalty "because it's more
  differentiable."
- Cap the budget at 1 action "because multi-step is complicated."
- Drop the actor-critic split and go pure policy gradient.

Improvements are welcome: deeper networks, more edge types (Fix 2),
better feature encoding, larger PS embedding tables. Replacements are
not.

### 4. Verify end-to-end after every change on three org shapes

The equity page must produce a plausible, non-crashing result on **all
three** of the following before any change ships:

| Case | Description | Expected UI state |
|---|---|---|
| A | **Small dev org** (< 20 active users) | `grouping_key = "too_small"` (after Fix 6), page shows "org too small for group-level analysis" message and hides the KPI card. Per-user drill-down still works. |
| B | **Mid-org with populated Department** | `grouping_key = "department"`, per-dept bars render with real names, Equity Index < 1.0 if there's actual disparity, grants proposed. |
| C | **Mid-org with null Department** | `grouping_key = "role"` or `"profile"` (fallback ladder), bars show role/profile names, disclosure note reads "Grouped by User.UserRole — User.Department was null on juniors…". |

If any of the three regresses, the change is not ready.

---

## §1 — Feature intro

**The pitch in one sentence:** GAEA proposes a small budget of new
permission-set grants that maximally equalise access across employee
groups.

**Deal-winning hook:** *"Your Support department is 4x further from
your VIPs than Sales is. Here are 20 grants that would close that
gap."*

**The consulting story:** structural access audit. GAEA is not a "who's
missing perm X" tool — that's anomaly detection. GAEA is a
**fairness / equity audit** that asks whether different departments
have structurally equal access to institutional resources (measured
via graph distance to VIP nodes), then proposes minimal-cost edits
that improve equality.

The distinction matters:

| Question | Product |
|---|---|
| "Who's missing perm X?" | Anomaly detection (existing feature) |
| "Which departments are structurally shortchanged?" | GAEA / Equity |
| "How do I right-size seat spend?" | License-to-Persona Fit |
| "What automations are broken?" | Automation Sprawl |

Equity is the only one of these that carries a group-level, structural
objective. It's the "why does our HR team have fewer connections to
leadership than our Sales team?" question — and the answer is a
concrete list of `(user, permission_set)` grants that would close the
gap.

---

## §2 — Research theory (GAEA / EMD-MRP)

### Core claim in plain English

In a Salesforce org there is a small set of **VIP nodes** — executives,
managers, admins. Ordinary users have access to those VIPs only
*transitively*: through the reporting tree, the role hierarchy, and
shared permission sets. If we treat the org as a **multi-relation
graph**, then per-user "utility" is the *inverse graph distance from
that user to the nearest VIP*.

When that utility is unevenly distributed across departments (Sales
users are 1 hop from a VIP, HR users are 4 hops), some groups have
structurally worse access to institutional resources than others.
GAEA proposes adding a small, budget-limited number of **new
user→permission-set edges** to *equalise* those group utilities.

### Mathematical objective

Visible in `research/rl_solution/env.py:210-217` and mirrored in
`apps/backend/app/services/equity_recommendations.py:640-641`.

Per-step reward:
```
r = Δmin(group_utility) − λ · D
```

where:
- `min(group_utility)` is the *minimum* group utility (bump the
  worst-off department first)
- `D = Σ_g |U_g − mean(U)|` — sum of absolute deviations of per-group
  utilities from the org mean
- `λ = 0.5` by default

The headline diagnostic is:
```
Equity Index = 1 − Gini(per_group_utilities)
```

So 1.0 is perfect parity (all groups have identical utility), 0.0 is
maximal inequality.

### Algorithm class

**PPO-trained R-GCN actor-critic** — a Relational Graph Convolutional
network scores every `(junior, permission_set)` pair, with the
environment enforcing an action mask so only "grants that shorten some
junior→VIP path" are legal (`env.py:369-386`).

The primary baseline is **GECI — Greedy Equity-Centric Augmentation**
(`research/rl_solution/baselines/geci.py:25-55`). At every step GECI
identifies the group with lowest current utility, enumerates every
legal grant to a member of that group, simulates each edge, and picks
the one that maximally raises that group's utility. GECI is both the
training-time comparison target and the **production fallback when the
trained weights aren't loadable** — see `_PolicyRunner.try_load` in
`equity_recommendations.py:927-938`.

### The paper itself

The paper is **not checked in**. It's referenced only through code
comments:
- `env.py:3` cites "paper §III-C / §IV"
- `policy.py:1` cites "§IV-A"
- `baselines/geci.py:1` cites "§III-A"

The paper's internal codename is **EMD-MRP** ("Equity through Minimum
Disparity via Multi-Relation Perturbation") per
`research/rl_solution/__init__.py:1`. If we ever want to publish or
cite, this is the name that appears in the training code.

### Actions

A single step is a `(junior_user_idx, permission_set_idx)` pair —
grant permission set `p` to junior user `j`. Actions are masked
(`env.py:369-386`, `equity_recommendations.py:695-713`) so that only
edges which:

1. Don't already exist
2. Target a junior (not a VIP)
3. Grant a PS that ≥1 VIP already holds (otherwise the new edge
   can't shorten any junior-to-VIP path)

are legal.

---

## §3 — RL training pipeline (`research/rl_solution/`)

### `env.py` — the environment

Gymnasium-style env with **no gym dependency, no torch dependency**.
Pure numpy on the hot path so it can be imported by the production
backend if we ever want to compute utilities without loading torch.

`EquityAccessEnv` at `env.py:55-406`:

- **State**: heterogeneous user graph, exposed as
  - Node features `(n, F)` — canonical-department one-hot +
    canonical-seniority one-hot + `is_vip` + `is_junior`. Since we
    have 6 departments + 4 seniorities + 2 flags, `F = 12`.
  - Three adjacency matrices: `adj_manages`, `adj_role_above`,
    `adj_ps_overlap`. (Only 3 in the RL env — the 4 phase-2 edges
    live only in the production graph, not in training.)
  - Action mask over `(n_juniors × n_ps)`.

- **VIP set R** at `env.py:107-129` — union of:
  1. Users appearing as someone else's manager
  2. Admin/senior-tier users with no manager (top of tree)
  3. Name-pattern matches on profile/role name against the tuple
     `("director", "vp ", " vp", "chief", "manager", "head of",
     "officer", "lead", "president", "hr business partner")`

- **Distances** via Floyd-Warshall (`env.py:242-267`) with
  `cost = 1/weight`; cheapest edge wins where multiple relations
  connect the same pair. Weights at `env.py:25-29`:
  `manages=1.0, role_above=0.7, ps_overlap=0.5`.

- **Reward** at `env.py:210-217`: `Δ min-group-utility − λ · disparity`,
  `−0.05` for invalid actions.

### `policy.py` — R-GCN actor-critic

- **`RGCNLayer`** (lines 27-54) — one `nn.Linear(in, out, bias=False)`
  per edge type + a bias-carrying `self_loop`. Forward:
  `out = self_loop(x) + Σ_r W_r · (D_r^{-1} A_r) · x`, then ReLU.
  Row-normalised adjacency, no symmetric normalisation (comment at
  lines 48-50 justifies).

- **`EquityActorCritic`** (lines 57-135) — two stacked R-GCN layers
  (`node_feature_dim → hidden_dim=64 → embed_dim=32`), plus an
  `nn.Embedding(n_ps, 32)` PS table with `n_ps = MAX_PS_EMBEDDING = 4096`
  (`train.py:215`) sized to over-provision so different orgs share
  weights, plus an `nn.Bilinear(32, 32, 1)` actor scorer and a two-
  layer MLP critic on the mean-pooled embeddings.

- Forward returns `(masked_logits, value)`. Invalid actions get
  `-1e9` before softmax (line 133).

### `train.py` — PPO training loop

Per-episode PPO — one synthetic org per episode, roll under budget
`B=20`, compute GAE (`γ=0.95, λ=0.95`), do `ppo_epochs=4` updates with
`clip_eps=0.2`, `entropy_coef=0.01`, `value_coef=0.5`, Adam
`lr=1e-3` (`train.py:243-260`).

Default `--episodes 10000`. Eval every 100 episodes against GECI on
seeds `10000-10004`; keep the best-eval-equity checkpoint at
`checkpoints/best.pt` (`train.py:318-323`).

### `export.py` — .pt → .npz

Converts the winning `.pt` checkpoint to
`research/rl_solution/artifacts/policy_v1.npz` (543 kB on disk) so the
production backend never needs torch. This is the file
`_PolicyRunner.try_load` reads at inference time.

### `eval.py` — standalone evaluation harness

`research/rl_solution/eval.py` exists as a separate script (not just an
`--eval-only` flag on train.py). Reads a checkpoint, runs
policy-vs-GECI on a persona × seed grid, writes a CSV. The pass
criterion documented in its docstring is `ΔGini < 0 AND ΔUtility > 0`
vs GECI on `≥ 4/8` settings. Handy for Fix 5 — no new code needed,
just run this and commit the output.

### Canonical vocabulary — the "must match at inference" invariant

```python
CANONICAL_DEPARTMENTS = ("Finance", "HR", "IT", "Marketing", "Sales", "Support")
CANONICAL_SENIORITIES = ("admin", "senior", "mid", "junior")
```

Defined at `env.py:40-41` **and identically at
`equity_recommendations.py:78-79`**. The alphabetical ordering matters:
the one-hot slot for "Sales" at training time must map to the same slot
at inference time, or the trained weights become meaningless. **Any
change requires retrain-and-re-export.** This is the tightest coupling
between training and production in the whole system.

---

## §4 — Synthetic data

The RL env doesn't call its own generator — it wraps the *anomaly
benchmark's* `generate_org` and augments it
(`research/rl_solution/data/synth_hierarchy.py`).

### Base org shape

Personas come from `research/anomaly_benchmark/data/distributions.py`:
- small-business: 25-100 users
- mid-market: 200-1000 users
- enterprise: 2000-10 000 users

15 profile shapes across 6 departments × 4 seniorities. Users are
assigned a profile via Zipf-like weights (Pareto distribution — one
profile grabs ~30% of assignments).

### Heterogeneous augmentation

`synth_hierarchy.py:214-249` — after `generate_org(...)`, `augment()`
deterministically bolts on:

- **`manages`** (`_assign_managers`, lines 85-137) — juniors →
  mids-of-same-dept → seniors → admins → a single org-wide CEO drawn
  from the admin pool. Fallbacks up the ladder if a seniority tier
  is empty.

- **`role_above`** — a per-dept 4-level chain `<dept>-admin →
  <dept>-senior → <dept>-mid → <dept>-junior`, all rooted at a "CEO"
  role.

- **`ps_overlap`** via `_build_ps_pool_and_assignments` (lines 140-211)
  — a **stratified PS catalog**: 70% of each user's PSes drawn from a
  `(dept, seniority)`-specific pool, 20% dept-wide, 10% org-wide. This
  produces meaningful overlap clusters rather than random noise, so
  the `ps_overlap` edge type actually carries signal.

**Only 3 edge types are synthesised.** The 4 phase-2 edges
(`delegated_approver`, `account_team`, `opportunity_team`,
`record_share`) are **not present in training data at all** — see §7
shortcoming #2 for why this matters.

### How the "unfair" state is seeded

The generator does **not** explicitly plant equity anomalies.
Unfairness emerges naturally from the sampling shape:

- Junior seniorities get far smaller `num_permission_sets` baselines
  than admins (`SENIORITY_BASELINES` in the anomaly-benchmark paper's
  Appendix B.2 — junior mean = 1.5, admin mean = 8).
- Zipf-shaped profile assignment concentrates most users in the
  smallest, most junior profiles.
- Sensitive-department profiles (HR, Finance) get a 2× sensitive-
  permissions bump.

Result: at `reset()` time, the graph naturally has a starkly uneven
per-department distance-to-VIP distribution — exactly the state the
policy is asked to fix. This is important design: the environment
doesn't ship "wrong" starting states; it ships *realistic-looking*
starting states whose imperfection is a consequence of the sampling
distribution, matching the mess of real customer orgs.

### Episode sampling

`train.py:288-290` seeds each episode with `seed = args.seed +
episode + 1`, producing a fresh persona=mid_market org every episode.

Determinism: same seed → same org → same augmentation. So the eval
set (seeds `10000-10004`) is a **held-out fixed evaluation battery**
reused across the whole training run — the trained policy has never
seen these five orgs during training, and its performance on them
gates the checkpoint save.

---

## §5 — Paper → Salesforce mapping

This is the crucial translation layer between the abstractions in the
paper and concrete Salesforce SObject fields.

### Object mapping

| Paper abstraction | Concrete SF field / snapshot | Code location |
|---|---|---|
| **User node** | `UserSnapshot` row (`salesforce_id`, `name`, `department`, `title`, `profile_id`, `user_role_id`, `manager_id`, `delegated_approver_id`, `is_active`) | `models.py:249-297` |
| **VIP node (R)** | Union set: `managers_in_data` ∪ `top_role_users` (depth-0 or depth-1 in role tree) ∪ `name_match` ∪ `pinned` VIPDesignations, minus `unpinned` | `equity_recommendations.py:416-439` |
| **Junior node** | Every active user in `user_index` not in the VIP set | `equity_recommendations.py:445-448` |
| **Group** | `Department → UserRole → Profile → "unassigned"` fallback ladder (shipped in commit `8d70960`) | `equity_recommendations.py:553-580` (`_derive_bucket`) |
| **Utility per user** | `1 / min_over_R(shortest_path_cost)` on the multi-relation graph, 0 if unreachable | `equity_recommendations.py:582-639` |
| **Action** | New `(junior_sf_id, permission_set_sf_id)` grant — persisted as a `Recommendation` row of `RecommendationType.GRANT_FOR_EQUITY` | `equity_recommendations.py:829-863` |

### The 7 edges

`equity_recommendations.py:60-68` defines the weights; all edges are
mixed via Floyd-Warshall (`_compute_distances`, lines 533-545) with
cheapest-cost-wins semantics.

| Edge type | Weight | Source data | Construction |
|---|---|---|---|
| `manages` | 1.0 | `UserSnapshot.manager_id` | Directed junior→manager. `equity_recommendations.py:312-317` |
| `delegated_approver` | 0.9 | `UserSnapshot.delegated_approver_id` (added in commit `6bdfab0`) | Directed junior→approver. Lines 347-352 |
| `role_above` | 0.7 | `RoleSnapshot.parent_role_id` chain | Ancestor closure per role; user a → user b if b's role is ancestor of a's. Lines 320-343 |
| `opportunity_team` | 0.6 | `OpportunityTeamMemberSnapshot` (opportunity_id, user_id) | Clique per opportunity: every pair of members gets an undirected edge. Line 364 |
| `account_team` | 0.6 | `AccountTeamMemberSnapshot` (account_id, user_id) | Clique per account. Lines 358-362 |
| `ps_overlap` | 0.5 | `PermissionSetAssignmentSnapshot` (rebuilt at every step in `_build_ps_adjacency`) | Clique per PS: every pair of users sharing a PS. Lines 506-522 |
| `record_share` | 0.4 | `AccountShareSnapshot` + `OpportunityShareSnapshot` (capped at `EQUITY_RECORD_SHARE_MAX=50000`) | Clique per shared record. Lines 373-385 |

Cost in Floyd-Warshall is `1/weight`; where multiple edge types connect
the same pair we take `min(cost)` (cheapest-wins).

### The R-GCN blind spot

The trained R-GCN policy **only knows about the first three edge
types**: `manages`, `role_above`, `ps_overlap`. See
`_PolicyRunner._adj_dict` at `equity_recommendations.py:965-970`.

The four Phase-2 edges (`delegated_approver`, `account_team`,
`opportunity_team`, `record_share`) enter the **utility calculation**
(Floyd-Warshall) and the **reward accounting**, but the R-GCN's
message-passing never sees them. That's model-vs-reward drift — see §7
shortcoming #2 for the concrete impact.

### Grouping fallback ladder (shipped in `8d70960`)

`_derive_bucket` at `equity_recommendations.py:553-580` returns
`(bucket, source)` per user via this ladder:

1. `User.Department` (if non-null)
2. `UserRole.Name` (if non-null)
3. `Profile.Name` (if non-null)
4. `"unassigned"` (guaranteed catch-all)

The `grouping_key` field on the run reports the *worst* tier any junior
fell to, so the UI can be honest ("grouped by Role" rather than
pretending Department was used when only 1 in 100 juniors had Dept
populated). Persisted on `EquitySnapshot.raw_metrics.grouping_key` —
no schema migration.

### VIP set derivation — the exact heuristic

`equity_recommendations.py:409-448`:

```python
# 1. Direct managers — anyone appearing as User.ManagerId
managers_in_data = {u.manager_id for u in users if u.manager_id}

# 2. Top-2 levels of the role tree
depth_0 = {r.salesforce_id for r in roles if r.parent_role_id is None}
depth_1 = {r.salesforce_id for r in roles if r.parent_role_id in depth_0}
top_role_users = {u.salesforce_id for u in users if u.user_role_id in (depth_0 | depth_1)}

# 3. Name-pattern match on Profile / Role / Title
NAME_PATTERN_TERMS = ("director", "vp ", " vp", "chief", "manager",
                     "head of", "officer", "lead", "president",
                     "hr business partner")
name_match = { u for u in users if any(term in haystack.lower() for term in NAME_PATTERN_TERMS) }

# 4. Explicit pins
pinned = {d.user_sf_id for d in designations if d.kind == VIPDesignationKind.PIN}
unpinned = {d.user_sf_id for d in designations if d.kind == VIPDesignationKind.UNPIN}

# Union minus unpinned
vip_user_ids = (managers_in_data | top_role_users | name_match | pinned) - unpinned
```

The old `admin_roots` heuristic ("manager_id IS NULL → user is at the
top of the tree") was removed in commit `a8805f3` because in dev orgs
where ManagerId is universally null it tagged nearly every user as a
VIP and left almost no juniors. Any new VIP signal must not have this
failure mode.

---

## §6 — Production inference path

Request lifecycle when the frontend fires
`POST /orgs/{id}/equity/recommendations/generate`:

### Route → service

`apps/backend/app/api/routes/equity.py:99-116` builds
`EquityRecommendationService(db, budget=<1..200>)` and awaits
`.generate(org_id)` (`equity_recommendations.py:177-188`). The service
returns `EquityRunResult` which the route wraps in a `GenerateResponse`
Pydantic model.

### Step 1 — `_build_graph`

`equity_recommendations.py:193-263` runs seven `SELECT` queries in
order, all filtered by `organization_id`:

1. `UserSnapshot` where `is_active=True`
2. `RoleSnapshot`
3. `ProfileSnapshot`
4. `PermissionSetAssignmentSnapshot`
5. `PermissionSetSnapshot`
6. `VIPDesignation`
7. `AccountTeamMemberSnapshot`, `OpportunityTeamMemberSnapshot`,
   `AccountShareSnapshot`, `OpportunityShareSnapshot` — the last two
   capped at 50k rows via `EQUITY_RECORD_SHARE_MAX`

Then `_materialize_graph` (lines 265-470) constructs the seven
adjacency matrices, derives per-user seniority from role-name suffix
(falls back to `None`, giving a "seniority-unknown" bucket), computes
ancestor closures on roles, and assembles the VIP set.

### Step 2 — `_PolicyRunner.try_load`

`equity_recommendations.py:927-938` reads
`research/rl_solution/artifacts/policy_v1.npz` (path overridable via
`EQUITY_POLICY_PATH` env var). If the file is missing (`p.exists() =
False`) or `np.load` throws, it logs and returns `None`.

In that case, `_choose_action` (line 727) skips the policy branch
entirely and drops through to GECI. **This is the graceful degradation
path**: even with a stale/absent checkpoint, the endpoint still
produces sensible recommendations. This means GECI is what actually
runs on many real customer sites — see §7 shortcoming #3.

### Step 3 — `_roll_out`

`equity_recommendations.py:656-693`. For `budget` iterations (default
20):

1. Compute current group utilities via Floyd-Warshall over all 7
   edge types.
2. Identify `most_dis` (lowest-utility group).
3. `_choose_action`: if the policy loaded, run a pure-numpy forward
   pass through the two R-GCN layers + bilinear scorer
   (`actor_logits`, lines 990-1035); mask out illegal actions; mask
   out juniors *not* in the disadvantaged group (soft dept
   restriction at lines 735-740); pick argmax. Otherwise, GECI
   simulates every legal grant restricted to `most_dis` juniors and
   picks the one that maximally raises `U(most_dis)`.
4. Apply the edge by mutating `graph.user_ps[user_sf_id].add(ps_sf_id)`;
   record before/after utilities into the proposal's rationale.
5. Repeat.

### Step 4 — `_persist`

`equity_recommendations.py:776-865`. Writes exactly two things to the
DB:

- One `EquitySnapshot` row (`models.py:1068-1097`) carrying
  `equity_index`, `disparity`, `most_disadvantaged_group`, `vip_count`,
  `per_dept_utilities` JSON, `edge_type_counts` JSON, and
  `raw_metrics.grouping_key` (which fallback tier fired).
- One `Recommendation` row per proposal, with
  `rec_type=GRANT_FOR_EQUITY`, `track=EQUITY`, `status=PENDING`, and
  human-readable `title`/`description`/`rationale` fields that quote
  the PS label + user name rather than raw 18-char SF IDs.

Both are committed in a single transaction. The response payload is
the `EquityRunResult` dataclass (`equity_recommendations.py:143-154`).

---

## §7 — Current state grade

### What's genuinely novel vs a naive cleanup rule

Three properties stand out:

1. **Group-aware disparity objective.** A naive rule flags Sarah
   because she's missing Y; GAEA proposes granting Y to Sarah
   *because Sarah's department is graph-distant from the VIPs and Y
   closes the gap*. That's a fundamentally different question —
   it's an org-design question, not an anomaly-detection question.
   No off-the-shelf IGA product asks it.

2. **Multi-relation graph reasoning.** Seven edge types with distinct
   semantic weights, folded through Floyd-Warshall so a user's
   shortest path to a VIP can hop `report-to → shared-opportunity →
   shared-PS`. Traditional identity governance treats permissions
   as flat sets; GAEA treats them as graph structure.

3. **RL formulation looks several moves ahead.** GECI is myopic — it
   makes the locally-best move for the currently-worst group at
   every step and never considers that granting to group B *now*
   might set up a better grant to group A *later*. PPO's return
   signal in `train.py:109-126` explicitly optimises for cumulative
   discounted reward.

### The six shortcomings

#### 1. Trained purely on synthetic data (OUT OF SCOPE)

Every training episode came from `research/anomaly_benchmark/data/
generator.py`, which is a *stylised* Salesforce org — Pareto-weighted
profiles, log-normal login times, canonical 6-dept vocabulary, always
populates `manager_id`. A real customer whose Dept is null on 80% of
users, whose manager tree only covers Sales, and whose IT people are
all on "IT_Operations_v2" instead of one of the canonical names will
fall very far outside the training distribution.

The v2 code partly acknowledges this (grouping fallback ladder at
line 553, allowing seniority-unknown one-hot) but the R-GCN was never
*trained* on those degenerate distributions.

**User has explicitly excluded this from future work** ("synthetic
data we cannot fix"). Any improvement would require a real
customer-org training corpus which we don't have.

#### 2. R-GCN sees only 3 of 7 edges — model-vs-reward drift

`_PolicyRunner._adj_dict` (line 965) still feeds the policy only
`manages / role_above / ps_overlap`. The four Phase-2 edges
(`delegated_approver`, `account_team`, `opportunity_team`,
`record_share`) participate in utility calculation (Floyd-Warshall)
and reward accounting, but the R-GCN's message-passing sees a strictly
smaller graph than the objective it's scored against.

**Concrete impact:** the policy may pick an action that looks great
over the 3-edge subgraph it sees, but the utility function (using all
7 edges) may report a smaller improvement because a phase-2 edge
already provided a similar path. Bounded loss but a real one.

#### 3. GECI is what actually runs — single-checkpoint fragility

The current checkpoint `policy_v1.npz` is one 543 kB file trained on
one persona (`mid_market`) with one seed. Anyone whose org shape is
very different is effectively getting a well-engineered greedy
algorithm labelled as "AI".

We have no per-org shape detection — we always load `policy_v1.npz`.
For a 20-person startup and a 5000-person enterprise, the exact same
weights fire.

#### 4. `ps_overlap` degenerates on standard-user-heavy orgs — no trivial-PS filter

Two users sharing a PS is not the same relationship as two users on
the same account team. In an enterprise with 2000 users all holding a
"Standard User" PS, `ps_overlap` degenerates into a near-complete
graph and shortest paths lose all meaning.

There's no filtering of "trivial" PSes — no threshold on assignment
rate, no exclusion of profile-owned PSes, no exclusion of standard
PSes shipped by SF. Everything counts equally.

#### 5. No A/B / ablation numbers checked in

`train.py:190-210` computes policy-vs-GECI at eval time and logs to
`train_log.jsonl` in a checkpoint dir. `eval.py` produces a per-seed
CSV. But no summary is committed to the repo — whether the PPO policy
actually beats GECI on eval seeds and by how much isn't a cite-able
number today.

The commercial pitch says "AI-driven"; we can't back that up with
numbers.

#### 6. "Junior" = negation of VIP — noisy in small orgs

The "junior" label is defined *negatively*: anyone not in the VIP set.
In a 15-person startup where the whole org is one CEO + four Sales +
four Support + six others, "junior" ends up meaning "everyone except
maybe the CEO" — including department heads who are structurally
senior but don't manage anyone.

The equity-per-department objective also breaks down when a
department has one member: their utility is a single scalar and the
min-max spread is dominated by outliers.

---

## §8 — Proposed fixes

For each of the five *fixable* shortcomings (skipping #1 per the
user's decision), here's the concrete plan.

### Fix 2 — 7-edge policy input

Two paths, listed in ship order:

#### Fix 2a — No-retrain inference bridge (fast)

**What:** Collapse the 4 new edge types into the 3 the policy knows.
Weighted union:

- `manages_extended = manages ∪ (delegated_approver × 0.9/1.0)` —
  fold delegated approver into manages as a weaker manages-like edge
- `ps_overlap_extended = ps_overlap ∪ (account_team × 0.6/0.5) ∪
  (opportunity_team × 0.6/0.5) ∪ (record_share × 0.4/0.5)` — fold
  the three shared-resource edges into ps_overlap

The scaling factors preserve the relative weights (0.9/1.0 = 0.9 for
delegated_approver; 0.6/0.5 = 1.2 for team edges, capped at 1.0).

**Where:** `equity_recommendations.py::_PolicyRunner._adj_dict` (line
965). Change is ~15 lines. Keep the utility-calc using all 7 edges
unchanged so the reward accounting still reflects the true graph.

**Effort:** 2-3 hours.

**Retrain required:** No.

**Verification:** Run `eval.py` on the current `policy_v1.npz` before
and after the change. Policy performance should not regress on the
eval seeds (they only exercise 3 edges anyway) but should show a
larger delta on real customer orgs where the 4 phase-2 edges carry
signal.

#### Fix 2b — Retrain policy_v2 with all 7 edges native

**What:**
1. Extend `synth_hierarchy.augment()` to synthesise the 4 missing
   edge types deterministically:
   - `delegated_approver`: assign 20% of managers to have a
     delegated_approver drawn from same-dept peers
   - `account_team`: create N synthetic accounts per dept, assign
     team members from within the dept
   - `opportunity_team`: same shape as account_team, keyed by
     synthetic opportunities
   - `record_share`: sparse shares of the synthetic accounts /
     opportunities to users outside the owning dept
2. Extend `env.py:25-29` `EDGE_WEIGHTS` to include all 7 with
   matching weights.
3. Add 4 new relation slots in `policy.py` `RGCNLayer` and
   `EquityActorCritic`.
4. Retrain (default 10k episodes, ~1 day of compute).
5. Re-export to `policy_v2.npz`.

**Where:**
- `research/rl_solution/data/synth_hierarchy.py` — new augmentation
  functions for the 4 edges (~150 LOC)
- `research/rl_solution/env.py` — expose the new adjacencies, extend
  reset() and node-features (~50 LOC)
- `research/rl_solution/policy.py` — 4 new relation weights per
  R-GCN layer (~20 LOC)
- `research/rl_solution/train.py` — no changes if `MAX_PS_EMBEDDING`
  still holds
- `research/rl_solution/artifacts/policy_v2.npz` — new artifact
- `apps/backend/app/services/equity_recommendations.py` —
  `_PolicyRunner` loads v2, adj_dict passes all 7

**Effort:** 3-5 days including training time.

**Retrain required:** Yes.

**Verification:** eval.py must show policy_v2 >= policy_v1 on eval
seeds AND `ΔGini < 0 AND ΔUtility > 0 vs GECI on ≥ 4/8 settings`
(the pass criterion from `eval.py:5`). If policy_v2 regresses, we
keep v1 in production and iterate.

### Fix 3 — Multi-persona checkpoints

**What:** Train small_business / mid_market / enterprise checkpoints
separately, ship 3 `.npz` files, production selects based on active-
user count.

**Where:**
- `research/rl_solution/train.py` — already supports `--persona`
  arg; run 3 training passes
- `research/rl_solution/artifacts/` — ship
  `policy_v2_small.npz`, `policy_v2_mid.npz`, `policy_v2_ent.npz`
- `apps/backend/app/services/equity_recommendations.py` —
  `_PolicyRunner.try_load` grows a persona parameter, chooses the
  file based on `len(active_users)`:
  - `< 100` → small
  - `100-1500` → mid
  - `> 1500` → enterprise

**Effort:** 3-5 days (compute-bound). Only pursue AFTER Fix 2b lands
— retraining once is expensive; retraining three times before we've
validated the 7-edge architecture is wasteful.

**Retrain required:** Yes, 3× actually.

**Verification:** Each per-persona checkpoint must beat GECI on its
target persona's eval seeds. Compare against a single-persona
checkpoint of the same architecture to make sure specialisation
actually helped (it may not — mid_market may generalise well).

### Fix 4 — Trivial-PS filter for `ps_overlap`

**What:** Skip PSes assigned to > 80% of active users when building
`ps_overlap` adjacency. Also skip profile-owned PSes (PS.name pattern
matches `X<ProfileId>` — the auto-created PS-per-Profile that carries
Profile permissions).

**Where:** `equity_recommendations.py::_build_ps_adjacency` (lines
506-522). Add:

```python
TRIVIAL_PS_ASSIGNMENT_THRESHOLD = float(
    os.environ.get("EQUITY_TRIVIAL_PS_THRESHOLD", "0.80")
)

def _is_trivial_ps(ps: PermissionSetSnapshot, assign_count: int, n_active: int) -> bool:
    if n_active > 0 and assign_count / n_active >= TRIVIAL_PS_ASSIGNMENT_THRESHOLD:
        return True
    if ps.is_owned_by_profile:
        return True
    return False
```

**Effort:** 2-3 hours.

**Retrain required:** No — pure inference-time change. The RL policy
never saw a "trivial PS" during training (the synth generator's PS
catalog is stratified, not universal) so filtering these at inference
brings production closer to the training distribution.

**Verification:** On a customer org with a known "Standard User"-like
PS, the `ps_overlap` adjacency should have significantly fewer
edges. Manually inspect: `SELECT COUNT(*) FROM ps_overlap edges
BEFORE and AFTER`. Equity Index should shift because paths through
those edges are no longer taken.

### Fix 5 — Eval log in repo

**What:** Run `python -m research.rl_solution.eval --checkpoint
artifacts/policy_v1.npz --output results/policy_v1_eval.csv` and
commit both the CSV and a summary Markdown table.

**Where:**
- `research/rl_solution/results/` (new directory)
- `research/rl_solution/results/policy_v1_eval.csv` — the eval script
  output
- `research/rl_solution/results/policy_v1_eval.md` — hand-written
  summary: mean policy_equity vs geci_equity across all seeds,
  per-persona breakdown, pass/fail vs the `ΔGini < 0 AND ΔUtility >
  0 on ≥ 4/8` criterion
- `apps/frontend/src/app/orgs/[orgId]/equity/page.tsx` — cite the
  summary number in a footer badge ("policy_v1 shows +X.X% mean
  equity improvement vs GECI baseline across 40 eval seeds")

**Effort:** 4 hours (run eval + write summary + wire into UI).

**Retrain required:** No.

**Verification:** The badge on the equity page shows the number.
Clicking it links to the summary Markdown. Numbers match what
`eval.py` produced.

### Fix 6 — Small-org guard

**What:** In `_group_utilities`, if `len(users) < 20`, skip disparity
calc and set `grouping_key = "too_small"`. Frontend renders a
distinct message and hides the KPI card, steering to the per-user
disparity view instead.

**Where:**
- `equity_recommendations.py` — early return in `_group_utilities`
  when `len(graph.user_ids) < 20`. Set `grouping_key = "too_small"`.
- `useEquity.ts` — no type change (grouping_key is already
  `string | null`)
- `equity/page.tsx` — extend the vacuous-check block to also handle
  `grouping_key === "too_small"` with a dedicated message

Configurable via `EQUITY_SMALL_ORG_THRESHOLD` env var (default 20).

**Effort:** 3-4 hours.

**Retrain required:** No.

**Verification:** On a dev sandbox with < 20 users, the equity page
shows the "org too small" message and does not render the Equity
Index card. Per-user disparity drill-down still works. On a
sandbox with ≥ 20 users, behaviour is unchanged.

---

## §9 — Sequencing recommendation

**Ship order:**

1. **Fix 4** (`ps_overlap` trivial-PS filter) — highest impact-to-effort
   ratio; pure inference change; brings production closer to training
   distribution. ~3 hours.
2. **Fix 6** (small-org guard) — cleanup for the fragile
   dev-sandbox case; no user complaints once shipped. ~4 hours.
3. **Fix 5** (eval log in repo) — measure the current baseline so
   we can prove retraining helps. ~4 hours.
4. **Fix 2a** (7-edge inference bridge) — smallest step toward 7-edge
   support without paying training cost. ~3 hours.
5. **Fix 2b** (retrain policy_v2 with 7 edges native) — the real win.
   3-5 days.
6. **Fix 3** (multi-persona checkpoints) — only worth doing after v2
   proves the architecture. Another 3-5 days.

**Cost curve:** first 4 are pure inference/docs (~2 days total).
Last 2 involve retraining (~1-2 weeks).

**Dependencies:**
- Fix 3 depends on Fix 2b (retrain architecture must be validated
  before specialising per-persona).
- Fix 5's evaluation numbers become the baseline for Fix 2b/3 to
  beat.

---

## §10 — Verification

### Three-org verification recipe (from §0 invariant #4)

After every equity change, verify all three:

**Case A — Small dev org (< 20 users):**
1. Create a fresh SF dev org with 15-19 active users
2. Sync
3. Generate recommendations
4. Expected: Equity page shows "Org too small for group-level
   analysis" message (post-Fix 6) OR shows vacuous-100% with copper
   badge (pre-Fix 6)
5. Per-user drill-down should still work

**Case B — Mid-org with Department populated:**
1. Populate `User.Department` on 20+ active non-VIP users, split
   across ≥ 2 depts
2. Ensure ≥ 1 user has `User.ManagerId` pointing at a VIP
3. Sync
4. Generate
5. Expected: `grouping_key === "department"`, Equity Index < 1.0
   if there's any disparity, per-dept bars render with real names,
   grants proposed for the most-disadvantaged dept

**Case C — Mid-org with Department null:**
1. Same as Case B but with `User.Department` NULL on all juniors
2. Sync + Generate
3. Expected: `grouping_key === "role"` or `"profile"`, bars show
   role/profile names, disclosure note reads "Grouped by
   User.UserRole — User.Department was null on juniors…"

### Reproducing training

```bash
cd research/rl_solution
python -m pip install -r requirements.txt
python -m research.rl_solution.train --episodes 100 --persona mid_market --seed 1
```

Expected: training log at `checkpoints_smoke/train_log.jsonl` shows
`policy_equity` and `geci_equity` per eval. Policy should beat GECI
by episode ~50 on mid_market.

### Comparing checkpoints

```bash
python -m research.rl_solution.eval \
    --checkpoint artifacts/policy_v1.npz \
    --output results/policy_v1_eval.csv \
    --seeds 10000,10001,10002,10003,10004 \
    --personas small_business,mid_market
```

Pass criterion (from `eval.py:5`):
`ΔGini < 0 AND ΔUtility > 0 vs GECI on ≥ 4/8 settings`.

---

## §11 — Future workstream: OSS synthetic-data package

### Motivation

`research/anomaly_benchmark/data/generator.py` +
`research/rl_solution/data/synth_hierarchy.py` are genuinely useful
to the broader Salesforce security / IAM research community,
independent of any commercial product.

Shipping them as OSS:
- Puts a marker down in the field (published research artefact)
- Lets other researchers reproduce our results
- Separates the "publishable research" from the "commercial product"
- Gives us a portable evaluation harness for the anomaly-detection
  paper AND the GAEA/equity paper

### Proposed structure

New standalone directory: `synth_org_gen/` sibling to `research/`
(or a separate git repo entirely — decide at extraction time).

Contents:
- **Base org generator** — personas (small/mid/enterprise), Zipf
  profile assignment, canonical departments/seniorities, log-normal
  login times, sensitive-dept sensitivity bumps
- **Heterogeneous augmentation layer** — `manages`, `role_above`,
  `ps_overlap` (initial), plus `delegated_approver`, `account_team`,
  `opportunity_team`, `record_share` (once Fix 2b lands)
- **Determinism guarantees** — seed → same org, verified by
  hash-comparison tests
- **Sample outputs** — pre-generated `sample_orgs/{persona}.json`
  at multiple seeds
- **CLI** — `python -m synth_org_gen generate --persona mid_market
  --seed 1 --output org.json`

### Packaging

- `pyproject.toml` (modern PEP 621 metadata)
- `README.md` with quickstart, worked example, citation info
- `LICENSE` — MIT or Apache-2.0 (user picks at release time)
- `CHANGELOG.md`
- CI (GitHub Actions) verifying:
  - Lint clean (ruff or similar)
  - Determinism tests pass (same seed → same output hash)
  - CLI runs without errors on all three personas
- PyPI publish (or GitHub-only mirror for v0.1)

### Documentation

Top-level README explains the "distribution mimicking a real SF org"
contribution:
- Canonical vocabularies (why these 6 departments, why these 4
  seniorities)
- Seniority baselines (why junior mean = 1.5, admin mean = 8)
- Sensitive-department bumps (why HR + Finance get 2×)
- The role of Zipf-weighted profile assignment

Cite the anomaly-detection paper as prior work — that's where the
base generator was originally written.

### Extraction constraints

- **No imports from `apps/backend/`.** The extracted package cannot
  reach into the commercial code.
- **Adapter layer** — any org-model shim required to run the
  extracted package inside our commercial code lives in a small
  adapter file inside `apps/backend/`, not in the OSS package
  itself.
- **No commercial branding, deal-winning hooks, or client-specific
  logic** in the OSS package. It's pure research infrastructure.

### Release readiness checklist (for v0.1)

- [ ] Extraction complete — no imports from `apps/backend/`
- [ ] Deterministic tests pass on 3 personas × 5 seeds each
- [ ] README has a "run this in 2 minutes" quickstart
- [ ] CLI documented with `--help`
- [ ] Sample outputs committed to repo
- [ ] LICENSE chosen and committed
- [ ] CITATION.md pointing at the paper(s) (once we're ready to
      publish)
- [ ] PyPI account created (if publishing)
- [ ] GitHub-only mirror set up (if not publishing to PyPI initially)

### Effort estimate

~1 week from starting extraction to a public v0.1. Independent of
the equity-fixes work — can happen in parallel or after.

---

## Appendix — file quick reference

**Backend:**
- `apps/backend/app/services/equity_recommendations.py` — the whole
  service; `_build_graph`, `_group_utilities`, `_derive_bucket`,
  `_roll_out`, `_persist`, `_PolicyRunner`
- `apps/backend/app/services/equity_diagnostic.py` — read-only
  diagnostic queries for the frontend
- `apps/backend/app/api/routes/equity.py` — 4 endpoints
- `apps/backend/app/domain/models.py` — `UserSnapshot` (L249),
  `VIPDesignation` (L1043), `EquitySnapshot` (L1068), `Recommendation`

**Frontend:**
- `apps/frontend/src/app/orgs/[orgId]/equity/page.tsx` — page +
  vacuous-check + fallback disclosure
- `apps/frontend/src/lib/api/hooks/useEquity.ts` — types + hooks

**Research:**
- `research/rl_solution/env.py` — Gymnasium env
- `research/rl_solution/policy.py` — R-GCN actor-critic
- `research/rl_solution/train.py` — PPO training loop
- `research/rl_solution/eval.py` — standalone eval harness
- `research/rl_solution/export.py` — .pt → .npz
- `research/rl_solution/baselines/geci.py` — greedy fallback
- `research/rl_solution/data/synth_hierarchy.py` — heterogeneous
  augmentation
- `research/rl_solution/artifacts/policy_v1.npz` — production
  checkpoint (543 kB)
- `research/anomaly_benchmark/data/generator.py` — base org
  generator (owned by anomaly-detection track)

**Key commits:**
- `cb70703` — initial equity feature
- `6bdfab0` — Phase 2: 4 new edge types + SF write-back
- `a8805f3` — removed the over-eager `admin_roots` VIP heuristic
- `2f55e08` — added generate-mutation error/success surfaces
- `06b879e` — vacuous-100% detection on the frontend
- `8d70960` — grouping fallback ladder (Department → Role → Profile
  → unassigned)
