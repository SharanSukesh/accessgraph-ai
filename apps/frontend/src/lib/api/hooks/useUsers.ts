/**
 * Users API Hooks
 */

import { useQuery } from '@tanstack/react-query'
import { apiClient, ApiError } from '../client'
import { endpoints } from '../endpoints'
import type { ObjectAccess, FieldAccess, AccessExplanation } from '@/lib/types/salesforce'

// Types
interface UserFilters {
  search?: string
  role?: string
  profile?: string
  department?: string
  isActive?: boolean
  riskLevel?: string
  sort?: 'risk' | 'name'
  limit?: number
  offset?: number
}

interface User {
  id: string
  salesforceUserId: string
  username: string
  email: string
  name: string
  firstName?: string
  lastName?: string
  isActive: boolean
  role?: string
  profile?: string
  department?: string
  title?: string
  lastLoginDate?: string
  riskScore?: number
  riskLevel?: string
}

interface UserDetail extends User {
  anomalyScore?: number
  recommendationCount?: number
}

export interface RiskGrant {
  type: 'profile' | 'permission_set' | 'permission_set_group' | string
  name: string
}

export interface RiskEvidence {
  label: string
  kind?: string
  severity?: 'critical' | 'high' | 'medium' | 'low' | string
  category?: string
  detail?: string | null
  holders?: number
  granted_by?: RiskGrant[]
  expected_for_role?: boolean
}

export interface RiskFactor {
  factor: string
  label?: string
  score: number
  weight: number
  impact?: number
  description: string
  evidence?: RiskEvidence[]
  evidence_total?: number
  expected_for_role?: boolean
}

export interface RiskScore {
  userId?: string
  score?: number
  risk_score?: number
  level?: string
  risk_level?: string
  factors?: RiskFactor[]
  explanation?: string
  reason_text?: string
  calculatedAt?: string | null
}

interface Recommendation {
  id: string
  type: string
  severity: string
  title: string
  description: string
  affectedResources: string[]
  status: string
}

// Query Keys
export const userKeys = {
  all: ['users'] as const,
  lists: () => [...userKeys.all, 'list'] as const,
  list: (orgId: string, filters?: UserFilters) => [...userKeys.lists(), orgId, filters] as const,
  details: () => [...userKeys.all, 'detail'] as const,
  detail: (orgId: string, userId: string) => [...userKeys.details(), orgId, userId] as const,
  objectAccess: (orgId: string, userId: string) =>
    [...userKeys.detail(orgId, userId), 'object-access'] as const,
  fieldAccess: (orgId: string, userId: string) =>
    [...userKeys.detail(orgId, userId), 'field-access'] as const,
  objectExplanation: (orgId: string, userId: string, objectName: string) =>
    [...userKeys.detail(orgId, userId), 'explain-object', objectName] as const,
  risk: (orgId: string, userId: string) =>
    [...userKeys.detail(orgId, userId), 'risk'] as const,
  recommendations: (orgId: string, userId: string) =>
    [...userKeys.detail(orgId, userId), 'recommendations'] as const,
}

/**
 * Normalize user data from API (handles both snake_case and camelCase)
 */
function normalizeUser(user: any): User {
  return {
    id: user.id,
    salesforceUserId: user.salesforceUserId || user.salesforce_id,
    username: user.username,
    email: user.email,
    name: user.name,
    firstName: user.firstName || user.first_name,
    lastName: user.lastName || user.last_name,
    isActive: user.isActive !== undefined ? user.isActive : user.is_active,
    role: user.role,
    profile: user.profile,
    department: user.department,
    title: user.title,
    lastLoginDate: user.lastLoginDate || user.last_login_date,
    riskLevel: user.riskLevel ?? user.risk ?? user.risk_level ?? undefined,
    riskScore: user.riskScore ?? user.risk_score ?? undefined,
  }
}

/**
 * Get users list with optional filters
 */
export function useUsers(orgId: string, filters?: UserFilters) {
  return useQuery({
    queryKey: userKeys.list(orgId, filters),
    queryFn: async () => {
      const data = await apiClient.get<any[]>(endpoints.users(orgId), {
        params: filters as any,
      })
      return data.map(normalizeUser)
    },
    enabled: !!orgId,
  })
}

/**
 * Get user detail
 */
export function useUser(orgId: string, userId: string) {
  return useQuery({
    queryKey: userKeys.detail(orgId, userId),
    queryFn: async () => {
      const data = await apiClient.get<UserDetail>(endpoints.user(orgId, userId))
      return data
    },
    enabled: !!orgId && !!userId,
  })
}

/**
 * Get user's object access permissions
 */
export interface AccessPath {
  source_type: 'profile' | 'permission_set' | 'permission_set_group' | string
  source_name: string
  permissions: string[]
  granted_via: string[]
  muted: { permission: string; muted_by: string }[]
  steps: string[]
}

export interface ObjectAccessExplanation {
  user_id: string
  user_name: string
  object: string
  access: Record<'read' | 'create' | 'edit' | 'delete', boolean>
  paths: AccessPath[]
}

/** How a user gets each permission on one object (fetched on demand). */
export function useObjectAccessExplanation(orgId: string, userId: string, objectName: string | null) {
  return useQuery({
    queryKey: userKeys.objectExplanation(orgId, userId, objectName ?? ''),
    queryFn: () =>
      apiClient.get<ObjectAccessExplanation>(
        endpoints.userObjectExplanation(orgId, userId, objectName as string)
      ),
    enabled: !!orgId && !!userId && !!objectName,
  })
}

export function useUserObjectAccess(orgId: string, userId: string) {
  return useQuery({
    queryKey: userKeys.objectAccess(orgId, userId),
    queryFn: async () => {
      const data = await apiClient.get<{ objects: ObjectAccess[] }>(
        endpoints.userObjectAccess(orgId, userId)
      )
      // API returns {objects: [...]} but we want just the array
      return data.objects || []
    },
    enabled: !!orgId && !!userId,
  })
}

/**
 * Get user's field access permissions
 */
export function useUserFieldAccess(orgId: string, userId: string) {
  return useQuery({
    queryKey: userKeys.fieldAccess(orgId, userId),
    queryFn: async () => {
      const data = await apiClient.get<{ fields: FieldAccess[] }>(
        endpoints.userFieldAccess(orgId, userId)
      )
      // API returns {fields: [...]} but we want just the array
      return data.fields || []
    },
    enabled: !!orgId && !!userId,
  })
}

/**
 * Get user's risk score
 */
export function useUserRisk(orgId: string, userId: string) {
  return useQuery({
    queryKey: userKeys.risk(orgId, userId),
    queryFn: async () => {
      try {
        const data = await apiClient.get<RiskScore>(endpoints.userRisk(orgId, userId))
        return data
      } catch (error: any) {
        // Return null if not found instead of throwing
        if (error instanceof ApiError && error.status === 404) {
          return null
        }
        throw error
      }
    },
    enabled: !!orgId && !!userId,
    retry: false,
  })
}

/**
 * Get user's anomalies
 */
export function useUserAnomalies(orgId: string, userId: string) {
  return useQuery({
    queryKey: [...userKeys.detail(orgId, userId), 'anomalies'],
    queryFn: async () => {
      try {
        const data = await apiClient.get<any[]>(endpoints.userAnomalies(orgId, userId))
        return data
      } catch (error: any) {
        // Return empty array if not found
        if (error instanceof ApiError && error.status === 404) {
          return []
        }
        throw error
      }
    },
    enabled: !!orgId && !!userId,
    retry: false,
  })
}

/**
 * Get user's recommendations
 */
export function useUserRecommendations(orgId: string, userId: string) {
  return useQuery({
    queryKey: userKeys.recommendations(orgId, userId),
    queryFn: async () => {
      try {
        const data = await apiClient.get<Recommendation[]>(
          endpoints.userRecommendations(orgId, userId)
        )
        return data
      } catch (error: any) {
        // Return empty array if not found
        if (error instanceof ApiError && error.status === 404) {
          return []
        }
        throw error
      }
    },
    enabled: !!orgId && !!userId,
    retry: false,
  })
}
