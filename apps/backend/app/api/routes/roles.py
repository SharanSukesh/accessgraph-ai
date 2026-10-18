"""Role hierarchy view (roadmap item 35a), read-only.

  - GET /orgs/{org_id}/roles/hierarchy         the role tree with counts and flags
  - GET /orgs/{org_id}/roles/{role_id}/users   users in one role

Reads Newton's synced snapshot only; nothing is written to Salesforce.
"""
from __future__ import annotations

from typing import Any, Dict, List

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_database
from app.services import privacy_mode
from app.services.role_hierarchy import (
    DEFAULT_DEEP_AFTER,
    DEFAULT_WIDE_AFTER,
    Thresholds,
    load_view,
    role_users,
)

router = APIRouter()


@router.get("/orgs/{org_id}/roles/hierarchy")
async def role_hierarchy(
    org_id: str,
    deep_after: int = Query(DEFAULT_DEEP_AFTER, ge=1, le=50),
    wide_after: int = Query(DEFAULT_WIDE_AFTER, ge=1, le=500),
    db: AsyncSession = Depends(get_database),
) -> Dict[str, Any]:
    return await load_view(db, org_id, Thresholds(deep_after=deep_after, wide_after=wide_after))


@router.get("/orgs/{org_id}/roles/{role_id}/users")
async def users_in_role(
    org_id: str,
    role_id: str,
    db: AsyncSession = Depends(get_database),
) -> List[Dict[str, Any]]:
    await privacy_mode.require_feature(db, org_id, "users")
    return await role_users(db, org_id, role_id)
