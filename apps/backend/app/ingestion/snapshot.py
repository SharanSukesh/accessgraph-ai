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
    AccountShareSnapshot,
    AccountTeamMemberSnapshot,
    FieldPermissionSnapshot,
    GroupMemberSnapshot,
    GroupSnapshot,
    ObjectPermissionSnapshot,
    OpportunityShareSnapshot,
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
        # Delete all existing object permissions for this org
        # This ensures removed permissions are properly removed from the database
        from sqlalchemy import delete

        delete_stmt = delete(ObjectPermissionSnapshot).where(
            ObjectPermissionSnapshot.organization_id == org_id
        )
        result = await self.db.execute(delete_stmt)
        deleted_count = result.rowcount
        logger.info(f"Deleted {deleted_count} existing object permissions for org {org_id}")

        # Insert all fresh permissions from Salesforce
        count = 0
        for perm_data in permissions:
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
        # Delete all existing field permissions for this org
        # This ensures removed permissions are properly removed from the database
        from sqlalchemy import delete

        delete_stmt = delete(FieldPermissionSnapshot).where(
            FieldPermissionSnapshot.organization_id == org_id
        )
        result = await self.db.execute(delete_stmt)
        deleted_count = result.rowcount
        logger.info(f"Deleted {deleted_count} existing field permissions for org {org_id}")

        # Insert all fresh permissions from Salesforce
        count = 0
        for perm_data in permissions:
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

    async def persist_groups(
        self,
        org_id: str,
        groups: List[Dict[str, Any]],
        sync_job_id: Optional[str] = None,
    ) -> int:
        """Persist group snapshots"""
        count = 0
        snapshot_date = datetime.now(timezone.utc)

        for group_data in groups:
            # Handle NULL group names - use type + id as fallback
            group_name = group_data.get("Name")
            if not group_name:
                group_type = group_data.get("Type", "Unknown")
                group_id = group_data.get("Id", "")[:8]  # First 8 chars of ID
                group_name = f"{group_type} Group ({group_id})"

            result = await self.db.execute(
                select(GroupSnapshot).where(
                    GroupSnapshot.organization_id == org_id,
                    GroupSnapshot.salesforce_id == group_data["Id"],
                )
            )
            existing = result.scalar_one_or_none()

            if existing:
                existing.name = group_name
                existing.group_type = group_data["Type"]
                existing.developer_name = group_data.get("DeveloperName")
                existing.related_id = group_data.get("RelatedId")
                existing.snapshot_date = snapshot_date
            else:
                group = GroupSnapshot(
                    organization_id=org_id,
                    salesforce_id=group_data["Id"],
                    name=group_name,
                    group_type=group_data["Type"],
                    developer_name=group_data.get("DeveloperName"),
                    related_id=group_data.get("RelatedId"),
                    snapshot_date=snapshot_date,
                )
                self.db.add(group)

            count += 1

        await self.db.flush()
        logger.info(f"Persisted {count} groups")
        return count

    async def persist_group_members(
        self,
        org_id: str,
        members: List[Dict[str, Any]],
        sync_job_id: Optional[str] = None,
    ) -> int:
        """Persist group member snapshots"""
        count = 0
        snapshot_date = datetime.now(timezone.utc)

        for member_data in members:
            result = await self.db.execute(
                select(GroupMemberSnapshot).where(
                    GroupMemberSnapshot.organization_id == org_id,
                    GroupMemberSnapshot.salesforce_id == member_data["Id"],
                )
            )
            existing = result.scalar_one_or_none()

            if existing:
                existing.group_id = member_data["GroupId"]
                existing.user_or_group_id = member_data["UserOrGroupId"]
                existing.snapshot_date = snapshot_date
            else:
                member = GroupMemberSnapshot(
                    organization_id=org_id,
                    salesforce_id=member_data["Id"],
                    group_id=member_data["GroupId"],
                    user_or_group_id=member_data["UserOrGroupId"],
                    snapshot_date=snapshot_date,
                )
                self.db.add(member)

            count += 1

        await self.db.flush()
        logger.info(f"Persisted {count} group members")
        return count

    async def persist_account_shares(
        self,
        org_id: str,
        shares: List[Dict[str, Any]],
        sync_job_id: Optional[str] = None,
    ) -> int:
        """Persist account share snapshots"""
        count = 0
        snapshot_date = datetime.now(timezone.utc)

        for share_data in shares:
            result = await self.db.execute(
                select(AccountShareSnapshot).where(
                    AccountShareSnapshot.organization_id == org_id,
                    AccountShareSnapshot.salesforce_id == share_data["Id"],
                )
            )
            existing = result.scalar_one_or_none()

            if existing:
                existing.account_id = share_data["AccountId"]
                existing.user_or_group_id = share_data["UserOrGroupId"]
                existing.account_access_level = share_data["AccountAccessLevel"]
                existing.opportunity_access_level = share_data["OpportunityAccessLevel"]
                existing.case_access_level = share_data["CaseAccessLevel"]
                existing.row_cause = share_data["RowCause"]
                existing.snapshot_date = snapshot_date
            else:
                share = AccountShareSnapshot(
                    organization_id=org_id,
                    salesforce_id=share_data["Id"],
                    account_id=share_data["AccountId"],
                    user_or_group_id=share_data["UserOrGroupId"],
                    account_access_level=share_data["AccountAccessLevel"],
                    opportunity_access_level=share_data["OpportunityAccessLevel"],
                    case_access_level=share_data["CaseAccessLevel"],
                    row_cause=share_data["RowCause"],
                    snapshot_date=snapshot_date,
                )
                self.db.add(share)

            count += 1

        await self.db.flush()
        logger.info(f"Persisted {count} account shares")
        return count

    async def persist_opportunity_shares(
        self,
        org_id: str,
        shares: List[Dict[str, Any]],
        sync_job_id: Optional[str] = None,
    ) -> int:
        """Persist opportunity share snapshots"""
        count = 0
        snapshot_date = datetime.now(timezone.utc)

        for share_data in shares:
            result = await self.db.execute(
                select(OpportunityShareSnapshot).where(
                    OpportunityShareSnapshot.organization_id == org_id,
                    OpportunityShareSnapshot.salesforce_id == share_data["Id"],
                )
            )
            existing = result.scalar_one_or_none()

            if existing:
                existing.opportunity_id = share_data["OpportunityId"]
                existing.user_or_group_id = share_data["UserOrGroupId"]
                existing.opportunity_access_level = share_data["OpportunityAccessLevel"]
                existing.row_cause = share_data["RowCause"]
                existing.snapshot_date = snapshot_date
            else:
                share = OpportunityShareSnapshot(
                    organization_id=org_id,
                    salesforce_id=share_data["Id"],
                    opportunity_id=share_data["OpportunityId"],
                    user_or_group_id=share_data["UserOrGroupId"],
                    opportunity_access_level=share_data["OpportunityAccessLevel"],
                    row_cause=share_data["RowCause"],
                    snapshot_date=snapshot_date,
                )
                self.db.add(share)

            count += 1

        await self.db.flush()
        logger.info(f"Persisted {count} opportunity shares")
        return count

    async def persist_account_team_members(
        self,
        org_id: str,
        members: List[Dict[str, Any]],
        sync_job_id: Optional[str] = None,
    ) -> int:
        """Persist account team member snapshots"""
        count = 0
        snapshot_date = datetime.now(timezone.utc)

        for member_data in members:
            result = await self.db.execute(
                select(AccountTeamMemberSnapshot).where(
                    AccountTeamMemberSnapshot.organization_id == org_id,
                    AccountTeamMemberSnapshot.salesforce_id == member_data["Id"],
                )
            )
            existing = result.scalar_one_or_none()

            if existing:
                existing.account_id = member_data["AccountId"]
                existing.user_id = member_data["UserId"]
                existing.team_member_role = member_data.get("TeamMemberRole")
                existing.account_access_level = member_data["AccountAccessLevel"]
                existing.opportunity_access_level = member_data["OpportunityAccessLevel"]
                existing.case_access_level = member_data["CaseAccessLevel"]
                existing.snapshot_date = snapshot_date
            else:
                member = AccountTeamMemberSnapshot(
                    organization_id=org_id,
                    salesforce_id=member_data["Id"],
                    account_id=member_data["AccountId"],
                    user_id=member_data["UserId"],
                    team_member_role=member_data.get("TeamMemberRole"),
                    account_access_level=member_data["AccountAccessLevel"],
                    opportunity_access_level=member_data["OpportunityAccessLevel"],
                    case_access_level=member_data["CaseAccessLevel"],
                    snapshot_date=snapshot_date,
                )
                self.db.add(member)

            count += 1

        await self.db.flush()
        logger.info(f"Persisted {count} account team members")
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

        # Persist sharing data
        counts["groups"] = await self.persist_groups(
            org_id, data.get("groups", []), sync_job_id
        )
        counts["group_members"] = await self.persist_group_members(
            org_id, data.get("group_members", []), sync_job_id
        )
        counts["account_shares"] = await self.persist_account_shares(
            org_id, data.get("account_shares", []), sync_job_id
        )
        counts["opportunity_shares"] = await self.persist_opportunity_shares(
            org_id, data.get("opportunity_shares", []), sync_job_id
        )
        counts["account_team_members"] = await self.persist_account_team_members(
            org_id, data.get("account_team_members", []), sync_job_id
        )

        await self.db.commit()

        logger.info(f"Persisted all data: {counts}")
        return counts
