/**
 * Permission Set Data Hooks
 * React Query hooks for permission set detail / impact view (used by the
 * the Salesforce Explorer tab deep-link landing page).
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
  /** One row per object the set grants, explicit field-level security first (a preview: first 10, each with its first 10 fields). */
  fieldAccess?: Array<{
    objectName: string
    objectPerm: { read: boolean; create: boolean; edit: boolean; delete: boolean; viewAll: boolean; modifyAll: boolean }
    fieldCount: number
    fields: Array<{ fieldName: string; qualifiedId: string; read: boolean; edit: boolean }>
  }>
  totalFieldAccessObjects?: number
  totalExplicitFieldObjects?: number
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
    queryKey: [...permissionSetKeys.detail(orgId, psId), 'preview'],
    // Each list cut to its first 10 rows (totals stay whole); full lists are paged on their own pages.
    queryFn: () =>
      apiClient.get<PermissionSetDetail>(`/orgs/${orgId}/permission-sets/${psId}?preview=10`),
    enabled: !!orgId && !!psId,
  })
}
