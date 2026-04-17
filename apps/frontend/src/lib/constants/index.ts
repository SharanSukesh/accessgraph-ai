/**
 * Application Constants
 */

// ======================
// Risk Levels
// ======================

export const RISK_LEVELS = {
  LOW: { level: 'low' as const, label: 'Low', color: 'green', threshold: 25 },
  MEDIUM: { level: 'medium' as const, label: 'Medium', color: 'yellow', threshold: 50 },
  HIGH: { level: 'high' as const, label: 'High', color: 'orange', threshold: 75 },
  CRITICAL: { level: 'critical' as const, label: 'Critical', color: 'red', threshold: 100 },
} as const

export type RiskLevel = keyof typeof RISK_LEVELS

// ======================
// Anomaly Severities
// ======================

export const ANOMALY_SEVERITIES = {
  LOW: { value: 'low', label: 'Low', color: 'blue' },
  MEDIUM: { value: 'medium', label: 'Medium', color: 'yellow' },
  HIGH: { value: 'high', label: 'High', color: 'orange' },
  CRITICAL: { value: 'critical', label: 'Critical', color: 'red' },
} as const

export type AnomalySeverity = keyof typeof ANOMALY_SEVERITIES

// ======================
// Recommendation Types
// ======================

export const RECOMMENDATION_TYPES = {
  PERMISSION_REMOVAL: {
    value: 'permission_removal',
    label: 'Permission Removal',
    description: 'Remove excessive permissions',
  },
  ACCESS_REVIEW: {
    value: 'access_review',
    label: 'Access Review',
    description: 'Review and validate access',
  },
  PSG_MIGRATION: {
    value: 'psg_migration',
    label: 'PSG Migration',
    description: 'Migrate to Permission Set Group',
  },
  ROLE_ASSIGNMENT: {
    value: 'role_assignment',
    label: 'Role Assignment',
    description: 'Assign appropriate role',
  },
} as const

// ======================
// Graph Node Types
// ======================

export const NODE_TYPES = {
  USER: { value: 'user', label: 'User', color: '#3b82f6', icon: 'User' },
  ROLE: { value: 'role', label: 'Role', color: '#f59e0b', icon: 'Shield' },
  PROFILE: { value: 'profile', label: 'Profile', color: '#8b5cf6', icon: 'UserCircle' },
  PERMISSION_SET: {
    value: 'permission_set',
    label: 'Permission Set',
    color: '#06b6d4',
    icon: 'Key',
  },
  PERMISSION_SET_GROUP: {
    value: 'permission_set_group',
    label: 'Permission Set Group',
    color: '#f59e0b',
    icon: 'Layers',
  },
  OBJECT: { value: 'object', label: 'Object', color: '#10b981', icon: 'Database' },
  FIELD: { value: 'field', label: 'Field', color: '#a3e635', icon: 'FileText' },
  GROUP: { value: 'group', label: 'Group', color: '#ec4899', icon: 'Users' },
} as const

export type NodeType = keyof typeof NODE_TYPES

// ======================
// Graph Edge Types
// ======================

export const EDGE_TYPES = {
  HAS_ROLE: { value: 'HAS_ROLE', label: 'Has Role', color: '#f59e0b' },
  HAS_PROFILE: { value: 'HAS_PROFILE', label: 'Has Profile', color: '#8b5cf6' },
  HAS_PERMISSION_SET: { value: 'ASSIGNED_PERMISSION_SET', label: 'Has Permission Set', color: '#06b6d4' },
  INHERITS_FROM: { value: 'inherits_from', label: 'Inherits From', color: '#ec4899' },
  GRANTS_ACCESS: { value: 'GRANTS_ACCESS', label: 'Grants Access', color: '#10b981' },
  GRANTS_FIELD_ACCESS: { value: 'GRANTS_FIELD_ACCESS', label: 'Grants Field Access', color: '#a3e635' },
  CAN_ACCESS: { value: 'can_access', label: 'Can Access', color: '#10b981' },
  CAN_READ: { value: 'can_read', label: 'Can Read', color: '#a3e635' },
  CAN_CREATE: { value: 'can_create', label: 'Can Create', color: '#a3e635' },
  CAN_EDIT: { value: 'can_edit', label: 'Can Edit', color: '#a3e635' },
  CAN_DELETE: { value: 'can_delete', label: 'Can Delete', color: '#a3e635' },
  MEMBER_OF: { value: 'member_of', label: 'Member Of', color: '#ec4899' },
  OBJECT_RELATIONSHIP: { value: 'OBJECT_RELATIONSHIP', label: 'Related To', color: '#f472b6' },
} as const

// ======================
// Sensitive Object Categories
// ======================

export const SENSITIVE_OBJECTS = [
  'Account',
  'Contact',
  'Lead',
  'Opportunity',
  'Case',
  'Contract',
  'Order',
  'Quote',
  'User',
] as const

// ======================
// Field Sensitivity Indicators
// ======================

export const SENSITIVE_FIELD_PATTERNS = [
  'SSN',
  'Social_Security',
  'CreditCard',
  'BankAccount',
  'Salary',
  'Compensation',
  'Medical',
  'Health',
  'Diagnosis',
] as const

// ======================
// Sync Status
// ======================

export const SYNC_STATUS = {
  PENDING: { value: 'pending', label: 'Pending', color: 'gray' },
  RUNNING: { value: 'running', label: 'Running', color: 'blue' },
  COMPLETED: { value: 'completed', label: 'Completed', color: 'green' },
  FAILED: { value: 'failed', label: 'Failed', color: 'red' },
} as const

// ======================
// Pagination
// ======================

export const DEFAULT_PAGE_SIZE = 25
export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const

// ======================
// Graph Limits
// ======================

export const GRAPH_MAX_NODES =
  parseInt(process.env.NEXT_PUBLIC_GRAPH_MAX_NODES || '500', 10) || 500
export const GRAPH_WARNING_NODES = Math.floor(GRAPH_MAX_NODES * 0.75)

// ======================
// API Configuration
// ======================

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
export const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === 'true'

// ======================
// Routes
// ======================

export const ROUTES = {
  HOME: '/',
  ONBOARDING: '/onboarding',
  ORG_DASHBOARD: (orgId: string) => `/orgs/${orgId}/dashboard`,
  USERS: (orgId: string) => `/orgs/${orgId}/users`,
  USER_DETAIL: (orgId: string, userId: string) => `/orgs/${orgId}/users/${userId}`,
  OBJECTS: (orgId: string) => `/orgs/${orgId}/objects`,
  OBJECT_DETAIL: (orgId: string, objectName: string) =>
    `/orgs/${orgId}/objects/${objectName}`,
  FIELDS: (orgId: string) => `/orgs/${orgId}/fields`,
  FIELD_DETAIL: (orgId: string, fieldApiName: string) =>
    `/orgs/${orgId}/fields/${fieldApiName}`,
  ANOMALIES: (orgId: string) => `/orgs/${orgId}/anomalies`,
  RECOMMENDATIONS: (orgId: string) => `/orgs/${orgId}/recommendations`,
  GRAPH: (orgId: string) => `/orgs/${orgId}/graph`,
  GRAPH_USER: (orgId: string, userId: string) => `/orgs/${orgId}/graph/${userId}`,
} as const
