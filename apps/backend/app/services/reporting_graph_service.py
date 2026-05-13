"""Reporting Graph Service — write-back orchestrator for admin-edited
manager / delegated-approver relationships.

The web app's Reporting Graph editor (drag-and-drop Cytoscape canvas)
collects pending edge edits client-side, then POSTs them here as a batch.
This service:

  1. Authorizes the actor (must have OrgUserRole.ORG_ADMIN for this org).
  2. Refreshes the SF access token if expired.
  3. For each edit, PATCHes the Salesforce User record then updates the
     local UserSnapshot so the equity graph reflects the change immediately
     on the next /equity/recommendations/generate call.
  4. Writes one AuditLog row per edit with prior_value + new_value in
     context_data.
  5. Returns per-edit results so the frontend can surface partial failures
     row-by-row.

First write-path in the codebase — read paths in equity_recommendations.py
and equity_diagnostic.py are completely unaffected.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import List, Literal, Optional

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.models import (
    AuditAction,
    AuditLog,
    OrgUser,
    OrgUserRole,
    UserSnapshot,
)
from app.services.salesforce_sync import SalesforceSyncService


logger = logging.getLogger(__name__)


# Salesforce field names we let the editor write. Anything outside this
# allowlist is rejected — keeps the blast radius of this service tight.
WRITABLE_USER_FIELDS = {"ManagerId", "DelegatedApproverId"}
LOCAL_COLUMN_BY_FIELD = {
    "ManagerId": "manager_id",
    "DelegatedApproverId": "delegated_approver_id",
}


@dataclass
class UserRelationshipEdit:
    """One row in the bulk apply payload."""
    user_sf_id: str
    field: Literal["ManagerId", "DelegatedApproverId"]
    new_value: Optional[str]  # 18-char SF user id, or None to clear


@dataclass
class UserRelationshipEditResult:
    user_sf_id: str
    field: str
    success: bool
    prior_value: Optional[str]
    new_value: Optional[str]
    error: Optional[str] = None


class ReportingGraphService:
    """Orchestrates Salesforce write-back for manager / delegated-approver
    edits from the Reporting Graph editor."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def _authorize_org_admin(
        self, org_id: str, actor_email: str
    ) -> OrgUser:
        """Raise PermissionError unless the actor has ORG_ADMIN for this org."""
        result = await self.db.execute(
            select(OrgUser).where(
                OrgUser.organization_id == org_id,
                OrgUser.email == actor_email,
            )
        )
        org_user = result.scalar_one_or_none()
        if org_user is None or org_user.role != OrgUserRole.ORG_ADMIN:
            raise PermissionError(
                "Only ORG_ADMIN users can edit the reporting graph for this org."
            )
        return org_user

    async def _prior_value(
        self, org_id: str, user_sf_id: str, field: str
    ) -> Optional[str]:
        """Read the current local snapshot value for audit logging."""
        result = await self.db.execute(
            select(UserSnapshot).where(
                UserSnapshot.organization_id == org_id,
                UserSnapshot.salesforce_id == user_sf_id,
            )
        )
        snap = result.scalar_one_or_none()
        if snap is None:
            return None
        column = LOCAL_COLUMN_BY_FIELD[field]
        return getattr(snap, column, None)

    async def apply_edits(
        self,
        org_id: str,
        actor_email: str,
        actor_ip: Optional[str],
        edits: List[UserRelationshipEdit],
    ) -> List[UserRelationshipEditResult]:
        """Validate, write, audit. Returns per-edit results.

        Partial-failure semantics: a single edit failing (SF 400, user
        deleted, etc.) does NOT abort the batch. Each row gets its own
        result with success/error. The audit log captures successes only;
        failures are visible in app logs but don't pollute the audit trail.
        """
        # Authorization happens once for the whole batch.
        await self._authorize_org_admin(org_id, actor_email)

        # Sanity-validate every edit before any mutation. If any field is
        # outside the allowlist, fail the whole batch (defensive — the
        # frontend shouldn't be able to send these).
        for edit in edits:
            if edit.field not in WRITABLE_USER_FIELDS:
                raise ValueError(
                    f"Field '{edit.field}' is not in the allowlist "
                    f"{sorted(WRITABLE_USER_FIELDS)}."
                )

        # Resolve a working SF API client. Reuses the existing sync service's
        # token-refresh logic so we never bother the user with stale-token
        # 401s mid-write.
        sync_service = SalesforceSyncService(self.db, org_id)
        sf_client = await sync_service._refresh_access_token()

        results: List[UserRelationshipEditResult] = []
        for edit in edits:
            prior = await self._prior_value(org_id, edit.user_sf_id, edit.field)
            try:
                await sf_client.update_user_with_retry(
                    edit.user_sf_id,
                    {edit.field: edit.new_value},
                )
            except httpx.HTTPStatusError as e:
                results.append(UserRelationshipEditResult(
                    user_sf_id=edit.user_sf_id,
                    field=edit.field,
                    success=False,
                    prior_value=prior,
                    new_value=edit.new_value,
                    error=str(e),
                ))
                logger.warning(
                    "Reporting-graph PATCH failed for user %s field %s: %s",
                    edit.user_sf_id, edit.field, e,
                )
                continue
            except Exception as e:
                results.append(UserRelationshipEditResult(
                    user_sf_id=edit.user_sf_id,
                    field=edit.field,
                    success=False,
                    prior_value=prior,
                    new_value=edit.new_value,
                    error=str(e),
                ))
                logger.exception(
                    "Reporting-graph PATCH unexpected error for user %s",
                    edit.user_sf_id,
                )
                continue

            # SF accepted the change. Mirror it into the local UserSnapshot
            # so the equity graph immediately reflects it (no need to wait
            # for the next sync). Skip the row if the snapshot is gone.
            local_col = LOCAL_COLUMN_BY_FIELD[edit.field]
            result = await self.db.execute(
                select(UserSnapshot).where(
                    UserSnapshot.organization_id == org_id,
                    UserSnapshot.salesforce_id == edit.user_sf_id,
                )
            )
            snap = result.scalar_one_or_none()
            if snap is not None:
                setattr(snap, local_col, edit.new_value)

            # Audit log — successful edits only.
            self.db.add(AuditLog(
                organization_id=org_id,
                user_email=actor_email,
                action=AuditAction.UPDATE_USER_RELATIONSHIP,
                resource_type="user",
                resource_id=edit.user_sf_id,
                request_path=f"/orgs/{org_id}/reporting-graph/apply",
                request_method="POST",
                ip_address=actor_ip,
                success=True,
                context_data={
                    "field": edit.field,
                    "prior_value": prior,
                    "new_value": edit.new_value,
                },
                created_at=datetime.now(timezone.utc),
            ))

            results.append(UserRelationshipEditResult(
                user_sf_id=edit.user_sf_id,
                field=edit.field,
                success=True,
                prior_value=prior,
                new_value=edit.new_value,
            ))

        await self.db.commit()
        return results
