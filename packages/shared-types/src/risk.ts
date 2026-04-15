/**
 * Risk Analysis Types
 */

export interface RiskScore {
  id: string
  organizationId: string
  entityType: RiskEntityType
  entityId: string
  score: number
  level: RiskLevel
  factors: RiskFactor[]
  trend: RiskTrend
  calculatedAt: Date
  metadata?: Record<string, any>
}

export enum RiskEntityType {
  USER = 'user',
  ROLE = 'role',
  PERMISSION = 'permission',
  ORGANIZATION = 'organization',
}

export enum RiskLevel {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export enum RiskTrend {
  INCREASING = 'increasing',
  STABLE = 'stable',
  DECREASING = 'decreasing',
}

export interface RiskFactor {
  id: string
  type: RiskFactorType
  description: string
  severity: number
  weight: number
  evidence?: string[]
  detectedAt: Date
}

export enum RiskFactorType {
  EXCESSIVE_PERMISSIONS = 'excessive_permissions',
  DORMANT_ACCOUNT = 'dormant_account',
  UNUSUAL_ACCESS_PATTERN = 'unusual_access_pattern',
  SHARED_CREDENTIALS = 'shared_credentials',
  PRIVILEGE_ESCALATION = 'privilege_escalation',
  EXTERNAL_SHARING = 'external_sharing',
  ORPHANED_PERMISSIONS = 'orphaned_permissions',
  COMPLIANCE_VIOLATION = 'compliance_violation',
}

export interface RiskAssessment {
  organizationId: string
  overallScore: number
  overallLevel: RiskLevel
  breakdown: RiskBreakdown
  topRisks: RiskScore[]
  recommendations: string[]
  assessedAt: Date
}

export interface RiskBreakdown {
  byLevel: Record<RiskLevel, number>
  byType: Record<RiskFactorType, number>
  byEntity: Record<RiskEntityType, number>
}
