/**
 * Graph API Hooks
 */

import { useQuery } from '@tanstack/react-query'
import { apiClient } from '../client'
import { endpoints } from '../endpoints'

// Types
interface GraphNode {
  id: string
  type: string
  label: string
  properties: Record<string, any>
}

interface GraphEdge {
  id: string
  source: string
  target: string
  type: string
  label?: string
  properties?: Record<string, any>
}

interface Graph {
  nodes: GraphNode[]
  edges: GraphEdge[]
  metadata: {
    nodeCount: number
    edgeCount: number
    centerNodeId?: string
    generatedAt: string
  }
}

// Query Keys
export const graphKeys = {
  all: ['graph'] as const,
  user: (orgId: string, userId: string) => [...graphKeys.all, 'user', orgId, userId] as const,
}

/**
 * Get graph for a specific user
 */
export function useUserGraph(orgId: string, userId: string) {
  return useQuery({
    queryKey: graphKeys.user(orgId, userId),
    queryFn: async () => {
      const data = await apiClient.get<Graph>(endpoints.userGraph(orgId, userId))
      return data
    },
    enabled: !!orgId && !!userId,
    // Graph data can be large, cache for longer
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
}
