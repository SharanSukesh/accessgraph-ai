/**
 * Integration Sprawl API hooks.
 *
 * Powers the Integrations tab of /orgs/{orgId}/sprawl — inventory of
 * every integration surface in the org (Connected Apps + Named
 * Credentials + External Data Sources + Auth Providers + Remote
 * Sites), tiered by activity + activation state with drill-down.
 *
 * Types mirror the Pydantic response models in
 * apps/backend/app/api/routes/integration_sprawl.py.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '../client'
import { endpoints } from '../endpoints'

// ============================================================================
// Types
// ============================================================================

export type IntegrationType =
  | 'connected_app'
  | 'named_credential'
  | 'external_data_source'
  | 'auth_provider'
  | 'remote_site'

export type IntegrationDirection = 'inbound' | 'outbound' | 'sso'

export type IntegrationTier = 'healthy' | 'stale' | 'broken' | 'unknown'

export interface IntegrationItem {
  id: string
  sf_id: string
  integration_type: IntegrationType
  direction: IntegrationDirection
  name: string
  developer_name: string | null
  endpoint: string | null
  namespace_prefix: string | null
  is_active: boolean | null
  login_count_180d: number | null
  failed_login_count_180d: number | null
  last_used_at: string | null
  tier: IntegrationTier
  evidence: Record<string, unknown>
}

export interface IntegrationSourceDiagnostic {
  raw_count?: number
  error?: string | null
}

export interface IntegrationSourceDiagnostics {
  connected_apps?: IntegrationSourceDiagnostic
  named_credentials?: IntegrationSourceDiagnostic
  external_data_sources?: IntegrationSourceDiagnostic
  auth_providers?: IntegrationSourceDiagnostic
  remote_sites?: IntegrationSourceDiagnostic
  login_history?: IntegrationSourceDiagnostic
}

export interface IntegrationSprawlSummary {
  run_id: string | null
  snapshot_at: string | null
  connected_apps_total: number
  named_credentials_total: number
  external_data_sources_total: number
  auth_providers_total: number
  remote_sites_total: number
  items_total: number
  items_healthy: number
  items_stale: number
  items_broken: number
  items_unknown: number
  logins_180d: number
  failed_logins_180d: number
  has_data: boolean
  duration_ms: number | null
  error: string | null
  source_diagnostics: IntegrationSourceDiagnostics | null
}

export interface IntegrationListResponse {
  run_id: string | null
  total: number
  items: IntegrationItem[]
}

export interface IntegrationSprawlRunResponse {
  run_id: string
  snapshot_at: string
  items_total: number
  items_broken: number
  items_stale: number
}

export interface IntegrationSprawlHistoryPoint {
  run_id: string
  snapshot_at: string
  items_total: number
  items_broken: number
  items_stale: number
}

export interface IntegrationItemFilters {
  tier?: IntegrationTier
  integration_type?: IntegrationType
  search?: string
  limit?: number
  offset?: number
}

// ============================================================================
// Query keys
// ============================================================================

export const integrationSprawlKeys = {
  all: ['integration-sprawl'] as const,
  latest: (orgId: string) =>
    [...integrationSprawlKeys.all, 'latest', orgId] as const,
  items: (orgId: string, filters?: IntegrationItemFilters) =>
    [...integrationSprawlKeys.all, 'items', orgId, filters ?? {}] as const,
  history: (orgId: string) =>
    [...integrationSprawlKeys.all, 'history', orgId] as const,
}

// ============================================================================
// Reads
// ============================================================================

export function useIntegrationSprawlLatest(orgId: string) {
  return useQuery<IntegrationSprawlSummary>({
    queryKey: integrationSprawlKeys.latest(orgId),
    queryFn: () => apiClient.get(endpoints.integrationSprawlLatest(orgId)),
    enabled: !!orgId,
    staleTime: 30_000,
  })
}

export function useIntegrationSprawlItems(
  orgId: string,
  filters?: IntegrationItemFilters,
) {
  const qs = new URLSearchParams()
  if (filters?.tier) qs.set('tier', filters.tier)
  if (filters?.integration_type)
    qs.set('integration_type', filters.integration_type)
  if (filters?.search) qs.set('search', filters.search)
  if (typeof filters?.limit === 'number')
    qs.set('limit', String(filters.limit))
  if (typeof filters?.offset === 'number')
    qs.set('offset', String(filters.offset))
  const suffix = qs.toString() ? `?${qs.toString()}` : ''

  return useQuery<IntegrationListResponse>({
    queryKey: integrationSprawlKeys.items(orgId, filters),
    queryFn: () =>
      apiClient.get(`${endpoints.integrationSprawlItems(orgId)}${suffix}`),
    enabled: !!orgId,
    staleTime: 30_000,
  })
}

export function useIntegrationSprawlHistory(orgId: string) {
  return useQuery<IntegrationSprawlHistoryPoint[]>({
    queryKey: integrationSprawlKeys.history(orgId),
    queryFn: () => apiClient.get(endpoints.integrationSprawlHistory(orgId)),
    enabled: !!orgId,
    staleTime: 60_000,
  })
}

// ============================================================================
// Writes
// ============================================================================

export function useRunIntegrationSprawl(orgId: string) {
  const qc = useQueryClient()
  return useMutation<IntegrationSprawlRunResponse, unknown, void>({
    mutationFn: () => apiClient.post(endpoints.integrationSprawlRun(orgId)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: integrationSprawlKeys.all })
    },
  })
}
