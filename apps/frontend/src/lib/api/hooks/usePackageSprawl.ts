/**
 * Managed-Package Sprawl API hooks.
 *
 * Powers the /package-sprawl page — inventories every managed package
 * installed in the org, tiers each as Active / Under-used / Unused
 * based on component activity + licence-seat usage, and rolls the
 * counts into a KPI strip. Consultants use the resulting Unused list
 * to quantify AppExchange waste.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '../client'
import { endpoints } from '../endpoints'

// ============================================================================
// Types — mirror Pydantic responses in
// apps/backend/app/api/routes/package_sprawl.py.
// ============================================================================

export type PackageTier = 'active' | 'underused' | 'unused'

export interface InstalledPackage {
  id: string
  sf_package_id: string
  sf_version_id: string | null
  name: string
  namespace_prefix: string | null
  description: string | null
  version_name: string | null
  version_number: string | null
  is_beta: boolean
  is_deprecated: boolean
  is_managed: boolean
  apex_class_count: number
  flow_count: number
  custom_object_count: number
  licenses_allowed: number | null
  licenses_used: number | null
  utilization_tier: PackageTier
  evidence: {
    reasoning?: {
      components?: number
      components_breakdown?: {
        apex_class?: number
        flow?: number
        custom_object?: number
      }
      licence_seats_used?: number
      licence_seats_allowed?: number | null
      deprecated_penalty?: boolean
      final_tier?: PackageTier
    }
  }
}

export interface PackageSprawlSummary {
  run_id: string | null
  snapshot_at: string | null
  packages_total: number
  packages_active: number
  packages_underused: number
  packages_unused: number
  avg_utilization_pct: number
  total_licenses_allowed: number
  total_licenses_used: number
  has_data: boolean
  duration_ms: number | null
  error: string | null
}

export interface PackageListResponse {
  run_id: string | null
  packages: InstalledPackage[]
}

export interface PackageSprawlRunResponse {
  run_id: string
  snapshot_at: string
  packages_total: number
  packages_unused: number
}

export interface PackageSprawlHistoryPoint {
  run_id: string
  snapshot_at: string
  packages_total: number
  packages_unused: number
  avg_utilization_pct: number
}

// ============================================================================
// Query keys
// ============================================================================

export const packageSprawlKeys = {
  all: ['package-sprawl'] as const,
  latest: (orgId: string) => [...packageSprawlKeys.all, 'latest', orgId] as const,
  packages: (orgId: string, tier?: PackageTier) =>
    [...packageSprawlKeys.all, 'packages', orgId, tier ?? 'all'] as const,
  history: (orgId: string) =>
    [...packageSprawlKeys.all, 'history', orgId] as const,
}

// ============================================================================
// Reads
// ============================================================================

/** Headline stats for the last run. */
export function usePackageSprawlLatest(orgId: string) {
  return useQuery<PackageSprawlSummary>({
    queryKey: packageSprawlKeys.latest(orgId),
    queryFn: () => apiClient.get(endpoints.packageSprawlLatest(orgId)),
    enabled: !!orgId,
    staleTime: 30_000,
  })
}

/** Per-package list, ordered Unused → Under-used → Active. */
export function usePackageSprawlPackages(
  orgId: string,
  filters?: { tier?: PackageTier },
) {
  const qs = filters?.tier ? `?tier=${filters.tier}` : ''
  return useQuery<PackageListResponse>({
    queryKey: packageSprawlKeys.packages(orgId, filters?.tier),
    queryFn: () =>
      apiClient.get(`${endpoints.packageSprawlPackages(orgId)}${qs}`),
    enabled: !!orgId,
    staleTime: 30_000,
  })
}

/** Score-over-time trend. */
export function usePackageSprawlHistory(orgId: string) {
  return useQuery<PackageSprawlHistoryPoint[]>({
    queryKey: packageSprawlKeys.history(orgId),
    queryFn: () => apiClient.get(endpoints.packageSprawlHistory(orgId)),
    enabled: !!orgId,
    staleTime: 60_000,
  })
}

// ============================================================================
// Writes
// ============================================================================

export function useRunPackageSprawl(orgId: string) {
  const queryClient = useQueryClient()
  return useMutation<PackageSprawlRunResponse>({
    mutationFn: () => apiClient.post(endpoints.packageSprawlRun(orgId)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: packageSprawlKeys.all })
    },
  })
}
