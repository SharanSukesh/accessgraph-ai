/**
 * Recommendations API Hooks
 */

import { useQuery } from '@tanstack/react-query'
import { apiClient } from '../client'
import { endpoints } from '../endpoints'

// Types
interface RecommendationFilters {
  search?: string
  type?: string
  severity?: string
  status?: string
  rec_type?: string                // backend column name
  track?: 'security' | 'equity'    // backend column for high-level grouping
  userId?: string
  limit?: number
  offset?: number
}

interface Recommendation {
  id: string
  type: string
  rec_type?: string                // mirrors backend; e.g. "grant_for_equity"
  track?: 'security' | 'equity'    // backend grouping column
  severity: string
  title: string
  description: string
  rationale?: string
  userId?: string
  userName?: string
  affectedResources: string[]
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
