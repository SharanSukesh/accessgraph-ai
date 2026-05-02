"""
Salesforce Data Sync Service
Orchestrates extraction and storage of Salesforce data
"""
import logging
from datetime import datetime, timezone
from typing import Dict, List
from uuid import uuid4

import httpx
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
    GroupSnapshot,
    GroupMemberSnapshot,
    AccountShareSnapshot,
    OpportunityShareSnapshot,
    AccountTeamMemberSnapshot,
    OrganizationWideDefaultSnapshot,
    SharingRuleSnapshot,
)
from app.salesforce.client import SalesforceAPIClient
from app.salesforce.oauth import SalesforceOAuthClient

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

    async def _refresh_access_token(self) -> SalesforceAPIClient:
        """
        Refresh the access token and return a new client

        Returns:
            New SalesforceAPIClient with refreshed token
        """
        # Get organization's Salesforce connection
        stmt = select(SalesforceConnection).where(
            SalesforceConnection.organization_id == self.org_id,
            SalesforceConnection.is_active == True
        )
        result = await self.db.execute(stmt)
        sf_connection = result.scalar_one_or_none()

        if not sf_connection or not sf_connection.refresh_token:
            raise ValueError(f"No refresh token available for org {self.org_id}")

        logger.warning("Access token expired, refreshing...")

        oauth_client = SalesforceOAuthClient()
        token_response = await oauth_client.refresh_access_token(
            sf_connection.refresh_token
        )

        # Update connection with new token
        sf_connection.access_token = token_response.access_token
        sf_connection.instance_url = token_response.instance_url
        await self.db.commit()

        logger.info("Access token refreshed successfully")

        # Return new client with refreshed token
        return SalesforceAPIClient(
            instance_url=token_response.instance_url,
            access_token=token_response.access_token
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

            # Try to extract data, retry once with refreshed token if 401
            try:
                sf_data = await client.extract_all()
            except httpx.HTTPStatusError as e:
                if e.response.status_code == 401:
                    logger.warning("Got 401 during extract_all, refreshing token and retrying...")
                    # Token expired during extraction - refresh and retry
                    client = await self._refresh_access_token()
                    sf_data = await client.extract_all()
                else:
                    raise

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

            # Sync sharing data
            stats["groups"] = await self._sync_groups(sf_data["groups"])
            stats["group_members"] = await self._sync_group_members(sf_data["group_members"])
            stats["account_shares"] = await self._sync_account_shares(sf_data["account_shares"])
            stats["opportunity_shares"] = await self._sync_opportunity_shares(sf_data["opportunity_shares"])
            stats["account_team_members"] = await self._sync_account_team_members(sf_data["account_team_members"])
            stats["organization_wide_defaults"] = await self._sync_organization_wide_defaults(sf_data["organization_wide_defaults"])
            stats["sharing_rules"] = await self._sync_sharing_rules(sf_data["sharing_rules"])

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
                profile_id=sf_user.ProfileId,
                user_role_id=sf_user.UserRoleId,
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
                parent_role_id=sf_role.ParentRoleId,
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
                profile_id=sf_ps.ProfileId,
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
                assignee_id=sf_assign.AssigneeId,
                permission_set_id=sf_assign.PermissionSetId,
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
                parent_id=sf_perm.ParentId,
                sobject_type=sf_perm.SobjectType,
                permissions_read=sf_perm.PermissionsRead,
                permissions_create=sf_perm.PermissionsCreate,
                permissions_edit=sf_perm.PermissionsEdit,
                permissions_delete=sf_perm.PermissionsDelete,
                permissions_view_all_records=sf_perm.PermissionsViewAllRecords,
                permissions_modify_all_records=sf_perm.PermissionsModifyAllRecords,
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
                parent_id=sf_perm.ParentId,
                sobject_type=sf_perm.SobjectType,
                field=sf_perm.Field,
                permissions_read=sf_perm.PermissionsRead,
                permissions_edit=sf_perm.PermissionsEdit,
            )
            self.db.add(perm)

        await self.db.commit()
        logger.info(f"Synced {len(permissions)} field permissions")
        return len(permissions)

    async def _sync_groups(self, groups: List) -> int:
        """Sync groups to database"""
        from sqlalchemy import select

        snapshot_date = datetime.now(timezone.utc)

        for sf_group in groups:
            # Handle NULL group names - use type + id as fallback
            group_name = sf_group.get("Name")
            if not group_name:
                group_type = sf_group.get("Type", "Unknown")
                group_id = sf_group.get("Id", "")[:8]  # First 8 chars of ID
                group_name = f"{group_type} Group ({group_id})"

            # Check if record already exists (upsert logic)
            stmt = select(GroupSnapshot).where(
                GroupSnapshot.organization_id == self.org_id,
                GroupSnapshot.salesforce_id == sf_group["Id"],
                GroupSnapshot.snapshot_date == snapshot_date
            )
            result = await self.db.execute(stmt)
            existing_group = result.scalar_one_or_none()

            if existing_group:
                # Update existing record
                existing_group.name = group_name
                existing_group.group_type = sf_group["Type"]
                existing_group.related_id = sf_group.get("RelatedId")
                existing_group.snapshot_date = snapshot_date
            else:
                # Create new record
                group = GroupSnapshot(
                    organization_id=self.org_id,
                    salesforce_id=sf_group["Id"],
                    name=group_name,
                    group_type=sf_group["Type"],
                    related_id=sf_group.get("RelatedId"),
                    snapshot_date=snapshot_date,
                )
                self.db.add(group)

        await self.db.commit()
        logger.info(f"Synced {len(groups)} groups")
        return len(groups)

    async def _sync_group_members(self, group_members: List) -> int:
        """Sync group members to database"""
        snapshot_date = datetime.now(datetime.timezone.utc)

        for sf_member in group_members:
            member = GroupMemberSnapshot(
                organization_id=self.org_id,
                salesforce_id=sf_member["Id"],
                group_id=sf_member["GroupId"],
                user_or_group_id=sf_member["UserOrGroupId"],
                snapshot_date=snapshot_date,
            )
            self.db.add(member)

        await self.db.commit()
        logger.info(f"Synced {len(group_members)} group members")
        return len(group_members)

    async def _sync_account_shares(self, account_shares: List) -> int:
        """Sync account shares to database"""
        snapshot_date = datetime.now(datetime.timezone.utc)

        for sf_share in account_shares:
            share = AccountShareSnapshot(
                organization_id=self.org_id,
                salesforce_id=sf_share["Id"],
                account_id=sf_share["AccountId"],
                user_or_group_id=sf_share["UserOrGroupId"],
                account_access_level=sf_share["AccountAccessLevel"],
                opportunity_access_level=sf_share["OpportunityAccessLevel"],
                case_access_level=sf_share["CaseAccessLevel"],
                row_cause=sf_share["RowCause"],
                snapshot_date=snapshot_date,
            )
            self.db.add(share)

        await self.db.commit()
        logger.info(f"Synced {len(account_shares)} account shares")
        return len(account_shares)

    async def _sync_opportunity_shares(self, opportunity_shares: List) -> int:
        """Sync opportunity shares to database"""
        snapshot_date = datetime.now(datetime.timezone.utc)

        for sf_share in opportunity_shares:
            share = OpportunityShareSnapshot(
                organization_id=self.org_id,
                salesforce_id=sf_share["Id"],
                opportunity_id=sf_share["OpportunityId"],
                user_or_group_id=sf_share["UserOrGroupId"],
                opportunity_access_level=sf_share["OpportunityAccessLevel"],
                row_cause=sf_share["RowCause"],
                snapshot_date=snapshot_date,
            )
            self.db.add(share)

        await self.db.commit()
        logger.info(f"Synced {len(opportunity_shares)} opportunity shares")
        return len(opportunity_shares)

    async def _sync_account_team_members(self, account_team_members: List) -> int:
        """Sync account team members to database"""
        snapshot_date = datetime.now(datetime.timezone.utc)

        for sf_member in account_team_members:
            member = AccountTeamMemberSnapshot(
                organization_id=self.org_id,
                salesforce_id=sf_member["Id"],
                account_id=sf_member["AccountId"],
                user_id=sf_member["UserId"],
                team_member_role=sf_member.get("TeamMemberRole"),
                account_access_level=sf_member["AccountAccessLevel"],
                opportunity_access_level=sf_member["OpportunityAccessLevel"],
                case_access_level=sf_member["CaseAccessLevel"],
                snapshot_date=snapshot_date,
            )
            self.db.add(member)

        await self.db.commit()
        logger.info(f"Synced {len(account_team_members)} account team members")
        return len(account_team_members)

    async def _sync_organization_wide_defaults(self, owds: List) -> int:
        """Sync organization-wide defaults to database"""
        snapshot_date = datetime.now(datetime.timezone.utc)

        for sf_owd in owds:
            owd = OrganizationWideDefaultSnapshot(
                organization_id=self.org_id,
                sobject_type=sf_owd["sobject_type"],
                sobject_label=sf_owd.get("sobject_label"),
                internal_sharing_model=sf_owd["internal_sharing_model"],
                external_sharing_model=sf_owd.get("external_sharing_model"),
                is_default_owner_is_creator=False,  # This would need to be extracted separately if needed
                snapshot_date=snapshot_date,
            )
            self.db.add(owd)

        await self.db.commit()
        logger.info(f"Synced {len(owds)} organization-wide defaults")
        return len(owds)

    async def _sync_sharing_rules(self, sharing_rules: List) -> int:
        """Sync sharing rules to database"""
        snapshot_date = datetime.now(datetime.timezone.utc)

        for sf_rule in sharing_rules:
            rule = SharingRuleSnapshot(
                organization_id=self.org_id,
                salesforce_id=sf_rule["Id"],
                rule_name=sf_rule["Name"],
                sobject_type=sf_rule["SobjectType"],
                rule_type=sf_rule["RuleType"],
                access_level=sf_rule["AccessLevel"],
                shared_to_type=sf_rule["SharedToType"],
                shared_to_id=sf_rule.get("SharedToId"),
                criteria=None,  # Would need additional data to populate
                is_active=True,
                snapshot_date=snapshot_date,
            )
            self.db.add(rule)

        await self.db.commit()
        logger.info(f"Synced {len(sharing_rules)} sharing rules")
        return len(sharing_rules)
