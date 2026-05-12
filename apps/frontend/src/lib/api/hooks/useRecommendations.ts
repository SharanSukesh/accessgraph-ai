/**
 * Recommendations API Hooks
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
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
  // affected_access carries ps_id / ps_label / user_id / user_name so
  // the UI can render readable names + build SF deep-links without
  // another DB round-trip.
  affected_access?: Record<string, unknown>
  target_entity_id?: string        // Salesforce ID of the user the rec targets
  userId?: string
  userName?: string
  affectedResources: string[]
  estimatedImpact?: string
  status: string
  createdAt: string
}

export type RecommendationStatus =
  | 'pending'
  | 'accepted'
  | 'rejected'
  | 'applied'

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

/**
 * PATCH a recommendation's status (apply / dismiss / accept / reject).
 *
 * Used by both the Equity page's Apply / Dismiss buttons and any future
 * actionability on the unified recs page. Invalidates the recs list cache
 * on success so the row reflects the new status without a manual refresh.
 */
export function useUpdateRecommendationStatus() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      recId,
      status,
    }: {
      recId: string
      status: RecommendationStatus
    }) => {
      return apiClient.patch<Recommendation>(
        endpoints.recommendation(recId),
        { status },
      )
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: recommendationKeys.lists() })
    },
  })
}
