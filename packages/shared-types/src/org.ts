/**
 * Organization Types
 */

export interface Organization {
  id: string
  name: string
  domain: string
  salesforceOrgId?: string
  industry?: string
  size?: OrganizationSize
  tier?: OrganizationTier
  settings: OrganizationSettings
  createdAt: Date
  updatedAt: Date
}

export enum OrganizationSize {
  SMALL = 'small',
  MEDIUM = 'medium',
  LARGE = 'large',
  ENTERPRISE = 'enterprise',
}

export enum OrganizationTier {
  FREE = 'free',
  STARTER = 'starter',
  PROFESSIONAL = 'professional',
  ENTERPRISE = 'enterprise',
}

export interface OrganizationSettings {
  riskThreshold: number
  anomalyDetectionEnabled: boolean
  autoRecommendations: boolean
  notificationPreferences: NotificationPreferences
}

export interface NotificationPreferences {
  email: boolean
  slack: boolean
  webhook?: string
}

export interface OrganizationStats {
  totalUsers: number
  totalPermissions: number
  riskScore: number
  activeAnomalies: number
  lastScan?: Date
}
