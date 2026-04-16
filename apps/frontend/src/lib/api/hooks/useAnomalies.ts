/**
 * Anomalies API Hooks
 */

import { useQuery } from '@tanstack/react-query'
import { apiClient } from '../client'
import { endpoints } from '../endpoints'

// Types
interface AnomalyFilters {
  severity?: string
  userId?: string
  reasonType?: string
  limit?: number
  offset?: number
}

interface Anomaly {
  id: string
  userId: string
  userName?: string
  score: number
  severity: string
  reasons: string[]
  peerComparison?: {
    peerGroup: string
    peerMedian: number
    deviation: number
  }
  detectedAt: string
}

interface TopAnomalousUser {
  userId: string
  userName: string
  userEmail: string
  anomalyScore: number
  severity: string
  topReasons: string[]
  riskScore?: number
}

// Query Keys
export const anomalyKeys = {
  all: ['anomalies'] as const,
  lists: () => [...anomalyKeys.all, 'list'] as const,
  list: (orgId: string, filters?: AnomalyFilters) =>
    [...anomalyKeys.lists(), orgId, filters] as const,
  topUsers: (orgId: string) => [...anomalyKeys.all, 'top-users', orgId] as const,
}

/**
 * Get anomalies for organization
 */
export function useAnomalies(orgId: string, filters?: AnomalyFilters) {
  return useQuery({
    queryKey: anomalyKeys.list(orgId, filters),
    queryFn: async () => {
      const data = await apiClient.get<Anomaly[]>(endpoints.anomalies(orgId), {
        params: filters as any,
      })
      return data
    },
    enabled: !!orgId,
  })
}

/**
 * Get top anomalous users
 */
export function useTopAnomalousUsers(orgId: string, limit: number = 10) {
  return useQuery({
    queryKey: anomalyKeys.topUsers(orgId),
    queryFn: async () => {
      const data = await apiClient.get<TopAnomalousUser[]>(
        endpoints.topAnomalousUsers(orgId),
        { params: { limit } }
      )
      return data
    },
    enabled: !!orgId,
  })
}
