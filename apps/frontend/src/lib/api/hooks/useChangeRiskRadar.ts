/**
 * Change-Risk Radar API hooks.
 *
 * Powers the /change-risk page — pulls SetupAuditTrail from Salesforce
 * and scores each event by "blast radius" (how broadly the change
 * could affect users / data / access). Timeline lists high-risk
 * changes first so admins can spot risky recent activity at a glance.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '../client'
import { endpoints } from '../endpoints'

// ============================================================================
// Types — mirror Pydantic response models in
// apps/backend/app/api/routes/change_risk_radar.py.
// ============================================================================

export type BlastTier = 'critical' | 'high' | 'medium' | 'low'

export interface ChangeEvent {
  id: string
  sf_event_id: string
  created_at_sf: string
  actor_id: string | null
  actor_name: string | null
  section: string | null
  action: string | null
  display: string
  delegate_user: string | null
  blast_radius: number
  blast_tier: BlastTier
  reasoning: {
    section_base?: number
    section_used?: string
    modifiers?: { keyword: string; bump: number }[]
    final?: number
  }
}

export interface ChangeRiskSummary {
  run_id: string | null
  snapshot_at: string | null
  since: string | null
  events_ingested: number
  high_blast_count: number
  unique_actors: number
  avg_blast_radius: number
  rollups: {
    by_section?: Record<string, number>
    by_actor?: Record<string, number>
    by_tier?: Record<BlastTier, number>
  }
  has_data: boolean
  duration_ms: number | null
  error: string | null
}

export interface ChangeEventListResponse {
  run_id: string | null
  total: number
  events: ChangeEvent[]
}

export interface ChangeRiskRunResponse {
  run_id: string
  snapshot_at: string
  events_ingested: number
  high_blast_count: number
}

export interface ChangeRiskHistoryPoint {
  run_id: string
  snapshot_at: string
  events_ingested: number
  high_blast_count: number
  avg_blast_radius: number
}

export interface EventFilters {
  tier?: BlastTier
  section?: string
  actor?: string
  limit?: number
  offset?: number
}

// ============================================================================
// Query keys
// ============================================================================

export const changeRiskKeys = {
  all: ['change-risk'] as const,
  latest: (orgId: string) => [...changeRiskKeys.all, 'latest', orgId] as const,
  events: (orgId: string, filters?: EventFilters) =>
    [...changeRiskKeys.all, 'events', orgId, filters ?? {}] as const,
  history: (orgId: string) => [...changeRiskKeys.all, 'history', orgId] as const,
}

// ============================================================================
// Reads
// ============================================================================

/**
 * Headline stats for the most recent SetupAuditTrail pull. Returns
 * `has_data: false` when the engine has never run, so the page can
 * render an "Analyse now" empty state cleanly on first visit.
 */
export function useChangeRiskLatest(orgId: string) {
  return useQuery<ChangeRiskSummary>({
    queryKey: changeRiskKeys.latest(orgId),
    queryFn: () => apiClient.get(endpoints.changeRiskLatest(orgId)),
    enabled: !!orgId,
    staleTime: 30_000,
  })
}

/**
 * Paginated event timeline with optional tier / section / actor
 * filters. Server orders most-recent first.
 */
export function useChangeRiskEvents(orgId: string, filters?: EventFilters) {
  const qs = new URLSearchParams()
  if (filters?.tier) qs.set('tier', filters.tier)
  if (filters?.section) qs.set('section', filters.section)
  if (filters?.actor) qs.set('actor', filters.actor)
  if (typeof filters?.limit === 'number') qs.set('limit', String(filters.limit))
  if (typeof filters?.offset === 'number') qs.set('offset', String(filters.offset))
  const suffix = qs.toString() ? `?${qs.toString()}` : ''

  return useQuery<ChangeEventListResponse>({
    queryKey: changeRiskKeys.events(orgId, filters),
    queryFn: () =>
      apiClient.get(`${endpoints.changeRiskEvents(orgId)}${suffix}`),
    enabled: !!orgId,
    staleTime: 30_000,
  })
}

/**
 * Score-over-time sparkline data. Small array, safe to keep fresh.
 */
export function useChangeRiskHistory(orgId: string) {
  return useQuery<ChangeRiskHistoryPoint[]>({
    queryKey: changeRiskKeys.history(orgId),
    queryFn: () => apiClient.get(endpoints.changeRiskHistory(orgId)),
    enabled: !!orgId,
    staleTime: 60_000,
  })
}

// ============================================================================
// Writes
// ============================================================================

/**
 * Kick off a new SetupAuditTrail pull. Optional `sinceDays` picks how
 * far back to go — defaults to 30 on the backend if omitted.
 */
export function useRunChangeRisk(orgId: string) {
  const queryClient = useQueryClient()
  return useMutation<ChangeRiskRunResponse, unknown, number | void>({
    mutationFn: (sinceDays) => {
      const qs =
        typeof sinceDays === 'number' ? `?since_days=${sinceDays}` : ''
      return apiClient.post(`${endpoints.changeRiskRun(orgId)}${qs}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: changeRiskKeys.all })
    },
  })
}
