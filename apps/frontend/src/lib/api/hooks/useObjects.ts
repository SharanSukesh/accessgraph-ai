/**
 * Object Data Hooks
 * React Query hooks for object-related API calls
 */

import { useQuery } from '@tanstack/react-query'
import { apiClient } from '../client'
import { endpoints } from '../endpoints'

// Query keys
export const objectKeys = {
  all: ['objects'] as const,
  lists: () => [...objectKeys.all, 'list'] as const,
  list: (orgId: string, filters?: ObjectFilters) =>
    [...objectKeys.lists(), orgId, filters] as const,
  details: () => [...objectKeys.all, 'detail'] as const,
  detail: (orgId: string, objectName: string) =>
    [...objectKeys.details(), orgId, objectName] as const,
}

// Types
export interface SalesforceObject {
  id: string
  objectName: string
  objectLabel?: string
  apiName: string
  isCustom: boolean
  isSensitive: boolean
  userCount?: number
  anomalyCount?: number
  description?: string
  fieldCount?: number
}

export interface ObjectFilters {
  search?: string
  sensitive?: string
  isCustom?: boolean
}

/**
 * Fetch all objects for an organization
 */
export function useObjects(orgId: string, filters?: ObjectFilters) {
  return useQuery({
    queryKey: objectKeys.list(orgId, filters),
    queryFn: async () => {
      const params = new URLSearchParams()
      if (filters?.search) params.append('search', filters.search)
      if (filters?.sensitive) params.append('sensitive', filters.sensitive)
      if (filters?.isCustom !== undefined)
        params.append('isCustom', String(filters.isCustom))

      const query = params.toString() ? `?${params.toString()}` : ''
      const data = await apiClient.get<SalesforceObject[]>(
        `${endpoints.objects(orgId)}${query}`
      )
      return data
    },
    enabled: !!orgId,
  })
}

/**
 * Fetch a single object details
 */
export function useObject(orgId: string, objectName: string) {
  return useQuery({
    queryKey: objectKeys.detail(orgId, objectName),
    queryFn: async () => {
      const data = await apiClient.get<SalesforceObject>(
        endpoints.object(orgId, objectName)
      )
      return data
    },
    enabled: !!orgId && !!objectName,
  })
}
