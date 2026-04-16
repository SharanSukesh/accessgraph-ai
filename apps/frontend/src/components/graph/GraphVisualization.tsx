'use client'

/**
 * Graph Visualization Component
 * Interactive graph visualization using Cytoscape.js
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import cytoscape, { Core, NodeSingular, EdgeSingular, ElementDefinition } from 'cytoscape'
// @ts-ignore - No types available for cose-bilkent
import coseBilkent from 'cytoscape-cose-bilkent'
import {
  transformGraphToCytoscape,
  getCytoscapeStylesheet,
  getLayoutOptions,
  filterGraphElements,
} from '@/lib/utils/graph-transforms'
import { Loader2 } from 'lucide-react'

// Register layout
if (typeof window !== 'undefined') {
  cytoscape.use(coseBilkent)
}

interface Graph {
  nodes: Array<{
    id: string
    type: string
    label: string
    properties: Record<string, any>
  }>
  edges: Array<{
    id: string
    source: string
    target: string
    type: string
    label?: string
    properties?: Record<string, any>
  }>
  metadata: {
    nodeCount: number
    edgeCount: number
    centerNodeId?: string
    generatedAt: string
  }
}

interface GraphVisualizationProps {
  graph: Graph
  layout?: 'cose-bilkent' | 'circle' | 'grid' | 'breadthfirst'
  filters?: {
    nodeTypes?: string[]
    edgeTypes?: string[]
    searchTerm?: string
  }
  onNodeSelect?: (node: any) => void
  onEdgeSelect?: (edge: any) => void
  onBackgroundClick?: () => void
  height?: string
  className?: string
}

export function GraphVisualization({
  graph,
  layout = 'cose-bilkent',
  filters,
  onNodeSelect,
  onEdgeSelect,
  onBackgroundClick,
  height = '600px',
  className = '',
}: GraphVisualizationProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const cyRef = useRef<Core | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [selectedNode, setSelectedNode] = useState<string | null>(null)
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null)

  // Initialize Cytoscape
  useEffect(() => {
    if (!containerRef.current || !graph) return

    setIsLoading(true)

    // Transform graph data
    let elements = transformGraphToCytoscape(graph)

    // Apply filters if provided
    if (filters) {
      elements = filterGraphElements(elements, filters)
    }

    // Initialize Cytoscape instance
    const cy = cytoscape({
      container: containerRef.current,
      elements,
      style: getCytoscapeStylesheet() as any,
      layout: getLayoutOptions(layout),
      minZoom: 0.1,
      maxZoom: 3,
      wheelSensitivity: 0.2,
      userZoomingEnabled: true,
      userPanningEnabled: true,
      boxSelectionEnabled: true,
    })

    // Store reference
    cyRef.current = cy

    // Event: Node click
    cy.on('tap', 'node', (event) => {
      const node = event.target as NodeSingular
      const nodeData = {
        id: node.id(),
        type: node.data('type'),
        label: node.data('label'),
        ...node.data(),
      }
      setSelectedNode(node.id())
      setSelectedEdge(null)
      onNodeSelect?.(nodeData)
    })

    // Event: Edge click
    cy.on('tap', 'edge', (event) => {
      const edge = event.target as EdgeSingular
      const edgeData = {
        id: edge.id(),
        source: edge.source().id(),
        target: edge.target().id(),
        type: edge.data('type'),
        label: edge.data('label'),
        ...edge.data(),
      }
      setSelectedEdge(edge.id())
      setSelectedNode(null)
      onEdgeSelect?.(edgeData)
    })

    // Event: Background click
    cy.on('tap', (event) => {
      if (event.target === cy) {
        setSelectedNode(null)
        setSelectedEdge(null)
        onBackgroundClick?.()
      }
    })

    // Event: Layout complete
    cy.one('layoutstop', () => {
      setIsLoading(false)
    })

    // Cleanup
    return () => {
      cy.destroy()
      cyRef.current = null
    }
  }, [graph, layout, filters, onNodeSelect, onEdgeSelect, onBackgroundClick])

  // Public API methods via ref
  const fitToView = useCallback(() => {
    cyRef.current?.fit(undefined, 30)
  }, [])

  const zoomIn = useCallback(() => {
    const cy = cyRef.current
    if (!cy) return
    const zoom = cy.zoom()
    cy.zoom({ level: zoom * 1.2, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } })
  }, [])

  const zoomOut = useCallback(() => {
    const cy = cyRef.current
    if (!cy) return
    const zoom = cy.zoom()
    cy.zoom({ level: zoom * 0.8, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } })
  }, [])

  const resetZoom = useCallback(() => {
    cyRef.current?.reset()
  }, [])

  const runLayout = useCallback((layoutType: typeof layout) => {
    const cy = cyRef.current
    if (!cy) return
    cy.layout(getLayoutOptions(layoutType)).run()
  }, [])

  const centerOnNode = useCallback((nodeId: string) => {
    const cy = cyRef.current
    if (!cy) return
    const node = cy.getElementById(nodeId)
    if (node.length > 0) {
      cy.animate({
        center: { eles: node },
        zoom: 1.5,
      }, {
        duration: 500,
      })
    }
  }, [])

  const highlightNeighborhood = useCallback((nodeId: string) => {
    const cy = cyRef.current
    if (!cy) return

    const node = cy.getElementById(nodeId)
    if (node.length === 0) return

    // Dim all elements
    cy.elements().addClass('dimmed')

    // Highlight the node and its neighborhood
    const neighborhood = node.neighborhood().add(node)
    neighborhood.removeClass('dimmed')
  }, [])

  const clearHighlight = useCallback(() => {
    cyRef.current?.elements().removeClass('dimmed')
  }, [])

  const exportAsPNG = useCallback((filename?: string) => {
    const cy = cyRef.current
    if (!cy) return

    const png = cy.png({
      output: 'blob',
      bg: '#ffffff',
      full: true,
      scale: 2,
    })

    const url = URL.createObjectURL(png)
    const link = document.createElement('a')
    link.href = url
    link.download = filename || 'graph.png'
    link.click()
    URL.revokeObjectURL(url)
  }, [])

  // Expose methods via imperative handle (if needed)
  useEffect(() => {
    if (containerRef.current) {
      // Store methods on the container for external access
      ;(containerRef.current as any).graphAPI = {
        fitToView,
        zoomIn,
        zoomOut,
        resetZoom,
        runLayout,
        centerOnNode,
        highlightNeighborhood,
        clearHighlight,
        exportAsPNG,
        getCytoscape: () => cyRef.current,
      }
    }
  }, [fitToView, zoomIn, zoomOut, resetZoom, runLayout, centerOnNode, highlightNeighborhood, clearHighlight, exportAsPNG])

  return (
    <div className={`relative ${className}`} style={{ height }}>
      {/* Loading overlay */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/80 dark:bg-gray-900/80 z-10">
          <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span>Loading graph...</span>
          </div>
        </div>
      )}

      {/* Cytoscape container */}
      <div
        ref={containerRef}
        data-graph-container
        className="w-full h-full bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700"
      />

      {/* Add dimmed class styles */}
      <style jsx global>{`
        .cy-element.dimmed {
          opacity: 0.2;
        }
      `}</style>
    </div>
  )
}

// Export the component with additional utilities
export { GraphVisualization as default }

// Type for external API access
export interface GraphAPI {
  fitToView: () => void
  zoomIn: () => void
  zoomOut: () => void
  resetZoom: () => void
  runLayout: (layoutType: 'cose-bilkent' | 'circle' | 'grid' | 'breadthfirst') => void
  centerOnNode: (nodeId: string) => void
  highlightNeighborhood: (nodeId: string) => void
  clearHighlight: () => void
  exportAsPNG: (filename?: string) => void
  getCytoscape: () => Core | null
}
