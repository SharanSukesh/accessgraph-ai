"""Apply-fix dispatcher for Org Analyzer findings.

Translates a finding into a Salesforce write-back. Re-uses the same
SalesforceAPIClient + AuditLog plumbing the Reporting Graph editor
already exercises, so we don't introduce a second write-back path.

Initial action allowlist is intentionally small:
  LICENSE_INACTIVE_USER     → User.IsActive = false
  LICENSE_NEVER_LOGGED_IN   → User.IsActive = false

Every additional action type lands here as a new dispatch-table entry
PLUS a UI affordance, so the consultant always sees the exact PATCH
they're about to authorise.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.models import (
    AuditAction,
    AuditLog,
    OrgFinding,
    OrgUser,
    OrgUserRole,
    UserSnapshot,
)
from app.services.salesforce_sync import SalesforceSyncService


logger = logging.getLogger(__name__)


# Codes whose findings expose a one-click "Apply fix" affordance.
APPLY_FIX_SUPPORTED = frozenset({
    "LICENSE_INACTIVE_USER",
    "LICENSE_NEVER_LOGGED_IN",
})


@dataclass
class ApplyFixResult:
    finding_id: str
    code: str
    succeeded_count: int
    failed_count: int
    details: List[Dict[str, Any]]
    error: Optional[str] = None


class ApplyFixService:
    """Service that executes the SF write-back implied by a finding.

    Mirrors `ReportingGraphService` in scope + safety: every call is
    audit-logged, errors per-row don't fail the batch, and a single
    finding can carry multiple target users (we operate on the sample
    rows the analyzer captured in evidence).
    """

    def __init__(self, db: AsyncSession, org_id: str):
        self.db = db
        self.org_id = org_id

    async def _authorize_org_admin(self, actor_email: str) -> None:
        """Same implicit-admin-until-explicit-RBAC pattern as the
        reporting-graph service. If any OrgUser row exists for this org,
        the actor must be ORG_ADMIN; otherwise we authorize implicitly
        on the OAuth handshake.
        """
        result = await self.db.execute(
            select(OrgUser).where(OrgUser.organization_id == self.org_id)
        )
        org_users = list(result.scalars().all())
        for u in org_users:
            if u.email == actor_email and u.role == OrgUserRole.ORG_ADMIN:
                return
        if not org_users:
            return  # implicit admin
        raise PermissionError(
            "Only ORG_ADMIN users can apply org-analyzer fixes for this org. "
            f"Actor '{actor_email}' is not in the ORG_ADMIN list."
        )

    async def apply_fix(
        self,
        finding: OrgFinding,
        actor_email: str,
        actor_ip: Optional[str],
        target_user_sf_ids: Optional[List[str]] = None,
    ) -> ApplyFixResult:
        """Execute the SF write-back implied by `finding`.

        Args:
            finding: The persisted OrgFinding row.
            actor_email: For audit attribution + ORG_ADMIN authz.
            actor_ip: For audit attribution (request.client.host).
            target_user_sf_ids: Optional subset of sample user ids to act
                on. None → act on every sample row in the finding's
                evidence. Lets the UI run apply-fix on one row at a time.
        """
        if finding.code not in APPLY_FIX_SUPPORTED:
            return ApplyFixResult(
                finding_id=finding.id,
                code=finding.code,
                succeeded_count=0,
                failed_count=0,
                details=[],
                error=(
                    f"No automated fix is registered for code '{finding.code}'. "
                    "Follow the recommended action manually."
                ),
            )

        await self._authorize_org_admin(actor_email)

        # Get the SF client via the existing sync-service refresh path so
        # we don't ever hit a stale-token 401.
        sync_service = SalesforceSyncService(self.db, self.org_id)
        sf_client = await sync_service._refresh_access_token()

        sample = (finding.evidence or {}).get("sample") or []
        targets = [
            row for row in sample
            if row.get("id") and (
                target_user_sf_ids is None
                or row["id"] in target_user_sf_ids
            )
        ]
        if not targets:
            return ApplyFixResult(
                finding_id=finding.id,
                code=finding.code,
                succeeded_count=0,
                failed_count=0,
                details=[],
                error="No matching target users in this finding's evidence.",
            )

        # Dispatch — both currently-supported codes deactivate the user.
        # Future codes land as new branches here.
        succeeded = 0
        failed = 0
        details: List[Dict[str, Any]] = []
        for row in targets:
            sf_id = row["id"]
            name = row.get("name") or sf_id
            try:
                await sf_client.update_user_with_retry(
                    sf_id, {"IsActive": False}
                )
                # Mirror in local UserSnapshot so the equity graph + next
                # analyzer run see the change without waiting for a sync.
                snap_q = await self.db.execute(
                    select(UserSnapshot).where(
                        UserSnapshot.organization_id == self.org_id,
                        UserSnapshot.salesforce_id == sf_id,
                    )
                )
                snap = snap_q.scalar_one_or_none()
                if snap is not None:
                    snap.is_active = False

                self.db.add(AuditLog(
                    organization_id=self.org_id,
                    user_email=actor_email,
                    action=AuditAction.UPDATE_USER_RELATIONSHIP,
                    resource_type="user",
                    resource_id=sf_id,
                    request_path=(
                        f"/orgs/{self.org_id}/org-analyzer/findings/"
                        f"{finding.id}/apply-fix"
                    ),
                    request_method="POST",
                    ip_address=actor_ip,
                    success=True,
                    context_data={
                        "finding_code": finding.code,
                        "finding_id": finding.id,
                        "field": "IsActive",
                        "prior_value": True,
                        "new_value": False,
                    },
                    created_at=datetime.now(timezone.utc),
                ))
                succeeded += 1
                details.append({
                    "user_sf_id": sf_id, "name": name, "success": True,
                })
            except Exception as e:
                logger.exception(
                    "apply-fix failed for user %s on finding %s", sf_id, finding.id,
                )
                failed += 1
                details.append({
                    "user_sf_id": sf_id, "name": name, "success": False,
                    "error": str(e)[:500],
                })

        # If every target succeeded, mark the finding resolved.
        if failed == 0 and succeeded > 0:
            finding.is_resolved = True
            finding.resolved_at = datetime.now(timezone.utc)
            finding.resolved_by = actor_email

        await self.db.commit()
        return ApplyFixResult(
            finding_id=finding.id,
            code=finding.code,
            succeeded_count=succeeded,
            failed_count=failed,
            details=details,
        )
