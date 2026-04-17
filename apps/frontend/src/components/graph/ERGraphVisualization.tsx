'use client'

/**
 * ER Graph Visualization
 * Enhanced graph visualization with ER-style object cards as HTML overlays
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import cytoscape, { Core, NodeSingular, ElementDefinition } from 'cytoscape'
// @ts-ignore - No types available for cose-bilkent
import coseBilkent from 'cytoscape-cose-bilkent'
import { Loader2 } from 'lucide-react'
import { ERObjectCard } from './ERObjectCard'
import { getLayoutOptions } from '@/lib/utils/graph-transforms'

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

interface ERGraphVisualizationProps {
  graph: Graph
  selectedObjects: string[]
  onNodeSelect?: (node: any) => void
  height?: string
  className?: string
}

export function ERGraphVisualization({
  graph,
  selectedObjects,
  onNodeSelect,
  height = '800px',
  className = '',
}: ERGraphVisualizationProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const cyRef = useRef<Core | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [objectCardPositions, setObjectCardPositions] = useState<
    Map<string, { x: number; y: number; node: any }>
  >(new Map())
  const [selectedNode, setSelectedNode] = useState<string | null>(null)

  // Filter nodes based on selected objects and default filter
  const filterElements = useCallback((elements: ElementDefinition[]) => {
    // Default: show user, profiles, permission sets, roles
    // Only show objects if they're in selectedObjects
    const filteredNodes = elements.filter((el) => {
      if (el.group === 'edges') return true // Handle edges later

      const nodeType = el.data.type
      const objectName = el.data.properties?.objectName

      // Always show these node types
      if (['user', 'profile', 'permission_set', 'role'].includes(nodeType)) {
        return true
      }

      // For objects, only show if selected
      if (nodeType === 'object') {
        return selectedObjects.includes(objectName)
      }

      // Hide field nodes (we'll render them in ER cards)
      if (nodeType === 'field') {
        return false
      }

      return true
    })

    // Get node IDs for filtering edges
    const nodeIds = new Set(
      filteredNodes
        .filter((el) => el.group === 'nodes')
        .map((el) => el.data.id)
    )

    // Filter edges: only keep if both source and target are in nodeIds
    return filteredNodes.filter((el) => {
      if (el.group === 'nodes') return true
      return nodeIds.has(el.data.source) && nodeIds.has(el.data.target)
    })
  }, [selectedObjects])

  // Transform graph data to Cytoscape format
  const transformGraph = useCallback((): ElementDefinition[] => {
    const elements: ElementDefinition[] = []

    // Transform nodes
    graph.nodes.forEach((node) => {
      elements.push({
        group: 'nodes',
        data: {
          id: node.id,
          label: node.label,
          type: node.type,
          ...node.properties,
          isCenter: node.id === graph.metadata.centerNodeId,
        },
        classes: [
          node.type,
          node.id === graph.metadata.centerNodeId ? 'center' : '',
        ].filter(Boolean),
      })
    })

    // Transform edges
    graph.edges.forEach((edge) => {
      elements.push({
        group: 'edges',
        data: {
          id: edge.id,
          source: edge.source,
          target: edge.target,
          label: edge.label || edge.type,
          type: edge.type,
          ...edge.properties,
        },
        classes: [edge.type],
      })
    })

    return elements
  }, [graph])

  // Get stylesheet for non-object nodes
  const getStylesheet = () => {
    return [
      // Default node style
      {
        selector: 'node',
        style: {
          'background-color': '#f1f5f9',
          'background-opacity': 0.95,
          'border-width': 3,
          'border-color': '#94a3b8',
          label: 'data(label)',
          'text-valign': 'center',
          'text-halign': 'center',
          'font-size': '13px',
          'font-weight': '600',
          'font-family': 'Inter, system-ui, sans-serif',
          color: '#0f172a',
          'text-wrap': 'wrap',
          'text-max-width': '110px',
          'text-outline-color': '#ffffff',
          'text-outline-width': 2,
          width: 70,
          height: 70,
        },
      },
      // User nodes
      {
        selector: 'node[type="user"]',
        style: {
          'background-color': '#60a5fa',
          'border-color': '#3b82f6',
          'border-width': 4,
          shape: 'ellipse',
        },
      },
      // Profile nodes
      {
        selector: 'node[type="profile"]',
        style: {
          'background-color': '#a78bfa',
          'border-color': '#8b5cf6',
          'border-width': 4,
          shape: 'round-rectangle',
        },
      },
      // Permission set nodes
      {
        selector: 'node[type="permission_set"]',
        style: {
          'background-color': '#22d3ee',
          'border-color': '#06b6d4',
          'border-width': 4,
          shape: 'round-rectangle',
        },
      },
      // Role nodes
      {
        selector: 'node[type="role"]',
        style: {
          'background-color': '#fbbf24',
          'border-color': '#f59e0b',
          'border-width': 4,
          shape: 'diamond',
        },
      },
      // Object nodes - Invisible (rendered as HTML overlays)
      {
        selector: 'node[type="object"]',
        style: {
          'background-opacity': 0,
          'border-opacity': 0,
          label: '',
          width: 300,
          height: 200,
        },
      },
      // Center node
      {
        selector: 'node.center',
        style: {
          'border-width': 5,
          'border-color': '#f97316',
          width: 90,
          height: 90,
          'font-size': '15px',
        },
      },
      // Edges - Default
      {
        selector: 'edge',
        style: {
          width: 2.5,
          'line-color': '#cbd5e1',
          'target-arrow-color': '#94a3b8',
          'target-arrow-shape': 'triangle',
          'curve-style': 'bezier',
          label: 'data(label)',
          'font-size': '11px',
          'text-rotation': 'autorotate',
          'text-background-color': '#ffffff',
          'text-background-opacity': 0.9,
        },
      },
      // GRANTS_ACCESS edges
      {
        selector: 'edge[type="GRANTS_ACCESS"]',
        style: {
          'line-color': '#34d399',
          'target-arrow-color': '#10b981',
          width: 3,
        },
      },
      // OBJECT_RELATIONSHIP edges
      {
        selector: 'edge[type="OBJECT_RELATIONSHIP"]',
        style: {
          'line-color': '#f472b6',
          'target-arrow-color': '#ec4899',
          'line-style': 'dashed',
          width: 2,
        },
      },
      // HAS_PROFILE edge
      {
        selector: 'edge[type="HAS_PROFILE"]',
        style: {
          'line-color': '#a78bfa',
          'target-arrow-color': '#8b5cf6',
          width: 3,
        },
      },
      // ASSIGNED_PERMISSION_SET edge
      {
        selector: 'edge[type="ASSIGNED_PERMISSION_SET"]',
        style: {
          'line-color': '#22d3ee',
          'target-arrow-color': '#06b6d4',
          'line-style': 'dashed',
          width: 2.5,
        },
      },
      // HAS_ROLE edge
      {
        selector: 'edge[type="HAS_ROLE"]',
        style: {
          'line-color': '#fbbf24',
          'target-arrow-color': '#f59e0b',
          width: 3,
        },
      },
    ]
  }

  // Update object card positions when graph changes
  const updateObjectCardPositions = useCallback(() => {
    const cy = cyRef.current
    if (!cy) return

    const positions = new Map()
    cy.nodes('[type="object"]').forEach((node: NodeSingular) => {
      const position = node.renderedPosition()
      const nodeData = {
        id: node.id(),
        objectName: node.data('objectName'),
        fields: node.data('fields') || [],
        permissions: {
          canRead: node.data('canRead'),
          canCreate: node.data('canCreate'),
          canEdit: node.data('canEdit'),
          canDelete: node.data('canDelete'),
        },
      }
      positions.set(node.id(), {
        x: position.x,
        y: position.y,
        node: nodeData,
      })
    })

    setObjectCardPositions(positions)
  }, [])

  // Initialize Cytoscape
  useEffect(() => {
    if (!containerRef.current || !graph) return

    setIsLoading(true)

    const elements = transformGraph()
    const filtered = filterElements(elements)

    const cy = cytoscape({
      container: containerRef.current,
      elements: filtered,
      style: getStylesheet() as any,
      layout: getLayoutOptions('cose-bilkent'),
      minZoom: 0.1,
      maxZoom: 3,
      wheelSensitivity: 0.15,
    })

    cyRef.current = cy

    // Node click
    cy.on('tap', 'node', (event) => {
      const node = event.target as NodeSingular
      const nodeData = {
        id: node.id(),
        type: node.data('type'),
        label: node.data('label'),
        ...node.data(),
      }
      setSelectedNode(node.id())
      onNodeSelect?.(nodeData)
    })

    // Background click
    cy.on('tap', (event) => {
      if (event.target === cy) {
        setSelectedNode(null)
      }
    })

    // Update positions after layout
    cy.one('layoutstop', () => {
      setIsLoading(false)
      updateObjectCardPositions()
    })

    // Update positions on pan/zoom
    cy.on('pan zoom', updateObjectCardPositions)

    return () => {
      cy.destroy()
      cyRef.current = null
    }
  }, [graph, selectedObjects, transformGraph, filterElements, onNodeSelect, updateObjectCardPositions])

  return (
    <div className={`relative ${className}`} style={{ height }}>
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
        className="w-full h-full bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700"
      />

      {/* ER Object Cards as HTML overlays */}
      <div className="absolute inset-0 pointer-events-none">
        {Array.from(objectCardPositions.entries()).map(([id, data]) => (
          <div
            key={id}
            className="absolute pointer-events-auto"
            style={{
              left: `${data.x}px`,
              top: `${data.y}px`,
              transform: 'translate(-50%, -50%)',
            }}
          >
            <ERObjectCard
              objectName={data.node.objectName}
              fields={data.node.fields}
              permissions={data.node.permissions}
              isSelected={selectedNode === id}
              onClick={() => {
                setSelectedNode(id)
                onNodeSelect?.(data.node)
              }}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
