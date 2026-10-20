"""Role hierarchy view (roadmap item 35a), read-only.

  - GET /orgs/{org_id}/roles/hierarchy         the role tree with counts and flags
  - GET /orgs/{org_id}/roles/{role_id}/users   users in one role (paged with `page`)

Reads Newton's synced snapshot only; nothing is written to Salesforce.
"""
from __future__ import annotations

from typing import Any, Dict, List

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_database
from app.api.pagination import PageParams, page_params, paged
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
    status: str = Query("all", pattern="^(all|active|inactive)$"),
    params: PageParams = Depends(page_params),
    db: AsyncSession = Depends(get_database),
) -> Any:
    """Without `page`, every user in the old order (active first, riskiest first)."""
    await privacy_mode.require_feature(db, org_id, "users")
    rows: List[Dict[str, Any]] = await role_users(db, org_id, role_id)
    if not params.paged:
        return rows
    if status != "all":
        rows = [r for r in rows if r["is_active"] == (status == "active")]
    sorts: Dict[str, Any] = {
        "name": lambda r: r["name"],
        "profile": lambda r: r["profile"],
        "risk": lambda r: r["risk_score"],
        "last_login": lambda r: r["last_login_at"],
    }
    # No sort chosen: keep the service's order.
    return paged(rows, params, text=lambda r: " ".join(x for x in (r["name"], r["profile"]) if x),
                 sorts=sorts, default_sort=None)
