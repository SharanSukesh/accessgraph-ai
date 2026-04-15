/**
 * Anomaly Detection Types
 */

export interface Anomaly {
  id: string
  organizationId: string
  type: AnomalyType
  severity: AnomalySeverity
  title: string
  description: string
  affectedEntity: AffectedEntity
  detectedAt: Date
  status: AnomalyStatus
  evidence: AnomalyEvidence[]
  confidence: number
  falsePositive: boolean
  resolvedAt?: Date
  resolvedBy?: string
  resolution?: string
}

export enum AnomalyType {
  ACCESS_PATTERN = 'access_pattern',
  PERMISSION_CHANGE = 'permission_change',
  LOGIN_ANOMALY = 'login_anomaly',
  DATA_EXFILTRATION = 'data_exfiltration',
  PRIVILEGE_ABUSE = 'privilege_abuse',
  UNUSUAL_LOCATION = 'unusual_location',
  UNUSUAL_TIME = 'unusual_time',
  BULK_OPERATION = 'bulk_operation',
}

export enum AnomalySeverity {
  INFO = 'info',
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export enum AnomalyStatus {
  NEW = 'new',
  INVESTIGATING = 'investigating',
  CONFIRMED = 'confirmed',
  FALSE_POSITIVE = 'false_positive',
  RESOLVED = 'resolved',
  IGNORED = 'ignored',
}

export interface AffectedEntity {
  type: 'user' | 'role' | 'permission' | 'resource'
  id: string
  name: string
}

export interface AnomalyEvidence {
  timestamp: Date
  metric: string
  value: number | string
  baseline?: number
  deviation?: number
}

export interface AnomalyStats {
  total: number
  bySeverity: Record<AnomalySeverity, number>
  byType: Record<AnomalyType, number>
  byStatus: Record<AnomalyStatus, number>
  recentTrend: TrendData[]
}

export interface TrendData {
  date: string
  count: number
}
