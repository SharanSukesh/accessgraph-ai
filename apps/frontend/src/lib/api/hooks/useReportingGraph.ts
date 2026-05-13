/**
 * Reporting Graph API hooks.
 *
 * Drives the drag-and-drop reporting-graph editor. Read endpoint returns
 * the current manager / delegated-approver edges from UserSnapshot.
 * Apply endpoint writes a batch of edits back to Salesforce User records;
 * the backend validates ORG_ADMIN role + audit-logs every successful PATCH.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '../client'
import { endpoints } from '../endpoints'
import { equityKeys } from './useEquity'

// Types

export interface ReportingGraphNode {
  user_sf_id: string
  name: string
  department: string | null
  is_active: boolean
  title?: string | null
  role_name?: string | null
  profile_name?: string | null
  // 0 = top of role hierarchy, +1 per parent hop. null = no role assigned.
  role_depth?: number | null
}

export interface ReportingGraphEdge {
  source: string
  target: string
  edge_type: 'manager' | 'delegated_approver'
}

export interface ReportingGraphResponse {
  nodes: ReportingGraphNode[]
  edges: ReportingGraphEdge[]
}

export type RelationshipField = 'ManagerId' | 'DelegatedApproverId'

export interface RelationshipEdit {
  user_sf_id: string
  field: RelationshipField
  new_value: string | null
}

export interface EditResult extends RelationshipEdit {
  success: boolean
  prior_value: string | null
  error: string | null
}

export interface ApplyResponse {
  total: number
  succeeded: number
  failed: number
  results: EditResult[]
}

// Query keys
export const reportingGraphKeys = {
  all: ['reporting-graph'] as const,
  graph: (orgId: string) =>
    [...reportingGraphKeys.all, 'graph', orgId] as const,
}

/**
 * Read current manager + delegated-approver edges. Used to seed the
 * editor canvas with the existing reporting structure.
 */
export function useReportingGraph(orgId: string) {
  return useQuery({
    queryKey: reportingGraphKeys.graph(orgId),
    queryFn: async () => {
      return apiClient.get<ReportingGraphResponse>(
        endpoints.reportingGraph(orgId),
      )
    },
    enabled: !!orgId,
  })
}

/**
 * Apply a batch of edits. On success invalidates the reporting-graph
 * cache (so the canvas refreshes) plus the equity diagnostic cache (the
 * underlying graph now has new edges, so equity scores may shift).
 */
export function useApplyReportingGraphEdits(orgId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (edits: RelationshipEdit[]) => {
      return apiClient.post<ApplyResponse>(
        endpoints.reportingGraphApply(orgId),
        { edits },
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: reportingGraphKeys.graph(orgId),
      })
      queryClient.invalidateQueries({
        queryKey: equityKeys.diagnostic(orgId),
      })
    },
  })
}
