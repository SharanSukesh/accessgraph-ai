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
  const [zoomLevel, setZoomLevel] = useState(1)

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
      // Object nodes - Invisible but interactive (rendered as HTML overlays)
      {
        selector: 'node[type="object"]',
        style: {
          'background-opacity': 0, // Completely invisible
          'border-opacity': 0,
          label: '',
          width: 300,
          height: 200,
          shape: 'rectangle',
          events: 'yes', // Ensure node can receive events
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
    const zoom = cy.zoom()
    setZoomLevel(zoom)

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

  // Initialize Cytoscape once with base nodes
  useEffect(() => {
    if (!containerRef.current || !graph) return

    setIsLoading(true)

    // Initial elements: only non-object nodes
    const initialElements: ElementDefinition[] = []

    // Add non-object nodes
    graph.nodes.forEach((node) => {
      if (node.type !== 'object' && node.type !== 'field') {
        initialElements.push({
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
      }
    })

    // Add edges between non-object nodes
    graph.edges.forEach((edge) => {
      const sourceNode = graph.nodes.find(n => n.id === edge.source)
      const targetNode = graph.nodes.find(n => n.id === edge.target)

      // Only add edge if both nodes are non-objects AND non-fields
      // Objects will be added dynamically later with their edges
      const sourceIsBase = sourceNode && sourceNode.type !== 'object' && sourceNode.type !== 'field'
      const targetIsBase = targetNode && targetNode.type !== 'object' && targetNode.type !== 'field'

      if (sourceIsBase && targetIsBase) {
        initialElements.push({
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
      }
    })

    const cy = cytoscape({
      container: containerRef.current,
      elements: initialElements,
      style: getStylesheet() as any,
      layout: getLayoutOptions('cose-bilkent'),
      minZoom: 0.1,
      maxZoom: 3,
      // wheelSensitivity: 0.15, // Removed to avoid warning - using default
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

    // Update positions when nodes are dragged
    cy.on('drag', 'node[type="object"]', updateObjectCardPositions)
    cy.on('dragfree', 'node[type="object"]', updateObjectCardPositions)

    return () => {
      cy.destroy()
      cyRef.current = null
    }
  }, [graph, onNodeSelect, updateObjectCardPositions])

  // Update graph when selectedObjects changes
  useEffect(() => {
    const cy = cyRef.current
    if (!cy || !graph) return

    // Get all object nodes from graph data
    const objectNodes = graph.nodes.filter(n => n.type === 'object')

    // Remove objects that are no longer selected
    cy.nodes('[type="object"]').forEach((node: NodeSingular) => {
      const objectName = node.data('objectName')
      if (!selectedObjects.includes(objectName)) {
        // Remove connected edges first
        node.connectedEdges().remove()
        // Remove the node
        node.remove()
      }
    })

    // Add newly selected objects
    selectedObjects.forEach((objectName) => {
      const objectNode = objectNodes.find(n =>
        n.properties.objectName === objectName || n.label === objectName
      )

      if (!objectNode) return

      const nodeId = objectNode.id

      // Check if node already exists
      if (cy.getElementById(nodeId).length > 0) return

      // Add the object node
      cy.add({
        group: 'nodes',
        data: {
          id: nodeId,
          label: objectNode.label,
          type: objectNode.type,
          ...objectNode.properties,
        },
        classes: [objectNode.type],
        grabbable: true, // Ensure node can be dragged
        selectable: true, // Ensure node can be selected
      })

      // Add edges connected to this object
      graph.edges.forEach((edge) => {
        if (edge.source === nodeId || edge.target === nodeId) {
          // Check if edge already exists
          if (cy.getElementById(edge.id).length > 0) return

          // Check if both endpoints exist
          const sourceExists = cy.getElementById(edge.source).length > 0
          const targetExists = cy.getElementById(edge.target).length > 0

          if (sourceExists && targetExists) {
            cy.add({
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
          }
        }
      })
    })

    // Re-run layout if we added or removed nodes
    if (selectedObjects.length > 0 || cy.nodes('[type="object"]').length > 0) {
      const layout = cy.layout(getLayoutOptions('cose-bilkent'))
      layout.run()

      // Update card positions after layout completes
      layout.one('layoutstop', () => {
        updateObjectCardPositions()
      })
    } else {
      // Just update positions if no layout change
      updateObjectCardPositions()
    }
  }, [selectedObjects, graph, updateObjectCardPositions])

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
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {Array.from(objectCardPositions.entries()).map(([id, data]) => {
          const handleDragStart = (e: React.MouseEvent) => {
            const cy = cyRef.current
            if (!cy) return

            const node = cy.getElementById(id)
            if (node.length === 0) return

            // Get the container's bounding rect for coordinate conversion
            const container = containerRef.current
            if (!container) return

            const containerRect = container.getBoundingClientRect()

            // Calculate offset between mouse and card center at drag start
            const startMouseX = e.clientX
            const startMouseY = e.clientY
            const startCardX = data.x + containerRect.left
            const startCardY = data.y + containerRect.top
            const offsetX = startMouseX - startCardX
            const offsetY = startMouseY - startCardY

            let hasMoved = false

            const handleMouseMove = (moveEvent: MouseEvent) => {
              // Check if actually dragging (moved more than 3px)
              const deltaX = moveEvent.clientX - startMouseX
              const deltaY = moveEvent.clientY - startMouseY

              if (!hasMoved && (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3)) {
                hasMoved = true
              }

              if (hasMoved) {
                // Get current container position (in case it moved)
                const currentRect = container.getBoundingClientRect()

                // Calculate where the card center should be (cursor position minus offset)
                const newCardCenterX = moveEvent.clientX - offsetX
                const newCardCenterY = moveEvent.clientY - offsetY

                // Convert to container-relative coordinates
                const relativeX = newCardCenterX - currentRect.left
                const relativeY = newCardCenterY - currentRect.top

                // Convert screen position to Cytoscape model position
                // We need to account for pan and zoom
                const pan = cy.pan()
                const zoom = cy.zoom()

                const modelX = (relativeX - pan.x) / zoom
                const modelY = (relativeY - pan.y) / zoom

                // Update node position in model coordinates
                node.position({
                  x: modelX,
                  y: modelY,
                })

                // Update HTML card position immediately
                updateObjectCardPositions()
              }
            }

            const handleMouseUp = () => {
              document.removeEventListener('mousemove', handleMouseMove)
              document.removeEventListener('mouseup', handleMouseUp)
            }

            document.addEventListener('mousemove', handleMouseMove)
            document.addEventListener('mouseup', handleMouseUp)
          }

          return (
            <div
              key={id}
              className="absolute"
              style={{
                left: `${data.x}px`,
                top: `${data.y}px`,
                transform: `translate(-50%, -50%) scale(${zoomLevel})`,
                transformOrigin: 'center center',
                pointerEvents: 'none', // Wrapper doesn't capture events
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
                onDragStart={handleDragStart}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
