"""
Salesforce REST API Client
Handles data extraction from Salesforce
"""
import logging
from typing import Any, Dict, List, Optional

import httpx
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from app.salesforce.models import (
    QueryResponse,
    SalesforceAccountShare,
    SalesforceAccountTeamMember,
    SalesforceFieldPermission,
    SalesforceGroup,
    SalesforceGroupMember,
    SalesforceObjectPermission,
    SalesforceOpportunityShare,
    SalesforcePermissionSet,
    SalesforcePermissionSetAssignment,
    SalesforcePermissionSetGroup,
    SalesforcePermissionSetGroupComponent,
    SalesforceProfile,
    SalesforceSharingRule,
    SalesforceUser,
    SalesforceUserRole,
)

logger = logging.getLogger(__name__)


class SalesforceAPIClient:
    """
    Salesforce REST API client
    Handles SOQL queries and metadata extraction
    """

    def __init__(self, instance_url: str, access_token: str, api_version: str = "v59.0"):
        self.instance_url = instance_url.rstrip("/")
        self.access_token = access_token
        self.api_version = api_version
        self.base_url = f"{self.instance_url}/services/data/{api_version}"

    def _get_headers(self) -> Dict[str, str]:
        """Get HTTP headers with auth"""
        return {
            "Authorization": f"Bearer {self.access_token}",
            "Content-Type": "application/json",
        }

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        retry=retry_if_exception_type(httpx.HTTPStatusError),
        reraise=True,
    )
    async def query(self, soql: str) -> QueryResponse:
        """
        Execute SOQL query

        Args:
            soql: SOQL query string

        Returns:
            QueryResponse with results

        Raises:
            httpx.HTTPError: If query fails
        """
        url = f"{self.base_url}/query"
        params = {"q": soql}

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(url, headers=self._get_headers(), params=params)
            response.raise_for_status()

            data = response.json()
            return QueryResponse(**data)

    async def query_all(self, soql: str, batch_size: int = 2000) -> List[Dict[str, Any]]:
        """
        Execute query and handle pagination

        Args:
            soql: SOQL query string
            batch_size: Records per batch

        Returns:
            List of all records
        """
        all_records = []
        next_url = None

        # First query
        result = await self.query(soql)
        all_records.extend(result.records)

        # Handle pagination
        while not result.done and result.nextRecordsUrl:
            logger.info(f"Fetching next batch, total so far: {len(all_records)}")
            result = await self._query_more(result.nextRecordsUrl)
            all_records.extend(result.records)

        logger.info(f"Query complete, total records: {len(all_records)}")
        return all_records

    async def _query_more(self, next_records_url: str) -> QueryResponse:
        """
        Fetch next page of results

        Args:
            next_records_url: URL from previous response

        Returns:
            QueryResponse with next batch
        """
        url = f"{self.instance_url}{next_records_url}"

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(url, headers=self._get_headers())
            response.raise_for_status()

            data = response.json()
            return QueryResponse(**data)

    # =========================================================================
    # Extraction Methods
    # =========================================================================

    async def extract_users(self) -> List[SalesforceUser]:
        """
        Extract all users

        Returns:
            List of SalesforceUser objects
        """
        soql = """
            SELECT Id, Username, Name, Email, ProfileId, UserRoleId,
                   IsActive, UserType, Department, Title
            FROM User
            WHERE IsActive = true
        """

        records = await self.query_all(soql)
        users = [SalesforceUser(**rec) for rec in records]

        logger.info(f"Extracted {len(users)} users")
        return users

    async def extract_user_roles(self) -> List[SalesforceUserRole]:
        """
        Extract all user roles

        Returns:
            List of SalesforceUserRole objects
        """
        soql = """
            SELECT Id, Name, ParentRoleId
            FROM UserRole
        """

        records = await self.query_all(soql)
        roles = [SalesforceUserRole(**rec) for rec in records]

        logger.info(f"Extracted {len(roles)} roles")
        return roles

    async def extract_profiles(self) -> List[SalesforceProfile]:
        """
        Extract all profiles

        Returns:
            List of SalesforceProfile objects
        """
        soql = """
            SELECT Id, Name
            FROM Profile
        """

        records = await self.query_all(soql)
        profiles = [SalesforceProfile(**rec) for rec in records]

        logger.info(f"Extracted {len(profiles)} profiles")
        return profiles

    async def extract_permission_sets(self) -> List[SalesforcePermissionSet]:
        """
        Extract all permission sets

        Returns:
            List of SalesforcePermissionSet objects
        """
        soql = """
            SELECT Id, Name, Label, IsOwnedByProfile, ProfileId
            FROM PermissionSet
        """

        records = await self.query_all(soql)
        permission_sets = [SalesforcePermissionSet(**rec) for rec in records]

        logger.info(f"Extracted {len(permission_sets)} permission sets")
        return permission_sets

    async def extract_permission_set_assignments(self) -> List[SalesforcePermissionSetAssignment]:
        """
        Extract all permission set assignments

        Returns:
            List of SalesforcePermissionSetAssignment objects
        """
        soql = """
            SELECT Id, AssigneeId, PermissionSetId
            FROM PermissionSetAssignment
            WHERE Assignee.IsActive = true
        """

        records = await self.query_all(soql)
        assignments = [SalesforcePermissionSetAssignment(**rec) for rec in records]

        logger.info(f"Extracted {len(assignments)} permission set assignments")
        return assignments

    async def extract_permission_set_groups(self) -> List[SalesforcePermissionSetGroup]:
        """
        Extract all permission set groups

        Returns:
            List of SalesforcePermissionSetGroup objects
        """
        soql = """
            SELECT Id, DeveloperName, MasterLabel
            FROM PermissionSetGroup
        """

        records = await self.query_all(soql)
        groups = [SalesforcePermissionSetGroup(**rec) for rec in records]

        logger.info(f"Extracted {len(groups)} permission set groups")
        return groups

    async def extract_permission_set_group_components(self) -> List[SalesforcePermissionSetGroupComponent]:
        """
        Extract all permission set group components

        Returns:
            List of SalesforcePermissionSetGroupComponent objects
        """
        soql = """
            SELECT Id, PermissionSetGroupId, PermissionSetId
            FROM PermissionSetGroupComponent
        """

        records = await self.query_all(soql)
        components = [SalesforcePermissionSetGroupComponent(**rec) for rec in records]

        logger.info(f"Extracted {len(components)} PSG components")
        return components

    async def extract_object_permissions(self) -> List[SalesforceObjectPermission]:
        """
        Extract all object permissions

        Returns:
            List of SalesforceObjectPermission objects
        """
        soql = """
            SELECT Id, ParentId, SobjectType,
                   PermissionsRead, PermissionsCreate, PermissionsEdit, PermissionsDelete,
                   PermissionsViewAllRecords, PermissionsModifyAllRecords
            FROM ObjectPermissions
        """

        records = await self.query_all(soql)
        permissions = [SalesforceObjectPermission(**rec) for rec in records]

        logger.info(f"Extracted {len(permissions)} object permissions")
        return permissions

    async def extract_field_permissions(self) -> List[SalesforceFieldPermission]:
        """
        Extract all field permissions

        Returns:
            List of SalesforceFieldPermission objects
        """
        soql = """
            SELECT Id, ParentId, SobjectType, Field,
                   PermissionsRead, PermissionsEdit
            FROM FieldPermissions
        """

        records = await self.query_all(soql)
        permissions = [SalesforceFieldPermission(**rec) for rec in records]

        logger.info(f"Extracted {len(permissions)} field permissions")
        return permissions

    async def extract_groups(self) -> List[SalesforceGroup]:
        """
        Extract all groups (public groups, queues, roles, etc.)

        Returns:
            List of SalesforceGroup objects
        """
        soql = """
            SELECT Id, Name, Type, DeveloperName, RelatedId
            FROM Group
        """

        records = await self.query_all(soql)
        groups = [SalesforceGroup(**rec) for rec in records]

        logger.info(f"Extracted {len(groups)} groups")
        return groups

    async def extract_group_members(self) -> List[SalesforceGroupMember]:
        """
        Extract all group members

        Returns:
            List of SalesforceGroupMember objects
        """
        soql = """
            SELECT Id, GroupId, UserOrGroupId
            FROM GroupMember
        """

        records = await self.query_all(soql)
        members = [SalesforceGroupMember(**rec) for rec in records]

        logger.info(f"Extracted {len(members)} group members")
        return members

    async def extract_account_shares(self) -> List[SalesforceAccountShare]:
        """
        Extract all account shares

        Returns:
            List of SalesforceAccountShare objects
        """
        soql = """
            SELECT Id, AccountId, UserOrGroupId, AccountAccessLevel,
                   OpportunityAccessLevel, CaseAccessLevel, RowCause
            FROM AccountShare
            WHERE RowCause != 'Owner'
        """

        records = await self.query_all(soql)
        shares = [SalesforceAccountShare(**rec) for rec in records]

        logger.info(f"Extracted {len(shares)} account shares")
        return shares

    async def extract_opportunity_shares(self) -> List[SalesforceOpportunityShare]:
        """
        Extract all opportunity shares

        Returns:
            List of SalesforceOpportunityShare objects
        """
        soql = """
            SELECT Id, OpportunityId, UserOrGroupId, OpportunityAccessLevel, RowCause
            FROM OpportunityShare
            WHERE RowCause != 'Owner'
        """

        records = await self.query_all(soql)
        shares = [SalesforceOpportunityShare(**rec) for rec in records]

        logger.info(f"Extracted {len(shares)} opportunity shares")
        return shares

    async def extract_account_team_members(self) -> List[SalesforceAccountTeamMember]:
        """
        Extract all account team members

        Returns:
            List of SalesforceAccountTeamMember objects
        """
        soql = """
            SELECT Id, AccountId, UserId, TeamMemberRole,
                   AccountAccessLevel, OpportunityAccessLevel, CaseAccessLevel
            FROM AccountTeamMember
        """

        records = await self.query_all(soql)
        members = [SalesforceAccountTeamMember(**rec) for rec in records]

        logger.info(f"Extracted {len(members)} account team members")
        return members

    async def extract_all(self) -> Dict[str, List[Any]]:
        """
        Extract all data in one operation

        Returns:
            Dict with all extracted data (Pydantic models converted to dicts)
        """
        logger.info("Starting full extraction")

        # Extract all in parallel would be better, but let's keep it simple for now
        users = await self.extract_users()
        roles = await self.extract_user_roles()
        profiles = await self.extract_profiles()
        permission_sets = await self.extract_permission_sets()
        permission_set_assignments = await self.extract_permission_set_assignments()
        permission_set_groups = await self.extract_permission_set_groups()
        permission_set_group_components = await self.extract_permission_set_group_components()
        object_permissions = await self.extract_object_permissions()
        field_permissions = await self.extract_field_permissions()

        # Extract sharing data
        groups = await self.extract_groups()
        group_members = await self.extract_group_members()
        account_shares = await self.extract_account_shares()
        opportunity_shares = await self.extract_opportunity_shares()
        account_team_members = await self.extract_account_team_members()

        # Convert Pydantic models to dicts
        data = {
            "users": [u.model_dump() for u in users],
            "roles": [r.model_dump() for r in roles],
            "profiles": [p.model_dump() for p in profiles],
            "permission_sets": [ps.model_dump() for ps in permission_sets],
            "permission_set_assignments": [psa.model_dump() for psa in permission_set_assignments],
            "permission_set_groups": [psg.model_dump() for psg in permission_set_groups],
            "permission_set_group_components": [psgc.model_dump() for psgc in permission_set_group_components],
            "object_permissions": [op.model_dump() for op in object_permissions],
            "field_permissions": [fp.model_dump() for fp in field_permissions],
            "groups": [g.model_dump() for g in groups],
            "group_members": [gm.model_dump() for gm in group_members],
            "account_shares": [ash.model_dump() for ash in account_shares],
            "opportunity_shares": [osh.model_dump() for osh in opportunity_shares],
            "account_team_members": [atm.model_dump() for atm in account_team_members],
        }

        logger.info("Extraction complete")
        return data
