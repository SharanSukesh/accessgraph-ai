/**
 * Field Data Hooks
 * React Query hooks for field-related API calls
 */

import { useQuery } from '@tanstack/react-query'
import { apiClient } from '../client'
import { endpoints } from '../endpoints'

// Query keys
export const fieldKeys = {
  all: ['fields'] as const,
  lists: () => [...fieldKeys.all, 'list'] as const,
  list: (orgId: string, filters?: FieldFilters) =>
    [...fieldKeys.lists(), orgId, filters] as const,
  details: () => [...fieldKeys.all, 'detail'] as const,
  detail: (orgId: string, fieldApiName: string) =>
    [...fieldKeys.details(), orgId, fieldApiName] as const,
}

// Types
export interface SalesforceField {
  id: string
  fieldName: string
  fieldLabel?: string
  apiName: string
  objectName: string
  dataType: string
  isCustom: boolean
  isSensitive: boolean
  isEncrypted: boolean
  userCount?: number
  description?: string
  length?: number
  isRequired?: boolean
}

export interface FieldFilters {
  search?: string
  objectName?: string
  sensitive?: string
  isCustom?: boolean
  isEncrypted?: boolean
}

/**
 * Fetch all fields for an organization
 */
export function useFields(orgId: string, filters?: FieldFilters) {
  return useQuery({
    queryKey: fieldKeys.list(orgId, filters),
    queryFn: async () => {
      const params = new URLSearchParams()
      if (filters?.search) params.append('search', filters.search)
      if (filters?.objectName) params.append('objectName', filters.objectName)
      if (filters?.sensitive) params.append('sensitive', filters.sensitive)
      if (filters?.isCustom !== undefined)
        params.append('isCustom', String(filters.isCustom))
      if (filters?.isEncrypted !== undefined)
        params.append('isEncrypted', String(filters.isEncrypted))

      const query = params.toString() ? `?${params.toString()}` : ''
      const data = await apiClient.get<SalesforceField[]>(
        `${endpoints.fields(orgId)}${query}`
      )
      return data
    },
    enabled: !!orgId,
  })
}

/**
 * Fetch a single field details
 */
export function useField(orgId: string, fieldApiName: string) {
  return useQuery({
    queryKey: fieldKeys.detail(orgId, fieldApiName),
    queryFn: async () => {
      const data = await apiClient.get<SalesforceField>(
        endpoints.field(orgId, fieldApiName)
      )
      return data
    },
    enabled: !!orgId && !!fieldApiName,
  })
}

/**
 * Fetch detailed field information with access breakdown
 */
export function useFieldDetails(orgId: string, fieldId: string) {
  return useQuery({
    queryKey: [...fieldKeys.details(), orgId, fieldId, 'full'],
    queryFn: async () => {
      const data = await apiClient.get<any>(
        `/orgs/${orgId}/fields/${encodeURIComponent(fieldId)}`
      )
      return data
    },
    enabled: !!orgId && !!fieldId,
  })
}
