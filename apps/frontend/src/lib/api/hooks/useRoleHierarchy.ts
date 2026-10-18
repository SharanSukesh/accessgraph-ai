/** Role hierarchy view (roadmap 35a): /orgs/{orgId}/roles/*. Read-only. */
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '../client'
import { endpoints } from '../endpoints'
import type { RoleHierarchy, RoleUser } from '@/lib/roleHierarchy'

export function useRoleHierarchy(orgId: string, deepAfter: number, wideAfter: number) {
  return useQuery({
    queryKey: ['role-hierarchy', orgId, deepAfter, wideAfter],
    queryFn: () =>
      apiClient.get<RoleHierarchy>(endpoints.roleHierarchy(orgId), {
        params: { deep_after: deepAfter, wide_after: wideAfter },
      }),
    enabled: !!orgId,
    placeholderData: (prev) => prev,
  })
}

export function useRoleUsers(orgId: string, roleId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ['role-users', orgId, roleId],
    queryFn: () => apiClient.get<RoleUser[]>(endpoints.roleUsers(orgId, roleId as string)),
    enabled: !!orgId && !!roleId && enabled,
  })
}
