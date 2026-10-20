"""Writes docs/samples/lumenvale-org-documentation.xlsx: the Org
documentation workbook for the synthetic Lumenvale fixture, synced into an
in-memory database. Never touches a real org or any database.

    cd apps/backend && python scripts/make_documentation_sample.py
"""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker  # noqa: E402
from app.db.base import Base  # noqa: E402
from app.domain.models import Organization, SyncJob, SyncStatus  # noqa: E402
from app.ingestion.orchestrator import SyncOrchestrator  # noqa: E402
from app.services.change_risk_radar import ChangeRiskRadarService  # noqa: E402
from app.services.data_quality import DataQualityService  # noqa: E402
from app.services.report.documentation import build_documentation_workbook  # noqa: E402

OUT = Path(__file__).resolve().parents[3] / "docs/samples/lumenvale-org-documentation.xlsx"

async def main():
    eng = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with eng.begin() as c:
        await c.run_sync(Base.metadata.create_all)
    S = async_sessionmaker(eng, expire_on_commit=False)
    async with S() as db:
        org = Organization(name="Lumenvale Systems (Demo)", is_demo=True, settings={"demo_fixture": "synthetic_mid_market"})
        db.add(org)
        await db.flush()
        job = SyncJob(organization_id=org.id, status=SyncStatus.PENDING)
        db.add(job)
        await db.commit()
        await SyncOrchestrator(db).run_sync(org.id, job.id)
        # Data Quality's per-field counts let the Cleanup Candidates sheet say how many records hold a value.
        await DataQualityService(db, org.id).run(actor_email="sample")
        # The Change History sheet lists what Change-Risk Radar pulled (the fixture's audit trail on a demo org).
        await ChangeRiskRadarService(db, org.id).run(actor_email="sample")
        OUT.parent.mkdir(parents=True, exist_ok=True)
        OUT.write_bytes(await build_documentation_workbook(db, org))
        print("wrote", OUT, OUT.stat().st_size)


if __name__ == "__main__":
    asyncio.run(main())
