/**
 * License-to-Persona Fit hooks.
 *
 * Types mirror the Pydantic response models in
 * apps/backend/app/api/routes/license_fit.py.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '../client'
import { endpoints } from '../endpoints'

// ============================================================================
// Types
// ============================================================================

export type LicenseFitPersona =
  | 'sales'
  | 'service'
  | 'marketing'
  | 'admin'
  | 'platform'
  | 'readonly'
  | 'community'
  | 'inactive'
  | 'unknown'

export type LicenseFitCategory =
  | 'right_sized'
  | 'overbuilt'
  | 'wrong_cloud'
  | 'underused'
  | 'inactive_billed'
  | 'unknown'

export type LicenseFitConfidence = 'high' | 'medium' | 'low'

export interface LicenseFitAssessment {
  id: string
  user_sf_id: string
  user_name: string | null
  user_username: string | null
  user_is_active: boolean
  user_profile_name: string | null
  user_department: string | null
  user_title: string | null
  last_login_at: string | null
  days_since_login: number | null
  current_license_name: string | null
  current_monthly_cost_cents: number
  persona: LicenseFitPersona
  fit_category: LicenseFitCategory
  confidence: LicenseFitConfidence
  recommended_license_name: string | null
  recommended_monthly_cost_cents: number | null
  annual_savings_cents: number
  accounts_owned: number
  opportunities_owned: number
  cases_owned: number
  leads_owned: number
  contacts_owned: number
  evidence: Record<string, unknown>
}

export interface LicenseFitSourceDiagnostics {
  users?: { count?: number; error?: string | null }
  profiles?: { count?: number; error?: string | null }
  owner_counts?: Record<string, number>
  price_book_source?: 'defaults' | 'org_override'
}

export interface LicenseFitSummary {
  run_id: string | null
  snapshot_at: string | null
  users_assessed: number
  users_right_sized: number
  users_overbuilt: number
  users_wrong_cloud: number
  users_underused: number
  users_inactive_billed: number
  users_unknown: number
  total_annual_savings_cents: number
  total_current_annual_cost_cents: number
  has_data: boolean
  duration_ms: number | null
  error: string | null
  source_diagnostics: LicenseFitSourceDiagnostics | null
}

export interface LicenseFitListResponse {
  run_id: string | null
  total: number
  items: LicenseFitAssessment[]
}

export interface LicenseFitRunResponse {
  run_id: string
  snapshot_at: string
  users_assessed: number
  total_annual_savings_cents: number
}

export interface LicenseFitHistoryPoint {
  run_id: string
  snapshot_at: string
  users_assessed: number
  total_annual_savings_cents: number
}

export interface LicenseFitFilters {
  fit_category?: LicenseFitCategory
  persona?: LicenseFitPersona
  search?: string
  limit?: number
  offset?: number
}

// ============================================================================
// Query keys
// ============================================================================

export const licenseFitKeys = {
  all: ['license-fit'] as const,
  latest: (orgId: string) =>
    [...licenseFitKeys.all, 'latest', orgId] as const,
  items: (orgId: string, filters?: LicenseFitFilters) =>
    [...licenseFitKeys.all, 'items', orgId, filters ?? {}] as const,
  history: (orgId: string) =>
    [...licenseFitKeys.all, 'history', orgId] as const,
}

// ============================================================================
// Reads
// ============================================================================

export function useLicenseFitLatest(orgId: string) {
  return useQuery<LicenseFitSummary>({
    queryKey: licenseFitKeys.latest(orgId),
    queryFn: () => apiClient.get(endpoints.licenseFitLatest(orgId)),
    enabled: !!orgId,
    staleTime: 30_000,
  })
}

export function useLicenseFitItems(
  orgId: string,
  filters?: LicenseFitFilters,
) {
  const qs = new URLSearchParams()
  if (filters?.fit_category) qs.set('fit_category', filters.fit_category)
  if (filters?.persona) qs.set('persona', filters.persona)
  if (filters?.search) qs.set('search', filters.search)
  if (typeof filters?.limit === 'number')
    qs.set('limit', String(filters.limit))
  if (typeof filters?.offset === 'number')
    qs.set('offset', String(filters.offset))
  const suffix = qs.toString() ? `?${qs.toString()}` : ''

  return useQuery<LicenseFitListResponse>({
    queryKey: licenseFitKeys.items(orgId, filters),
    queryFn: () =>
      apiClient.get(`${endpoints.licenseFitItems(orgId)}${suffix}`),
    enabled: !!orgId,
    staleTime: 30_000,
  })
}

export function useLicenseFitHistory(orgId: string) {
  return useQuery<LicenseFitHistoryPoint[]>({
    queryKey: licenseFitKeys.history(orgId),
    queryFn: () => apiClient.get(endpoints.licenseFitHistory(orgId)),
    enabled: !!orgId,
    staleTime: 60_000,
  })
}

// ============================================================================
// Writes
// ============================================================================

export function useRunLicenseFit(orgId: string) {
  const qc = useQueryClient()
  return useMutation<LicenseFitRunResponse, unknown, void>({
    mutationFn: () => apiClient.post(endpoints.licenseFitRun(orgId)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: licenseFitKeys.all })
    },
  })
}
