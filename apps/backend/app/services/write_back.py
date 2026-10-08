"""Per-org consent for Newton to change anything in a client's Salesforce.

Off by default. Every write-back route checks it in addition to requiring
an ORG_ADMIN, so a mis-click or a compromised analyst account can't
modify a client org that never agreed to changes.
"""
from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.models import Organization


def write_back_enabled(org: Optional[Organization]) -> bool:
    return bool(org and (org.settings or {}).get("write_back", {}).get("enabled"))


async def require_write_back(db: AsyncSession, org_id: str) -> None:
    if not write_back_enabled(await db.get(Organization, org_id)):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Changes to this client's Salesforce are disabled. An admin can "
                "enable write-back for this org on its Privacy & Data page."
            ),
        )


def set_write_back(org: Organization, enabled: bool, actor_email: str, note: Optional[str]) -> dict:
    record = {
        "enabled": enabled,
        "changed_by": actor_email,
        "changed_at": datetime.now(timezone.utc).isoformat(),
        "note": (note or "")[:500],
    }
    org.settings = {**(org.settings or {}), "write_back": record}
    return record
