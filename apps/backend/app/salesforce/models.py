"""
Salesforce API Response Models
Pydantic models for Salesforce REST API responses
"""
from typing import List, Optional
from pydantic import BaseModel, Field


# =============================================================================
# OAuth
# =============================================================================


class OAuthTokenResponse(BaseModel):
    """Salesforce OAuth token response"""
    access_token: str
    refresh_token: Optional[str] = None
    instance_url: str
    id: str
    token_type: str = "Bearer"
    issued_at: str


# =============================================================================
# Salesforce Object Models
# =============================================================================


class SalesforceUser(BaseModel):
    """Salesforce User object"""
    Id: str
    Username: str
    Name: str
    Email: Optional[str] = None
    ProfileId: str
    UserRoleId: Optional[str] = None
    IsActive: bool = True
    UserType: Optional[str] = None
    Department: Optional[str] = None
    Title: Optional[str] = None


class SalesforceUserRole(BaseModel):
    """Salesforce UserRole object"""
    Id: str
    Name: str
    ParentRoleId: Optional[str] = None


class SalesforceProfile(BaseModel):
    """Salesforce Profile object"""
    Id: str
    Name: str


class SalesforcePermissionSet(BaseModel):
    """Salesforce PermissionSet object"""
    Id: str
    Name: str
    Label: str
    IsOwnedByProfile: bool = False
    ProfileId: Optional[str] = None


class SalesforcePermissionSetAssignment(BaseModel):
    """Salesforce PermissionSetAssignment object"""
    Id: str
    AssigneeId: str
    PermissionSetId: str


class SalesforcePermissionSetGroup(BaseModel):
    """Salesforce PermissionSetGroup object"""
    Id: str
    DeveloperName: str
    MasterLabel: str


class SalesforcePermissionSetGroupComponent(BaseModel):
    """Salesforce PermissionSetGroupComponent object"""
    Id: str
    PermissionSetGroupId: str
    PermissionSetId: str


class SalesforceObjectPermission(BaseModel):
    """Salesforce ObjectPermissions object"""
    Id: str
    ParentId: str
    SobjectType: str
    PermissionsRead: bool = False
    PermissionsCreate: bool = False
    PermissionsEdit: bool = False
    PermissionsDelete: bool = False
    PermissionsViewAllRecords: bool = False
    PermissionsModifyAllRecords: bool = False


class SalesforceFieldPermission(BaseModel):
    """Salesforce FieldPermissions object"""
    Id: str
    ParentId: str
    SobjectType: str
    Field: str
    PermissionsRead: bool = False
    PermissionsEdit: bool = False


# =============================================================================
# Record-Level Sharing Models
# =============================================================================


class SalesforceSharingRule(BaseModel):
    """Salesforce Sharing Rule (from metadata API or custom object)"""
    Id: str
    Name: str
    SobjectType: str
    RuleType: str  # OwnerSharingRule, CriteriaSharingRule, etc.
    AccessLevel: str
    SharedToType: str  # Group, Role, RoleAndSubordinates, etc.
    SharedToId: Optional[str] = None


class SalesforceAccountShare(BaseModel):
    """Salesforce AccountShare object"""
    Id: str
    AccountId: str
    UserOrGroupId: str
    AccountAccessLevel: str
    OpportunityAccessLevel: str
    CaseAccessLevel: str
    RowCause: str


class SalesforceOpportunityShare(BaseModel):
    """Salesforce OpportunityShare object"""
    Id: str
    OpportunityId: str
    UserOrGroupId: str
    OpportunityAccessLevel: str
    RowCause: str


class SalesforceGroup(BaseModel):
    """Salesforce Group object"""
    Id: str
    Name: Optional[str] = None  # Some groups may not have a name
    Type: str
    DeveloperName: Optional[str] = None
    RelatedId: Optional[str] = None


class SalesforceGroupMember(BaseModel):
    """Salesforce GroupMember object"""
    Id: str
    GroupId: str
    UserOrGroupId: str


class SalesforceAccountTeamMember(BaseModel):
    """Salesforce AccountTeamMember object"""
    Id: str
    AccountId: str
    UserId: str
    TeamMemberRole: Optional[str] = None
    AccountAccessLevel: str
    OpportunityAccessLevel: str
    CaseAccessLevel: str


# =============================================================================
# Query Response
# =============================================================================


class QueryResponse(BaseModel):
    """Salesforce SOQL query response"""
    totalSize: int
    done: bool
    records: List[dict]
    nextRecordsUrl: Optional[str] = None
