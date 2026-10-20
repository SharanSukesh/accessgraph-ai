"""Item 30: how each option for the anomaly flag in the risk score would
change Lumenvale's levels. Reads nothing but the synthetic fixture (synced
into an in-memory database); changes no formula. Prints the numbers that
docs/risk-score-options.md quotes.

    cd apps/backend && python scripts/risk_options.py
"""
import asyncio
import collections
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from sqlalchemy import select  # noqa: E402
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine  # noqa: E402

from app.db.base import Base  # noqa: E402
from app.domain.models import AccessAnomaly, Organization, SyncJob, SyncStatus, UserSnapshot  # noqa: E402
from app.ingestion.orchestrator import SyncOrchestrator  # noqa: E402
from app.services.risk_scoring import ANOMALY_FACTOR, combine_factors, determine_risk_level, latest_user_risks  # noqa: E402

LEVELS = ("critical", "high", "medium", "low")


def score_with(factors, peer_weight=None):
    pairs = []
    for f in factors or []:
        w = f.get("weight", 0.0)
        if f.get("factor") == ANOMALY_FACTOR:
            if peer_weight is None:
                continue
            w = peer_weight
        pairs.append((w, f.get("score", 0.0)))
    return round(combine_factors(pairs), 1)


async def main() -> None:
    eng = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with eng.begin() as c:
        await c.run_sync(Base.metadata.create_all)
    async with async_sessionmaker(eng, expire_on_commit=False)() as db:
        org = Organization(name="Lumenvale Systems (Demo)", is_demo=True, settings={"demo_fixture": "synthetic_mid_market"})
        db.add(org)
        await db.flush()
        job = SyncJob(organization_id=org.id, status=SyncStatus.PENDING)
        db.add(job)
        await db.commit()
        await SyncOrchestrator(db).run_sync(org.id, job.id)
        risks = await latest_user_risks(db, org.id)
        flagged = {a.user_id: a for a in (await db.execute(select(AccessAnomaly).where(
            AccessAnomaly.organization_id == org.id, AccessAnomaly.category == "access"))).scalars()}
        names = {u.salesforce_id: u.name for u in (await db.execute(select(UserSnapshot).where(
            UserSnapshot.organization_id == org.id))).scalars()}
        options = {
            "1 or today (flag in the score, weight 0.35)": lambda r: float(r.risk_score),
            "2 and 4 (no peer deviation; base risk)": lambda r: score_with(r.factors, None),
            "3 (peer deviation at 0.15)": lambda r: score_with(r.factors, 0.15),
        }
        print(f"users scored: {len(risks)}, flagged access anomalies: {len(flagged)}")
        for label, fn in options.items():
            levels = collections.Counter(determine_risk_level(fn(r)).value for r in risks.values())
            print(f"{label}: " + ", ".join(f"{lvl} {levels.get(lvl, 0)}" for lvl in LEVELS))
        print("\nflagged users (rank order), score today / at 0.15 / without:")
        for a in sorted(flagged.values(), key=lambda a: -a.anomaly_score):
            r = risks[a.user_id]
            today, mid, base = float(r.risk_score), score_with(r.factors, 0.15), score_with(r.factors, None)
            print(f"  {names.get(a.user_id, a.user_id)}: {today:.1f} {determine_risk_level(today).value} / "
                  f"{mid:.1f} {determine_risk_level(mid).value} / {base:.1f} {determine_risk_level(base).value}")


if __name__ == "__main__":
    asyncio.run(main())
