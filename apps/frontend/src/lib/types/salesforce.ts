/**
 * Salesforce-Specific Types
 * Extended types for Salesforce access intelligence
 */

// ======================
// Salesforce Objects
// ======================

export interface SalesforceObject {
  apiName: string
  label: string
  isSensitive?: boolean
  category?: 'standard' | 'custom'
  recordCount?: number
}

export interface ObjectAccess {
  objectName: string
  objectLabel?: string
  permissions: ObjectPermissions
  sources: AccessSource[]
  isSensitive?: boolean
}

export interface ObjectPermissions {
  read: boolean
  create: boolean
  edit: boolean
  delete: boolean
  viewAll: boolean
  modifyAll: boolean
}

// ======================
// Salesforce Fields
// ======================

export interface SalesforceField {
  apiName: string
  objectName: string
  label: string
  type: string
  isSensitive?: boolean
  sensitivity?: FieldSensitivity
}

export interface FieldAccess {
  fieldApiName: string
  objectName: string
  fieldLabel?: string
  permissions: FieldPermissions
  sources: AccessSource[]
  sensitivity?: FieldSensitivity
}

export interface FieldPermissions {
  read: boolean
  edit: boolean
}

export enum FieldSensitivity {
  PUBLIC = 'public',
  INTERNAL = 'internal',
  CONFIDENTIAL = 'confidential',
  RESTRICTED = 'restricted',
  PII = 'pii',
  PHI = 'phi',
}

// ======================
// Access Sources
// ======================

export interface AccessSource {
  type: AccessSourceType
  id: string
  name: string
  isProfileBacked?: boolean
}

export enum AccessSourceType {
  PROFILE = 'profile',
  PERMISSION_SET = 'permission_set',
  PERMISSION_SET_GROUP = 'permission_set_group',
  DIRECT_ASSIGNMENT = 'direct_assignment',
}

// ======================
// Explanation Paths
// ======================

export interface ExplanationPath {
  id: string
  steps: ExplanationStep[]
  pathType: 'direct' | 'indirect' | 'inherited'
  source: string
  target: string
}

export interface ExplanationStep {
  nodeId: string
  nodeType: string
  nodeName: string
  relationship: string
  metadata?: Record<string, any>
}

export interface AccessExplanation {
  objectName?: string
  fieldApiName?: string
  userId: string
  hasAccess: boolean
  permissions: ObjectPermissions | FieldPermissions
  paths: ExplanationPath[]
  effectiveFrom: Date
}

// ======================
// Salesforce Users (extends base User type)
// ======================

export interface SalesforceUserDetail {
  id: string
  salesforceUserId: string
  username: string
  email: string
  firstName: string
  lastName: string
  name: string
  isActive: boolean
  role?: string
  roleName?: string
  profile?: string
  profileName?: string
  department?: string
  title?: string
  lastLoginDate?: string
  createdDate?: string
}

export interface UserAccessSummary {
  totalObjects: number
  objectsWithRead: number
  objectsWithEdit: number
  objectsWithDelete: number
  totalFields: number
  sensitiveFields: number
  totalPermissionSets: number
  permissionSetGroups: number
  directAssignments: number
}

// ======================
// Sync Jobs
// ======================

export interface SyncJob {
  id: string
  organization_id: string
  status: SyncJobStatus
  started_at?: string
  completed_at?: string
  error_message?: string
  summary?: SyncSummary
  metadata?: any
  created_at: string
}

export enum SyncJobStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export interface SyncSummary {
  usersProcessed?: number
  rolesProcessed?: number
  profilesProcessed?: number
  permissionSetsProcessed?: number
  objectsProcessed?: number
  fieldsProcessed?: number
  duration?: number
}
