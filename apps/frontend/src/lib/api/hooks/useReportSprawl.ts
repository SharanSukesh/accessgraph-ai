/**
 * Report & Dashboard Sprawl API hooks.
 *
 * Powers /orgs/{orgId}/report-sprawl — the interactive inventory page
 * where consultants see every Report + Dashboard classified into one
 * of four tiers (live / zombie / orphaned / duplicate) and can drill
 * down for evidence.
 *
 * Types mirror the Pydantic response models in
 * apps/backend/app/api/routes/report_sprawl.py.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '../client'
import { endpoints } from '../endpoints'

// ============================================================================
// Types
// ============================================================================

export type ReportItemType = 'report' | 'dashboard'
export type ReportTier = 'live' | 'zombie' | 'orphaned' | 'duplicate'

export interface ReportItem {
  id: string
  sf_id: string
  item_type: ReportItemType
  name: string
  developer_name: string | null
  folder_name: string | null
  folder_id: string | null
  owner_sf_id: string | null
  owner_name: string | null
  owner_is_active: boolean | null
  description: string | null
  report_format: string | null
  created_at_sf: string | null
  last_referenced_at: string | null
  last_run_at: string | null
  last_modified_at: string | null
  days_since_last_view: number | null
  tier: ReportTier
  duplicate_group_key: string | null
  evidence: Record<string, unknown>
}

export interface ReportSprawlSummary {
  run_id: string | null
  snapshot_at: string | null
  reports_total: number
  dashboards_total: number
  items_total: number
  items_live: number
  items_zombie: number
  items_orphaned: number
  items_duplicate: number
  items_never_referenced: number
  avg_days_since_last_view: number | null
  duplicate_groups: number
  has_data: boolean
  duration_ms: number | null
  error: string | null
}

export interface ReportItemListResponse {
  run_id: string | null
  total: number
  items: ReportItem[]
}

export interface ReportSprawlRunResponse {
  run_id: string
  snapshot_at: string
  items_total: number
  items_zombie: number
  items_orphaned: number
  items_duplicate: number
}

export interface ReportSprawlHistoryPoint {
  run_id: string
  snapshot_at: string
  items_total: number
  items_zombie: number
  items_orphaned: number
  items_duplicate: number
}

export interface ReportItemFilters {
  tier?: ReportTier
  item_type?: ReportItemType
  search?: string
  limit?: number
  offset?: number
}

// ============================================================================
// Query keys
// ============================================================================

export const reportSprawlKeys = {
  all: ['report-sprawl'] as const,
  latest: (orgId: string) =>
    [...reportSprawlKeys.all, 'latest', orgId] as const,
  items: (orgId: string, filters?: ReportItemFilters) =>
    [...reportSprawlKeys.all, 'items', orgId, filters ?? {}] as const,
  history: (orgId: string) =>
    [...reportSprawlKeys.all, 'history', orgId] as const,
}

// ============================================================================
// Reads
// ============================================================================

/** KPI + tier-count rollup. has_data=false until first run completes. */
export function useReportSprawlLatest(orgId: string) {
  return useQuery<ReportSprawlSummary>({
    queryKey: reportSprawlKeys.latest(orgId),
    queryFn: () => apiClient.get(endpoints.reportSprawlLatest(orgId)),
    enabled: !!orgId,
    staleTime: 30_000,
  })
}

/** Per-item list — supports tier / type / search / pagination filters. */
export function useReportSprawlItems(
  orgId: string,
  filters?: ReportItemFilters,
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

  return useQuery<ReportItemListResponse>({
    queryKey: reportSprawlKeys.items(orgId, filters),
    queryFn: () =>
      apiClient.get(`${endpoints.reportSprawlItems(orgId)}${suffix}`),
    enabled: !!orgId,
    staleTime: 30_000,
  })
}

/** Sparkline data — up to N historical runs. */
export function useReportSprawlHistory(orgId: string) {
  return useQuery<ReportSprawlHistoryPoint[]>({
    queryKey: reportSprawlKeys.history(orgId),
    queryFn: () => apiClient.get(endpoints.reportSprawlHistory(orgId)),
    enabled: !!orgId,
    staleTime: 60_000,
  })
}

// ============================================================================
// Writes
// ============================================================================

/** Kick off a new sprawl analysis. Synchronous — resolves when the
 *  backend has finished the fetch + score pass (30-60s for large orgs). */
export function useRunReportSprawl(orgId: string) {
  const qc = useQueryClient()
  return useMutation<ReportSprawlRunResponse, unknown, void>({
    mutationFn: () => apiClient.post(endpoints.reportSprawlRun(orgId)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: reportSprawlKeys.all })
    },
  })
}
