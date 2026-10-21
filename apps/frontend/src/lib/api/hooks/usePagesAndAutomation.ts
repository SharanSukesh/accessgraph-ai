/** Page layouts, record pages, Apex and flows for one user (roadmap item 1). */
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '../client'
import { endpoints } from '../endpoints'
import type { PagesAndAutomation, ProfileListing, SetAutomation } from '@/lib/pagesAndAutomation'

/** The panel's view: each list cut to its first rows, with `counts` (full lists are paged). */
export const PREVIEW_ROWS = 10

export function usePagesAndAutomation(orgId: string, userId: string, enabled = true) {
  return useQuery({
    queryKey: ['pages-and-automation', orgId, userId, 'preview'],
    queryFn: () => apiClient.get<PagesAndAutomation>(`${endpoints.pagesAndAutomation(orgId, userId)}?preview=${PREVIEW_ROWS}`),
    enabled: !!orgId && !!userId && enabled,
  })
}

/** What a profile grants on its own; works at every privacy level. */
export function useProfilePagesAndAutomation(orgId: string, profileId: string) {
  return useQuery({
    queryKey: ['profile-pages-and-automation', orgId, profileId, 'preview'],
    queryFn: () => apiClient.get<PagesAndAutomation>(`${endpoints.profilePagesAndAutomation(orgId, profileId)}?preview=${PREVIEW_ROWS}`),
    enabled: !!orgId && !!profileId,
  })
}

export function useProfiles(orgId: string) {
  return useQuery({
    queryKey: ['profiles', orgId],
    queryFn: () => apiClient.get<ProfileListing>(endpoints.profiles(orgId)),
    enabled: !!orgId,
  })
}

/** Apex classes and flows a permission set (or group) grants. */
export function useSetAutomation(orgId: string, psId: string, enabled = true) {
  return useQuery({
    queryKey: ['set-automation', orgId, psId, 'preview'],
    queryFn: () => apiClient.get<SetAutomation>(`${endpoints.setAutomation(orgId, psId)}?preview=${PREVIEW_ROWS}`),
    enabled: !!orgId && !!psId && enabled,
  })
}

export interface PermissionSetGroupView {
  id: string
  label: string
  developer_name: string | null
  permission_sets: { id: string; label: string | null; name: string | null }[]
  muting_sets: { id: string; label: string | null; name: string | null }[]
  users: number | null
  automation: SetAutomation & { muting_note?: string | null }
}

/** A permission set group's sets, muting set, users and Apex and flow access. */
export function usePermissionSetGroup(orgId: string, groupId: string) {
  return useQuery({
    queryKey: ['permission-set-group', orgId, groupId],
    queryFn: () => apiClient.get<PermissionSetGroupView>(endpoints.permissionSetGroup(orgId, groupId)),
    enabled: !!orgId && !!groupId,
  })
}
