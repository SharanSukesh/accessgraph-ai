/**
 * Equity API Hooks (GAEA recommendation track)
 *
 * Drives the dedicated Equity page: headline Equity Index, per-department
 * access-utility bars, most-disadvantaged-group callout, and the list of
 * grant_for_equity recommendations. Read endpoints are TanStack-cached;
 * the generate endpoint is a mutation that invalidates the diagnostic
 * + recommendations caches on success.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '../client'
import { endpoints } from '../endpoints'
import { recommendationKeys } from './useRecommendations'

// Types

export interface EquityDiagnostic {
  snapshot_id: string | null
  snapshot_at: string | null
  equity_index: number
  disparity: number
  most_disadvantaged_group: string | null
  vip_count: number
  per_dept_utilities: Record<string, number>
  edge_type_counts: Record<string, number>
  recommendations_generated: number
  has_data: boolean
  // Salesforce instance URL so the frontend can build deep-links into
  // the right org. Null when no active connection exists.
  salesforce_instance_url?: string | null
  // Which tier of the grouping-fallback ladder the metric actually
  // used: 'department' | 'role' | 'profile' | 'unassigned' | 'no_vips'.
  // Null on pre-fallback historical snapshots — frontend treats null
  // as 'department' since that was the only option before the ladder.
  grouping_key?: string | null
}

export interface EquityHistoryPoint {
  snapshot_at: string
  equity_index: number
  disparity: number
  vip_count: number
  recommendations_generated: number
}

export interface EquityGenerateResult {
  snapshot_id: string
  recommendations_created: number
  equity_index: number
  disparity: number
  most_disadvantaged_group: string | null
  vip_count: number
  per_dept_utilities: Record<string, number>
  edge_type_counts: Record<string, number>
}

export interface UserDisparity {
  user_sf_id: string
  department: string | null
  distance_to_nearest_vip: number | null
  inverse_distance_utility: number
  department_avg_utility: number
  org_avg_utility: number
  is_vip: boolean
}

// Query keys
export const equityKeys = {
  all: ['equity'] as const,
  diagnostic: (orgId: string) => [...equityKeys.all, 'diagnostic', orgId] as const,
  history: (orgId: string, limit?: number) =>
    [...equityKeys.all, 'history', orgId, limit] as const,
  userDisparity: (orgId: string, userSfId: string) =>
    [...equityKeys.all, 'user', orgId, userSfId] as const,
}

/**
 * Latest equity diagnostic for an org. Returns has_data=false until the
 * first generate call has produced a snapshot.
 */
export function useEquityDiagnostic(orgId: string) {
  return useQuery({
    queryKey: equityKeys.diagnostic(orgId),
    queryFn: async () => {
      return apiClient.get<EquityDiagnostic>(endpoints.equityDiagnostic(orgId))
    },
    enabled: !!orgId,
  })
}

/**
 * Per-user disparity drill-down. Computed live from the current graph,
 * so it always reflects up-to-date access state.
 */
export function useUserDisparity(orgId: string, userSfId: string | undefined) {
  return useQuery({
    queryKey: equityKeys.userDisparity(orgId, userSfId || ''),
    queryFn: async () => {
      return apiClient.get<UserDisparity>(
        endpoints.equityUser(orgId, userSfId as string)
      )
    },
    enabled: !!orgId && !!userSfId,
  })
}

/**
 * Trigger an equity-recommendations run. Invalidates the diagnostic and
 * recommendations caches so the page refreshes with the new snapshot.
 */
export function useGenerateEquityRecommendations(orgId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (budget?: number) => {
      const params = budget ? { budget } : undefined
      return apiClient.post<EquityGenerateResult>(
        endpoints.equityGenerate(orgId),
        undefined,
        { params: params as any }
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: equityKeys.diagnostic(orgId) })
      queryClient.invalidateQueries({ queryKey: equityKeys.history(orgId) })
      queryClient.invalidateQueries({ queryKey: recommendationKeys.lists() })
    },
  })
}

/**
 * Chronological history of equity snapshots for an org — drives the
 * Equity Index trend sparkline on the dashboard.
 */
export function useEquityHistory(orgId: string, limit: number = 30) {
  return useQuery({
    queryKey: equityKeys.history(orgId, limit),
    queryFn: async () => {
      return apiClient.get<EquityHistoryPoint[]>(
        endpoints.equityHistory(orgId),
        { params: { limit } as any },
      )
    },
    enabled: !!orgId,
  })
}
