'use client'

/**
 * ER Graph Visualization
 *
 * A user's access graph, left to right: the user, then their profile, role,
 * permission sets and groups, then a group's included sets and muting set,
 * then object cards (HTML overlays positioned on invisible anchor nodes).
 * Nodes are chips: colored border by type, icon, name, small caption. Colors
 * and sizes live in graphStyle.ts; the layout in layeredLayout.ts.
 *
 * Hover a node to highlight its paths; click an object card to pin every
 * path that grants access to it (muting edges included); click empty canvas
 * to clear.
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import cytoscape, { Core, NodeSingular, EdgeSingular, EdgeCollection, ElementDefinition, Collection } from 'cytoscape'
import { Download, Loader2, Maximize2, Minus, Plus, Tag } from 'lucide-react'
import { ERObjectCard } from './ERObjectCard'
import { exportGraphToJSON, exportStamp } from '@/lib/utils/exports'
import {
  EDGE_REST_ALPHA,
  GRAPH_PALETTE,
  PICKED_TYPES,
  SPECIAL_EDGES,
  USER_NODE_SIZE,
  edgeColor,
  nodeTypeStyle,
  objectCardSize,
  type GraphTheme,
} from './graphStyle'
import { canvasMeasure, chipImage, userImage } from './graphChips'
import { layeredPositions } from './layeredLayout'
import { edgePath, placeLabels, routeEdge, type Box, type LabelInput, type Point } from './edgeGeometry'
import { currentGraphTheme as currentTheme, useGraphTheme } from './useGraphTheme'

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
    // Permission sets and groups drawn, and how many were left out.
    assignmentsShown?: number
    assignmentsHidden?: number
  }
}

interface ERGraphVisualizationProps {
  graph: Graph
  selectedObjects: string[]
  /** Ids of the layouts, record pages, Apex classes and flows to draw (PICKED_TYPES). */
  selectedItems?: string[]
  onNodeSelect?: (node: any) => void
  height?: string
  className?: string
  /** Filename stem for PNG / JSON downloads; omit to hide the export buttons. */
  exportName?: string
}

const LAYOUT_MS = 300

/** Give every element the data the stylesheet reads: chip art, size, colors. */
function decorate(cy: Core, theme: GraphTheme) {
  const measure = canvasMeasure()
  cy.batch(() => {
    cy.nodes().forEach((node) => {
      const type = node.data('type')
      if (type === 'object') {
        const { width, height } = objectCardSize((node.data('fields') || []).length)
        node.data({ w: width, h: height })
        return
      }
      const style = nodeTypeStyle(type)
      const art = type === 'user' ? userImage(node.data('label')) : chipImage(type, node.data('label'), theme, measure)
      node.data({
        chip: art.uri,
        w: art.width,
        h: art.height,
        color: style.color,
        shape: style.shape ?? 'round-rectangle',
        borderStyle: style.double ? 'double' : style.dashed ? 'dashed' : 'solid',
        borderWidth: style.double ? 4 : 1.5,
        fillOpacity: style.outline ? 0 : 1,
      })
    })
    cy.edges().forEach((edge) => {
      const targetType = edge.target().data('type')
      const special = SPECIAL_EDGES[edge.data('type')]
      edge.data({
        color: edgeColor(edge.data('type'), targetType, EDGE_REST_ALPHA),
        strong: edgeColor(edge.data('type'), targetType, 1),
        lineStyle: special?.lineStyle ?? 'solid',
        labelOffset: edge.data('labelOffset') ?? 0,
      })
    })
  })
}

function stylesheet(theme: GraphTheme): any[] {
  const p = GRAPH_PALETTE[theme]
  return [
    {
      selector: 'node',
      style: {
        // Chips always sit above the edges that pass behind them.
        'z-index-compare': 'manual',
        'z-index': 10,
        'overlay-opacity': 0,
        'transition-property': 'opacity',
        'transition-duration': 150,
      },
    },
    {
      selector: 'node[chip]',
      style: {
        shape: 'data(shape)',
        width: 'data(w)',
        height: 'data(h)',
        'background-color': p.chip,
        'background-opacity': 'data(fillOpacity)',
        'background-image': 'data(chip)',
        'background-fit': 'contain',
        'background-clip': 'none',
        'border-width': 'data(borderWidth)',
        'border-color': 'data(color)',
        'border-style': 'data(borderStyle)',
        label: '',
      },
    },
    {
      selector: 'node[type="user"]',
      style: {
        shape: 'ellipse',
        width: USER_NODE_SIZE,
        height: USER_NODE_SIZE,
        'background-opacity': 1,
        'border-width': 2,
        label: 'data(label)',
        'text-valign': 'bottom',
        'text-margin-y': 7,
        'font-size': 12,
        'font-weight': 600,
        'font-family': 'system-ui, -apple-system, sans-serif',
        color: p.ink,
        'underlay-color': nodeTypeStyle('user').color,
        'underlay-padding': 6,
        'underlay-opacity': 0.14,
        'underlay-shape': 'ellipse',
      },
    },
    {
      // Object anchors: invisible; the HTML card sits on top.
      selector: 'node[type="object"]',
      style: {
        'background-opacity': 0,
        'border-opacity': 0,
        label: '',
        width: 'data(w)',
        height: 'data(h)',
        shape: 'rectangle',
        events: 'yes',
      },
    },
    {
      selector: 'node:selected',
      style: { 'border-width': 2.5 },
    },
    {
      selector: 'edge',
      style: {
        'z-index-compare': 'manual',
        'z-index': 1,
        width: 1.5,
        // Straight unless routeEdge() gives it a curve (see edgeGeometry.ts).
        'curve-style': 'straight',
        'line-color': 'data(color)',
        'line-style': 'data(lineStyle)',
        'line-dash-pattern': [6, 4],
        'target-arrow-shape': 'triangle',
        'target-arrow-color': 'data(color)',
        'arrow-scale': 0.7,
        // The label rides along the edge at a distance from the source chosen
        // by placeLabels(), so labels keep off chips and each other.
        'source-label': 'data(label)',
        'source-text-offset': 'data(labelOffset)',
        'source-text-rotation': 'none',
        'font-size': LABEL_FONT_SIZE,
        'font-family': 'system-ui, -apple-system, sans-serif',
        color: p.muted,
        'text-opacity': 1,
        'text-background-color': p.labelBackground,
        'text-background-opacity': 0.9,
        'text-background-shape': 'roundrectangle',
        'text-background-padding': '2px',
        'overlay-opacity': 0,
        'transition-property': 'opacity, line-color, width, text-opacity',
        'transition-duration': 150,
      },
    },
    {
      selector: 'edge[type="INCLUDES_PERMISSION_SET"]',
      style: { 'line-style': 'dotted' },
    },
    {
      selector: 'edge[type="MUTES"]',
      style: { 'line-style': 'dashed', color: SPECIAL_EDGES.MUTES.color, 'font-weight': 600 },
    },
    {
      // Labels toggle off: every label but "mutes".
      selector: 'edge.labels-off',
      style: { 'text-opacity': 0 },
    },
    {
      selector: 'edge[type="MUTES"].labels-off',
      style: { 'text-opacity': 1 },
    },
    {
      // Too far out to read: fade all labels until zoomed back in.
      selector: 'edge.zoomed-out',
      style: { 'text-opacity': 0 },
    },
    {
      selector: 'edge.highlighted',
      style: { 'line-color': 'data(strong)', 'target-arrow-color': 'data(strong)', width: 2 },
    },
    {
      // While a node or object is focused, only its paths keep their labels.
      selector: '.dimmed',
      style: { opacity: 0.15, 'text-opacity': 0 },
    },
  ]
}

const LABEL_FONT_SIZE = 10
const LABEL_FONT = `600 ${LABEL_FONT_SIZE}px system-ui, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif`
/** Below this zoom a 10px label renders under ~6px and stops being readable. */
const LABEL_MIN_ZOOM = 0.6

function nodeBox(node: NodeSingular): Box {
  const p = node.position()
  return { x: p.x, y: p.y, w: node.width(), h: node.height() }
}

/** Curve or straighten each edge for where its nodes are now (any position). */
function routeEdges(edges: EdgeCollection) {
  edges.forEach((edge: EdgeSingular) => {
    const route = routeEdge(nodeBox(edge.source()), nodeBox(edge.target()))
    if (route.kind === 'straight') {
      edge.style({ 'curve-style': 'straight' })
    } else {
      edge.style({
        'curve-style': 'unbundled-bezier',
        'control-point-distances': route.distances,
        'control-point-weights': route.weights,
      })
    }
  })
}

/** Slide each label along its edge so it sits off chips, cards and other labels. */
function placeEdgeLabels(cy: Core) {
  const measure = canvasMeasure()
  const nodes = cy.nodes().map((n) => nodeBox(n))
  const paths = new Map<string, Point[]>()
  const labels: LabelInput[] = []
  cy.edges().forEach((edge) => {
    const source = nodeBox(edge.source())
    const target = nodeBox(edge.target())
    const path = edgePath(source, target, routeEdge(source, target))
    paths.set(edge.id(), path)
    const text = String(edge.data('label') ?? '')
    labels.push({
      id: edge.id(),
      path,
      width: measure(text, LABEL_FONT) + 8,
      height: LABEL_FONT_SIZE + 6,
      priority: edge.data('type') === 'MUTES',
    })
  })
  const offsets = placeLabels(labels, nodes, paths)
  cy.batch(() => {
    cy.edges().forEach((edge) => {
      edge.data('labelOffset', offsets[edge.id()] ?? 0)
    })
  })
}

const PICKED = new Set<string>(PICKED_TYPES)
const NO_ITEMS: string[] = []

/** Nodes drawn from the start; objects and picked items are added when chosen. */
const isBase = (type: string | undefined) => !!type && type !== 'object' && type !== 'field' && !PICKED.has(type)

export function ERGraphVisualization({
  graph,
  selectedObjects,
  selectedItems = NO_ITEMS,
  onNodeSelect,
  height = '800px',
  className = '',
  exportName,
}: ERGraphVisualizationProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const cyRef = useRef<Core | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [objectCardPositions, setObjectCardPositions] = useState<
    Map<string, { x: number; y: number; node: any }>
  >(new Map())
  const [selectedNode, setSelectedNode] = useState<string | null>(null)
  const [zoomLevel, setZoomLevel] = useState(1)
  const theme = useGraphTheme()
  // Element ids kept bright while something is hovered or an object is pinned.
  const [lit, setLit] = useState<Set<string> | null>(null)
  const pinned = useRef(false)
  // Edge labels: on by default; the toggle hides all but "mutes".
  const [labelsOn, setLabelsOn] = useState(true)
  const labelsOnRef = useRef(true)

  /** Labels toggle and zoom fade, applied to every edge (new ones included). */
  const applyLabelClasses = useCallback(() => {
    const cy = cyRef.current
    if (!cy) return
    cy.batch(() => {
      cy.edges().toggleClass('labels-off', !labelsOnRef.current)
      cy.edges().toggleClass('zoomed-out', cy.zoom() < LABEL_MIN_ZOOM)
    })
  }, [])

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

  const runLayout = useCallback((animate: boolean) => {
    const cy = cyRef.current
    if (!cy) return
    const positions = layeredPositions(
      cy.nodes().map((n) => ({
        id: n.id(),
        type: n.data('type'),
        label: n.data('label'),
        width: n.data('w') || 120,
        height: n.data('h') || 42,
      })),
      cy.edges().map((e) => ({ source: e.data('source'), target: e.data('target'), type: e.data('type') })),
      graph.metadata.centerNodeId,
    )
    // Straight edges while nodes move; curves are recomputed where they land.
    cy.edges().removeStyle('curve-style control-point-distances control-point-weights')
    const layout = cy.layout({
      name: 'preset',
      positions: (node: any) => positions[node.id()],
      fit: true,
      padding: 48,
      animate,
      animationDuration: LAYOUT_MS,
      animationEasing: 'ease-out',
    } as any)
    layout.one('layoutstop', () => {
      routeEdges(cy.edges())
      placeEdgeLabels(cy)
      applyLabelClasses()
      setIsLoading(false)
      updateObjectCardPositions()
    })
    layout.run()
  }, [graph, updateObjectCardPositions, applyLabelClasses])

  const highlight = useCallback((keep: Collection | null) => {
    const cy = cyRef.current
    if (!cy) return
    cy.batch(() => {
      cy.elements().removeClass('dimmed highlighted')
      if (keep) {
        cy.elements().not(keep).addClass('dimmed')
        keep.edges().addClass('highlighted')
      }
    })
    setLit(keep ? new Set(keep.map((e) => e.id())) : null)
  }, [])

  /** Every path that grants access to an object (or a picked item), and any muting on those groups. */
  const focusObject = useCallback((id: string) => {
    const cy = cyRef.current
    if (!cy) return
    const object = cy.getElementById(id)
    if (object.empty()) return
    let keep = object.union(object.predecessors())
    const groups = keep.nodes('[type="permission_set_group"]')
    const mutes = groups.outgoers('edge[type="MUTES"]')
    keep = keep.union(mutes).union(mutes.targets())
    pinned.current = true
    highlight(keep)
  }, [highlight])

  const clearFocus = useCallback(() => {
    pinned.current = false
    highlight(null)
  }, [highlight])

  // Initialize Cytoscape once with base nodes
  useEffect(() => {
    if (!containerRef.current || !graph) return

    setIsLoading(true)

    // Initial elements: only non-object nodes
    const initialElements: ElementDefinition[] = []

    graph.nodes.forEach((node) => {
      if (isBase(node.type)) {
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

    // Edges between base nodes; object and picked-item edges arrive with them.
    graph.edges.forEach((edge) => {
      const sourceNode = graph.nodes.find(n => n.id === edge.source)
      const targetNode = graph.nodes.find(n => n.id === edge.target)
      const sourceIsBase = isBase(sourceNode?.type)
      const targetIsBase = isBase(targetNode?.type)

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
      style: stylesheet(currentTheme()),
      layout: { name: 'preset' },
      minZoom: 0.1,
      maxZoom: 3,
    })

    cyRef.current = cy
    // Lets local browser checks find nodes and drag them; not set in production builds.
    if (process.env.NODE_ENV !== 'production') (window as any).__accessGraph = cy
    decorate(cy, currentTheme())
    runLayout(false)

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
      if (node.data('type') === 'object' || PICKED.has(node.data('type'))) focusObject(node.id())
    })

    // Background click clears selection and any pinned paths.
    cy.on('tap', (event) => {
      if (event.target === cy) {
        setSelectedNode(null)
        clearFocus()
      }
    })

    // Hover: light up the node's paths, dim the rest (unless an object is pinned).
    cy.on('mouseover', 'node', (event) => {
      if (pinned.current) return
      const node = event.target as NodeSingular
      if (node.data('type') === 'object') return
      if (PICKED.has(node.data('type'))) return highlight(node.union(node.predecessors()))
      highlight(node.union(node.predecessors()).union(node.successors()))
    })
    cy.on('mouseout', 'node', () => {
      if (!pinned.current) highlight(null)
    })
    cy.on('zoom', applyLabelClasses)

    // Update positions on pan/zoom
    cy.on('pan zoom', updateObjectCardPositions)

    // Dragging a node re-routes its edges for wherever it goes (left of the
    // user, above the top row, anywhere) and keeps its card attached.
    cy.on('drag', 'node', (event) => {
      routeEdges(event.target.connectedEdges())
      if (event.target.data('type') === 'object') updateObjectCardPositions()
    })
    cy.on('dragfree', 'node', (event) => {
      placeEdgeLabels(cy)
      if (event.target.data('type') === 'object') updateObjectCardPositions()
    })

    return () => {
      cy.destroy()
      cyRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph])

  useEffect(() => {
    labelsOnRef.current = labelsOn
    applyLabelClasses()
  }, [labelsOn, applyLabelClasses])

  // Restyle on theme change: chip art carries its text colors.
  useEffect(() => {
    const cy = cyRef.current
    if (!cy) return
    cy.style(stylesheet(theme))
    decorate(cy, theme)
  }, [theme])

  // Update graph when selectedObjects changes
  useEffect(() => {
    const cy = cyRef.current
    if (!cy || !graph) return

    let graphModified = false
    const objectNodes = graph.nodes.filter(n => n.type === 'object')

    // Remove objects that are no longer selected
    cy.nodes('[type="object"]').forEach((node: NodeSingular) => {
      const objectName = node.data('objectName')
      if (!selectedObjects.includes(objectName)) {
        node.connectedEdges().remove()
        node.remove()
        graphModified = true
      }
    })

    // Add newly selected objects
    selectedObjects.forEach((objectName) => {
      const objectNode = objectNodes.find(n =>
        n.properties.objectName === objectName || n.label === objectName
      )
      if (!objectNode) return
      const nodeId = objectNode.id
      if (cy.getElementById(nodeId).length > 0) return

      cy.add({
        group: 'nodes',
        data: {
          id: nodeId,
          label: objectNode.label,
          type: objectNode.type,
          ...objectNode.properties,
        },
        classes: [objectNode.type],
        grabbable: true,
        selectable: true,
        locked: false,
      })
      graphModified = true

      graph.edges.forEach((edge) => {
        if (edge.source === nodeId || edge.target === nodeId) {
          if (cy.getElementById(edge.id).length > 0) return
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

    if (graphModified) {
      clearFocus()
      decorate(cy, currentTheme())
      runLayout(true)
    } else {
      updateObjectCardPositions()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedObjects, graph])

  // Add and remove picked layouts, record pages, Apex classes and flows.
  useEffect(() => {
    const cy = cyRef.current
    if (!cy || !graph) return
    const wanted = new Set(selectedItems)
    let graphModified = false
    cy.nodes().forEach((node: NodeSingular) => {
      if (PICKED.has(node.data('type')) && !wanted.has(node.id())) {
        node.connectedEdges().remove()
        node.remove()
        graphModified = true
      }
    })
    const byId = new Map(graph.nodes.map((n) => [n.id, n]))
    selectedItems.forEach((id) => {
      const item = byId.get(id)
      if (!item || !PICKED.has(item.type) || cy.getElementById(id).length > 0) return
      cy.add({
        group: 'nodes',
        data: { id, label: item.label, type: item.type, ...item.properties },
        classes: [item.type],
      })
      graphModified = true
    })
    if (graphModified) {
      // Edges of the items now drawn, to anything else on screen (objects included).
      graph.edges.forEach((edge) => {
        if (cy.getElementById(edge.id).length > 0) return
        if (!(wanted.has(edge.source) || wanted.has(edge.target))) return
        if (cy.getElementById(edge.source).length > 0 && cy.getElementById(edge.target).length > 0) {
          cy.add({
            group: 'edges',
            data: { id: edge.id, source: edge.source, target: edge.target, label: edge.label || edge.type, type: edge.type, ...edge.properties },
            classes: [edge.type],
          })
        }
      })
      clearFocus()
      decorate(cy, currentTheme())
      runLayout(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedItems, graph])

  const zoomBy = (factor: number) => {
    const cy = cyRef.current
    if (!cy) return
    const level = Math.min(cy.maxZoom(), Math.max(cy.minZoom(), cy.zoom() * factor))
    cy.animate({ zoom: { level, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } } } as any, { duration: 200 })
  }
  const fit = () => cyRef.current?.animate({ fit: { eles: cyRef.current.elements(), padding: 48 } } as any, { duration: LAYOUT_MS })

  // Object cards are HTML overlays the canvas can't capture, so for the PNG
  // the object anchors briefly draw themselves as chips, e.g. "Account (R E)".
  // The export always shows the whole graph, undimmed.
  const exportPng = async () => {
    const cy = cyRef.current
    if (!cy || !exportName) return
    const objects = cy.nodes('[type="object"]')
    const measure = canvasMeasure()
    const dimmed = cy.elements('.dimmed')
    const highlighted = cy.elements('.highlighted')
    const faded = cy.edges('.zoomed-out')
    const images: Promise<void>[] = []
    cy.batch(() => {
      dimmed.removeClass('dimmed')
      highlighted.removeClass('highlighted')
      faded.removeClass('zoomed-out')
      objects.forEach((n) => {
        const perms = (['canRead', 'canCreate', 'canEdit', 'canDelete'] as const)
          .filter((k) => n.data(k))
          .map((k) => k.charAt(3))
          .join(' ')
        const art = chipImage('object', `${n.data('objectName') ?? n.id()}${perms ? ` (${perms})` : ''}`, theme, measure)
        images.push(new Promise((resolve) => {
          const img = new Image()
          img.onload = img.onerror = () => resolve()
          img.src = art.uri
        }))
        n.style({
          'background-opacity': 1,
          'background-color': GRAPH_PALETTE[theme].chip,
          'background-image': art.uri,
          'background-fit': 'contain',
          'border-opacity': 1,
          'border-width': 1.5,
          'border-color': nodeTypeStyle('object').color,
          shape: 'round-rectangle',
          width: art.width,
          height: art.height,
        })
      })
    })
    // Objects are chip-sized now: re-route their edges and labels to match.
    routeEdges(cy.edges())
    placeEdgeLabels(cy)
    // Cytoscape paints new background images once they've loaded.
    await Promise.all(images)
    // ...and once highlight colors have faded back (150ms transitions).
    await new Promise((resolve) => setTimeout(resolve, 250))
    const uri = cy.png({ full: true, scale: 2, bg: GRAPH_PALETTE[theme].canvas, output: 'base64uri' })
    cy.batch(() => {
      objects.removeStyle()
      dimmed.addClass('dimmed')
      highlighted.addClass('highlighted')
      faded.addClass('zoomed-out')
    })
    routeEdges(cy.edges())
    placeEdgeLabels(cy)
    const link = document.createElement('a')
    link.href = uri
    link.download = `${exportName}-${exportStamp()}.png`
    link.click()
  }

  const controlButton =
    'inline-flex h-8 w-8 items-center justify-center text-grove-ink/70 hover:bg-primary-50 hover:text-grove-ink dark:text-grove-ink-dk/70 dark:hover:bg-primary-900/30 dark:hover:text-grove-ink-dk'

  return (
    <div className={`relative ${className}`} style={{ height }}>
      {exportName && !isLoading && (
        <div className="absolute right-3 top-3 z-20 flex gap-1.5">
          <button
            type="button"
            onClick={exportPng}
            className="inline-flex items-center gap-1 rounded-md border border-grove-border bg-grove-surface/90 px-2 py-1 text-xs font-medium text-grove-ink/80 hover:bg-primary-50 dark:border-grove-border-dk dark:bg-grove-surface-dk/90 dark:text-grove-ink-dk/80"
            title="Download the graph as an image"
          >
            <Download className="h-3.5 w-3.5" /> PNG
          </button>
          <button
            type="button"
            onClick={() => exportGraphToJSON(graph, `${exportName}-${exportStamp()}`)}
            className="inline-flex items-center gap-1 rounded-md border border-grove-border bg-grove-surface/90 px-2 py-1 text-xs font-medium text-grove-ink/80 hover:bg-primary-50 dark:border-grove-border-dk dark:bg-grove-surface-dk/90 dark:text-grove-ink-dk/80"
            title="Download the nodes and edges as JSON"
          >
            <Download className="h-3.5 w-3.5" /> JSON
          </button>
        </div>
      )}
      {!isLoading && (graph.metadata.assignmentsHidden ?? 0) > 0 && (
        <div className="absolute left-3 top-3 z-20 rounded-md border border-copper-200 bg-copper-50/95 px-2 py-1 text-xs text-copper-700 dark:border-copper-800 dark:bg-copper-900/40 dark:text-copper-300">
          +{graph.metadata.assignmentsHidden} more permission sets or groups not drawn. The Object Access tab
          includes them all.
        </div>
      )}
      {!isLoading && (
        <div className="absolute bottom-3 right-3 z-20 flex flex-col overflow-hidden rounded-md border border-grove-border bg-grove-surface/95 shadow-sm dark:border-grove-border-dk dark:bg-grove-surface-dk/95">
          <button type="button" className={controlButton} onClick={() => zoomBy(1.25)} title="Zoom in" aria-label="Zoom in">
            <Plus className="h-4 w-4" />
          </button>
          <button type="button" className={controlButton} onClick={() => zoomBy(0.8)} title="Zoom out" aria-label="Zoom out">
            <Minus className="h-4 w-4" />
          </button>
          <button type="button" className={controlButton} onClick={fit} title="Fit to screen" aria-label="Fit to screen">
            <Maximize2 className="h-4 w-4" />
          </button>
        </div>
      )}
      {!isLoading && (
        <button
          type="button"
          onClick={() => setLabelsOn((on) => !on)}
          aria-pressed={labelsOn}
          title={labelsOn ? 'Hide edge labels ("mutes" stays)' : 'Show edge labels'}
          className={`absolute bottom-3 right-14 z-20 inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium shadow-sm ${
            labelsOn
              ? 'border-primary-300 bg-primary-50 text-primary-800 dark:border-primary-700 dark:bg-primary-900/40 dark:text-primary-200'
              : 'border-grove-border bg-grove-surface/95 text-grove-ink/70 dark:border-grove-border-dk dark:bg-grove-surface-dk/95 dark:text-grove-ink-dk/70'
          }`}
        >
          <Tag className="h-3.5 w-3.5" />
          Labels {labelsOn ? 'on' : 'off'}
        </button>
      )}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-grove-surface/80 dark:bg-grove-canvas-dk/80 z-10">
          <div className="flex items-center gap-2 text-grove-ink/65 dark:text-grove-ink-dk/65">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span>Loading graph...</span>
          </div>
        </div>
      )}

      {/* Cytoscape container */}
      <div
        ref={containerRef}
        data-testid="access-graph"
        className="v2-dotgrid w-full h-full bg-grove-canvas dark:bg-grove-canvas-dk rounded-lg border border-grove-border dark:border-grove-border-dk"
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
                const pan = cy.pan()
                const zoom = cy.zoom()

                const modelX = (relativeX - pan.x) / zoom
                const modelY = (relativeY - pan.y) / zoom

                node.position({
                  x: modelX,
                  y: modelY,
                })
                routeEdges(node.connectedEdges())

                // Update HTML card position immediately
                updateObjectCardPositions()
              }
            }

            const handleMouseUp = () => {
              if (hasMoved) placeEdgeLabels(cy)
              document.removeEventListener('mousemove', handleMouseMove)
              document.removeEventListener('mouseup', handleMouseUp)
            }

            document.addEventListener('mousemove', handleMouseMove)
            document.addEventListener('mouseup', handleMouseUp)
          }

          return (
            <div
              key={id}
              className="absolute transition-opacity duration-150"
              style={{
                left: `${data.x}px`,
                top: `${data.y}px`,
                transform: `translate(-50%, -50%) scale(${zoomLevel})`,
                transformOrigin: 'center center',
                pointerEvents: 'none', // Wrapper doesn't capture events
                opacity: lit && !lit.has(id) ? 0.2 : 1,
              }}
            >
              <ERObjectCard
                objectName={data.node.objectName}
                fields={data.node.fields}
                permissions={data.node.permissions}
                hasImplicitFieldAccess={data.node.hasImplicitFieldAccess}
                isSelected={selectedNode === id}
                onClick={() => {
                  setSelectedNode(id)
                  onNodeSelect?.(data.node)
                  focusObject(id)
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
