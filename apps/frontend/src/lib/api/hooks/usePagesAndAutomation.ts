/** Page layouts, record pages, Apex and flows for one user (roadmap item 1). */
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '../client'
import { endpoints } from '../endpoints'
import type { PagesAndAutomation, ProfileListing, SetAutomation } from '@/lib/pagesAndAutomation'

export function usePagesAndAutomation(orgId: string, userId: string, enabled = true) {
  return useQuery({
    queryKey: ['pages-and-automation', orgId, userId],
    queryFn: () => apiClient.get<PagesAndAutomation>(endpoints.pagesAndAutomation(orgId, userId)),
    enabled: !!orgId && !!userId && enabled,
  })
}

/** What a profile grants on its own; works at every privacy level. */
export function useProfilePagesAndAutomation(orgId: string, profileId: string) {
  return useQuery({
    queryKey: ['profile-pages-and-automation', orgId, profileId],
    queryFn: () => apiClient.get<PagesAndAutomation>(endpoints.profilePagesAndAutomation(orgId, profileId)),
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
export function useSetAutomation(orgId: string, psId: string) {
  return useQuery({
    queryKey: ['set-automation', orgId, psId],
    queryFn: () => apiClient.get<SetAutomation>(endpoints.setAutomation(orgId, psId)),
    enabled: !!orgId && !!psId,
  })
}
