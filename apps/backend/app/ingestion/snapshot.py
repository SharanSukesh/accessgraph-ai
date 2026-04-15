"""
Snapshot Persistence
Persists Salesforce data snapshots to PostgreSQL
"""
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.models import (
    FieldPermissionSnapshot,
    ObjectPermissionSnapshot,
    PermissionSetAssignmentSnapshot,
    PermissionSetGroupComponentSnapshot,
    PermissionSetGroupSnapshot,
    PermissionSetSnapshot,
    ProfileSnapshot,
    RoleSnapshot,
    UserSnapshot,
)

logger = logging.getLogger(__name__)


class SnapshotPersister:
    """
    Persist Salesforce data snapshots
    Handles upserts and maintains audit trail
    """

    def __init__(self, db: AsyncSession):
        self.db = db

    async def persist_users(
        self,
        org_id: str,
        users: List[Dict[str, Any]],
        sync_job_id: Optional[str] = None,
    ) -> int:
        """Persist user snapshots"""
        count = 0

        for user_data in users:
            # Check if exists
            result = await self.db.execute(
                select(UserSnapshot).where(
                    UserSnapshot.organization_id == org_id,
                    UserSnapshot.salesforce_id == user_data["Id"],
                )
            )
            existing = result.scalar_one_or_none()

            if existing:
                # Update
                existing.username = user_data["Username"]
                existing.name = user_data["Name"]
                existing.email = user_data.get("Email")
                existing.user_type = user_data.get("UserType")
                existing.is_active = user_data.get("IsActive", True)
                existing.profile_id = user_data.get("ProfileId")
                existing.user_role_id = user_data.get("UserRoleId")
                existing.department = user_data.get("Department")
                existing.title = user_data.get("Title")
                existing.raw_data = user_data
                existing.sync_job_id = sync_job_id
            else:
                # Create
                user = UserSnapshot(
                    organization_id=org_id,
                    sync_job_id=sync_job_id,
                    salesforce_id=user_data["Id"],
                    username=user_data["Username"],
                    name=user_data["Name"],
                    email=user_data.get("Email"),
                    user_type=user_data.get("UserType"),
                    is_active=user_data.get("IsActive", True),
                    profile_id=user_data.get("ProfileId"),
                    user_role_id=user_data.get("UserRoleId"),
                    department=user_data.get("Department"),
                    title=user_data.get("Title"),
                    raw_data=user_data,
                )
                self.db.add(user)

            count += 1

        await self.db.flush()
        logger.info(f"Persisted {count} users")
        return count

    async def persist_roles(
        self,
        org_id: str,
        roles: List[Dict[str, Any]],
        sync_job_id: Optional[str] = None,
    ) -> int:
        """Persist role snapshots"""
        count = 0

        for role_data in roles:
            result = await self.db.execute(
                select(RoleSnapshot).where(
                    RoleSnapshot.organization_id == org_id,
                    RoleSnapshot.salesforce_id == role_data["Id"],
                )
            )
            existing = result.scalar_one_or_none()

            if existing:
                existing.name = role_data["Name"]
                existing.parent_role_id = role_data.get("ParentRoleId")
                existing.raw_data = role_data
                existing.sync_job_id = sync_job_id
            else:
                role = RoleSnapshot(
                    organization_id=org_id,
                    sync_job_id=sync_job_id,
                    salesforce_id=role_data["Id"],
                    name=role_data["Name"],
                    parent_role_id=role_data.get("ParentRoleId"),
                    raw_data=role_data,
                )
                self.db.add(role)

            count += 1

        await self.db.flush()
        logger.info(f"Persisted {count} roles")
        return count

    async def persist_profiles(
        self,
        org_id: str,
        profiles: List[Dict[str, Any]],
        sync_job_id: Optional[str] = None,
    ) -> int:
        """Persist profile snapshots"""
        count = 0

        for profile_data in profiles:
            result = await self.db.execute(
                select(ProfileSnapshot).where(
                    ProfileSnapshot.organization_id == org_id,
                    ProfileSnapshot.salesforce_id == profile_data["Id"],
                )
            )
            existing = result.scalar_one_or_none()

            if existing:
                existing.name = profile_data["Name"]
                existing.raw_data = profile_data
                existing.sync_job_id = sync_job_id
            else:
                profile = ProfileSnapshot(
                    organization_id=org_id,
                    sync_job_id=sync_job_id,
                    salesforce_id=profile_data["Id"],
                    name=profile_data["Name"],
                    raw_data=profile_data,
                )
                self.db.add(profile)

            count += 1

        await self.db.flush()
        logger.info(f"Persisted {count} profiles")
        return count

    async def persist_permission_sets(
        self,
        org_id: str,
        permission_sets: List[Dict[str, Any]],
        sync_job_id: Optional[str] = None,
    ) -> int:
        """Persist permission set snapshots"""
        count = 0

        for ps_data in permission_sets:
            result = await self.db.execute(
                select(PermissionSetSnapshot).where(
                    PermissionSetSnapshot.organization_id == org_id,
                    PermissionSetSnapshot.salesforce_id == ps_data["Id"],
                )
            )
            existing = result.scalar_one_or_none()

            if existing:
                existing.name = ps_data["Name"]
                existing.label = ps_data["Label"]
                existing.is_owned_by_profile = ps_data.get("IsOwnedByProfile", False)
                existing.profile_id = ps_data.get("ProfileId")
                existing.raw_data = ps_data
                existing.sync_job_id = sync_job_id
            else:
                ps = PermissionSetSnapshot(
                    organization_id=org_id,
                    sync_job_id=sync_job_id,
                    salesforce_id=ps_data["Id"],
                    name=ps_data["Name"],
                    label=ps_data["Label"],
                    is_owned_by_profile=ps_data.get("IsOwnedByProfile", False),
                    profile_id=ps_data.get("ProfileId"),
                    raw_data=ps_data,
                )
                self.db.add(ps)

            count += 1

        await self.db.flush()
        logger.info(f"Persisted {count} permission sets")
        return count

    async def persist_permission_set_assignments(
        self,
        org_id: str,
        assignments: List[Dict[str, Any]],
        sync_job_id: Optional[str] = None,
    ) -> int:
        """Persist permission set assignment snapshots"""
        count = 0

        for assignment_data in assignments:
            result = await self.db.execute(
                select(PermissionSetAssignmentSnapshot).where(
                    PermissionSetAssignmentSnapshot.organization_id == org_id,
                    PermissionSetAssignmentSnapshot.salesforce_id == assignment_data["Id"],
                )
            )
            existing = result.scalar_one_or_none()

            if existing:
                existing.assignee_id = assignment_data["AssigneeId"]
                existing.permission_set_id = assignment_data["PermissionSetId"]
                existing.raw_data = assignment_data
                existing.sync_job_id = sync_job_id
            else:
                assignment = PermissionSetAssignmentSnapshot(
                    organization_id=org_id,
                    sync_job_id=sync_job_id,
                    salesforce_id=assignment_data["Id"],
                    assignee_id=assignment_data["AssigneeId"],
                    permission_set_id=assignment_data["PermissionSetId"],
                    raw_data=assignment_data,
                )
                self.db.add(assignment)

            count += 1

        await self.db.flush()
        logger.info(f"Persisted {count} permission set assignments")
        return count

    async def persist_permission_set_groups(
        self,
        org_id: str,
        groups: List[Dict[str, Any]],
        sync_job_id: Optional[str] = None,
    ) -> int:
        """Persist permission set group snapshots"""
        count = 0

        for group_data in groups:
            result = await self.db.execute(
                select(PermissionSetGroupSnapshot).where(
                    PermissionSetGroupSnapshot.organization_id == org_id,
                    PermissionSetGroupSnapshot.salesforce_id == group_data["Id"],
                )
            )
            existing = result.scalar_one_or_none()

            if existing:
                existing.developer_name = group_data["DeveloperName"]
                existing.master_label = group_data["MasterLabel"]
                existing.raw_data = group_data
                existing.sync_job_id = sync_job_id
            else:
                group = PermissionSetGroupSnapshot(
                    organization_id=org_id,
                    sync_job_id=sync_job_id,
                    salesforce_id=group_data["Id"],
                    developer_name=group_data["DeveloperName"],
                    master_label=group_data["MasterLabel"],
                    raw_data=group_data,
                )
                self.db.add(group)

            count += 1

        await self.db.flush()
        logger.info(f"Persisted {count} permission set groups")
        return count

    async def persist_permission_set_group_components(
        self,
        org_id: str,
        components: List[Dict[str, Any]],
        sync_job_id: Optional[str] = None,
    ) -> int:
        """Persist PSG component snapshots"""
        count = 0

        for component_data in components:
            result = await self.db.execute(
                select(PermissionSetGroupComponentSnapshot).where(
                    PermissionSetGroupComponentSnapshot.organization_id == org_id,
                    PermissionSetGroupComponentSnapshot.salesforce_id == component_data["Id"],
                )
            )
            existing = result.scalar_one_or_none()

            if existing:
                existing.permission_set_group_id = component_data["PermissionSetGroupId"]
                existing.permission_set_id = component_data["PermissionSetId"]
                existing.raw_data = component_data
                existing.sync_job_id = sync_job_id
            else:
                component = PermissionSetGroupComponentSnapshot(
                    organization_id=org_id,
                    sync_job_id=sync_job_id,
                    salesforce_id=component_data["Id"],
                    permission_set_group_id=component_data["PermissionSetGroupId"],
                    permission_set_id=component_data["PermissionSetId"],
                    raw_data=component_data,
                )
                self.db.add(component)

            count += 1

        await self.db.flush()
        logger.info(f"Persisted {count} PSG components")
        return count

    async def persist_object_permissions(
        self,
        org_id: str,
        permissions: List[Dict[str, Any]],
        sync_job_id: Optional[str] = None,
    ) -> int:
        """Persist object permission snapshots"""
        count = 0

        for perm_data in permissions:
            result = await self.db.execute(
                select(ObjectPermissionSnapshot).where(
                    ObjectPermissionSnapshot.organization_id == org_id,
                    ObjectPermissionSnapshot.salesforce_id == perm_data["Id"],
                )
            )
            existing = result.scalar_one_or_none()

            if existing:
                existing.parent_id = perm_data["ParentId"]
                existing.sobject_type = perm_data["SobjectType"]
                existing.permissions_read = perm_data.get("PermissionsRead", False)
                existing.permissions_create = perm_data.get("PermissionsCreate", False)
                existing.permissions_edit = perm_data.get("PermissionsEdit", False)
                existing.permissions_delete = perm_data.get("PermissionsDelete", False)
                existing.permissions_view_all_records = perm_data.get("PermissionsViewAllRecords", False)
                existing.permissions_modify_all_records = perm_data.get("PermissionsModifyAllRecords", False)
                existing.raw_data = perm_data
                existing.sync_job_id = sync_job_id
            else:
                perm = ObjectPermissionSnapshot(
                    organization_id=org_id,
                    sync_job_id=sync_job_id,
                    salesforce_id=perm_data["Id"],
                    parent_id=perm_data["ParentId"],
                    sobject_type=perm_data["SobjectType"],
                    permissions_read=perm_data.get("PermissionsRead", False),
                    permissions_create=perm_data.get("PermissionsCreate", False),
                    permissions_edit=perm_data.get("PermissionsEdit", False),
                    permissions_delete=perm_data.get("PermissionsDelete", False),
                    permissions_view_all_records=perm_data.get("PermissionsViewAllRecords", False),
                    permissions_modify_all_records=perm_data.get("PermissionsModifyAllRecords", False),
                    raw_data=perm_data,
                )
                self.db.add(perm)

            count += 1

        await self.db.flush()
        logger.info(f"Persisted {count} object permissions")
        return count

    async def persist_field_permissions(
        self,
        org_id: str,
        permissions: List[Dict[str, Any]],
        sync_job_id: Optional[str] = None,
    ) -> int:
        """Persist field permission snapshots"""
        count = 0

        for perm_data in permissions:
            result = await self.db.execute(
                select(FieldPermissionSnapshot).where(
                    FieldPermissionSnapshot.organization_id == org_id,
                    FieldPermissionSnapshot.salesforce_id == perm_data["Id"],
                )
            )
            existing = result.scalar_one_or_none()

            if existing:
                existing.parent_id = perm_data["ParentId"]
                existing.sobject_type = perm_data["SobjectType"]
                existing.field = perm_data["Field"]
                existing.permissions_read = perm_data.get("PermissionsRead", False)
                existing.permissions_edit = perm_data.get("PermissionsEdit", False)
                existing.raw_data = perm_data
                existing.sync_job_id = sync_job_id
            else:
                perm = FieldPermissionSnapshot(
                    organization_id=org_id,
                    sync_job_id=sync_job_id,
                    salesforce_id=perm_data["Id"],
                    parent_id=perm_data["ParentId"],
                    sobject_type=perm_data["SobjectType"],
                    field=perm_data["Field"],
                    permissions_read=perm_data.get("PermissionsRead", False),
                    permissions_edit=perm_data.get("PermissionsEdit", False),
                    raw_data=perm_data,
                )
                self.db.add(perm)

            count += 1

        await self.db.flush()
        logger.info(f"Persisted {count} field permissions")
        return count

    async def persist_all(
        self,
        org_id: str,
        data: Dict[str, List[Dict[str, Any]]],
        sync_job_id: Optional[str] = None,
    ) -> Dict[str, int]:
        """
        Persist all extracted data

        Returns:
            Dict with counts per entity type
        """
        counts = {}

        counts["users"] = await self.persist_users(org_id, data.get("users", []), sync_job_id)
        counts["roles"] = await self.persist_roles(org_id, data.get("roles", []), sync_job_id)
        counts["profiles"] = await self.persist_profiles(org_id, data.get("profiles", []), sync_job_id)
        counts["permission_sets"] = await self.persist_permission_sets(
            org_id, data.get("permission_sets", []), sync_job_id
        )
        counts["permission_set_assignments"] = await self.persist_permission_set_assignments(
            org_id, data.get("permission_set_assignments", []), sync_job_id
        )
        counts["permission_set_groups"] = await self.persist_permission_set_groups(
            org_id, data.get("permission_set_groups", []), sync_job_id
        )
        counts["permission_set_group_components"] = await self.persist_permission_set_group_components(
            org_id, data.get("permission_set_group_components", []), sync_job_id
        )
        counts["object_permissions"] = await self.persist_object_permissions(
            org_id, data.get("object_permissions", []), sync_job_id
        )
        counts["field_permissions"] = await self.persist_field_permissions(
            org_id, data.get("field_permissions", []), sync_job_id
        )

        await self.db.commit()

        logger.info(f"Persisted all data: {counts}")
        return counts
