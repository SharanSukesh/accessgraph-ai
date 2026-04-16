"""
Salesforce Data Sync Service
Orchestrates extraction and storage of Salesforce data
"""
import logging
from datetime import datetime
from typing import Dict, List
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.models import (
    Organization,
    SalesforceConnection,
    SyncJob,
    UserSnapshot,
    RoleSnapshot,
    ProfileSnapshot,
    PermissionSetSnapshot,
    PermissionSetAssignmentSnapshot,
    PermissionSetGroupSnapshot,
    PermissionSetGroupComponentSnapshot,
    ObjectPermissionSnapshot,
    FieldPermissionSnapshot,
)
from app.salesforce.client import SalesforceAPIClient

logger = logging.getLogger(__name__)


class SalesforceSyncService:
    """
    Handles syncing data from Salesforce to database
    """

    def __init__(self, db: AsyncSession, org_id: str):
        self.db = db
        self.org_id = org_id

    async def _get_salesforce_client(self) -> SalesforceAPIClient:
        """Get authenticated Salesforce client for this org"""
        # Get organization's Salesforce connection
        stmt = select(SalesforceConnection).where(
            SalesforceConnection.organization_id == self.org_id,
            SalesforceConnection.is_active == True
        )
        result = await self.db.execute(stmt)
        sf_connection = result.scalar_one_or_none()

        if not sf_connection or not sf_connection.access_token:
            raise ValueError(f"No active Salesforce connection for org {self.org_id}")

        return SalesforceAPIClient(
            instance_url=sf_connection.instance_url,
            access_token=sf_connection.access_token
        )

    async def start_sync(self) -> SyncJob:
        """
        Start a new sync job

        Returns:
            Created SyncJob
        """
        sync_job = SyncJob(
            organization_id=self.org_id,
            status="in_progress",
            started_at=datetime.utcnow(),
        )
        self.db.add(sync_job)
        await self.db.commit()
        await self.db.refresh(sync_job)

        logger.info(f"Started sync job {sync_job.id} for org {self.org_id}")
        return sync_job

    async def complete_sync(self, sync_job: SyncJob, stats: Dict[str, int], error: str = None):
        """
        Mark sync job as complete

        Args:
            sync_job: The sync job to update
            stats: Statistics about synced records
            error: Error message if sync failed
        """
        sync_job.completed_at = datetime.utcnow()
        sync_job.status = "failed" if error else "completed"
        sync_job.error_message = error
        sync_job.records_synced = stats

        await self.db.commit()
        logger.info(f"Sync job {sync_job.id} {sync_job.status}: {stats}")

    async def sync_all(self) -> SyncJob:
        """
        Perform full sync of all Salesforce data

        Returns:
            Completed SyncJob
        """
        sync_job = await self.start_sync()
        stats = {}

        try:
            client = await self._get_salesforce_client()

            # Extract all data from Salesforce
            logger.info("Extracting data from Salesforce...")
            sf_data = await client.extract_all()

            # Sync each data type
            stats["users"] = await self._sync_users(sf_data["users"])
            stats["roles"] = await self._sync_roles(sf_data["roles"])
            stats["profiles"] = await self._sync_profiles(sf_data["profiles"])
            stats["permission_sets"] = await self._sync_permission_sets(sf_data["permission_sets"])
            stats["permission_set_assignments"] = await self._sync_permission_set_assignments(
                sf_data["permission_set_assignments"]
            )
            stats["permission_set_groups"] = await self._sync_permission_set_groups(
                sf_data["permission_set_groups"]
            )
            stats["permission_set_group_components"] = await self._sync_permission_set_group_components(
                sf_data["permission_set_group_components"]
            )
            stats["object_permissions"] = await self._sync_object_permissions(
                sf_data["object_permissions"]
            )
            stats["field_permissions"] = await self._sync_field_permissions(
                sf_data["field_permissions"]
            )

            await self.complete_sync(sync_job, stats)
            logger.info(f"Sync completed successfully: {stats}")

        except Exception as e:
            logger.error(f"Sync failed: {e}", exc_info=True)
            await self.complete_sync(sync_job, stats, error=str(e))
            raise

        return sync_job

    async def _sync_users(self, users: List) -> int:
        """Sync users to database"""
        for sf_user in users:
            user = UserSnapshot(
                organization_id=self.org_id,
                salesforce_id=sf_user.Id,
                username=sf_user.Username,
                name=sf_user.Name,
                email=sf_user.Email,
                profile_id_sf=sf_user.ProfileId,
                role_id_sf=sf_user.UserRoleId,
                is_active=sf_user.IsActive,
                user_type=sf_user.UserType,
                department=sf_user.Department,
                title=sf_user.Title,
            )
            self.db.add(user)

        await self.db.commit()
        logger.info(f"Synced {len(users)} users")
        return len(users)

    async def _sync_roles(self, roles: List) -> int:
        """Sync roles to database"""
        for sf_role in roles:
            role = RoleSnapshot(
                organization_id=self.org_id,
                salesforce_id=sf_role.Id,
                name=sf_role.Name,
                parent_role_id_sf=sf_role.ParentRoleId,
            )
            self.db.add(role)

        await self.db.commit()
        logger.info(f"Synced {len(roles)} roles")
        return len(roles)

    async def _sync_profiles(self, profiles: List) -> int:
        """Sync profiles to database"""
        for sf_profile in profiles:
            profile = ProfileSnapshot(
                organization_id=self.org_id,
                salesforce_id=sf_profile.Id,
                name=sf_profile.Name,
            )
            self.db.add(profile)

        await self.db.commit()
        logger.info(f"Synced {len(profiles)} profiles")
        return len(profiles)

    async def _sync_permission_sets(self, permission_sets: List) -> int:
        """Sync permission sets to database"""
        for sf_ps in permission_sets:
            ps = PermissionSetSnapshot(
                organization_id=self.org_id,
                salesforce_id=sf_ps.Id,
                name=sf_ps.Name,
                label=sf_ps.Label,
                is_owned_by_profile=sf_ps.IsOwnedByProfile,
                profile_id_sf=sf_ps.ProfileId,
            )
            self.db.add(ps)

        await self.db.commit()
        logger.info(f"Synced {len(permission_sets)} permission sets")
        return len(permission_sets)

    async def _sync_permission_set_assignments(self, assignments: List) -> int:
        """Sync permission set assignments to database"""
        for sf_assign in assignments:
            assign = PermissionSetAssignmentSnapshot(
                organization_id=self.org_id,
                salesforce_id=sf_assign.Id,
                assignee_id_sf=sf_assign.AssigneeId,
                permission_set_id_sf=sf_assign.PermissionSetId,
            )
            self.db.add(assign)

        await self.db.commit()
        logger.info(f"Synced {len(assignments)} permission set assignments")
        return len(assignments)

    async def _sync_permission_set_groups(self, groups: List) -> int:
        """Sync permission set groups to database"""
        for sf_group in groups:
            group = PermissionSetGroupSnapshot(
                organization_id=self.org_id,
                salesforce_id=sf_group.Id,
                developer_name=sf_group.DeveloperName,
                master_label=sf_group.MasterLabel,
            )
            self.db.add(group)

        await self.db.commit()
        logger.info(f"Synced {len(groups)} permission set groups")
        return len(groups)

    async def _sync_permission_set_group_components(self, components: List) -> int:
        """Sync permission set group components to database"""
        for sf_component in components:
            component = PermissionSetGroupComponentSnapshot(
                organization_id=self.org_id,
                salesforce_id=sf_component.Id,
                permission_set_group_id_sf=sf_component.PermissionSetGroupId,
                permission_set_id_sf=sf_component.PermissionSetId,
            )
            self.db.add(component)

        await self.db.commit()
        logger.info(f"Synced {len(components)} PSG components")
        return len(components)

    async def _sync_object_permissions(self, permissions: List) -> int:
        """Sync object permissions to database"""
        for sf_perm in permissions:
            perm = ObjectPermissionSnapshot(
                organization_id=self.org_id,
                salesforce_id=sf_perm.Id,
                parent_id_sf=sf_perm.ParentId,
                sobject_type=sf_perm.SobjectType,
                permissions_read=sf_perm.PermissionsRead,
                permissions_create=sf_perm.PermissionsCreate,
                permissions_edit=sf_perm.PermissionsEdit,
                permissions_delete=sf_perm.PermissionsDelete,
                permissions_view_all=sf_perm.PermissionsViewAllRecords,
                permissions_modify_all=sf_perm.PermissionsModifyAllRecords,
            )
            self.db.add(perm)

        await self.db.commit()
        logger.info(f"Synced {len(permissions)} object permissions")
        return len(permissions)

    async def _sync_field_permissions(self, permissions: List) -> int:
        """Sync field permissions to database"""
        for sf_perm in permissions:
            perm = FieldPermissionSnapshot(
                organization_id=self.org_id,
                salesforce_id=sf_perm.Id,
                parent_id_sf=sf_perm.ParentId,
                sobject_type=sf_perm.SobjectType,
                field=sf_perm.Field,
                permissions_read=sf_perm.PermissionsRead,
                permissions_edit=sf_perm.PermissionsEdit,
            )
            self.db.add(perm)

        await self.db.commit()
        logger.info(f"Synced {len(permissions)} field permissions")
        return len(permissions)
