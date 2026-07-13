/**
 * Automation Sprawl API hooks.
 *
 * Powers /orgs/{orgId}/automation-sprawl — inventory of every Flow +
 * ApexTrigger in the org, classified into one of four tiers
 * (broken / orphaned / dormant / active) with drill-down evidence.
 *
 * Types mirror the Pydantic response models in
 * apps/backend/app/api/routes/automation_sprawl.py.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '../client'
import { endpoints } from '../endpoints'

// ============================================================================
// Types
// ============================================================================

export type AutomationItemType = 'flow' | 'trigger'
export type AutomationTier = 'broken' | 'orphaned' | 'dormant' | 'active'

export interface AutomationItem {
  id: string
  sf_id: string
  item_type: AutomationItemType
  name: string
  api_name: string | null
  description: string | null
  namespace_prefix: string | null
  process_type: string | null
  trigger_type: string | null
  target_object: string | null
  api_version: string | null
  length_without_comments: number | null
  is_active: boolean | null
  is_valid: boolean | null
  owner_sf_id: string | null
  owner_name: string | null
  owner_is_active: boolean | null
  last_modified_at: string | null
  days_since_modified: number | null
  tier: AutomationTier
  duplicate_group_key: string | null
  evidence: Record<string, unknown>
}

export interface AutomationSprawlSummary {
  run_id: string | null
  snapshot_at: string | null
  flows_total: number
  triggers_total: number
  items_total: number
  items_active: number
  items_dormant: number
  items_orphaned: number
  items_broken: number
  avg_days_since_modified: number | null
  duplicate_groups: number
  has_data: boolean
  duration_ms: number | null
  error: string | null
}

export interface AutomationItemListResponse {
  run_id: string | null
  total: number
  items: AutomationItem[]
}

export interface AutomationSprawlRunResponse {
  run_id: string
  snapshot_at: string
  items_total: number
  items_broken: number
  items_orphaned: number
  items_dormant: number
}

export interface AutomationSprawlHistoryPoint {
  run_id: string
  snapshot_at: string
  items_total: number
  items_broken: number
  items_orphaned: number
  items_dormant: number
}

export interface AutomationItemFilters {
  tier?: AutomationTier
  item_type?: AutomationItemType
  search?: string
  limit?: number
  offset?: number
}

// ============================================================================
// Query keys
// ============================================================================

export const automationSprawlKeys = {
  all: ['automation-sprawl'] as const,
  latest: (orgId: string) =>
    [...automationSprawlKeys.all, 'latest', orgId] as const,
  items: (orgId: string, filters?: AutomationItemFilters) =>
    [...automationSprawlKeys.all, 'items', orgId, filters ?? {}] as const,
  history: (orgId: string) =>
    [...automationSprawlKeys.all, 'history', orgId] as const,
}

// ============================================================================
// Reads
// ============================================================================

export function useAutomationSprawlLatest(orgId: string) {
  return useQuery<AutomationSprawlSummary>({
    queryKey: automationSprawlKeys.latest(orgId),
    queryFn: () => apiClient.get(endpoints.automationSprawlLatest(orgId)),
    enabled: !!orgId,
    staleTime: 30_000,
  })
}

export function useAutomationSprawlItems(
  orgId: string,
  filters?: AutomationItemFilters,
) {
  const qs = new URLSearchParams()
  if (filters?.tier) qs.set('tier', filters.tier)
  if (filters?.item_type) qs.set('item_type', filters.item_type)
  if (filters?.search) qs.set('search', filters.search)
  if (typeof filters?.limit === 'number')
    qs.set('limit', String(filters.limit))
  if (typeof filters?.offset === 'number')
    qs.set('offset', String(filters.offset))
  const suffix = qs.toString() ? `?${qs.toString()}` : ''

  return useQuery<AutomationItemListResponse>({
    queryKey: automationSprawlKeys.items(orgId, filters),
    queryFn: () =>
      apiClient.get(`${endpoints.automationSprawlItems(orgId)}${suffix}`),
    enabled: !!orgId,
    staleTime: 30_000,
  })
}

export function useAutomationSprawlHistory(orgId: string) {
  return useQuery<AutomationSprawlHistoryPoint[]>({
    queryKey: automationSprawlKeys.history(orgId),
    queryFn: () => apiClient.get(endpoints.automationSprawlHistory(orgId)),
    enabled: !!orgId,
    staleTime: 60_000,
  })
}

// ============================================================================
// Writes
// ============================================================================

export function useRunAutomationSprawl(orgId: string) {
  const qc = useQueryClient()
  return useMutation<AutomationSprawlRunResponse, unknown, void>({
    mutationFn: () => apiClient.post(endpoints.automationSprawlRun(orgId)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: automationSprawlKeys.all })
    },
  })
}
