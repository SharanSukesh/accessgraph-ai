/**
 * Recommendations API Hooks
 */

import { useQuery } from '@tanstack/react-query'
import { apiClient } from '../client'
import { endpoints } from '../endpoints'

// Types
interface RecommendationFilters {
  type?: string
  severity?: string
  status?: string
  userId?: string
  limit?: number
  offset?: number
}

interface Recommendation {
  id: string
  type: string
  severity: string
  title: string
  description: string
  userId?: string
  userName?: string
  affectedResources: string[]
  rationale: string
  estimatedImpact?: string
  status: string
  createdAt: string
}

// Query Keys
export const recommendationKeys = {
  all: ['recommendations'] as const,
  lists: () => [...recommendationKeys.all, 'list'] as const,
  list: (orgId: string, filters?: RecommendationFilters) =>
    [...recommendationKeys.lists(), orgId, filters] as const,
}

/**
 * Get recommendations for organization
 */
export function useRecommendations(orgId: string, filters?: RecommendationFilters) {
  return useQuery({
    queryKey: recommendationKeys.list(orgId, filters),
    queryFn: async () => {
      const data = await apiClient.get<Recommendation[]>(
        endpoints.recommendations(orgId),
        { params: filters as any }
      )
      return data
    },
    enabled: !!orgId,
  })
}
