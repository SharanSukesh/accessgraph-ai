# Record-Level Access Implementation Plan

## Overview
Implement comprehensive record-level access analysis showing exactly which records a user can access and through what mechanism.

## Architecture

### 1. Data Models (Database Schema)

```python
# Sharing Rules
class SharingRuleSnapshot:
    - rule_id: str
    - rule_name: str
    - object_type: str  # Account, Opportunity, etc.
    - rule_type: str  # CriteriaBasedSharingRule, OwnerSharingRule
    - access_level: str  # Read, Edit
    - criteria: JSON  # For criteria-based rules
    - shared_to_type: str  # Role, RoleAndSubordinates, Group, etc.
    - shared_to_id: str

# Manual Shares
class ManualShareSnapshot:
    - share_id: str
    - record_id: str
    - user_or_group_id: str
    - access_level: str  # Read, Edit
    - row_cause: str  # Manual, Rule, etc.

# Account/Opportunity Teams
class AccountTeamMemberSnapshot:
    - team_member_id: str
    - account_id: str
    - user_id: str
    - team_member_role: str
    - account_access_level: str
    - opportunity_access_level: str

# Territory Assignments
class TerritoryAssignmentSnapshot:
    - assignment_id: str
    - territory_id: str
    - user_id: str
   - role: str

# Group Members
class GroupMemberSnapshot:
    - id: str
    - group_id: str
    - user_or_group_id: str
```

### 2. Salesforce API Integration

Need to query these Salesforce objects:
- `SharingRules` (various types: AccountSharingRules, OpportunitySharingRules, etc.)
- `AccountShare`, `OpportunityShare`, `ContactShare`, etc. (for manual shares)
- `AccountTeamMember`, `OpportunityTeamMember`, `CaseTeamMember`
- `UserTerritory2Association`, `Territory2`
- `Group`, `GroupMember`

### 3. Access Calculation Logic

For each user and object type, determine:

1. **Owned Records**
   - Query: `SELECT Id FROM {Object} WHERE OwnerId = :userId`
   - Access: Full (Read, Edit, Delete)

2. **Role Hierarchy Access**
   - Get user's role and all subordinate roles
   - Query records owned by users in subordinate roles
   - Respect organization-wide defaults (OWD)

3. **Sharing Rules**
   - Criteria-based: Evaluate criteria against records
   - Owner-based: Check if user is in shared-to role/group
   - Apply access level from rule

4. **Manual Shares**
   - Query `{Object}Share` table for user or their groups
   - Apply access level from share record

5. **Team Access**
   - Check AccountTeamMember, etc. for user
   - Apply team member access levels

6. **Territory Access**
   - Check UserTerritory2Association
   - Apply territory rules to matching accounts

### 4. API Endpoints

```python
# Get record-level access for a user
GET /orgs/{org_id}/users/{user_id}/record-access
Response: {
    "ownedRecords": {
        "Account": { "count": 50, "access": "full" },
        "Opportunity": { "count": 120, "access": "full" }
    },
    "roleHierarchyAccess": {
        "Account": { "count": 200, "access": "read" }
    },
    "sharingRuleAccess": {
        "Account": { "count": 500, "access": "read", "rules": [...] }
    },
    "manualShareAccess": {
        "Opportunity": { "count": 15, "access": "edit" }
    },
    "teamAccess": {
        "Account": { "count": 30, "teams": [...] }
    },
    "territoryAccess": {
        "Account": { "count": 1000, "territories": [...] }
    }
}

# Get specific records a user can access
GET /orgs/{org_id}/users/{user_id}/accessible-records/{object_type}
Query params: ?limit=100&offset=0
Response: {
    "records": [
        {
            "recordId": "001...",
            "recordName": "Acme Corp",
            "accessMethod": "ownership",  // or "role_hierarchy", "sharing_rule", etc.
            "accessLevel": "edit",
            "details": {...}
        }
    ],
    "pagination": {...}
}
```

### 5. Implementation Steps

#### Phase 1: Data Models & Ingestion (2-3 days)
1. Create database models for sharing rules, manual shares, teams, territories
2. Add Alembic migrations
3. Update Salesforce client to query sharing data
4. Add sync orchestrator logic to persist sharing data

#### Phase 2: Access Calculation Engine (3-4 days)
1. Implement owned records calculation
2. Implement role hierarchy traversal and access calculation
3. Implement sharing rule evaluation engine
4. Implement manual share lookup
5. Implement team access calculation
6. Implement territory access calculation
7. Add caching layer for performance

#### Phase 3: API Endpoints (1-2 days)
1. Create record-access summary endpoint
2. Create accessible-records detail endpoint
3. Add proper error handling and validation
4. Add API documentation

#### Phase 4: Frontend Integration (2-3 days)
1. Update graph detail panel to show real data
2. Create new "Record Access" tab in user detail page
3. Add visualizations for record access breakdown
4. Add drill-down capability to see specific records

#### Phase 5: Testing & Optimization (2-3 days)
1. Unit tests for access calculation logic
2. Integration tests for API endpoints
3. Performance optimization (caching, query optimization)
4. Load testing with production-scale data

### 6. Complexity & Considerations

**High Complexity Areas:**
- Sharing rule criteria evaluation (complex SOQL-like logic)
- Role hierarchy traversal with OWD settings
- Territory assignment rule evaluation
- Performance at scale (millions of records)

**Simplifications for MVP:**
- Start with standard objects only (Account, Opportunity, Contact, Lead, Case)
- Count-based analysis first, then drill-down later
- Cache aggressively (refresh on sync)
- Limit to direct access (not transitive through lookups)

### 7. Alternative: Simulated Data Approach

For immediate value without full implementation:
1. Calculate theoretical record access based on permissions
2. Show estimated counts based on typical distributions
3. Clearly label as "estimated" or "theoretical"
4. Provide educational content about record access mechanisms

## Timeline

- **Quick Win (1 day)**: Enhanced UI with educational content + simulated data
- **MVP (2 weeks)**: Basic implementation for Account object only
- **Full Feature (4-6 weeks)**: All standard objects + all access methods

## Recommendation

Given the current state, I recommend:
1. **Now**: Enhanced educational UI showing what record access means
2. **Next Sprint**: Implement for Account object only (most critical)
3. **Future**: Expand to all standard objects

This provides immediate value while building toward the complete solution.
