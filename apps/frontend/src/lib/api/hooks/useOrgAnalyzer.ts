/**
 * Org Analyzer API hooks.
 *
 * Powers the consulting-grade org-health dashboard + PDF report. The
 * `run` mutation kicks off a synchronous analyzer run on the backend
 * (5-30s typical); on success it invalidates `latest`, `findings`, and
 * `history` so the dashboard refreshes.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '../client'
import { endpoints } from '../endpoints'

// ----- Types -----

export type FindingCategory =
  | 'license_waste'
  | 'config_bloat'
  | 'automation_hygiene'
  | 'sharing_posture'
  | 'storage_limit'
  | 'data_quality'
  | 'user_activity'
  | 'predictive'

export type FindingSeverity =
  | 'critical'
  | 'high'
  | 'medium'
  | 'low'
  | 'info'

export interface OrgFinding {
  id: string
  category: FindingCategory
  code: string
  severity: FindingSeverity
  title: string
  description: string
  recommended_action: string | null
  affected_count: number
  estimated_annual_savings_cents: number | null
  evidence: Record<string, any>
  sf_setup_deeplink: string | null
  is_ignored: boolean
  ignored_at: string | null
  ignored_by: string | null
  ignore_reason: string | null
}

export interface SnapshotSummary {
  snapshot_id: string | null
  snapshot_at: string | null
  findings_count: number
  findings_by_severity: Record<string, number>
  findings_by_category: Record<string, number>
  total_estimated_annual_savings_cents: number
  metrics: Record<string, any>
  org_limits: Record<string, any>
  has_data: boolean
  // Live counts after applying admin ignores. Differ from the totals
  // above (which are frozen on the snapshot row at run-time) when the
  // user has flagged findings as intentional post-run.
  active_findings_count: number
  active_savings_cents: number
  ignored_findings_count: number
}

export interface FindingsPage {
  total: number
  snapshot_id: string | null
  findings: OrgFinding[]
}

export interface HistoryPoint {
  snapshot_id: string
  snapshot_at: string
  findings_count: number
  total_estimated_annual_savings_cents: number
  findings_by_severity: Record<string, number>
}

export interface PriceBookRow {
  license_name: string
  monthly_cost_cents: number
}

export interface PriceBookResponse {
  rows: PriceBookRow[]
}

export interface RunResponse {
  snapshot_id: string
  snapshot_at: string
  findings_count: number
  total_estimated_annual_savings_cents: number
}

// ----- Query keys -----

export const orgAnalyzerKeys = {
  all: ['org-analyzer'] as const,
  latest: (orgId: string) => [...orgAnalyzerKeys.all, 'latest', orgId] as const,
  findings: (orgId: string, filters: Record<string, any>) =>
    [...orgAnalyzerKeys.all, 'findings', orgId, filters] as const,
  history: (orgId: string) => [...orgAnalyzerKeys.all, 'history', orgId] as const,
  priceBook: (orgId: string) =>
    [...orgAnalyzerKeys.all, 'price-book', orgId] as const,
}

// ----- Hooks -----

export function useOrgAnalyzerLatest(orgId: string) {
  return useQuery({
    queryKey: orgAnalyzerKeys.latest(orgId),
    queryFn: async () =>
      apiClient.get<SnapshotSummary>(endpoints.orgAnalyzerLatest(orgId)),
    enabled: !!orgId,
  })
}

export interface FindingsFilter {
  category?: FindingCategory | null
  severity?: FindingSeverity | null
  include_ignored?: boolean
  limit?: number
  offset?: number
}

export function useOrgAnalyzerFindings(
  orgId: string,
  filter: FindingsFilter = {},
) {
  return useQuery({
    queryKey: orgAnalyzerKeys.findings(orgId, filter),
    queryFn: async () =>
      apiClient.get<FindingsPage>(endpoints.orgAnalyzerFindings(orgId), {
        params: {
          ...(filter.category ? { category: filter.category } : {}),
          ...(filter.severity ? { severity: filter.severity } : {}),
          ...(filter.include_ignored ? { include_ignored: true } : {}),
          limit: filter.limit ?? 100,
          offset: filter.offset ?? 0,
        },
      }),
    enabled: !!orgId,
  })
}

export function useIgnoreFinding(orgId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      findingId,
      reason,
    }: {
      findingId: string
      reason?: string
    }) =>
      apiClient.post<OrgFinding>(
        endpoints.orgAnalyzerIgnoreFinding(orgId, findingId),
        { reason: reason ?? null },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: orgAnalyzerKeys.latest(orgId) })
      qc.invalidateQueries({
        queryKey: [...orgAnalyzerKeys.all, 'findings', orgId],
      })
    },
  })
}

export function useUnignoreFinding(orgId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (findingId: string) =>
      apiClient.post<OrgFinding>(
        endpoints.orgAnalyzerUnignoreFinding(orgId, findingId),
        {},
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: orgAnalyzerKeys.latest(orgId) })
      qc.invalidateQueries({
        queryKey: [...orgAnalyzerKeys.all, 'findings', orgId],
      })
    },
  })
}

export function useOrgAnalyzerHistory(orgId: string, limit = 30) {
  return useQuery({
    queryKey: orgAnalyzerKeys.history(orgId),
    queryFn: async () =>
      apiClient.get<HistoryPoint[]>(endpoints.orgAnalyzerHistory(orgId), {
        params: { limit },
      }),
    enabled: !!orgId,
  })
}

export function useRunOrgAnalyzer(orgId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () =>
      apiClient.post<RunResponse>(endpoints.orgAnalyzerRun(orgId), {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: orgAnalyzerKeys.latest(orgId) })
      qc.invalidateQueries({ queryKey: orgAnalyzerKeys.history(orgId) })
      // Findings page uses a filter-keyed cache; invalidate the whole branch.
      qc.invalidateQueries({
        queryKey: [...orgAnalyzerKeys.all, 'findings', orgId],
      })
    },
  })
}

export function useLicensePriceBook(orgId: string) {
  return useQuery({
    queryKey: orgAnalyzerKeys.priceBook(orgId),
    queryFn: async () =>
      apiClient.get<PriceBookResponse>(endpoints.orgAnalyzerPriceBook(orgId)),
    enabled: !!orgId,
  })
}

export function useUpdateLicensePriceBook(orgId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (rows: PriceBookRow[]) =>
      apiClient.put<PriceBookResponse>(
        endpoints.orgAnalyzerPriceBook(orgId),
        { rows },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: orgAnalyzerKeys.priceBook(orgId) })
    },
  })
}

// ----- Helpers -----

export const CATEGORY_LABELS: Record<FindingCategory, string> = {
  license_waste: 'License & feature waste',
  config_bloat: 'Configuration bloat',
  automation_hygiene: 'Automation hygiene',
  sharing_posture: 'Sharing & security posture',
  storage_limit: 'Storage & limit risk',
  data_quality: 'Data quality',
  user_activity: 'User activity',
  predictive: 'Predictive trends',
}

export const SEVERITY_LABELS: Record<FindingSeverity, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  info: 'Info',
}

export const SEVERITY_COLORS: Record<FindingSeverity, string> = {
  critical: 'bg-red-700 text-white',
  high: 'bg-red-500 text-white',
  medium: 'bg-amber-500 text-white',
  low: 'bg-yellow-500 text-gray-900',
  info: 'bg-blue-500 text-white',
}

export function formatMoneyCents(cents: number | null | undefined): string {
  if (cents == null || cents === 0) return '—'
  const dollars = cents / 100
  if (dollars >= 1_000_000) {
    return `$${(dollars / 1_000_000).toFixed(2)}M`
  }
  if (dollars >= 10_000) {
    return `$${(dollars / 1_000).toFixed(1)}K`
  }
  return `$${Math.round(dollars).toLocaleString()}`
}
