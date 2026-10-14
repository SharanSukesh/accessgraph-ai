# Demo hardening notes (branch `demo-hardening`)

## Baseline (before any changes, 2026-10-14)

| Check | Result |
|---|---|
| Backend `pytest` (apps/backend) | 266 passed, 9 skipped |
| Frontend `npm run type-check` | clean |
| Frontend `npm run lint` | 0 errors, 6 warnings (pre-existing) |
| Frontend `npx vitest run --passWithNoTests` | no test files, exit 0 |
| Frontend `npm run build` | compiled successfully |

## 0. Local demo seed

`apps/backend/scripts/seed_local_demo.py` creates a local admin login and a
demo org (`is_demo`) from `fixtures/demo_org.json`, then runs the sync
analysis and the Health Report. It refuses to run unless
`NEWTON_LOCAL_SEED=1`, `DEMO_MODE=true` and `DATABASE_URL` is SQLite or a
localhost database.

```bash
docker run -d --rm --name newton-pg-local -e POSTGRES_PASSWORD=pw -e POSTGRES_DB=newton -p 55439:5432 postgres:16-alpine
cd apps/backend
export DATABASE_URL=postgresql://postgres:pw@localhost:55439/newton JWT_SECRET_KEY=local NEWTON_LOCAL_SEED=1
.venv/bin/alembic upgrade head
.venv/bin/python scripts/seed_local_demo.py
```

Login: `admin@newton-demo.com` / `Local-demo-only-1` (override with
`SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`). The fixture is small (8 users),
so it exercises every page but won't show rich anomalies.

## 1. PDF health report

Verified two ways on 2026-10-14:
- Local API (macOS, WeasyPrint with Homebrew Pango): log in, then
  `GET /orgs/{id}/org-analyzer/report.pdf` gives a 6-page PDF for the seeded demo org.
- Production-style container: built `apps/backend/Dockerfile` from a `git archive`
  of this branch (what Railway sees), ran it against Postgres. It ran migrations on
  boot, served the API, accepted a login and returned the same 6-page PDF with
  DejaVu fonts embedded.

Fixed while checking: the cover's health band now uses the analyzer's labels
(Excellent / Good / Needs attention / Concerning / Critical), and the executive
summary no longer calls an org "production" when its type is unknown.

### What production needs
- Backend service builder = **Dockerfile** (Railway: backend service, Settings,
  Build, Builder), root directory `apps/backend`, Dockerfile path `Dockerfile`.
- **No custom start command** (clear it if one was set for Nixpacks). The
  Dockerfile CMD runs `scripts/run_migrations.py` (alembic upgrade head) then
  uvicorn on `$PORT`.
- System libraries, already in the Dockerfile: `libpango-1.0-0`,
  `libpangoft2-1.0-0`, `libharfbuzz0b`, `fonts-dejavu-core`. Nothing else needed.
- No new environment variables.
- Not viable: the repo's `nixpacks.toml` fails to build locally (`pip: command
  not found`), even before any of these changes, and installs no Pango/fonts.
  Railpack would need `RAILPACK_DEPLOY_APT_PACKAGES` for the same libraries
  (untested).
- How to tell it's broken: Download PDF returns 503 "PDF generation
  unavailable", and the logs say WeasyPrint could not import external libraries.

**Railway build settings (handled by the owner on `main` before Thursday's merge):** backend service, Settings, Build: Builder = Dockerfile, root directory `apps/backend`, Dockerfile path `Dockerfile`, no custom start command. Rollback: switch the builder back to its previous value and redeploy.

## 2. Permission set group muting (item 1)

- `effective_access.py` now evaluates each grant source separately: the
  profile, each directly assigned permission set, and each group. A group
  contributes the union of its non-muting components minus what its muting set
  mutes; muting never removes a permission granted by another source.
  This mirrors `risk_scoring.py`'s `bundle()`.
- Explain (`/users/{id}/explain/object/{obj}`): a muting set is never a grant
  source. Each path has `granted_via` and `muted: [{permission, muted_by}]`,
  and the steps end with "Muted: Edit by muting permission set ...".
- Tests: `tests/test_effective_access_muting.py` (group mute removes edit;
  the profile's edit survives; field read muting; explain reporting).
- Demo fixture: "Sales Manager PSG Muting" mutes Account Edit and Delete in
  Sales Manager PSG. Alice keeps Account Edit (from her profile) and loses
  Account Delete (it came only from the group).
- Also fixed: the Health Report's "permission sets with zero assignees" rule
  counted sets used through groups, muting sets and group aggregate sets as
  unused. On the fixture this removes a false finding (3 to 2 findings).
- Shift on the fixture, old code vs new: only Alice's access changes (objects
  she can delete, 4 to 3). Anomaly scores and flagged users are unchanged.
  Risk scores are unchanged, because the risk scorer already applied muting.
- To verify on real data: create a permission set group with a muting
  permission set in the dev org and sync. The code assumes Salesforce reports
  muting sets as PermissionSet with Type "Muting", like the rest of the
  codebase. Unverified against a live org.

## Anomaly flagging (after step 3 review)

The detector flags exactly the top 2% of active users by ensemble score
(k = max(1, int(0.02 × users))). The old `score > 0.5` path is gone; on
min-max-normalised rank averages it admitted about half the org, and the
reason templates had been acting as the real filter. A top-k user is
never dropped: users with no role or profile peers are compared against
the whole org, and a fallback reason names the features that put them in
the top 2%. New reason templates: exclusive access, last login,
cross-department access.

## 4. Demo org in production (admin only)

- Admin → **Demo orgs** (`/admin/demo-orgs`): create "Lumenvale Systems
  (Demo)" from `fixtures/synthetic_mid_market.json`, or the 8-user Acme
  fixture. Creating it runs the normal sync on the fixture. Then run the
  Health Report and License Fit from the org as usual.
- Guardrails:
  - `is_demo=True` plus `settings.demo_fixture`. Sync always loads the
    fixture for a demo org, whatever `DEMO_MODE` says.
  - The OAuth callback refuses a connection linked to a demo org; new
    connections always create real orgs.
  - Health Report and License Fit read licences, edition, limits and
    ownership from the fixture's `demo_live` section. Data Quality, the
    four Sprawl tabs and Change Risk refuse demo orgs (greyed out in the
    sidebar). Every Salesforce write refuses.
  - "Demo data" badge in the top bar and the org list. The PDF has a cover
    banner, "DEMO DATA" in every page footer, and a `demo-` filename prefix.
  - Delete from the same admin page. It refuses non-demo orgs and uses the
    same erasure as Privacy → delete all data.
- Fallback (local): `NEWTON_LOCAL_SEED=1 JWT_SECRET_KEY=local
  DATABASE_URL=postgresql://postgres:pw@localhost:55439/newton
  .venv/bin/python scripts/seed_local_demo.py` (from `apps/backend`;
  `SEED_FIXTURE=acme` for the small one). `DEMO_MODE` is no longer needed.
- Before the demo, the Demo orgs page also lists any older `is_demo` orgs
  already in production, so check it once after the merge.

## Backlog (not before Friday)

- Anomaly severity: every top-2% user scores 0.986 or higher on the
  normalised scale, so all flagged users are "critical". Options:
  rank-based bands within the flagged set, or drop severity for anomalies
  and show rank only. Severity should stay "how unusual"; risk level
  already covers "how much damage".

- Pardot and Marketing Cloud are priced per org, not per seat. The
  catalog stores them as per-seat monthly prices ($1,250 and $400), so any
  per-seat savings line on them overstates savings. Treat them as org-level
  SKUs (no per-user math) or exclude them from seat findings.
