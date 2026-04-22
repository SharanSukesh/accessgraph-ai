/**
 * Graph Data Transformations
 * Converts API graph data to Cytoscape.js format
 */

import type { ElementDefinition } from 'cytoscape'
import { NODE_TYPES, EDGE_TYPES } from '../constants'

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

/**
 * Transform API graph data to Cytoscape elements
 */
export function transformGraphToCytoscape(graph: Graph): ElementDefinition[] {
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
        // Add visual metadata
        isCenter: node.id === graph.metadata.centerNodeId,
      },
      classes: [node.type, node.id === graph.metadata.centerNodeId ? 'center' : ''].filter(Boolean),
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
}

/**
 * Get Cytoscape stylesheet - Enhanced professional design
 */
export function getCytoscapeStylesheet() {
  return [
    // Default node style - Modern and sleek
    {
      selector: 'node',
      style: {
        'background-color': '#f1f5f9', // Soft light background
        'background-opacity': 0.95,
        'border-width': 3,
        'border-color': '#94a3b8',
        'border-opacity': 0.8,
        label: 'data(label)',
        'text-valign': 'center',
        'text-halign': 'center',
        'font-size': '13px',
        'font-weight': '600',
        'font-family': 'Inter, system-ui, -apple-system, sans-serif',
        color: '#0f172a', // Deep dark text
        'text-wrap': 'wrap',
        'text-max-width': '110px',
        'text-outline-color': '#ffffff',
        'text-outline-width': 2,
        'text-outline-opacity': 0.8,
        width: 70,
        height: 70,
        // Add subtle shadow
        'shadow-blur': 12,
        'shadow-color': '#1e293b',
        'shadow-opacity': 0.15,
        'shadow-offset-x': 0,
        'shadow-offset-y': 2,
      },
    },

    // User nodes - Modern purple gradient with glow (matching app theme)
    {
      selector: `node[type="${NODE_TYPES.USER.value}"]`,
      style: {
        'background-color': '#8b5cf6', // purple-500 (brand color)
        'background-opacity': 1,
        'border-color': '#a78bfa', // purple-400
        'border-width': 4,
        'border-style': 'double',
        shape: 'ellipse',
        width: 85,
        height: 85,
        'font-size': '14px',
        // Enhanced shadow with glow
        'shadow-blur': 24,
        'shadow-color': '#8b5cf6',
        'shadow-opacity': 0.5,
        'shadow-offset-x': 0,
        'shadow-offset-y': 3,
        // Add outer glow effect
        'underlay-color': '#c4b5fd', // purple-300
        'underlay-opacity': 0.3,
        'underlay-padding': 8,
      },
    },

    // Profile nodes - Elegant indigo gradient with shimmer
    {
      selector: `node[type="${NODE_TYPES.PROFILE.value}"]`,
      style: {
        'background-color': '#6366f1', // indigo-500
        'background-opacity': 1,
        'border-color': '#818cf8', // indigo-400
        'border-width': 4,
        'border-style': 'double',
        shape: 'round-rectangle',
        width: 80,
        height: 80,
        'font-size': '13px',
        // Enhanced shadow with glow
        'shadow-blur': 22,
        'shadow-color': '#6366f1',
        'shadow-opacity': 0.45,
        'shadow-offset-x': 0,
        'shadow-offset-y': 3,
        // Add outer glow effect
        'underlay-color': '#a5b4fc', // indigo-300
        'underlay-opacity': 0.25,
        'underlay-padding': 7,
      },
    },

    // Permission set nodes - Vibrant cyan gradient with glow
    {
      selector: `node[type="${NODE_TYPES.PERMISSION_SET.value}"]`,
      style: {
        'background-color': '#0891b2', // cyan-600
        'background-opacity': 1,
        'border-color': '#22d3ee', // cyan-400
        'border-width': 4,
        'border-style': 'double',
        shape: 'round-rectangle',
        width: 80,
        height: 80,
        'font-size': '13px',
        // Enhanced shadow with glow
        'shadow-blur': 22,
        'shadow-color': '#06b6d4',
        'shadow-opacity': 0.45,
        'shadow-offset-x': 0,
        'shadow-offset-y': 3,
        // Add outer glow effect
        'underlay-color': '#67e8f9', // cyan-300
        'underlay-opacity': 0.25,
        'underlay-padding': 7,
      },
    },

    // Role nodes - Golden amber
    {
      selector: `node[type="${NODE_TYPES.ROLE.value}"]`,
      style: {
        'background-color': '#fbbf24', // amber-400
        'background-opacity': 1,
        'border-color': '#f59e0b', // amber-500
        'border-width': 4,
        shape: 'diamond',
        'shadow-blur': 16,
        'shadow-color': '#f59e0b',
        'shadow-opacity': 0.3,
      },
    },

    // Object nodes - Fresh emerald
    {
      selector: `node[type="${NODE_TYPES.OBJECT.value}"]`,
      style: {
        'background-color': '#34d399', // emerald-400
        'background-opacity': 1,
        'border-color': '#10b981', // emerald-500
        'border-width': 4,
        shape: 'round-rectangle',
        'shadow-blur': 16,
        'shadow-color': '#10b981',
        'shadow-opacity': 0.3,
      },
    },

    // Field nodes - Bright lime
    {
      selector: `node[type="${NODE_TYPES.FIELD.value}"]`,
      style: {
        'background-color': '#bef264', // lime-300
        'background-opacity': 1,
        'border-color': '#a3e635', // lime-400
        'border-width': 3,
        shape: 'ellipse',
        width: 55,
        height: 55,
        'font-size': '11px',
        'shadow-blur': 14,
        'shadow-color': '#a3e635',
        'shadow-opacity': 0.25,
      },
    },

    // Group nodes - Modern pink
    {
      selector: `node[type="${NODE_TYPES.GROUP.value}"]`,
      style: {
        'background-color': '#f472b6', // pink-400
        'background-opacity': 1,
        'border-color': '#ec4899', // pink-500
        'border-width': 4,
        shape: 'round-hexagon',
        'shadow-blur': 16,
        'shadow-color': '#ec4899',
        'shadow-opacity': 0.3,
      },
    },

    // Center node (highlighted) - Stunning focal point
    {
      selector: 'node.center',
      style: {
        'border-width': 5,
        'border-color': '#f97316', // orange-500
        'border-opacity': 1,
        width: 90,
        height: 90,
        'font-size': '15px',
        'font-weight': 'bold',
        'shadow-blur': 24,
        'shadow-color': '#f97316',
        'shadow-opacity': 0.5,
        'shadow-offset-x': 0,
        'shadow-offset-y': 4,
        // Pulsing effect with border
        'border-style': 'solid',
      },
    },

    // Selected node - Vibrant highlight
    {
      selector: 'node:selected',
      style: {
        'border-width': 5,
        'border-color': '#eab308', // yellow-500
        'border-opacity': 1,
        'overlay-color': '#fef08a', // yellow-200
        'overlay-opacity': 0.25,
        'overlay-padding': 10,
        'shadow-blur': 20,
        'shadow-color': '#eab308',
        'shadow-opacity': 0.4,
      },
    },

    // Default edge style - Sleek and modern
    {
      selector: 'edge',
      style: {
        width: 2.5,
        'line-color': '#cbd5e1', // gray-300
        'line-opacity': 0.7,
        'target-arrow-color': '#94a3b8',
        'target-arrow-shape': 'triangle',
        'target-arrow-fill': 'filled',
        'arrow-scale': 1.2,
        'curve-style': 'bezier',
        label: 'data(label)',
        'font-size': '11px',
        'font-weight': '500',
        'font-family': 'Inter, system-ui, -apple-system, sans-serif',
        'text-rotation': 'autorotate',
        'text-margin-y': -12,
        'text-background-color': '#ffffff',
        'text-background-opacity': 0.9,
        'text-background-padding': '3px',
        'text-background-shape': 'roundrectangle',
        'text-border-color': '#e2e8f0',
        'text-border-width': 1,
        'text-border-opacity': 0.5,
        color: '#475569', // gray-600
        // Smooth transitions
        'transition-property': 'line-color, width, target-arrow-color',
        'transition-duration': '0.2s',
      },
    },

    // HasProfile edge - Elegant violet
    {
      selector: `edge[type="${EDGE_TYPES.HAS_PROFILE.value}"]`,
      style: {
        'line-color': '#a78bfa', // violet-400
        'target-arrow-color': '#8b5cf6', // violet-500
        'line-style': 'solid',
        'line-opacity': 0.85,
        width: 3,
      },
    },

    // HasPermissionSet edge - Vibrant cyan
    {
      selector: `edge[type="${EDGE_TYPES.HAS_PERMISSION_SET.value}"]`,
      style: {
        'line-color': '#22d3ee', // cyan-400
        'target-arrow-color': '#06b6d4', // cyan-500
        'line-style': 'solid',
        'line-opacity': 0.85,
        width: 3,
      },
    },

    // HasRole edge - Golden amber
    {
      selector: `edge[type="${EDGE_TYPES.HAS_ROLE.value}"]`,
      style: {
        'line-color': '#fbbf24', // amber-400
        'target-arrow-color': '#f59e0b', // amber-500
        'line-style': 'solid',
        'line-opacity': 0.85,
        width: 3,
      },
    },

    // InheritsFrom edge
    {
      selector: `edge[type="${EDGE_TYPES.INHERITS_FROM.value}"]`,
      style: {
        'line-color': '#ec4899', // pink-500
        'target-arrow-color': '#ec4899',
        'line-style': 'dashed',
      },
    },

    // CanAccess / GRANTS_ACCESS edge - Fresh emerald
    {
      selector: `edge[type="${EDGE_TYPES.CAN_ACCESS.value}"], edge[type="GRANTS_ACCESS"]`,
      style: {
        'line-color': '#34d399', // emerald-400
        'target-arrow-color': '#10b981', // emerald-500
        'line-style': 'solid',
        'line-opacity': 0.85,
        width: 3,
      },
    },

    // ASSIGNED_PERMISSION_SET edge - Vibrant cyan dashed
    {
      selector: `edge[type="ASSIGNED_PERMISSION_SET"]`,
      style: {
        'line-color': '#22d3ee', // cyan-400
        'target-arrow-color': '#06b6d4', // cyan-500
        'line-style': 'dashed',
        'line-opacity': 0.8,
        'line-dash-pattern': [8, 4],
        width: 2.5,
      },
    },

    // CanRead/Create/Edit/Delete edges - Bright lime
    {
      selector: `edge[type="${EDGE_TYPES.CAN_READ.value}"], edge[type="${EDGE_TYPES.CAN_CREATE.value}"], edge[type="${EDGE_TYPES.CAN_EDIT.value}"], edge[type="${EDGE_TYPES.CAN_DELETE.value}"]`,
      style: {
        'line-color': '#bef264', // lime-300
        'target-arrow-color': '#a3e635', // lime-400
        'line-style': 'dotted',
        'line-opacity': 0.75,
        width: 2,
      },
    },

    // MemberOf edge - Modern pink
    {
      selector: `edge[type="${EDGE_TYPES.MEMBER_OF.value}"]`,
      style: {
        'line-color': '#f472b6', // pink-400
        'target-arrow-color': '#ec4899', // pink-500
        'line-style': 'solid',
        'line-opacity': 0.85,
        width: 3,
      },
    },

    // Selected edge - Bright highlight
    {
      selector: 'edge:selected',
      style: {
        width: 5,
        'line-color': '#fbbf24', // amber-400
        'line-opacity': 1,
        'target-arrow-color': '#f59e0b', // amber-500
        'overlay-color': '#fef3c7', // amber-100
        'overlay-opacity': 0.3,
        'z-index': 999,
      },
    },

    // Hovered node - Enhanced glow with purple theme
    {
      selector: 'node:active',
      style: {
        'overlay-color': '#8b5cf6', // purple-500 (brand)
        'overlay-opacity': 0.3,
        'overlay-padding': 10,
        'border-width': 5,
        'shadow-blur': 30,
        'shadow-opacity': 0.6,
        // Make transition smooth
        'transition-property': 'border-width, shadow-blur, overlay-opacity',
        'transition-duration': '0.2s',
      },
    },

    // Hovered edge - Enhanced visibility with purple tint
    {
      selector: 'edge:active',
      style: {
        width: 4.5,
        'line-opacity': 1,
        'overlay-color': '#8b5cf6', // purple-500
        'overlay-opacity': 0.3,
        'line-color': '#a78bfa', // purple-400
        // Make transition smooth
        'transition-property': 'width, line-opacity, line-color',
        'transition-duration': '0.2s',
      },
    },
  ]
}

/**
 * Get layout options for different graph types
 */
export function getLayoutOptions(layoutType: 'cose-bilkent' | 'circle' | 'grid' | 'breadthfirst' = 'cose-bilkent') {
  const layouts = {
    'cose-bilkent': {
      name: 'cose-bilkent',
      animate: true,
      animationDuration: 500,
      fit: true,
      padding: 30,
      nodeDimensionsIncludeLabels: true,
      randomize: false,
      idealEdgeLength: 100,
      edgeElasticity: 0.45,
      nestingFactor: 0.1,
      gravity: 0.25,
      numIter: 2500,
      tile: true,
      tilingPaddingVertical: 10,
      tilingPaddingHorizontal: 10,
    },
    circle: {
      name: 'circle',
      animate: true,
      animationDuration: 500,
      fit: true,
      padding: 30,
    },
    grid: {
      name: 'grid',
      animate: true,
      animationDuration: 500,
      fit: true,
      padding: 30,
      rows: undefined,
      cols: undefined,
    },
    breadthfirst: {
      name: 'breadthfirst',
      animate: true,
      animationDuration: 500,
      fit: true,
      padding: 30,
      directed: true,
      spacingFactor: 1.5,
    },
  }

  return layouts[layoutType]
}

/**
 * Filter graph nodes and edges
 */
export function filterGraphElements(
  elements: ElementDefinition[],
  filters: {
    nodeTypes?: string[]
    edgeTypes?: string[]
    searchTerm?: string
  }
): ElementDefinition[] {
  let filtered = elements

  // Filter by node types
  if (filters.nodeTypes && filters.nodeTypes.length > 0) {
    const nodeIds = new Set(
      elements
        .filter((el) => el.group === 'nodes' && filters.nodeTypes!.includes(el.data.type))
        .map((el) => el.data.id)
    )

    filtered = filtered.filter((el) => {
      if (el.group === 'nodes') {
        return nodeIds.has(el.data.id)
      }
      // Keep edges only if both source and target are in nodeIds
      return nodeIds.has(el.data.source) && nodeIds.has(el.data.target)
    })
  }

  // Filter by edge types
  if (filters.edgeTypes && filters.edgeTypes.length > 0) {
    filtered = filtered.filter((el) => {
      if (el.group === 'edges') {
        return filters.edgeTypes!.includes(el.data.type)
      }
      return true // Keep all nodes
    })
  }

  // Filter by search term
  if (filters.searchTerm && filters.searchTerm.trim()) {
    const term = filters.searchTerm.toLowerCase()
    filtered = filtered.filter((el) => {
      if (el.group === 'nodes') {
        return (
          el.data.label?.toLowerCase().includes(term) ||
          el.data.id?.toLowerCase().includes(term)
        )
      }
      return true // Keep all edges
    })
  }

  return filtered
}

/**
 * Export graph as PNG (requires Cytoscape instance)
 */
export function exportGraphAsPNG(cy: any, filename: string = 'graph.png') {
  const png = cy.png({
    output: 'blob',
    bg: '#ffffff',
    full: true,
    scale: 2,
  })

  const url = URL.createObjectURL(png)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

/**
 * Export graph as JSON
 */
export function exportGraphAsJSON(cy: any, filename: string = 'graph.json') {
  const json = cy.json()
  const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
