/**
 * Permission Set Data Hooks
 * React Query hooks for permission set detail / impact view (used by the
 * AccessGraph Explorer deep-link landing page).
 */

import { useQuery } from '@tanstack/react-query'
import { apiClient } from '../client'

export interface PermissionSetDetail {
  id: string
  name: string
  label: string
  type: string
  isMuting: boolean
  isOwnedByProfile: boolean
  profile: { id: string; name: string } | null
  permissionSetGroups: Array<{ id: string; name: string; label: string }>
  users: Array<{
    id: string
    name: string
    username: string
    email: string
    isActive: boolean
    assignmentType: 'direct' | 'via_psg'
  }>
  totalUsers: number
  totalDirectAssignments: number
  totalViaPsgAssignments: number
  objectPermissions: Array<{
    objectName: string
    read: boolean
    create: boolean
    edit: boolean
    delete: boolean
    viewAll: boolean
    modifyAll: boolean
  }>
  totalObjectsGranted: number
  fieldPermissions: Array<{
    objectName: string
    fieldCount: number
    fields: Array<{
      fieldName: string
      qualifiedId: string
      read: boolean
      edit: boolean
    }>
  }>
  totalFieldsGranted: number
  // Keys are categories (e.g., "Data Access"); values are arrays of granted
  // system permissions in that category. Categories with zero granted perms
  // are omitted, so the UI can iterate Object.entries() safely.
  systemPermissions: Record<string, Array<{ apiName: string; label: string }>>
  totalSystemPermissionsGranted: number
}

export const permissionSetKeys = {
  all: ['permissionSets'] as const,
  details: () => [...permissionSetKeys.all, 'detail'] as const,
  detail: (orgId: string, psId: string) =>
    [...permissionSetKeys.details(), orgId, psId] as const,
}

export function usePermissionSetDetail(orgId: string, psId: string) {
  return useQuery<PermissionSetDetail>({
    queryKey: permissionSetKeys.detail(orgId, psId),
    queryFn: () =>
      apiClient.get<PermissionSetDetail>(`/orgs/${orgId}/permission-sets/${psId}`),
    enabled: !!orgId && !!psId,
  })
}
