/**
 * Organization API Hooks
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '../client'
import { endpoints } from '../endpoints'

// Types
interface Organization {
  id: string
  name: string
  salesforceOrgId?: string
  instanceUrl?: string
  isActive: boolean
  lastSyncAt?: string
  createdAt: string
}

interface CreateOrgRequest {
  name: string
  salesforceOrgId?: string
  instanceUrl?: string
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
export function useOrgs() {
  return useQuery({
    queryKey: orgKeys.lists(),
    queryFn: async () => {
      const data = await apiClient.get<Organization[]>(endpoints.orgs)
      return data
    },
  })
}

/**
 * Get organization by ID
 */
export function useOrg(orgId: string) {
  return useQuery({
    queryKey: orgKeys.detail(orgId),
    queryFn: async () => {
      const data = await apiClient.get<Organization>(endpoints.org(orgId))
      return data
    },
    enabled: !!orgId,
  })
}

/**
 * Create new organization
 */
export function useCreateOrg() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (request: CreateOrgRequest) => {
      const data = await apiClient.post<Organization>(endpoints.orgs, request)
      return data
    },
    onSuccess: () => {
      // Invalidate organizations list
      queryClient.invalidateQueries({ queryKey: orgKeys.lists() })
    },
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
        anomalies: number
        riskScores: number
        recommendations: number
      }>(endpoints.analyze(orgId))
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: orgKeys.detail(orgId) })
    },
  })
}

/**
 * Get sync jobs for organization
 */
export function useSyncJobs(orgId: string) {
  return useQuery({
    queryKey: orgKeys.syncJobs(orgId),
    queryFn: async () => {
      const data = await apiClient.get<any[]>(endpoints.syncJobs(orgId))
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
