/**
 * User Types
 */

export interface User {
  id: string
  organizationId: string
  email: string
  firstName: string
  lastName: string
  displayName: string
  role: UserRole
  status: UserStatus
  department?: string
  title?: string
  manager?: UserReference
  salesforceUserId?: string
  lastLoginAt?: Date
  createdAt: Date
  updatedAt: Date
}

export enum UserRole {
  SUPER_ADMIN = 'super_admin',
  ORG_ADMIN = 'org_admin',
  SECURITY_ANALYST = 'security_analyst',
  VIEWER = 'viewer',
  SALESFORCE_USER = 'salesforce_user',
}

export enum UserStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  SUSPENDED = 'suspended',
  PENDING = 'pending',
}

export interface UserReference {
  id: string
  displayName: string
  email: string
}

export interface UserPermissions {
  userId: string
  permissions: Permission[]
  roles: string[]
  groups: string[]
  totalPermissionCount: number
}

export interface Permission {
  id: string
  type: PermissionType
  resource: string
  action: string
  scope?: string
  grantedAt: Date
  grantedBy?: string
  expiresAt?: Date
}

export enum PermissionType {
  DIRECT = 'direct',
  ROLE_BASED = 'role_based',
  GROUP_BASED = 'group_based',
  INHERITED = 'inherited',
}

export interface UserRiskProfile {
  userId: string
  riskScore: number
  riskLevel: RiskLevel
  factors: RiskFactor[]
  lastAssessedAt: Date
}

export enum RiskLevel {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export interface RiskFactor {
  type: string
  description: string
  severity: number
  detectedAt: Date
}
