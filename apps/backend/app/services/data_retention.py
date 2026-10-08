"""
Data retention and erasure.

Every org-scoped table is assigned to exactly one retention class below;
tests/test_data_retention.py fails if a table with an organization_id
column is left unclassified, so new features can't silently keep data
forever or escape erasure.

Retention runs daily from main.lifespan (run_retention_for_all_orgs) and
on demand from the privacy routes.
"""
import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy import Table, and_, delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.base import Base
from app.domain.models import (
    Organization,
    OrgUser,
    SalesforceConnection,
    SyncJob,
)

logger = logging.getLogger(__name__)

# Mirror of the client's Salesforce configuration and its users. Rows are
# upserted on every sync, so updated_at is "last seen in Salesforce";
# anything not refreshed within the window has left Salesforce (or the
# engagement has ended) and is purged.
SALESFORCE_MIRROR_TABLES = {
    "users_snapshot",
    "roles_snapshot",
    "profiles_snapshot",
    "permission_sets_snapshot",
    "permission_set_assignments_snapshot",
    "permission_set_groups_snapshot",
    "permission_set_group_components_snapshot",
    "object_permissions_snapshot",
    "field_permissions_snapshot",
    "group_snapshots",
    "group_member_snapshots",
    "account_share_snapshots",
    "opportunity_share_snapshots",
    "account_team_member_snapshots",
    "opportunity_team_member_snapshots",
    "organization_wide_default_snapshots",
    "sharing_rule_snapshots",
}

# Outputs of Newton's analyses, by creation time.
ANALYSIS_TABLES = {
    "access_anomalies",
    "risk_scores",
    "recommendations",
    "equity_snapshots",
    "org_analysis_snapshots",
    "org_findings",
    "org_analyzer_runs",
    "data_quality_runs",
    "object_quality_scores",
    "change_audit_runs",
    "change_audit_events",
    "package_sprawl_runs",
    "installed_packages",
    "report_sprawl_runs",
    "report_inventory_items",
    "automation_sprawl_runs",
    "automation_inventory_items",
    "integration_sprawl_runs",
    "integration_inventory_items",
    "license_fit_runs",
    "license_fit_assessments",
    "restructure_runs",
    "restructure_moves",
    "compliance_scorecard_runs",
    "deeplink_redemptions",
}

AUDIT_TABLES = {"audit_logs"}
SYNC_TABLES = {"sync_jobs"}

# Consultant-authored work and engagement configuration: kept until the
# org is deleted.
CONFIG_TABLES = {
    "salesforce_connections",
    "org_users",
    "org_access_grants",
    "license_price_book",
    "brand_settings",
    "vip_designations",
    "restructure_plans",
    "restructure_preservation_constraints",
}

RETENTION_CLASSES = {
    "salesforce_mirror": SALESFORCE_MIRROR_TABLES,
    "analysis": ANALYSIS_TABLES,
    "audit": AUDIT_TABLES,
    "sync": SYNC_TABLES,
    "config": CONFIG_TABLES,
}


def org_scoped_tables() -> List[Table]:
    """Tables with an organization_id column, children before parents."""
    return [
        t for t in reversed(Base.metadata.sorted_tables)
        if "organization_id" in t.c
    ]


class ErasureRefused(Exception):
    pass


class DataRetentionService:
    DEFAULT_SNAPSHOT_RETENTION_DAYS = 90
    DEFAULT_ANALYSIS_RETENTION_DAYS = 180
    DEFAULT_AUDIT_LOG_RETENTION_DAYS = 365
    DEFAULT_SYNC_JOB_RETENTION_DAYS = 30

    def __init__(self, db: AsyncSession):
        self.db = db

    @staticmethod
    def retention_policy() -> Dict[str, int]:
        return {
            "snapshots_days": DataRetentionService.DEFAULT_SNAPSHOT_RETENTION_DAYS,
            "analysis_days": DataRetentionService.DEFAULT_ANALYSIS_RETENTION_DAYS,
            "audit_logs_days": DataRetentionService.DEFAULT_AUDIT_LOG_RETENTION_DAYS,
            "sync_jobs_days": DataRetentionService.DEFAULT_SYNC_JOB_RETENTION_DAYS,
        }

    async def _delete_older_than(
        self, tables: set, org_id: str, column: str, cutoff: datetime
    ) -> Dict[str, int]:
        counts: Dict[str, int] = {}
        for table in org_scoped_tables():
            if table.name not in tables:
                continue
            result = await self.db.execute(
                delete(table).where(
                    and_(table.c.organization_id == org_id, table.c[column] < cutoff)
                )
            )
            if result.rowcount:
                counts[table.name] = result.rowcount
        return counts

    async def delete_old_snapshots(
        self, org_id: str, retention_days: int = DEFAULT_SNAPSHOT_RETENTION_DAYS
    ) -> Dict[str, int]:
        cutoff = datetime.now(timezone.utc) - timedelta(days=max(retention_days, 1))
        counts = await self._delete_older_than(
            SALESFORCE_MIRROR_TABLES, org_id, "updated_at", cutoff
        )
        await self.db.commit()
        return counts

    async def _delete_old_sync_jobs(self, org_id: str, cutoff: datetime) -> int:
        latest = (
            await self.db.execute(
                select(SyncJob.id)
                .where(SyncJob.organization_id == org_id)
                .order_by(SyncJob.created_at.desc())
                .limit(1)
            )
        ).scalar_one_or_none()
        stmt = delete(SyncJob).where(
            SyncJob.organization_id == org_id, SyncJob.created_at < cutoff
        )
        if latest:
            stmt = stmt.where(SyncJob.id != latest)
        return (await self.db.execute(stmt)).rowcount or 0

    async def cleanup_all_old_data(self, org_id: str) -> Dict[str, Any]:
        now = datetime.now(timezone.utc)
        results: Dict[str, Any] = {
            "salesforce_mirror": await self._delete_older_than(
                SALESFORCE_MIRROR_TABLES, org_id, "updated_at",
                now - timedelta(days=self.DEFAULT_SNAPSHOT_RETENTION_DAYS),
            ),
            "analysis": await self._delete_older_than(
                ANALYSIS_TABLES, org_id, "created_at",
                now - timedelta(days=self.DEFAULT_ANALYSIS_RETENTION_DAYS),
            ),
            "audit": await self._delete_older_than(
                AUDIT_TABLES, org_id, "created_at",
                now - timedelta(days=self.DEFAULT_AUDIT_LOG_RETENTION_DAYS),
            ),
            "sync_jobs": await self._delete_old_sync_jobs(
                org_id, now - timedelta(days=self.DEFAULT_SYNC_JOB_RETENTION_DAYS)
            ),
        }
        await self.db.commit()
        return results

    async def delete_all_org_data(self, org_id: str) -> Dict[str, Any]:
        """Right to erasure for a client org: revoke Newton's Salesforce
        grant, drop the graph copy, delete every org-scoped row, then the
        org itself."""
        org = await self.db.get(Organization, org_id)
        if org is None:
            raise ErasureRefused("Organization not found")
        has_staff = (
            await self.db.execute(
                select(func.count()).select_from(OrgUser).where(OrgUser.organization_id == org_id)
            )
        ).scalar_one()
        if has_staff:
            raise ErasureRefused("This is the Newton operator org, not a client org.")

        from app.api.routes.auth import revoke_connection

        revoked = False
        for connection in (
            await self.db.execute(
                select(SalesforceConnection).where(SalesforceConnection.organization_id == org_id)
            )
        ).scalars().all():
            try:
                revoked = await revoke_connection(connection) or revoked
            except Exception:  # noqa: BLE001 — erasure must proceed regardless
                logger.exception("erasure: token revoke failed for org %s", org_id)

        graph_cleared = await _clear_graph(org_id)

        counts: Dict[str, int] = {}
        for table in org_scoped_tables():
            result = await self.db.execute(
                delete(table).where(table.c.organization_id == org_id)
            )
            if result.rowcount:
                counts[table.name] = result.rowcount
        await self.db.delete(org)
        await self.db.commit()
        logger.warning("erasure: org %s deleted (%d rows)", org_id, sum(counts.values()))
        return {
            "deleted_counts": counts,
            "salesforce_access_revoked": revoked,
            "graph_cleared": graph_cleared,
        }

    async def get_data_inventory(self, org_id: str) -> Dict[str, Any]:
        categories: Dict[str, Dict[str, int]] = {name: {} for name in RETENTION_CLASSES}
        total = 0
        for table in org_scoped_tables():
            count = (
                await self.db.execute(
                    select(func.count()).select_from(table).where(table.c.organization_id == org_id)
                )
            ).scalar_one()
            category = next(
                (name for name, tables in RETENTION_CLASSES.items() if table.name in tables),
                "unclassified",
            )
            categories.setdefault(category, {})[table.name] = count
            total += count
        return {"categories": categories, "total_records": total}


async def _clear_graph(org_id: str) -> Optional[bool]:
    """Best effort: None when no graph database is configured/reachable."""
    try:
        from app.db.neo4j_client import get_neo4j_client
        from app.graph.repository import GraphRepository

        await asyncio.wait_for(
            GraphRepository(get_neo4j_client()).clear_org_graph(org_id), timeout=10
        )
        return True
    except Exception:  # noqa: BLE001
        logger.info("erasure: graph store not cleared for org %s", org_id, exc_info=True)
        return None


async def run_retention_for_all_orgs() -> None:
    from app.db.session import AsyncSessionLocal

    async with AsyncSessionLocal() as db:
        org_ids = (await db.execute(select(Organization.id))).scalars().all()
    for org_id in org_ids:
        try:
            async with AsyncSessionLocal() as db:
                results = await DataRetentionService(db).cleanup_all_old_data(org_id)
            logger.info("retention: org %s -> %s", org_id, results)
        except Exception:  # noqa: BLE001
            logger.exception("retention: cleanup failed for org %s", org_id)


async def retention_loop(interval_hours: int = 24) -> None:
    await asyncio.sleep(60)
    while True:
        await run_retention_for_all_orgs()
        await asyncio.sleep(interval_hours * 3600)
