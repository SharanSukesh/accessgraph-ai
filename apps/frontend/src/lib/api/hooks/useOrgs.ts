/**
 * Organization API Hooks
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '../client'
import { endpoints } from '../endpoints'

// Types
/** A client org the signed-in user may open (GET /orgs). */
export interface Organization {
  id: string
  name: string
  domain: string | null
  is_demo: boolean
  created_at: string
  is_connected: boolean
  instance_url: string | null
  /** null when the org has no Salesforce connection yet. */
  is_sandbox: boolean | null
  last_sync_at: string | null
  last_sync_status: string | null
}

/** GET /orgs/{orgId} — the slimmer single-org shape. */
export interface OrganizationDetail {
  id: string
  name: string
  domain: string | null
  is_demo: boolean
  created_at: string
}

interface SyncResponse {
  jobId: string
  status: string
  message: string
}

// Query Keys
export const orgKeys = {
  all: ['orgs'] as const,
  lists: () => [...orgKeys.all, 'list'] as const,
  list: (filters?: any) => [...orgKeys.lists(), filters] as const,
  details: () => [...orgKeys.all, 'detail'] as const,
  detail: (id: string) => [...orgKeys.details(), id] as const,
  syncJobs: (id: string) => [...orgKeys.detail(id), 'sync-jobs'] as const,
}

/**
 * Get all organizations
 */
export function useOrgs(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: orgKeys.lists(),
    queryFn: async () => {
      const data = await apiClient.get<Organization[]>(endpoints.orgs)
      return data
    },
    enabled: options.enabled ?? true,
  })
}

/**
 * Get organization by ID
 */
export function useOrg(orgId: string) {
  return useQuery({
    queryKey: orgKeys.detail(orgId),
    queryFn: async () => {
      const data = await apiClient.get<OrganizationDetail>(endpoints.org(orgId))
      return data
    },
    enabled: !!orgId,
  })
}

/**
 * Sync organization with Salesforce
 */
export function useSyncOrg(orgId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      const data = await apiClient.post<SyncResponse>(endpoints.syncOrg(orgId))
      return data
    },
    onSuccess: () => {
      // Invalidate org detail and sync jobs
      queryClient.invalidateQueries({ queryKey: orgKeys.detail(orgId) })
      queryClient.invalidateQueries({ queryKey: orgKeys.syncJobs(orgId) })
    },
  })
}

/**
 * Build Neo4j graph for organization
 */
export function useBuildGraph(orgId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (rebuild: boolean = false) => {
      const data = await apiClient.post<{ message: string; nodeCount: number }>(
        endpoints.buildGraph(orgId),
        { rebuild }
      )
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: orgKeys.detail(orgId) })
    },
  })
}

/**
 * Run analysis on organization
 */
export function useAnalyzeOrg(orgId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      const data = await apiClient.post<{
        status: string
        results: {
          anomalies_detected: number
          users_scored: number
          recommendations_generated: number
        }
      }>(endpoints.analyze(orgId))
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: orgKeys.detail(orgId) })
      // Also invalidate anomalies and recommendations
      queryClient.invalidateQueries({ queryKey: ['anomalies', orgId] })
      queryClient.invalidateQueries({ queryKey: ['recommendations', orgId] })
    },
  })
}

/**
 * Get sync jobs for organization
 */
export function useSyncJobs(orgId: string | null | undefined) {
  return useQuery({
    queryKey: orgKeys.syncJobs(orgId ?? ''),
    queryFn: async () => {
      const data = await apiClient.get<any[]>(endpoints.syncJobs(orgId as string))
      return data
    },
    enabled: !!orgId,
    refetchInterval: (query) => {
      // Refetch every 5 seconds if there's a running job
      const hasRunningJob = query.state.data?.some(
        (job: any) => job.status === 'running' || job.status === 'pending'
      )
      return hasRunningJob ? 5000 : false
    },
  })
}
