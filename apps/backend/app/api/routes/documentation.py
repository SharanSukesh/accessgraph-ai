"""Org documentation workbook (roadmap item 11): the org's configuration
as Excel, from the last sync, with who can reach each thing documented.

  GET /orgs/{org_id}/documentation.xlsx
"""
from __future__ import annotations

import io
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_database
from app.domain.models import Organization, SyncJob, SyncStatus

router = APIRouter()


@router.get("/orgs/{org_id}/documentation.xlsx")
async def download_documentation(org_id: str, db: AsyncSession = Depends(get_database)) -> StreamingResponse:
    from app.services.report.documentation import build_documentation_workbook

    org = await db.get(Organization, org_id)
    if org is None:
        raise HTTPException(status_code=404, detail="Org not found")
    synced = (await db.execute(select(SyncJob.id).where(
        SyncJob.organization_id == org_id, SyncJob.status == SyncStatus.COMPLETED).limit(1))).first()
    if synced is None:
        raise HTTPException(status_code=404, detail="Not synced yet: sync the org first.")
    now = datetime.now(timezone.utc)
    data = await build_documentation_workbook(db, org, now)
    filename = f"{'demo-' if org.is_demo else ''}org-documentation-{now:%Y%m%d}.xlsx"
    return StreamingResponse(
        io.BytesIO(data),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
