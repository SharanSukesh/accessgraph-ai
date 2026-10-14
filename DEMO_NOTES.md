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
export DATABASE_URL=postgresql://postgres:pw@localhost:55439/newton JWT_SECRET_KEY=local NEWTON_LOCAL_SEED=1 DEMO_MODE=true
.venv/bin/alembic upgrade head
.venv/bin/python scripts/seed_local_demo.py
```

Login: `admin@newton-demo.com` / `Local-demo-only-1` (override with
`SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`). The fixture is small (8 users),
so it exercises every page but won't show rich anomalies.
