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
  // v2 wiring signals — null means the query for that signal failed
  // (missing permissions / no Tooling API access). 0 means we queried
  // and got no rows. Any positive number promotes the package to
  // Active tier automatically.
  dependency_count: number | null
  record_count_total: number | null
  async_job_count: number | null
  scheduled_job_count: number | null
  utilization_tier: PackageTier
  evidence: {
    reasoning?: {
      /** Which wiring signals fired for this package. */
      wiring_signals?: (
        | 'dependencies'
        | 'supplemental_deps'
        | 'records'
        | 'async_jobs'
        | 'scheduled_jobs'
        | 'licence_seats'
      )[]
      components?: number
      components_breakdown?: {
        apex_class?: number
        apex_trigger?: number | null
        flow?: number
        lwc?: number | null
        aura?: number | null
        custom_object?: number
      }
      dependency_count?: number | null
      record_count_total?: number | null
      async_job_count?: number | null
      scheduled_job_count?: number | null
      licence_seats_used?: number
      licence_seats_allowed?: number | null
      deprecated_penalty?: boolean
      final_tier?: PackageTier
    }
    /** Customer-owned components that reference this package.
     *  Blended from three sources:
     *   - Primary hits from `MetadataComponentDependency` (no `source`
     *     tag — this is Salesforce's official dependency index).
     *   - Supplemental hits from a direct CustomTab -> LWC lookup
     *     (`source: 'customtab_lwc'`) — catches direct Lightning
     *     Component tabs.
     *   - Supplemental hits from a FlexiPage metadata sweep
     *     (`source: 'flexipage'`) — catches Lightning App / Home /
     *     Record Pages built in App Builder that host a component
     *     from the target namespace. This is the *most common* way
     *     a customer surfaces a managed-package LWC, and the one
     *     `MetadataComponentDependency` misses hardest on beta 2GP
     *     packages. */
    top_dependents?: {
      component: string | null
      component_type: string | null
      ref_component: string | null
      ref_type: string | null
      source?: 'customtab_lwc' | 'flexipage'
    }[]
    /** Number of supplemental hits (subset of top_dependents.length
     *  where source === 'customtab_lwc'). Handy for the UI to show a
     *  "found via supplemental pass" note when the primary index
     *  returned 0. */
    supplemental_dependents_count?: number
    /** Per-object record counts across package-brought custom objects. */
    record_counts_by_object?: Record<string, number>
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
