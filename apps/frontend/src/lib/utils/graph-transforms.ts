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
 * Get Cytoscape stylesheet
 */
export function getCytoscapeStylesheet() {
  return [
    // Default node style
    {
      selector: 'node',
      style: {
        'background-color': '#94a3b8', // gray-400
        'border-width': 2,
        'border-color': '#64748b', // gray-500
        label: 'data(label)',
        'text-valign': 'center',
        'text-halign': 'center',
        'font-size': '12px',
        'font-weight': '500',
        color: '#1e293b', // gray-900
        'text-wrap': 'wrap',
        'text-max-width': '100px',
        width: 60,
        height: 60,
      },
    },

    // User nodes
    {
      selector: `node[type="${NODE_TYPES.USER.value}"]`,
      style: {
        'background-color': '#3b82f6', // blue-500
        'border-color': '#2563eb', // blue-600
        shape: 'ellipse',
      },
    },

    // Profile nodes
    {
      selector: `node[type="${NODE_TYPES.PROFILE.value}"]`,
      style: {
        'background-color': '#8b5cf6', // violet-500
        'border-color': '#7c3aed', // violet-600
        shape: 'round-rectangle',
      },
    },

    // Permission set nodes
    {
      selector: `node[type="${NODE_TYPES.PERMISSION_SET.value}"]`,
      style: {
        'background-color': '#06b6d4', // cyan-500
        'border-color': '#0891b2', // cyan-600
        shape: 'round-rectangle',
      },
    },

    // Role nodes
    {
      selector: `node[type="${NODE_TYPES.ROLE.value}"]`,
      style: {
        'background-color': '#f59e0b', // amber-500
        'border-color': '#d97706', // amber-600
        shape: 'diamond',
      },
    },

    // Object nodes
    {
      selector: `node[type="${NODE_TYPES.OBJECT.value}"]`,
      style: {
        'background-color': '#10b981', // emerald-500
        'border-color': '#059669', // emerald-600
        shape: 'round-rectangle',
      },
    },

    // Field nodes
    {
      selector: `node[type="${NODE_TYPES.FIELD.value}"]`,
      style: {
        'background-color': '#a3e635', // lime-400
        'border-color': '#84cc16', // lime-500
        shape: 'ellipse',
        width: 50,
        height: 50,
        'font-size': '10px',
      },
    },

    // Group nodes
    {
      selector: `node[type="${NODE_TYPES.GROUP.value}"]`,
      style: {
        'background-color': '#ec4899', // pink-500
        'border-color': '#db2777', // pink-600
        shape: 'round-hexagon',
      },
    },

    // Center node (highlighted)
    {
      selector: 'node.center',
      style: {
        'border-width': 4,
        'border-color': '#ef4444', // red-500
        'background-color': '#fca5a5', // red-300
        width: 80,
        height: 80,
        'font-size': '14px',
        'font-weight': 'bold',
      },
    },

    // Selected node
    {
      selector: 'node:selected',
      style: {
        'border-width': 4,
        'border-color': '#eab308', // yellow-500
        'overlay-color': '#eab308',
        'overlay-opacity': 0.2,
        'overlay-padding': 8,
      },
    },

    // Default edge style
    {
      selector: 'edge',
      style: {
        width: 2,
        'line-color': '#cbd5e1', // gray-300
        'target-arrow-color': '#cbd5e1',
        'target-arrow-shape': 'triangle',
        'curve-style': 'bezier',
        label: 'data(label)',
        'font-size': '10px',
        'text-rotation': 'autorotate',
        'text-margin-y': -10,
        color: '#64748b', // gray-500
      },
    },

    // HasProfile edge
    {
      selector: `edge[type="${EDGE_TYPES.HAS_PROFILE.value}"]`,
      style: {
        'line-color': '#8b5cf6', // violet-500
        'target-arrow-color': '#8b5cf6',
        'line-style': 'solid',
      },
    },

    // HasPermissionSet edge
    {
      selector: `edge[type="${EDGE_TYPES.HAS_PERMISSION_SET.value}"]`,
      style: {
        'line-color': '#06b6d4', // cyan-500
        'target-arrow-color': '#06b6d4',
        'line-style': 'solid',
      },
    },

    // HasRole edge
    {
      selector: `edge[type="${EDGE_TYPES.HAS_ROLE.value}"]`,
      style: {
        'line-color': '#f59e0b', // amber-500
        'target-arrow-color': '#f59e0b',
        'line-style': 'solid',
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

    // CanAccess edge
    {
      selector: `edge[type="${EDGE_TYPES.CAN_ACCESS.value}"]`,
      style: {
        'line-color': '#10b981', // emerald-500
        'target-arrow-color': '#10b981',
        'line-style': 'solid',
        width: 3,
      },
    },

    // CanRead/Create/Edit/Delete edges
    {
      selector: `edge[type="${EDGE_TYPES.CAN_READ.value}"], edge[type="${EDGE_TYPES.CAN_CREATE.value}"], edge[type="${EDGE_TYPES.CAN_EDIT.value}"], edge[type="${EDGE_TYPES.CAN_DELETE.value}"]`,
      style: {
        'line-color': '#a3e635', // lime-400
        'target-arrow-color': '#a3e635',
        'line-style': 'dotted',
        width: 1.5,
      },
    },

    // MemberOf edge
    {
      selector: `edge[type="${EDGE_TYPES.MEMBER_OF.value}"]`,
      style: {
        'line-color': '#ec4899', // pink-500
        'target-arrow-color': '#ec4899',
        'line-style': 'solid',
      },
    },

    // Selected edge
    {
      selector: 'edge:selected',
      style: {
        width: 4,
        'line-color': '#eab308', // yellow-500
        'target-arrow-color': '#eab308',
        'overlay-color': '#eab308',
        'overlay-opacity': 0.2,
      },
    },

    // Hovered elements
    {
      selector: 'node:active',
      style: {
        'overlay-color': '#3b82f6', // blue-500
        'overlay-opacity': 0.3,
        'overlay-padding': 6,
      },
    },
    {
      selector: 'edge:active',
      style: {
        width: 3,
        'overlay-color': '#3b82f6',
        'overlay-opacity': 0.3,
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
