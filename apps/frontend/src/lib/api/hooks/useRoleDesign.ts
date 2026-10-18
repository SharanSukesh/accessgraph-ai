/** Role design drafts (roadmap 35b): /orgs/{orgId}/role-designs/*. Never sent to Salesforce. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '../client'
import { endpoints } from '../endpoints'
import type { DesignBase, Operation } from '@/lib/roleDesign'

export interface DraftSummary {
  id: string
  name: string
  created_by: string | null
  created_at: string | null
  updated_at: string | null
  changes: number
  started_from: string | null
}

export interface Draft extends DraftSummary {
  base: DesignBase
  operations: Operation[]
  position: number
  users: { id: string; name: string }[]
  users_allowed: boolean
  users_hidden_reason: string | null
  stale: string[]
}

export interface ImpactPerson {
  user_id: string
  name: string
  /** Records counted; with at_least, more that the sync didn't count. */
  records: number
  at_least: boolean
}

export interface ObjectImpact {
  org_wide_default: string | null
  effect: 'view_and_edit' | 'edit_only' | 'none'
  explanation: string
  owners_affected: number
  /** null when an affected owner's records weren't counted by the sync. */
  records_owned: number | null
  records_owned_counted: number
  records_shared: number
  users_gaining: number
  users_losing: number
  gaining: ImpactPerson[]
  losing: ImpactPerson[]
  some_counts_unknown: boolean
}

export interface Impact {
  objects: Record<string, ObjectImpact>
  users_affected: number
  upper_bound_note: string
  coverage_label: string | null
  recalculation_warning: string
  users_allowed: boolean
  users_hidden_reason?: string
  references: { public_groups: string[]; role_sharing_rules: string[]; sharing_rules_note: string | null }
  changes: number
}

const keys = {
  list: (orgId: string) => ['role-designs', orgId] as const,
  one: (orgId: string, id: string) => ['role-design', orgId, id] as const,
  impact: (orgId: string, id: string) => ['role-design-impact', orgId, id] as const,
}

export function useRoleDesigns(orgId: string) {
  return useQuery({ queryKey: keys.list(orgId), queryFn: () => apiClient.get<DraftSummary[]>(endpoints.roleDesigns(orgId)) })
}

export function useRoleDesign(orgId: string, id: string | null) {
  return useQuery({
    queryKey: keys.one(orgId, id ?? ''),
    queryFn: () => apiClient.get<Draft>(endpoints.roleDesign(orgId, id as string)),
    enabled: !!id,
    staleTime: Infinity,
  })
}

export function useCreateRoleDesign(orgId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => apiClient.post<DraftSummary>(endpoints.roleDesigns(orgId), { name }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.list(orgId) }),
  })
}

export function useSaveRoleDesign(orgId: string, id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { name?: string; operations: Operation[]; position: number }) =>
      apiClient.put<DraftSummary & { diff_count: number }>(endpoints.roleDesign(orgId, id), body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.list(orgId) })
      qc.invalidateQueries({ queryKey: keys.impact(orgId, id) })
    },
  })
}

export function useDeleteRoleDesign(orgId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiClient.delete<void>(endpoints.roleDesign(orgId, id)),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.list(orgId) }),
  })
}

export function useRoleDesignImpact(orgId: string, id: string | null, enabled: boolean) {
  return useQuery({
    queryKey: keys.impact(orgId, id ?? ''),
    queryFn: () => apiClient.get<Impact>(endpoints.roleDesignImpact(orgId, id as string)),
    enabled: !!id && enabled,
  })
}
