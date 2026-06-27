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
  // v1.8 — "Apply fix" SF write-back state. has_apply_fix tells the
  // UI whether to render the button; is_resolved hides the finding by
  // default like is_ignored does.
  is_resolved?: boolean
  resolved_at?: string | null
  resolved_by?: string | null
  has_apply_fix?: boolean
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
  // Org-edition state from the latest analyzer run. Drives the
  // non-paying-org banner on the Overview tab + the auto-detection
  // ladder in the Price-book editor.
  org_type?: string | null
  is_sandbox?: boolean
  is_trial?: boolean
  is_paying_org?: boolean
  // v1.8 — narrative summary + delta-vs-prior-snapshot. Both hide their
  // cards when missing so old snapshots render cleanly.
  executive_summary?: string | null
  delta?: {
    prior_snapshot_id?: string | null
    prior_snapshot_at?: string | null
    new_high_critical?: number | null
    new_findings_total?: number | null
  } | null
}

export interface BrandSettings {
  firm_name: string | null
  accent_hex: string | null
  has_logo: boolean
}

export interface ApplyFixResponse {
  finding_id: string
  code: string
  succeeded_count: number
  failed_count: number
  details: Array<Record<string, any>>
  error: string | null
  is_resolved: boolean
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
  // Whether this SKU is billed for the customer (true) or bundled
  // at $0 (false). Sent on PUT so admin overrides persist.
  is_billed?: boolean
  // Optional flags returned by the GET endpoint. The PUT side ignores
  // these — overrides are inferred from presence in the payload — so
  // they're omitted in the request body.
  is_override?: boolean
  in_org?: boolean
  // Auto-detection reason for the current is_billed default. Surfaced
  // in a tooltip in the Price-book editor.
  billed_reason?: string | null
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

// ----- v1.8: Apply-fix + brand settings -----

export function useApplyFix(orgId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      findingId,
      target_user_sf_ids,
    }: {
      findingId: string
      target_user_sf_ids?: string[]
    }) =>
      apiClient.post<ApplyFixResponse>(
        endpoints.orgAnalyzerApplyFix(orgId, findingId),
        target_user_sf_ids ? { target_user_sf_ids } : {},
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: orgAnalyzerKeys.latest(orgId) })
      qc.invalidateQueries({
        queryKey: [...orgAnalyzerKeys.all, 'findings', orgId],
      })
    },
  })
}

const brandKey = (orgId: string) => [...orgAnalyzerKeys.all, 'brand', orgId] as const

export function useBrandSettings(orgId: string) {
  return useQuery({
    queryKey: brandKey(orgId),
    queryFn: async () =>
      apiClient.get<BrandSettings>(endpoints.orgAnalyzerBrand(orgId)),
    enabled: !!orgId,
  })
}

export function useUpdateBrandSettings(orgId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: {
      firm_name?: string | null
      accent_hex?: string | null
    }) =>
      apiClient.put<BrandSettings>(endpoints.orgAnalyzerBrand(orgId), payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: brandKey(orgId) })
    },
  })
}

export function useUploadBrandLogo(orgId: string) {
  const qc = useQueryClient()
  return useMutation({
    // multipart/form-data — fetch directly so we don't fight the JSON
    // shape of apiClient. credentials: include matches the rest of the
    // app's auth-cookie convention.
    mutationFn: async (file: File): Promise<BrandSettings> => {
      const formData = new FormData()
      formData.append('file', file)
      const base = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
      const res = await fetch(`${base}${endpoints.orgAnalyzerBrandLogo(orgId)}`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      })
      if (!res.ok) {
        const text = await res.text()
        throw new Error(text || `Upload failed (${res.status})`)
      }
      return res.json()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: brandKey(orgId) })
    },
  })
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
