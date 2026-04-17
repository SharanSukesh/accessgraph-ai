'use client'

/**
 * Graph Explorer Page
 * Interactive ER-diagram style graph visualization for exploring access relationships
 */

import { useState } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import { Search, Network } from 'lucide-react'
import { Card, CardContent } from '@/components/shared/Card'
import { Button } from '@/components/shared/Button'
import { ErrorState } from '@/components/shared/ErrorState'
import { EmptyState } from '@/components/shared/EmptyState'
import { ERGraphVisualization } from '@/components/graph/ERGraphVisualization'
import { ObjectFilterPanel } from '@/components/graph/ObjectFilterPanel'
import { GraphLegend } from '@/components/graph/GraphLegend'
import { GraphDetailPanel } from '@/components/graph/GraphDetailPanel'
import { useUserGraph } from '@/lib/api/hooks/useGraph'
import { useUsers } from '@/lib/api/hooks/useUsers'

export default function GraphExplorerPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const router = useRouter()
  const orgId = params.orgId as string
  const initialUserId = searchParams.get('userId') || ''

  const [selectedUserId, setSelectedUserId] = useState(initialUserId)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedObjects, setSelectedObjects] = useState<string[]>([])
  const [selectedNode, setSelectedNode] = useState<any>(null)

  // Fetch user list for search
  const { data: users } = useUsers(orgId)

  // Fetch graph data
  const {
    data: graph,
    isLoading,
    error,
    refetch,
  } = useUserGraph(orgId, selectedUserId)

  // Filter users by search
  const filteredUsers = users?.filter(
    (user) =>
      user.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.salesforceUserId?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const handleUserSelect = (userId: string) => {
    setSelectedUserId(userId)
    setSelectedNode(null)
    setSelectedObjects([]) // Reset objects when changing users
    // Update URL
    router.push(`/orgs/${orgId}/graph?userId=${userId}`)
  }

  const handleNodeSelect = (node: any) => {
    setSelectedNode(node)
  }

  const handleClearUser = () => {
    setSelectedUserId('')
    setSearchTerm('')
    setSelectedObjects([])
    setSelectedNode(null)
    router.push(`/orgs/${orgId}/graph`)
  }

  if (error) {
    return (
      <ErrorState
        message="Failed to load graph data. Please try again."
        onRetry={() => refetch()}
      />
    )
  }

  // Get selected user name
  const selectedUser = users?.find(u => u.salesforceUserId === selectedUserId)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
            <Network className="h-8 w-8" />
            Graph Explorer
          </h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            Interactive ER-style access visualization - explore users and their permissions
          </p>
        </div>
      </div>

      {/* User Search */}
      <Card variant="bordered">
        <CardContent className="py-4">
          <div className="flex items-center gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder={
                  selectedUser
                    ? `Currently viewing: ${selectedUser.name}`
                    : 'Search for a user to visualize their access graph...'
                }
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>
            {selectedUserId && (
              <Button
                size="sm"
                variant="secondary"
                onClick={handleClearUser}
              >
                Clear
              </Button>
            )}
          </div>

          {/* User search results */}
          {searchTerm && filteredUsers && filteredUsers.length > 0 && (
            <div className="mt-4 max-h-64 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg">
              {filteredUsers.slice(0, 10).map((user) => (
                <button
                  key={user.id}
                  onClick={() => {
                    handleUserSelect(user.salesforceUserId)
                    setSearchTerm('')
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 border-b border-gray-200 dark:border-gray-700 last:border-b-0 transition-colors text-left"
                >
                  <div className="h-10 w-10 rounded-full bg-primary-100 dark:bg-primary-900 flex items-center justify-center flex-shrink-0">
                    <span className="text-primary-600 dark:text-primary-400 font-medium text-sm">
                      {user.name?.charAt(0) || 'U'}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {user.name}
                    </div>
                    <div className="text-sm text-gray-500 dark:text-gray-400 truncate">
                      {user.email}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Graph Visualization Area */}
      {!selectedUserId ? (
        <Card variant="bordered" className="bg-gradient-to-br from-primary-50 to-primary-100 dark:from-primary-900/20 dark:to-primary-800/20">
          <CardContent className="py-24">
            <div className="text-center max-w-lg mx-auto">
              <div className="h-20 w-20 rounded-full bg-primary-100 dark:bg-primary-900/40 flex items-center justify-center mx-auto mb-6">
                <Network className="h-10 w-10 text-primary-600 dark:text-primary-400" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">
                Select a User to Begin
              </h2>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                Search for and select a user above to visualize their access graph in an interactive ER diagram format.
              </p>
              <div className="text-sm text-gray-500 dark:text-gray-500 space-y-2">
                <p>✓ See user's profiles, permission sets, and roles</p>
                <p>✓ Progressively add objects to explore their schema access</p>
                <p>✓ View field-level permissions in ER-style cards</p>
                <p>✓ Explore relationships between objects</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Main Graph Area */}
          <div className="lg:col-span-8 space-y-6">
            {isLoading ? (
              <Card variant="bordered">
                <CardContent className="py-12 text-center">
                  <div className="animate-pulse">
                    <div className="h-96 bg-gray-200 dark:bg-gray-700 rounded-lg" />
                    <p className="mt-4 text-gray-500 dark:text-gray-400">
                      Loading graph visualization...
                    </p>
                  </div>
                </CardContent>
              </Card>
            ) : graph ? (
              <>
                <ERGraphVisualization
                  graph={graph}
                  selectedObjects={selectedObjects}
                  onNodeSelect={handleNodeSelect}
                  height="800px"
                />
                <GraphLegend compact />
              </>
            ) : (
              <EmptyState
                title="No Graph Data"
                description="Unable to load graph data for this user"
                icon="network"
              />
            )}
          </div>

          {/* Right Sidebar - Object Filter or Node Details */}
          <div className="lg:col-span-4">
            {selectedNode ? (
              <GraphDetailPanel
                selectedNode={selectedNode}
                orgId={orgId}
                onClose={() => setSelectedNode(null)}
              />
            ) : (
              <ObjectFilterPanel
                availableObjects={
                  graph?.nodes
                    .filter((n) => n.type === 'object')
                    .map((n) => ({
                      id: n.id,
                      name: n.properties.objectName || n.label,
                      fieldCount: n.properties.fields?.length || 0,
                    })) || []
                }
                selectedObjects={selectedObjects}
                onObjectToggle={(objectName) => {
                  setSelectedObjects((prev) =>
                    prev.includes(objectName)
                      ? prev.filter((n) => n !== objectName)
                      : [...prev, objectName]
                  )
                }}
                onSelectAll={() => {
                  const allObjects = graph?.nodes
                    .filter((n) => n.type === 'object')
                    .map((n) => n.properties.objectName || n.label) || []
                  setSelectedObjects(allObjects)
                }}
                onDeselectAll={() => setSelectedObjects([])}
              />
            )}
          </div>
        </div>
      )}
    </div>
  )
}
