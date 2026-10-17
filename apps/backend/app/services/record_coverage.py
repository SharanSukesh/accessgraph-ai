"""How complete Newton's view of record-level sharing is.

Share rows (AccountShare, OpportunityShare) and owner counts are read as
the integration user, so they cover only records that user can see. They
are complete only if it holds View All Data or View All on the object.
The sync checks that and stores it on the sync job; every record-access
view uses it to say "Based on records the integration user can see"
instead of silently under-reporting.
"""
from __future__ import annotations

import re
from typing import Any, Dict, Optional, Sequence

from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.models import SyncJob, SyncStatus

RECORD_OBJECTS = ("Account", "Opportunity")
PARTIAL_LABEL = "Based on records the integration user can see"
_USER_ID = re.compile(r"005[A-Za-z0-9]{12}(?:[A-Za-z0-9]{3})?")


async def check_record_visibility(
    client: Any, user_id: Optional[str], objects: Sequence[str] = RECORD_OBJECTS,
) -> Dict[str, Any]:
    """Whether the connected user can see every record of each object
    (Account and Opportunity for record access; Data Quality passes the
    objects it scores).

    Reads the user's permission set assignments (the profile's own
    permission set included) for View All Data, and their object
    permissions for View All on each object. Read-only; returns
    {"checked": False} if it can't tell.
    """
    if not user_id or not _USER_ID.fullmatch(user_id):
        return {"checked": False}
    objects = [o for o in objects if re.fullmatch(r"[A-Za-z0-9_]+", o or "")]
    in_list = ", ".join(f"'{o}'" for o in objects)
    try:
        grants = (await client.query(
            "SELECT PermissionSet.PermissionsViewAllData FROM PermissionSetAssignment "
            f"WHERE AssigneeId = '{user_id}'"
        )).records or []
        perms = (await client.query(
            "SELECT SobjectType, PermissionsViewAllRecords FROM ObjectPermissions "
            f"WHERE SobjectType IN ({in_list}) AND ParentId IN "
            f"(SELECT PermissionSetId FROM PermissionSetAssignment WHERE AssigneeId = '{user_id}')"
        )).records or []
    except Exception:  # noqa: BLE001 — advisory; never fail a sync on it
        return {"checked": False}
    view_all_data = any((g.get("PermissionSet") or {}).get("PermissionsViewAllData") for g in grants)
    view_all = {o: any(p.get("SobjectType") == o and p.get("PermissionsViewAllRecords") for p in perms)
                for o in objects}
    return {"checked": True, "view_all_data": view_all_data, "view_all": view_all}


def object_coverage(stored: Optional[Dict[str, Any]], obj: str) -> str:
    """ "full", "partial" or "unknown" for one object."""
    stored = stored or {}
    if not stored.get("checked"):
        return "unknown"
    if stored.get("view_all_data") or (stored.get("view_all") or {}).get(obj):
        return "full"
    return "partial"


def summarize(stored: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """Per-object "full" / "partial" / "unknown", plus the label to show
    (None only when every object is fully covered)."""
    stored = stored or {}
    objects: Dict[str, str] = {}
    for obj in RECORD_OBJECTS:
        if not stored.get("checked"):
            objects[obj] = "unknown"
        elif stored.get("view_all_data") or (stored.get("view_all") or {}).get(obj):
            objects[obj] = "full"
        else:
            objects[obj] = "partial"
    partial = [o for o, s in objects.items() if s == "partial"]
    unknown = [o for o, s in objects.items() if s == "unknown"]
    if partial:
        detail = (f"The integration user has no View All on {' or '.join(partial)}, so records it can't "
                  "see, and the sharing on them, are missing. Counts are a minimum.")
    elif unknown:
        detail = ("Newton couldn't check whether the integration user has View All on "
                  f"{' or '.join(unknown)}, so treat counts as a minimum.")
    else:
        detail = None
    return {
        "objects": objects,
        "complete": not partial and not unknown,
        "label": None if not partial and not unknown else PARTIAL_LABEL,
        "detail": detail,
    }


async def latest_record_coverage(db: AsyncSession, org_id: str) -> Dict[str, Any]:
    """Coverage from the latest completed sync."""
    job = (await db.execute(
        select(SyncJob).where(SyncJob.organization_id == org_id, SyncJob.status == SyncStatus.COMPLETED)
        .order_by(desc(SyncJob.completed_at)).limit(1)
    )).scalar_one_or_none()
    return summarize(((job.sync_metadata or {}) if job else {}).get("record_coverage"))
