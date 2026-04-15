'use client'

/**
 * Graph Explorer Page
 * Interactive graph visualization for exploring access relationships
 */

import { useState, useRef, useCallback } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import { Search, Info } from 'lucide-react'
import { Card, CardContent } from '@/components/shared/Card'
import { Button } from '@/components/shared/Button'
import { ErrorState } from '@/components/shared/ErrorState'
import { EmptyState } from '@/components/shared/EmptyState'
import { GraphVisualization, GraphAPI } from '@/components/graph/GraphVisualization'
import { GraphControls, GraphFilters } from '@/components/graph/GraphControls'
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
  const [layout, setLayout] = useState<'cose-bilkent' | 'circle' | 'grid' | 'breadthfirst'>('cose-bilkent')
  const [filters, setFilters] = useState<GraphFilters>({})
  const [selectedNode, setSelectedNode] = useState<any>(null)
  const [selectedEdge, setSelectedEdge] = useState<any>(null)
  const [showLegend, setShowLegend] = useState(true)
  const [showControls, setShowControls] = useState(true)

  const graphRef = useRef<HTMLDivElement>(null)

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
    setSelectedEdge(null)
    // Update URL
    router.push(`/orgs/${orgId}/graph?userId=${userId}`)
  }

  const handleNodeSelect = (node: any) => {
    setSelectedNode(node)
    setSelectedEdge(null)
  }

  const handleEdgeSelect = (edge: any) => {
    setSelectedEdge(edge)
    setSelectedNode(null)
  }

  const handleBackgroundClick = () => {
    setSelectedNode(null)
    setSelectedEdge(null)
  }

  const handleNavigateToNode = (nodeId: string) => {
    // If it's a user node, center on it or load their graph
    const api = (graphRef.current as any)?.graphAPI as GraphAPI
    if (api) {
      api.centerOnNode(nodeId)
      api.highlightNeighborhood(nodeId)
    }
  }

  const handleZoomIn = () => {
    const api = (graphRef.current as any)?.graphAPI as GraphAPI
    api?.zoomIn()
  }

  const handleZoomOut = () => {
    const api = (graphRef.current as any)?.graphAPI as GraphAPI
    api?.zoomOut()
  }

  const handleFit = () => {
    const api = (graphRef.current as any)?.graphAPI as GraphAPI
    api?.fitToView()
  }

  const handleReset = () => {
    const api = (graphRef.current as any)?.graphAPI as GraphAPI
    api?.resetZoom()
    api?.clearHighlight()
  }

  const handleLayoutChange = (newLayout: typeof layout) => {
    setLayout(newLayout)
    const api = (graphRef.current as any)?.graphAPI as GraphAPI
    api?.runLayout(newLayout)
  }

  const handleExport = (format: 'png' | 'json') => {
    const api = (graphRef.current as any)?.graphAPI as GraphAPI
    if (format === 'png') {
      api?.exportAsPNG(`graph-${selectedUserId}.png`)
    } else {
      const cy = api?.getCytoscape()
      if (cy) {
        const json = cy.json()
        const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = `graph-${selectedUserId}.json`
        link.click()
        URL.revokeObjectURL(url)
      }
    }
  }

  const handleFilterChange = (newFilters: GraphFilters) => {
    setFilters(newFilters)
  }

  if (error) {
    return (
      <ErrorState
        message="Failed to load graph data. Please try again."
        onRetry={() => refetch()}
      />
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Graph Explorer
          </h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            Visualize and explore access relationships
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant={showLegend ? 'primary' : 'secondary'}
            onClick={() => setShowLegend(!showLegend)}
          >
            Legend
          </Button>
          <Button
            size="sm"
            variant={showControls ? 'primary' : 'secondary'}
            onClick={() => setShowControls(!showControls)}
          >
            Controls
          </Button>
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
                placeholder="Search for a user to visualize their graph..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>
            {selectedUserId && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  setSelectedUserId('')
                  setSearchTerm('')
                  router.push(`/orgs/${orgId}/graph`)
                }}
              >
                Clear
              </Button>
            )}
          </div>

          {/* User search results */}
          {searchTerm && filteredUsers && filteredUsers.length > 0 && !selectedUserId && (
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
        <EmptyState
          title="No User Selected"
          description="Search for and select a user above to visualize their access graph"
          icon="search"
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Left Sidebar - Controls & Legend */}
          <div className="lg:col-span-1 space-y-6">
            {showControls && (
              <GraphControls
                onZoomIn={handleZoomIn}
                onZoomOut={handleZoomOut}
                onFit={handleFit}
                onReset={handleReset}
                onLayoutChange={handleLayoutChange}
                onExport={handleExport}
                onFilterChange={handleFilterChange}
              />
            )}
            {showLegend && <GraphLegend />}
          </div>

          {/* Main Graph Area */}
          <div className="lg:col-span-2 space-y-6">
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
              <div ref={graphRef}>
                <GraphVisualization
                  graph={graph}
                  layout={layout}
                  filters={filters}
                  onNodeSelect={handleNodeSelect}
                  onEdgeSelect={handleEdgeSelect}
                  onBackgroundClick={handleBackgroundClick}
                  height="700px"
                />
              </div>
            ) : (
              <EmptyState
                title="No Graph Data"
                description="Unable to load graph data for this user"
                icon="network"
              />
            )}

            {/* Info Banner */}
            <Card variant="bordered" className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
              <CardContent className="py-3">
                <div className="flex items-start gap-3">
                  <Info className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-blue-900 dark:text-blue-300">
                    <p className="font-medium mb-1">Graph Interaction Tips:</p>
                    <ul className="list-disc list-inside space-y-0.5 text-xs">
                      <li>Click nodes/edges to view details</li>
                      <li>Drag nodes to reposition them</li>
                      <li>Scroll to zoom in/out</li>
                      <li>Click background to deselect</li>
                      <li>Use controls to change layout</li>
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Sidebar - Detail Panel */}
          <div className="lg:col-span-1">
            <GraphDetailPanel
              selectedNode={selectedNode}
              selectedEdge={selectedEdge}
              onClose={handleBackgroundClick}
              onNavigate={handleNavigateToNode}
            />
          </div>
        </div>
      )}
    </div>
  )
}
