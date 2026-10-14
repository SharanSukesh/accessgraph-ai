"""
Admin-only demo orgs.

A demo org is an Organization with is_demo=True, filled from a committed
fixture by the normal sync pipeline. It never has a Salesforce connection:
the OAuth callback refuses it, live-only modules refuse it, and every
Salesforce write refuses it.

- GET    /admin/demo-orgs           fixtures available + existing demo orgs
- POST   /admin/demo-orgs           create one from a fixture and sync it
- DELETE /admin/demo-orgs/{org_id}  erase a demo org and all its data
"""
import logging
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_database
from app.auth.deps import Principal, get_principal, require_admin
from app.domain.models import Organization, SyncJob, SyncStatus
from app.ingestion.demo_orgs import DEMO_FIXTURES, fixture_key
from app.ingestion.orchestrator import schedule_background_sync
from app.services.data_retention import DataRetentionService, ErasureRefused

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin/demo-orgs", tags=["demo-orgs"])


class DemoFixtureInfo(BaseModel):
    key: str
    org_name: str
    description: str


class DemoOrgRow(BaseModel):
    id: str
    name: str
    fixture: str
    created_at: Optional[datetime]
    last_sync_status: Optional[str]


class DemoOrgList(BaseModel):
    fixtures: List[DemoFixtureInfo]
    orgs: List[DemoOrgRow]


class CreateDemoOrg(BaseModel):
    fixture: str = "synthetic_mid_market"


class CreatedDemoOrg(BaseModel):
    id: str
    name: str
    fixture: str
    sync_job_id: str


async def _last_sync_status(db: AsyncSession, org_id: str) -> Optional[str]:
    job = (
        await db.execute(
            select(SyncJob)
            .where(SyncJob.organization_id == org_id)
            .order_by(SyncJob.created_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    return getattr(job.status, "value", job.status) if job else None


@router.get("", response_model=DemoOrgList)
async def list_demo_orgs(
    _admin: str = Depends(require_admin),
    db: AsyncSession = Depends(get_database),
):
    orgs = (
        await db.execute(
            select(Organization)
            .where(Organization.is_demo == True)  # noqa: E712
            .order_by(Organization.created_at)
        )
    ).scalars().all()
    return DemoOrgList(
        fixtures=[
            DemoFixtureInfo(key=k, org_name=f.org_name, description=f.description)
            for k, f in DEMO_FIXTURES.items()
        ],
        orgs=[
            DemoOrgRow(
                id=o.id,
                name=o.name,
                fixture=fixture_key(o),
                created_at=o.created_at,
                last_sync_status=await _last_sync_status(db, o.id),
            )
            for o in orgs
        ],
    )


@router.post("", response_model=CreatedDemoOrg, status_code=status.HTTP_201_CREATED)
async def create_demo_org(
    body: CreateDemoOrg,
    principal: Principal = Depends(get_principal),
    _admin: str = Depends(require_admin),
    db: AsyncSession = Depends(get_database),
):
    fixture = DEMO_FIXTURES.get(body.fixture)
    if fixture is None:
        raise HTTPException(status_code=400, detail=f"Unknown fixture '{body.fixture}'.")

    existing = (
        await db.execute(select(Organization).where(Organization.is_demo == True))  # noqa: E712
    ).scalars().all()
    for org in existing:
        if fixture_key(org) == body.fixture:
            raise HTTPException(
                status_code=409,
                detail=f"A demo org from this fixture already exists ({org.name}). Delete it first.",
            )

    org = Organization(
        name=fixture.org_name,
        domain="demo.invalid",
        is_demo=True,
        settings={"demo_fixture": body.fixture, "name_source": "manual"},
    )
    db.add(org)
    await db.flush()
    job = SyncJob(organization_id=org.id, status=SyncStatus.PENDING)
    db.add(job)
    await db.commit()

    schedule_background_sync(org.id, job.id)
    logger.info("demo org %s created from %s by %s", org.id, body.fixture, principal.email)
    return CreatedDemoOrg(id=org.id, name=org.name, fixture=body.fixture, sync_job_id=job.id)


@router.delete("/{org_id}")
async def delete_demo_org(
    org_id: str,
    principal: Principal = Depends(get_principal),
    _admin: str = Depends(require_admin),
    db: AsyncSession = Depends(get_database),
):
    org = await db.get(Organization, org_id)
    if org is None:
        raise HTTPException(status_code=404, detail="Organization not found")
    if not org.is_demo:
        # Never a back door to erasing a client org; that has its own
        # confirmed flow under Privacy.
        raise HTTPException(status_code=400, detail="Not a demo org.")
    try:
        result = await DataRetentionService(db).delete_all_org_data(org_id)
    except ErasureRefused as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    logger.info("demo org %s deleted by %s", org_id, principal.email)
    return {"id": org_id, "status": "deleted", "total_deleted": sum(result["deleted_counts"].values())}
