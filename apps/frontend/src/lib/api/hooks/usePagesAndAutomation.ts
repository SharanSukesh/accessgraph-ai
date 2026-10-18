/** Page layouts, record pages, Apex and flows for one user (roadmap item 1). */
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '../client'
import { endpoints } from '../endpoints'
import type { PagesAndAutomation } from '@/lib/pagesAndAutomation'

export function usePagesAndAutomation(orgId: string, userId: string, enabled = true) {
  return useQuery({
    queryKey: ['pages-and-automation', orgId, userId],
    queryFn: () => apiClient.get<PagesAndAutomation>(endpoints.pagesAndAutomation(orgId, userId)),
    enabled: !!orgId && !!userId && enabled,
  })
}
