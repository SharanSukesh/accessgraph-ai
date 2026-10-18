'use client'

/**
 * The People graph: Cytoscape + edgehandles, drawing only the people the
 * view asks for (lib/peopleTree.ts visiblePeople) in a top-down tree.
 * Elements are synced, not rebuilt, so drawing an edge or opening a
 * manager keeps everything else where it is; the tree is laid out again
 * only when the set of people changes. Pending edits come from the parent
 * (pending add edges, committed edges marked for removal).
 */

import { useEffect, useMemo, useRef } from 'react'
import cytoscape, { Core, ElementDefinition } from 'cytoscape'
// @ts-expect-error — cytoscape-edgehandles has no bundled types
import edgehandles from 'cytoscape-edgehandles'
import type { RelationshipField } from '@/lib/api/hooks/useReportingGraph'
import { useGraphTheme } from '@/components/graph/useGraphTheme'
import { NODE_H, NODE_W, type People, type Visible, treeLayout } from '@/lib/peopleTree'

if (typeof window !== 'undefined') {
  try {
    cytoscape.use(edgehandles)
  } catch {
    /* already registered */
  }
}

export interface PendingEditLike {
  user_sf_id: string
  field: RelationshipField
  new_value: string | null
  kind: 'add' | 'remove' | 'update'
}

// Role-depth ramp (0 = top of the role hierarchy), with text that reads on each fill.
const ROLE_COLORS = ['#094230', '#0d573c', '#146b4a', '#2e8064', '#6bbf95', '#b8d1c0']
function fillFor(depth: number | null | undefined): { fill: string; text: string } {
  if (depth == null) return { fill: '#9ca3af', text: '#111827' }
  const i = Math.max(0, Math.min(ROLE_COLORS.length - 1, depth))
  return { fill: ROLE_COLORS[i], text: i >= 4 ? '#0b2a1d' : '#ffffff' }
}
export const roleColor = (depth: number | null | undefined) => fillFor(depth).fill

export const ISOLATED_ID = '__no_manager_group__'
const MIN_READABLE_ZOOM = 0.7

function label(name: string, sub: string | null | undefined, counts: string | null): string {
  const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)
  return [cut(name, 26), sub ? cut(sub, 30) : null, counts].filter(Boolean).join('\n')
}

export function PeopleCanvas({
  people,
  visible,
  expanded,
  pending,
  selectedId,
  tool,
  edgeMode,
  isolated,
  onSelect,
  onToggle,
  onDraw,
  onRemoveEdge,
  onDropPending,
  onIsolatedClick,
}: {
  people: People
  visible: Visible
  expanded: Set<string>
  pending: PendingEditLike[]
  selectedId: string | null
  tool: 'move' | 'draw'
  edgeMode: RelationshipField
  /** Top-level people with no manager and no reports, drawn as one group node in the collapsed view. */
  isolated: string[]
  onSelect: (id: string | null) => void
  onToggle: (id: string) => void
  onDraw: (source: string, target: string, field: RelationshipField) => void
  onRemoveEdge: (source: string, field: RelationshipField) => void
  onDropPending: (source: string, field: RelationshipField) => void
  onIsolatedClick: () => void
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const cyRef = useRef<Core | null>(null)
  const ehRef = useRef<any>(null)
  const theme = useGraphTheme()
  // Listeners are bound once; they read the latest props through refs.
  const live = useRef({ edgeMode, visible, onSelect, onToggle, onDraw, onRemoveEdge, onDropPending, onIsolatedClick })
  live.current = { edgeMode, visible, onSelect, onToggle, onDraw, onRemoveEdge, onDropPending, onIsolatedClick }
  const lastNodeSet = useRef('')

  const elements = useMemo<ElementDefinition[]>(() => {
    const out: ElementDefinition[] = []
    const ids = new Set(visible.ids)
    const grouped = visible.mode === 'collapsed' && isolated.length > 1
    if (grouped) for (const id of isolated) ids.delete(id)
    for (const id of ids) {
      const p = people.byId.get(id)
      if (!p) continue
      const direct = people.reports.get(id)?.length ?? 0
      const total = people.total.get(id) ?? 0
      const marker = visible.mode === 'collapsed' && direct ? (expanded.has(id) ? '▾ ' : '▸ ') : ''
      const counts = direct ? `${marker}${direct} direct · ${total} total` : null
      const { fill, text } = fillFor(p.role_depth)
      const classes = [
        p.is_active ? '' : 'inactive',
        (p.flags ?? []).length ? 'flagged' : '',
        visible.context.has(id) ? 'context' : '',
        id === selectedId ? 'picked' : '',
      ].filter(Boolean).join(' ')
      out.push({ data: { id, label: label(p.name, p.title || p.role_name, counts), fill, text }, classes })
    }
    if (grouped) {
      out.push({
        data: { id: ISOLATED_ID, label: `${isolated.length} more with no manager\nand no reports`, fill: 'transparent', text: '' },
        classes: 'group',
      })
    }
    const marked = new Set(pending.map((e) => `${e.user_sf_id}::${e.field}`))
    for (const [src, tgt] of people.managerOf) {
      if (!ids.has(src) || !ids.has(tgt)) continue
      out.push({
        data: { id: `${src}__manager__${tgt}`, source: src, target: tgt, edge_type: 'manager' },
        classes: `edge-manager${marked.has(`${src}::ManagerId`) ? ' pending-remove' : ''}`,
      })
    }
    for (const [src, tgt] of people.approverOf) {
      if (!ids.has(src) || !ids.has(tgt)) continue
      out.push({
        data: { id: `${src}__delegated_approver__${tgt}`, source: src, target: tgt, edge_type: 'delegated_approver', label: 'delegated' },
        classes: `edge-delegated${marked.has(`${src}::DelegatedApproverId`) ? ' pending-remove' : ''}`,
      })
    }
    for (const e of pending) {
      if (e.kind !== 'add' || !e.new_value || !ids.has(e.user_sf_id) || !ids.has(e.new_value)) continue
      const manager = e.field === 'ManagerId'
      out.push({
        data: { id: `pending__${e.field}__${e.user_sf_id}__${e.new_value}`, source: e.user_sf_id, target: e.new_value,
          label: manager ? 'manager (pending)' : 'delegated (pending)' },
        classes: manager ? 'pending-add-manager' : 'pending-add-delegated',
      })
    }
    return out
  }, [people, visible, expanded, pending, selectedId, isolated])

  // Build the canvas once.
  useEffect(() => {
    if (!containerRef.current) return
    const cy = cytoscape({
      container: containerRef.current,
      elements: [],
      boxSelectionEnabled: false,
      minZoom: 0.15,
      maxZoom: 2.5,
      style: [],
    })
    cyRef.current = cy
    // A new canvas has nothing laid out yet (React may build it twice in development).
    lastNodeSet.current = ''
    if (process.env.NODE_ENV !== 'production') (window as any).__peopleGraph = cy
    const eh = (cy as any).edgehandles({ preview: false, hoverDelay: 120, snap: true, noEdgeEventsInDraw: false, handleNodes: 'node[!group]', edgeType: () => 'flat' })
    ehRef.current = eh
    cy.on('ehcomplete', (_e: any, source: any, target: any, added: any) => {
      added.remove()
      const s = source.id()
      const t = target.id()
      if (!s || !t || s === t || s === ISOLATED_ID || t === ISOLATED_ID) return
      live.current.onDraw(s, t, live.current.edgeMode)
    })
    cy.on('tap', 'node', (evt) => {
      const id = evt.target.id()
      if (id === ISOLATED_ID) return live.current.onIsolatedClick()
      live.current.onSelect(id)
      live.current.onToggle(id)
    })
    cy.on('tap', (evt) => {
      if (evt.target === cy) live.current.onSelect(null)
    })
    // Right-click an edge: mark a committed one for removal, or drop a pending one.
    cy.on('cxttap', 'edge', (evt) => {
      const edge = evt.target
      const id = (edge.id() as string) || ''
      if (id.startsWith('pending__')) {
        live.current.onDropPending(edge.data('source'), id.split('__')[1] as RelationshipField)
        return
      }
      const type = edge.data('edge_type')
      if (type) live.current.onRemoveEdge(edge.data('source'), type === 'manager' ? 'ManagerId' : 'DelegatedApproverId')
    })
    return () => {
      cy.destroy()
      cyRef.current = null
      ehRef.current = null
    }
  }, [])

  // Theme-aware styles.
  useEffect(() => {
    const cy = cyRef.current
    if (!cy) return
    const dark = theme === 'dark'
    cy.style([
      {
        selector: 'node',
        style: {
          shape: 'round-rectangle',
          width: NODE_W,
          height: NODE_H,
          'background-color': 'data(fill)',
          label: 'data(label)',
          color: 'data(text)',
          'font-size': 10,
          'font-family': 'Inter, system-ui, sans-serif',
          'text-wrap': 'wrap',
          'text-max-width': `${NODE_W - 14}px`,
          'text-valign': 'center',
          'text-halign': 'center',
          'line-height': 1.35,
          'border-width': 0,
          'overlay-opacity': 0,
        } as any,
      },
      { selector: 'node.inactive', style: { 'background-color': dark ? '#3f4a45' : '#d1d5db', color: dark ? '#e5e7eb' : '#374151', 'border-width': 2, 'border-style': 'dashed', 'border-color': dark ? '#9ca3af' : '#6b7280' } },
      { selector: 'node.flagged', style: { 'border-width': 3, 'border-color': '#f59e0b', 'border-style': 'solid' } },
      { selector: 'node.inactive.flagged', style: { 'border-style': 'dashed' } },
      { selector: 'node.context', style: { opacity: 0.45 } },
      { selector: 'node.picked', style: { 'border-width': 3, 'border-color': '#c26b47', 'border-style': 'solid' } },
      {
        selector: 'node.group',
        style: { 'background-opacity': 0, 'border-width': 1.5, 'border-style': 'dashed', 'border-color': dark ? '#9ca3af' : '#6b7280', color: dark ? '#e5e7eb' : '#374151' },
      },
      {
        selector: 'edge',
        style: {
          width: 1.5,
          'curve-style': 'bezier',
          'target-arrow-shape': 'triangle',
          'arrow-scale': 0.8,
          opacity: 0.85,
          label: 'data(label)',
          'font-size': 8,
          color: dark ? '#d1d5db' : '#4b5563',
          'text-background-color': dark ? '#0c1a14' : '#ffffff',
          'text-background-opacity': 0.85,
          'text-background-padding': '2px',
          'overlay-opacity': 0,
        } as any,
      },
      { selector: '.edge-manager', style: { 'line-color': dark ? '#6bbf95' : '#2e8064', 'target-arrow-color': dark ? '#6bbf95' : '#2e8064' } },
      { selector: '.edge-delegated', style: { 'line-color': '#c26b47', 'target-arrow-color': '#c26b47', 'line-style': 'dashed' } },
      { selector: '.pending-add-manager', style: { 'line-color': '#22c55e', 'target-arrow-color': '#22c55e', width: 3 } },
      { selector: '.pending-add-delegated', style: { 'line-color': '#22c55e', 'target-arrow-color': '#22c55e', 'line-style': 'dashed', width: 3 } },
      { selector: '.pending-remove', style: { 'line-color': '#ef4444', 'target-arrow-color': '#ef4444', opacity: 0.4 } },
      { selector: '.eh-handle', style: { 'background-color': '#22c55e', width: 12, height: 12, shape: 'ellipse', 'border-width': 2, 'border-color': '#fff' } },
    ] as any)
  }, [theme])

  // Sync the drawn elements; lay the tree out again only when the people change.
  useEffect(() => {
    const cy = cyRef.current
    if (!cy) return
    const wanted = new Map(elements.map((e) => [e.data.id as string, e]))
    cy.batch(() => {
      cy.elements().forEach((el) => {
        if (!wanted.has(el.id())) el.remove()
      })
      for (const e of elements) {
        const el = cy.getElementById(e.data.id as string)
        if (el.nonempty()) {
          el.data(e.data)
          el.classes(e.classes as string)
        } else if (!e.data.source || (cy.getElementById(e.data.source).nonempty() && cy.getElementById(e.data.target as string).nonempty())) {
          cy.add({ group: e.data.source ? 'edges' : 'nodes', ...e } as ElementDefinition)
        }
      }
      // Edges whose ends arrived in this pass.
      for (const e of elements) {
        if (!e.data.source || cy.getElementById(e.data.id as string).nonempty()) continue
        cy.add({ group: 'edges', ...e } as ElementDefinition)
      }
    })
    const nodeSet = cy.nodes().map((n) => n.id()).sort().join('|')
    if (nodeSet !== lastNodeSet.current) {
      lastNodeSet.current = nodeSet
      const drawn = new Set(cy.nodes().map((n) => n.id()))
      const kids = (id: string) => (people.reports.get(id) ?? []).filter((k) => drawn.has(k))
      const tops = [...drawn].filter((id) => id === ISOLATED_ID || !drawn.has(people.managerOf.get(id) ?? ''))
      tops.sort((a, b) => (a === ISOLATED_ID ? 1 : b === ISOLATED_ID ? -1 : (people.total.get(b) ?? 0) - (people.total.get(a) ?? 0)))
      // Wrap the top level to what fits the canvas at a readable zoom.
      const pos = treeLayout(tops, kids, Math.max(NODE_W * 2, cy.width() / MIN_READABLE_ZOOM - 80), [...drawn].sort())
      cy.layout({ name: 'preset', positions: (n: any) => pos[n.id()] ?? { x: 0, y: 0 }, fit: true, padding: 40, animate: false } as any).run()
      // A wide tree fits only at a zoom too small to read: stay readable and start at the top.
      if (cy.zoom() < MIN_READABLE_ZOOM) {
        const bb = cy.elements().boundingBox()
        cy.zoom(MIN_READABLE_ZOOM)
        cy.pan({ x: cy.width() / 2 - ((bb.x1 + bb.x2) / 2) * MIN_READABLE_ZOOM, y: 32 - bb.y1 * MIN_READABLE_ZOOM })
      }
    }
  }, [elements, people])

  // Move or draw.
  useEffect(() => {
    const cy = cyRef.current
    const eh = ehRef.current
    if (!cy || !eh) return
    if (tool === 'draw') {
      try { eh.enableDrawMode() } catch { /* idempotent */ }
      cy.nodes().ungrabify()
      if (containerRef.current) containerRef.current.style.cursor = 'crosshair'
    } else {
      try { eh.disableDrawMode() } catch { /* idempotent */ }
      cy.nodes().grabify()
      if (containerRef.current) containerRef.current.style.cursor = ''
    }
  }, [tool, elements])

  // Keep the picked person in view.
  useEffect(() => {
    const cy = cyRef.current
    if (!cy || !selectedId) return
    const n = cy.getElementById(selectedId)
    if (n.nonempty() && !n.renderedBoundingBox().w) cy.center(n)
  }, [selectedId])

  return (
    <div
      ref={containerRef}
      data-testid="people-graph"
      className="h-full w-full bg-grove-canvas dark:bg-grove-canvas-dk"
      style={{ minHeight: '650px' }}
    />
  )
}
