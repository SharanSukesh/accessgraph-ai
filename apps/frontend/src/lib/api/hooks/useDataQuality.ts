/**
 * Data Quality API Hooks
 *
 * Talks to /orgs/{orgId}/data-quality/* — the per-object health scoring
 * engine. Powers the Quality column on the Objects list, the Data
 * Quality card on the Object detail, and the run trigger button in
 * the Objects page header.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '../client'
import { endpoints } from '../endpoints'

// ============================================================================
// Types — mirror the Pydantic response models in
// apps/backend/app/api/routes/data_quality.py.
// ============================================================================

export interface ObjectScore {
  object_name: string
  object_label: string
  is_custom: boolean
  record_count: number
  sampled_count: number
  score: number
  completeness_pct: number
  duplicate_pct: number
  staleness_pct: number
  fields_inspected: number
  fields_with_gaps: number
  duplicate_clusters: number
  stale_record_count: number
  evidence?: {
    // "aggregate_soql" for the current metadata-only methodology
    // (Options A + C — see future_v2_items.md). Sample-based runs
    // returned no methodology tag; treat absence as legacy.
    methodology?: 'aggregate_soql'
    gap_fields?: {
      field: string
      missing_pct: number
      is_custom?: boolean
      is_required?: boolean
    }[]
    duplicate_key?: string
    duplicate_examples?: { key: string; count: number }[]
    // True when SOQL GROUP BY hit the 2000-cluster ceiling — the
    // real duplicate count for this object may be higher. Prompts
    // the frontend to show a "Deep Scan (opt-in)" nudge once we
    // ship the Bulk API mode.
    duplicates_truncated?: boolean
    // SF's own active Duplicate Rules for this object + the
    // DuplicateRecordSet cluster count each has produced. Empty
    // list = org hasn't configured SF Duplicate Management for this
    // object.
    sf_duplicate_rules?: {
      id: string
      developer_name: string
      label: string
      record_set_count: number
    }[]
    sf_duplicate_native_cluster_count?: number
    stale_record_count?: number
    staleness_cutoff?: string
    note?: string
  }
}

export interface DataQualitySummary {
  run_id: string | null
  snapshot_at: string | null
  objects_analyzed: number
  objects_skipped: number
  avg_score: number
  avg_completeness: number
  avg_duplicate_pct: number
  avg_staleness_pct: number
  sample_size: number
  staleness_threshold_days: number
  has_data: boolean
  duration_ms: number | null
  error: string | null
  // Backend groups per-object skips by category (sample_failed,
  // count_failed, no_last_modified, etc.). Empty when nothing was
  // skipped; populated for diagnostics on low-coverage runs.
  skip_reasons: Record<string, number>
  // Coverage stats — how many sObjects the org has total vs. how many
  // we selected for analysis, plus the custom-object cap breakdown.
  // Used by the diagnostic banner to explain "22 of 422 analysed"
  // without the user having to check a log.
  coverage: {
    // Which scope was picked for this run.
    scope?: DataQualityScope
    // Objects with permission grants — same denominator as the
    // Objects page's "Total Objects" KPI (~400 in a typical org).
    total_sobjects?: number
    // Raw global-describe count (~1500 including feeds / shadows).
    // Only shown in the tooltip so power users can see the delta.
    total_sobjects_raw?: number
    standard_selected?: number
    standard_missing?: number
    custom_selected?: number
    custom_available?: number
    custom_dropped_by_cap?: number
    custom_cap?: number
  }
}

export interface ObjectListResponse {
  run_id: string | null
  snapshot_at: string | null
  objects: ObjectScore[]
}

export interface RunResponse {
  run_id: string
  snapshot_at: string
  objects_analyzed: number
  avg_score: number
}

export interface HistoryPoint {
  run_id: string
  snapshot_at: string
  avg_score: number
  objects_analyzed: number
}

// ============================================================================
// Query keys
// ============================================================================

export const dataQualityKeys = {
  all: ['data-quality'] as const,
  latest: (orgId: string) => [...dataQualityKeys.all, 'latest', orgId] as const,
  objects: (orgId: string) => [...dataQualityKeys.all, 'objects', orgId] as const,
  object: (orgId: string, objectName: string) =>
    [...dataQualityKeys.all, 'object', orgId, objectName] as const,
  history: (orgId: string) => [...dataQualityKeys.all, 'history', orgId] as const,
}

// ============================================================================
// Reads
// ============================================================================

/**
 * Latest-run summary. Powers the org-wide KPI + "Last analysed" badge
 * on the Objects page. Returns has_data=false when the engine has
 * never run for this org, so callers can render an "Analyse now"
 * empty state instead of a broken chart.
 */
export function useDataQualityLatest(orgId: string) {
  return useQuery<DataQualitySummary>({
    queryKey: dataQualityKeys.latest(orgId),
    queryFn: () => apiClient.get(endpoints.dataQualityLatest(orgId)),
    enabled: !!orgId,
    staleTime: 30_000,
  })
}

/**
 * Per-object score list — ordered worst-first by the backend so the
 * Objects page can badge the offenders. Enabled only when we know
 * a run exists (avoids one empty round-trip on first visit).
 */
export function useDataQualityObjects(orgId: string, options?: { enabled?: boolean }) {
  return useQuery<ObjectListResponse>({
    queryKey: dataQualityKeys.objects(orgId),
    queryFn: () => apiClient.get(endpoints.dataQualityObjects(orgId)),
    enabled: !!orgId && (options?.enabled ?? true),
    staleTime: 30_000,
  })
}

/**
 * One object's detail — includes the evidence blob (gap fields, dupe
 * clusters, oldest records). Used on the Object detail page's Data
 * Quality card.
 */
export function useDataQualityObject(
  orgId: string,
  objectName: string,
  options?: { enabled?: boolean },
) {
  return useQuery<ObjectScore>({
    queryKey: dataQualityKeys.object(orgId, objectName),
    queryFn: () =>
      apiClient.get(endpoints.dataQualityObject(orgId, objectName)),
    enabled: !!orgId && !!objectName && (options?.enabled ?? true),
    staleTime: 30_000,
    retry: (failureCount, error: unknown) => {
      // 404 means no run has covered this object yet — surfacing the
      // error is the correct UX; don't hammer the endpoint.
      const status = (error as { status?: number })?.status
      if (status === 404) return false
      return failureCount < 2
    },
  })
}

/**
 * Score-over-time. Optional sparkline data source for the org KPI.
 */
export function useDataQualityHistory(orgId: string) {
  return useQuery<HistoryPoint[]>({
    queryKey: dataQualityKeys.history(orgId),
    queryFn: () => apiClient.get(endpoints.dataQualityHistory(orgId)),
    enabled: !!orgId,
    staleTime: 60_000,
  })
}

// ============================================================================
// Writes
// ============================================================================

/**
 * Analysis scope. "business" uses the permission-snapshot filter
 * (~400 objects on a typical org). "all" uses the raw global-describe
 * pool with shadow objects filtered out (~1000+ on a big org).
 */
export type DataQualityScope = 'business' | 'all'

/**
 * Trigger a new run. On success, invalidates the latest / objects /
 * history queries so the UI hydrates from the fresh snapshot. Accepts
 * an optional `scope` — defaults to 'business' if omitted.
 */
export function useRunDataQuality(orgId: string) {
  const queryClient = useQueryClient()
  return useMutation<RunResponse, unknown, DataQualityScope | void>({
    mutationFn: (scope) => {
      const s: DataQualityScope = scope ?? 'business'
      // Append scope as a query-string param so it survives the
      // apiClient's fetch wrapper without needing a body.
      return apiClient.post(
        `${endpoints.dataQualityRun(orgId)}?scope=${s}`,
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dataQualityKeys.all })
    },
  })
}
