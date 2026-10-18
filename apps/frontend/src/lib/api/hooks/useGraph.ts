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
    // Permission sets and groups drawn, and how many were left out.
    assignmentsShown?: number
    assignmentsHidden?: number
    /** Present when the pages-and-automation layer was asked for (roadmap item 1). */
    pagesAndAutomation?: { available: boolean; hidden: Record<string, number>; note: string } | null
  }
}

// Query Keys
export const graphKeys = {
  all: ['graph'] as const,
  user: (orgId: string, userId: string, include?: string) => [...graphKeys.all, 'user', orgId, userId, include ?? ''] as const,
}

/**
 * Get graph for a specific user
 */
export function useUserGraph(orgId: string, userId: string, include?: 'pages_and_automation') {
  return useQuery({
    queryKey: graphKeys.user(orgId, userId, include),
    queryFn: async () => {
      const data = await apiClient.get<Graph>(endpoints.userGraph(orgId, userId), include ? { params: { include } } : undefined)
      return data
    },
    placeholderData: (prev) => prev,
    enabled: !!orgId && !!userId,
    // Graph data can be large, cache for longer
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
}
