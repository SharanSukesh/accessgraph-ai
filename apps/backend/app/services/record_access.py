"""
Record-Level Access Service
Analyzes how users can access records in Salesforce
"""
import logging
from typing import Any, Dict, List, Optional
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.models import (
    AccountShareSnapshot,
    AccountTeamMemberSnapshot,
    GroupMemberSnapshot,
    GroupSnapshot,
    OpportunityShareSnapshot,
    OrganizationWideDefaultSnapshot,
    RoleSnapshot,
    UserSnapshot,
)

logger = logging.getLogger(__name__)


class RecordAccessService:
    """
    Service to calculate and analyze record-level access
    Implements the 6 ways users can access records in Salesforce
    """

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_user_record_access(
        self,
        org_id: str,
        user_sf_id: str,
    ) -> Dict[str, Any]:
        """
        Get all ways a user can access records

        Returns dict with:
        - owned_records: Records the user owns
        - role_hierarchy: Access via role hierarchy
        - manual_shares: Manual shares to this user
        - team_access: Team memberships
        - sharing_rules: Access via sharing rules
        - summary: Aggregated counts
        """

        # Get user details
        user_query = select(UserSnapshot).where(
            UserSnapshot.organization_id == org_id,
            UserSnapshot.salesforce_id == user_sf_id,
        )
        user_result = await self.db.execute(user_query)
        user = user_result.scalar_one_or_none()

        if not user:
            return {
                "error": "User not found",
                "owned_records": {},
                "role_hierarchy": {},
                "manual_shares": [],
                "team_access": [],
                "sharing_rules": [],
                "summary": {},
            }

        # 1. Owned Records - calculated from OwnerId field
        owned_records = await self._get_owned_records(org_id, user_sf_id)

        # 2. Role Hierarchy Access - access to subordinates' records
        role_hierarchy = await self._get_role_hierarchy_access(org_id, user)

        # 3. Manual Shares - explicit record shares
        manual_shares = await self._get_manual_shares(org_id, user_sf_id)

        # 4. Team Access - account/opportunity teams
        team_access = await self._get_team_access(org_id, user_sf_id)

        # 5. Sharing Rules - criteria-based and owner-based
        sharing_rules = await self._get_sharing_rules_access(org_id, user_sf_id)

        # 6. Organization-Wide Defaults - baseline sharing model
        organization_wide_defaults = await self._get_organization_wide_defaults(org_id)

        # Calculate summary
        summary = {
            "total_owned_records": sum(owned_records.values()),
            "total_manual_shares": len(manual_shares),
            "total_team_memberships": len(team_access),
            "total_sharing_rule_grants": len(sharing_rules),
            "has_role_hierarchy_access": bool(role_hierarchy.get("subordinate_count", 0) > 0),
        }

        return {
            "user_id": user_sf_id,
            "user_name": user.name,
            "owned_records": owned_records,
            "role_hierarchy": role_hierarchy,
            "manual_shares": manual_shares,
            "team_access": team_access,
            "sharing_rules": sharing_rules,
            "organization_wide_defaults": organization_wide_defaults,
            "summary": summary,
        }

    async def _get_owned_records(
        self,
        org_id: str,
        user_sf_id: str,
    ) -> Dict[str, int]:
        """
        Get count of records owned by this user

        Uses a lightweight approach:
        1. Count share records where RowCause='Owner' (no record storage needed!)
        2. This works because Salesforce creates Owner share records when OWD is not Public Read/Write

        Note: If OWD = Public Read/Write, owner shares may not exist.
        In that case, counts will be 0 (but user still owns records via permissions).
        """
        counts = {}

        # Count Account ownership from AccountShare
        account_count_query = select(func.count(AccountShareSnapshot.id)).where(
            AccountShareSnapshot.organization_id == org_id,
            AccountShareSnapshot.user_or_group_id == user_sf_id,
            AccountShareSnapshot.row_cause == 'Owner'
        )
        account_count_result = await self.db.execute(account_count_query)
        counts['Account'] = account_count_result.scalar() or 0

        # Count Opportunity ownership from OpportunityShare
        opp_count_query = select(func.count(OpportunityShareSnapshot.id)).where(
            OpportunityShareSnapshot.organization_id == org_id,
            OpportunityShareSnapshot.user_or_group_id == user_sf_id,
            OpportunityShareSnapshot.row_cause == 'Owner'
        )
        opp_count_result = await self.db.execute(opp_count_query)
        counts['Opportunity'] = opp_count_result.scalar() or 0

        # TODO: Add Case, Contact, Lead when we sync those share objects
        counts['Case'] = 0
        counts['Contact'] = 0
        counts['Lead'] = 0

        logger.info(f"Owned records for user {user_sf_id}: {counts}")
        return counts

    async def _get_role_hierarchy_access(
        self,
        org_id: str,
        user: UserSnapshot,
    ) -> Dict[str, Any]:
        """
        Calculate role hierarchy access
        Users can see records owned by users in subordinate roles
        """
        if not user.user_role_id:
            return {
                "has_role": False,
                "role_name": None,
                "subordinate_roles": [],
                "subordinate_count": 0,
            }

        # Get user's role
        role_query = select(RoleSnapshot).where(
            RoleSnapshot.organization_id == org_id,
            RoleSnapshot.salesforce_id == user.user_role_id,
        )
        role_result = await self.db.execute(role_query)
        role = role_result.scalar_one_or_none()

        if not role:
            return {
                "has_role": False,
                "role_name": None,
                "subordinate_roles": [],
                "subordinate_count": 0,
            }

        # Find all subordinate roles recursively
        subordinate_roles = await self._get_subordinate_roles(org_id, role.salesforce_id)

        return {
            "has_role": True,
            "role_id": role.salesforce_id,
            "role_name": role.name,
            "subordinate_roles": subordinate_roles,
            "subordinate_count": len(subordinate_roles),
        }

    async def _get_subordinate_roles(
        self,
        org_id: str,
        role_id: str,
        visited: Optional[set] = None,
    ) -> List[Dict[str, str]]:
        """
        Recursively get all subordinate roles
        """
        if visited is None:
            visited = set()

        if role_id in visited:
            return []

        visited.add(role_id)
        subordinates = []

        # Find direct children
        children_query = select(RoleSnapshot).where(
            RoleSnapshot.organization_id == org_id,
            RoleSnapshot.parent_role_id == role_id,
        )
        children_result = await self.db.execute(children_query)
        children = children_result.scalars().all()

        for child in children:
            subordinates.append({
                "role_id": child.salesforce_id,
                "role_name": child.name,
            })

            # Recursively get children's subordinates
            child_subordinates = await self._get_subordinate_roles(
                org_id, child.salesforce_id, visited
            )
            subordinates.extend(child_subordinates)

        return subordinates

    async def _get_manual_shares(
        self,
        org_id: str,
        user_sf_id: str,
    ) -> List[Dict[str, Any]]:
        """
        Get manual shares directly to this user or to groups they belong to
        """
        shares = []

        # Get user's group memberships
        user_groups = await self._get_user_groups(org_id, user_sf_id)
        user_and_group_ids = [user_sf_id] + [g["group_id"] for g in user_groups]

        # Get Account shares
        account_share_query = select(AccountShareSnapshot).where(
            AccountShareSnapshot.organization_id == org_id,
            AccountShareSnapshot.user_or_group_id.in_(user_and_group_ids),
            AccountShareSnapshot.row_cause == "Manual",
        )
        account_share_result = await self.db.execute(account_share_query)
        account_shares = account_share_result.scalars().all()

        for share in account_shares:
            shares.append({
                "record_type": "Account",
                "record_id": share.account_id,
                "access_level": share.account_access_level,
                "row_cause": share.row_cause,
                "shared_to": share.user_or_group_id,
            })

        # Get Opportunity shares
        opp_share_query = select(OpportunityShareSnapshot).where(
            OpportunityShareSnapshot.organization_id == org_id,
            OpportunityShareSnapshot.user_or_group_id.in_(user_and_group_ids),
            OpportunityShareSnapshot.row_cause == "Manual",
        )
        opp_share_result = await self.db.execute(opp_share_query)
        opp_shares = opp_share_result.scalars().all()

        for share in opp_shares:
            shares.append({
                "record_type": "Opportunity",
                "record_id": share.opportunity_id,
                "access_level": share.opportunity_access_level,
                "row_cause": share.row_cause,
                "shared_to": share.user_or_group_id,
            })

        return shares

    async def _get_user_groups(
        self,
        org_id: str,
        user_sf_id: str,
    ) -> List[Dict[str, str]]:
        """
        Get all groups this user belongs to (including nested groups)
        """
        groups = []
        visited = set()

        # Get direct group memberships
        direct_groups_query = select(GroupMemberSnapshot, GroupSnapshot).join(
            GroupSnapshot,
            GroupMemberSnapshot.group_id == GroupSnapshot.salesforce_id,
        ).where(
            GroupMemberSnapshot.organization_id == org_id,
            GroupMemberSnapshot.user_or_group_id == user_sf_id,
        )
        direct_groups_result = await self.db.execute(direct_groups_query)
        direct_groups = direct_groups_result.all()

        for member, group in direct_groups:
            if group.salesforce_id not in visited:
                visited.add(group.salesforce_id)
                groups.append({
                    "group_id": group.salesforce_id,
                    "group_name": group.name,
                    "group_type": group.group_type,
                })

        return groups

    async def _get_team_access(
        self,
        org_id: str,
        user_sf_id: str,
    ) -> List[Dict[str, Any]]:
        """
        Get team memberships (Account Teams, Opportunity Teams, etc.)
        """
        teams = []

        # Get Account Team memberships
        account_team_query = select(AccountTeamMemberSnapshot).where(
            AccountTeamMemberSnapshot.organization_id == org_id,
            AccountTeamMemberSnapshot.user_id == user_sf_id,
        )
        account_team_result = await self.db.execute(account_team_query)
        account_teams = account_team_result.scalars().all()

        for team in account_teams:
            teams.append({
                "team_type": "Account Team",
                "record_id": team.account_id,
                "role": team.team_member_role,
                "account_access": team.account_access_level,
                "opportunity_access": team.opportunity_access_level,
                "case_access": team.case_access_level,
            })

        return teams

    async def _get_sharing_rules_access(
        self,
        org_id: str,
        user_sf_id: str,
    ) -> List[Dict[str, Any]]:
        """
        Get access granted via sharing rules
        This is complex - sharing rules can grant access based on:
        - Owner-based rules
        - Criteria-based rules
        - Both can share to roles, public groups, territories

        For now, we'll analyze share records with RowCause indicating rules
        """
        shares = []

        # Get user's group memberships to check if any sharing rules target them
        user_groups = await self._get_user_groups(org_id, user_sf_id)
        user_and_group_ids = [user_sf_id] + [g["group_id"] for g in user_groups]

        # Get Account shares from sharing rules
        account_share_query = select(AccountShareSnapshot).where(
            AccountShareSnapshot.organization_id == org_id,
            AccountShareSnapshot.user_or_group_id.in_(user_and_group_ids),
            AccountShareSnapshot.row_cause.notin_(["Owner", "Manual", "Team"]),
        )
        account_share_result = await self.db.execute(account_share_query)
        account_shares = account_share_result.scalars().all()

        for share in account_shares:
            shares.append({
                "record_type": "Account",
                "record_id": share.account_id,
                "access_level": share.account_access_level,
                "row_cause": share.row_cause,
                "shared_to": share.user_or_group_id,
            })

        # Get Opportunity shares from sharing rules
        opp_share_query = select(OpportunityShareSnapshot).where(
            OpportunityShareSnapshot.organization_id == org_id,
            OpportunityShareSnapshot.user_or_group_id.in_(user_and_group_ids),
            OpportunityShareSnapshot.row_cause.notin_(["Owner", "Manual", "Team"]),
        )
        opp_share_result = await self.db.execute(opp_share_query)
        opp_shares = opp_share_result.scalars().all()

        for share in opp_shares:
            shares.append({
                "record_type": "Opportunity",
                "record_id": share.opportunity_id,
                "access_level": share.opportunity_access_level,
                "row_cause": share.row_cause,
                "shared_to": share.user_or_group_id,
            })

        return shares

    async def _get_organization_wide_defaults(
        self,
        org_id: str,
    ) -> List[Dict[str, Any]]:
        """
        Get Organization-Wide Default sharing settings for all objects

        OWD defines the baseline access level for each object in Salesforce:
        - Private: Only record owner (and those above in role hierarchy) can access
        - Read: All internal users can read
        - ReadWrite: All internal users can read and edit
        - ControlledByParent: Access inherited from parent record
        - FullAccess: All users have full access (rare)

        Returns:
            List of OWD settings with object type and sharing models
        """
        owds = []

        # Get the latest OWD settings for this org
        owd_query = select(OrganizationWideDefaultSnapshot).where(
            OrganizationWideDefaultSnapshot.organization_id == org_id
        ).order_by(
            OrganizationWideDefaultSnapshot.snapshot_date.desc()
        )
        owd_result = await self.db.execute(owd_query)
        owd_snapshots = owd_result.scalars().all()

        # Group by sobject_type and get the latest for each
        seen_objects = set()
        for owd in owd_snapshots:
            if owd.sobject_type not in seen_objects:
                seen_objects.add(owd.sobject_type)
                owds.append({
                    "sobject_type": owd.sobject_type,
                    "sobject_label": owd.sobject_label,
                    "internal_sharing_model": owd.internal_sharing_model,
                    "external_sharing_model": owd.external_sharing_model,
                })

        logger.info(f"Retrieved {len(owds)} OWD settings for org {org_id}")
        return owds
