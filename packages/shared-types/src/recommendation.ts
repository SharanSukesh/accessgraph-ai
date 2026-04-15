/**
 * Recommendation Types
 */

export interface Recommendation {
  id: string
  organizationId: string
  type: RecommendationType
  priority: RecommendationPriority
  title: string
  description: string
  rationale: string
  impact: ImpactAssessment
  action: RecommendedAction
  status: RecommendationStatus
  createdAt: Date
  dueDate?: Date
  appliedAt?: Date
  appliedBy?: string
}

export enum RecommendationType {
  PERMISSION_REMOVAL = 'permission_removal',
  ROLE_SIMPLIFICATION = 'role_simplification',
  ACCESS_REVIEW = 'access_review',
  ACCOUNT_CLEANUP = 'account_cleanup',
  POLICY_UPDATE = 'policy_update',
  SECURITY_HARDENING = 'security_hardening',
  COMPLIANCE_FIX = 'compliance_fix',
}

export enum RecommendationPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export enum RecommendationStatus {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  REJECTED = 'rejected',
  APPLIED = 'applied',
  DEFERRED = 'deferred',
}

export interface ImpactAssessment {
  riskReduction: number
  affectedUsers: number
  affectedPermissions: number
  estimatedEffort: EffortLevel
  potentialDowntime: boolean
}

export enum EffortLevel {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
}

export interface RecommendedAction {
  type: ActionType
  target: ActionTarget
  parameters: Record<string, any>
  reversible: boolean
  requiresApproval: boolean
}

export enum ActionType {
  REMOVE = 'remove',
  MODIFY = 'modify',
  ADD = 'add',
  REVIEW = 'review',
  NOTIFY = 'notify',
}

export interface ActionTarget {
  entityType: 'user' | 'role' | 'permission' | 'group'
  entityId: string
  entityName: string
}
