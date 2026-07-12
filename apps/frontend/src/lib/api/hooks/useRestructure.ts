/**
 * Restructure Studio API hooks.
 *
 * Powers /orgs/{orgId}/restructure — the interactive canvas where
 * consultants review proposed structural moves, accept/reject each,
 * assemble a plan, and export a CSV of the accepted sequence.
 *
 * Types mirror the Pydantic response models in
 * apps/backend/app/api/routes/restructure.py.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '../client'
import { endpoints } from '../endpoints'

// ============================================================================
// Types
// ============================================================================

export type RestructureMoveType =
  | 'MERGE_PERMISSION_SETS'
  | 'RETIRE_UNUSED_PS'
  | 'REASSIGN_TO_ROLE'
  | 'MERGE_ROLES'
  | 'FLATTEN_ROLE_LEVEL'
  | 'REPARENT_ROLE'
  | 'REASSIGN_MANAGER'

export type RestructureMoveStatus =
  | 'proposed'
  | 'accepted'
  | 'rejected'
  | 'edited'

export type RestructureBlastTier = 'low' | 'medium' | 'high' | 'critical'

/** Object-keyed record counts. `{Account: 1200, Opportunity: 3400}` */
export type RecordCountByObject = Record<string, number>

export interface RunKpiBlock {
  equity_index: number | null
  ps_count: number
  role_count: number
  user_count: number | null
  monthly_license_cost: number | null
}

export interface RestructureRunSummary {
  run_id: string | null
  snapshot_at: string | null
  status: string | null
  moves_generated: number
  duration_ms: number | null
  error: string | null
  has_data: boolean
  current: RunKpiBlock | null
  projected: RunKpiBlock | null
  move_type_counts: Record<string, number>
  blast_tier_counts: Record<string, number>
}

export interface RestructureRunResponse {
  run_id: string
  snapshot_at: string
  moves_generated: number
  projected_equity_index: number | null
}

export interface RestructureMoveImpact {
  object_access_preserved_pct: number | null
  field_access_preserved_pct: number | null
  equity_delta: number | null
  cost_delta_monthly: number | null
  complexity_delta: number | null
  sharing_rules_simplified: number | null
  blast_tier: RestructureBlastTier
  blast_score: number
  records_gained_by_object: RecordCountByObject | null
  records_lost_by_object: RecordCountByObject | null
  deep_analysis_at: string | null
  probe_sample_size: number | null
}

export interface RestructureMove {
  id: string
  run_id: string
  move_type: RestructureMoveType
  move_status: RestructureMoveStatus
  primary_component_id: string | null
  primary_component_name: string | null
  affected_component_ids: string[]
  affected_user_ids: string[]
  impact: RestructureMoveImpact
  constraint_violations: string[]
  rationale: string | null
  consultant_notes: string | null
}

export interface RestructureMoveListResponse {
  run_id: string | null
  total: number
  moves: RestructureMove[]
}

export interface RestructurePlan {
  id: string
  run_id: string
  name: string
  status: 'draft' | 'approved' | 'archived'
  accepted_move_ids: string[]
  notes: string | null
  created_by: string | null
  updated_by: string | null
}

export interface RestructureConstraint {
  id: string
  run_id: string
  user_sf_id: string
  object_type: string
  reason: string | null
}

// ============================================================================
// Query keys
// ============================================================================

export const restructureKeys = {
  all: ['restructure'] as const,
  latest: (orgId: string) => [...restructureKeys.all, 'latest', orgId] as const,
  moves: (
    orgId: string,
    filters?: {
      move_type?: string
      blast_tier?: string
      status?: string
      limit?: number
      offset?: number
    },
  ) => [...restructureKeys.all, 'moves', orgId, filters ?? {}] as const,
  move: (orgId: string, moveId: string) =>
    [...restructureKeys.all, 'move', orgId, moveId] as const,
  plans: (orgId: string, runId?: string) =>
    [...restructureKeys.all, 'plans', orgId, runId ?? 'latest'] as const,
  plan: (orgId: string, planId: string) =>
    [...restructureKeys.all, 'plan', orgId, planId] as const,
  constraints: (orgId: string, runId?: string) =>
    [...restructureKeys.all, 'constraints', orgId, runId ?? 'latest'] as const,
}

// ============================================================================
// Reads
// ============================================================================

/** Run summary + KPI deltas. Returns has_data=false when no run exists. */
export function useRestructureLatest(orgId: string) {
  return useQuery<RestructureRunSummary>({
    queryKey: restructureKeys.latest(orgId),
    queryFn: () => apiClient.get(endpoints.restructureLatest(orgId)),
    enabled: !!orgId,
    staleTime: 30_000,
  })
}

/** Paginated move list from the latest run. */
export function useRestructureMoves(
  orgId: string,
  filters?: {
    move_type?: string
    blast_tier?: string
    status?: string
    limit?: number
    offset?: number
  },
) {
  const qs = new URLSearchParams()
  if (filters?.move_type) qs.set('move_type', filters.move_type)
  if (filters?.blast_tier) qs.set('blast_tier', filters.blast_tier)
  if (filters?.status) qs.set('status', filters.status)
  if (typeof filters?.limit === 'number') qs.set('limit', String(filters.limit))
  if (typeof filters?.offset === 'number')
    qs.set('offset', String(filters.offset))
  const suffix = qs.toString() ? `?${qs.toString()}` : ''

  return useQuery<RestructureMoveListResponse>({
    queryKey: restructureKeys.moves(orgId, filters),
    queryFn: () =>
      apiClient.get(`${endpoints.restructureMoves(orgId)}${suffix}`),
    enabled: !!orgId,
    staleTime: 30_000,
  })
}

/** Single move detail — used by the drawer. */
export function useRestructureMove(orgId: string, moveId: string | null) {
  return useQuery<RestructureMove>({
    queryKey: restructureKeys.move(orgId, moveId ?? ''),
    queryFn: () =>
      apiClient.get(endpoints.restructureMove(orgId, moveId as string)),
    enabled: !!orgId && !!moveId,
    staleTime: 15_000,
  })
}

/** Plans for the latest run. */
export function useRestructurePlans(orgId: string, runId?: string) {
  const qs = runId ? `?run_id=${runId}` : ''
  return useQuery<RestructurePlan[]>({
    queryKey: restructureKeys.plans(orgId, runId),
    queryFn: () =>
      apiClient.get(`${endpoints.restructurePlans(orgId)}${qs}`),
    enabled: !!orgId,
    staleTime: 30_000,
  })
}

/** Preservation constraints for the latest run. */
export function useRestructureConstraints(orgId: string, runId?: string) {
  const qs = runId ? `?run_id=${runId}` : ''
  return useQuery<RestructureConstraint[]>({
    queryKey: restructureKeys.constraints(orgId, runId),
    queryFn: () =>
      apiClient.get(`${endpoints.restructureConstraints(orgId)}${qs}`),
    enabled: !!orgId,
    staleTime: 30_000,
  })
}

// ============================================================================
// Writes
// ============================================================================

export interface RunOptions {
  maxMoves?: number
  psOverlapThreshold?: number
  roleMemberOverlapThreshold?: number
}

/** Kick off a new Restructure generation. Synchronous — the mutation
 *  resolves when the backend has finished mining and scoring. */
export function useRunRestructure(orgId: string) {
  const qc = useQueryClient()
  return useMutation<RestructureRunResponse, unknown, RunOptions | void>({
    mutationFn: (opts) => {
      const params = new URLSearchParams()
      if (opts) {
        if (typeof opts.maxMoves === 'number') {
          params.set('max_moves', String(opts.maxMoves))
        }
        if (typeof opts.psOverlapThreshold === 'number') {
          params.set(
            'ps_overlap_threshold',
            String(opts.psOverlapThreshold),
          )
        }
        if (typeof opts.roleMemberOverlapThreshold === 'number') {
          params.set(
            'role_member_overlap_threshold',
            String(opts.roleMemberOverlapThreshold),
          )
        }
      }
      const qs = params.toString() ? `?${params.toString()}` : ''
      return apiClient.post(`${endpoints.restructureRun(orgId)}${qs}`)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: restructureKeys.all })
    },
  })
}

/** PATCH a move — accept/reject or edit consultant notes. */
export interface MoveUpdate {
  moveId: string
  move_status?: RestructureMoveStatus
  consultant_notes?: string | null
}

export function useUpdateRestructureMove(orgId: string) {
  const qc = useQueryClient()
  return useMutation<RestructureMove, unknown, MoveUpdate>({
    mutationFn: ({ moveId, ...body }) =>
      apiClient.patch<RestructureMove>(
        endpoints.restructureMove(orgId, moveId),
        body,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: restructureKeys.all })
    },
  })
}

/** Trigger Option B bounded probing for a specific move. */
export function useDeepAnalyzeMove(orgId: string) {
  const qc = useQueryClient()
  return useMutation<
    RestructureMove,
    unknown,
    { moveId: string; sampleSize?: number }
  >({
    mutationFn: ({ moveId, sampleSize }) => {
      const qs =
        typeof sampleSize === 'number' ? `?sample_size=${sampleSize}` : ''
      return apiClient.post<RestructureMove>(
        `${endpoints.restructureMoveDeepAnalyze(orgId, moveId)}${qs}`,
      )
    },
    onSuccess: (data) => {
      qc.invalidateQueries({
        queryKey: restructureKeys.move(orgId, data.id),
      })
      qc.invalidateQueries({
        queryKey: [...restructureKeys.all, 'moves'],
      })
    },
  })
}

/** Create a draft plan for a run. */
export interface PlanCreate {
  run_id: string
  name?: string
  notes?: string | null
}

export function useCreatePlan(orgId: string) {
  const qc = useQueryClient()
  return useMutation<RestructurePlan, unknown, PlanCreate>({
    mutationFn: (body) =>
      apiClient.post<RestructurePlan>(
        endpoints.restructurePlans(orgId),
        body,
      ),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: [...restructureKeys.all, 'plans'],
      })
    },
  })
}

export interface PlanUpdate {
  planId: string
  name?: string
  notes?: string | null
  status?: 'draft' | 'approved' | 'archived'
  accepted_move_ids?: string[]
}

export function useUpdatePlan(orgId: string) {
  const qc = useQueryClient()
  return useMutation<RestructurePlan, unknown, PlanUpdate>({
    mutationFn: ({ planId, ...body }) =>
      apiClient.patch<RestructurePlan>(
        endpoints.restructurePlan(orgId, planId),
        body,
      ),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: [...restructureKeys.all, 'plans'],
      })
    },
  })
}

/** Create a preservation constraint. Returns 409 if the same
 *  (run, user, object) is pinned twice. */
export interface ConstraintCreate {
  run_id: string
  user_sf_id: string
  object_type: string
  reason?: string | null
}

export function useCreateConstraint(orgId: string) {
  const qc = useQueryClient()
  return useMutation<RestructureConstraint, unknown, ConstraintCreate>({
    mutationFn: (body) =>
      apiClient.post<RestructureConstraint>(
        endpoints.restructureConstraints(orgId),
        body,
      ),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: [...restructureKeys.all, 'constraints'],
      })
    },
  })
}

export function useDeleteConstraint(orgId: string) {
  const qc = useQueryClient()
  return useMutation<void, unknown, { constraintId: string }>({
    mutationFn: ({ constraintId }) =>
      apiClient.delete(
        endpoints.restructureConstraint(orgId, constraintId),
      ),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: [...restructureKeys.all, 'constraints'],
      })
    },
  })
}
