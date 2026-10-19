'use client'

/**
 * Role design, Graph mode (roadmap 35b): the draft's hierarchy on a canvas,
 * edited the way the People graph edits managers. Drag roles to place
 * them; in Draw mode, drag from a role to its new parent (a role has one
 * parent, so replacing one asks first; loops are refused); right-click a
 * parent edge to make the role top level; drop a user from the side panel
 * onto a role. Auto-layout (top-down), zoom, fit and search. Every edit
 * goes through the same operations as Tree mode, so undo, redo, the impact
 * preview and the export don't change.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import cytoscape, { Core, ElementDefinition } from 'cytoscape'
// @ts-expect-error — cytoscape-edgehandles has no bundled types
import edgehandles from 'cytoscape-edgehandles'
import { LayoutGrid, Maximize2, Minus, MousePointer, Pencil, Plus, Search } from 'lucide-react'
import { useGraphTheme } from '@/components/graph/useGraphTheme'
import { type DesignDiff, type DesignState, type Operation, planReparent, roleLayout } from '@/lib/roleDesign'

if (typeof window !== 'undefined') {
  try {
    cytoscape.use(edgehandles)
  } catch {
    /* already registered */
  }
}

export const DRAG_USER = 'application/x-newton-user'
const MUTED = 'text-grove-ink/60 dark:text-grove-ink-dk/60'
const BTN =
  'inline-flex items-center gap-1.5 rounded-md border border-grove-border bg-grove-surface px-2.5 py-1.5 text-xs font-medium hover:bg-primary-50/40 disabled:opacity-50 dark:border-grove-border-dk dark:bg-grove-surface-dk dark:hover:bg-primary-900/15'

type Confirm = { message: string; op: Operation } | null

export function RoleGraph({
  state,
  changes,
  usersIn,
  showUsers,
  selected,
  onSelect,
  apply,
  onError,
}: {
  state: DesignState
  changes: DesignDiff
  usersIn: Record<string, string[]>
  showUsers: boolean
  selected: string | null
  onSelect: (id: string | null) => void
  /** Applies an operation through the designer (validated, undoable); false when refused. */
  apply: (op: Operation) => boolean
  onError: (message: string) => void
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const cyRef = useRef<Core | null>(null)
  const ehRef = useRef<any>(null)
  const theme = useGraphTheme()
  const [tool, setTool] = useState<'move' | 'draw'>('move')
  const [confirm, setConfirm] = useState<Confirm>(null)
  const [query, setQuery] = useState('')
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  // Where each role sits; kept across edits so a change doesn't scatter the canvas.
  const positions = useRef<Record<string, { x: number; y: number }>>({})
  // A new canvas fits the hierarchy to the screen once it's drawn.
  const needsFit = useRef(true)
  const live = useRef({ state, apply, onSelect, onError })
  live.current = { state, apply, onSelect, onError }

  const elements = useMemo<ElementDefinition[]>(() => {
    const out: ElementDefinition[] = []
    const moved = new Set(changes.reparented.map((x) => x.id))
    const renamed = new Set(changes.renamed.map((x) => x.id))
    for (const r of Object.values(state.roles)) {
      const n = usersIn[r.id]?.length ?? 0
      const tag = r.isNew ? 'NEW' : moved.has(r.id) || renamed.has(r.id) ? 'CHANGED' : ''
      const label = [r.name.length > 28 ? `${r.name.slice(0, 27)}…` : r.name, showUsers ? `${n} ${n === 1 ? 'user' : 'users'}` : null, tag || null]
        .filter(Boolean).join('\n')
      out.push({
        data: { id: r.id, label },
        classes: [r.isNew ? 'new' : tag ? 'changed' : '', r.id === selected ? 'picked' : '', r.id === dropTarget ? 'drop' : ''].filter(Boolean).join(' '),
      })
    }
    for (const r of Object.values(state.roles)) {
      if (r.parent_id && state.roles[r.parent_id]) {
        // The id names both ends: Cytoscape can't move an edge, so a new parent is a new edge.
        out.push({ data: { id: `parent__${r.id}__${r.parent_id}`, source: r.id, target: r.parent_id }, classes: moved.has(r.id) ? 'moved' : '' })
      }
    }
    return out
  }, [state, changes, usersIn, showUsers, selected, dropTarget])

  useEffect(() => {
    if (!containerRef.current) return
    const cy = cytoscape({ container: containerRef.current, elements: [], minZoom: 0.15, maxZoom: 2.5, boxSelectionEnabled: false })
    cyRef.current = cy
    needsFit.current = true
    if (process.env.NODE_ENV !== 'production') (window as any).__roleGraph = cy
    const eh = (cy as any).edgehandles({ preview: false, hoverDelay: 120, snap: true, noEdgeEventsInDraw: false, handleNodes: 'node', edgeType: () => 'flat' })
    ehRef.current = eh
    cy.on('ehcomplete', (_e: any, source: any, target: any, added: any) => {
      added.remove()
      const plan = planReparent(live.current.state, source.id(), target.id())
      if (plan.kind === 'blocked') live.current.onError(plan.message)
      else if (plan.kind === 'confirm') setConfirm({ message: plan.message, op: plan.op })
      else if (plan.kind === 'apply') live.current.apply(plan.op)
    })
    cy.on('tap', 'node', (evt) => live.current.onSelect(evt.target.id()))
    cy.on('tap', (evt) => {
      if (evt.target === cy) live.current.onSelect(null)
    })
    // Right-click a parent edge: make the role top level (after a confirmation).
    cy.on('cxttap', 'edge', (evt) => {
      const child = evt.target.data('source')
      const r = live.current.state.roles[child]
      const parent = r?.parent_id ? live.current.state.roles[r.parent_id] : null
      if (r && parent) setConfirm({ message: `Make ${r.name} a top-level role? It reports to ${parent.name} now.`, op: { op: 'move_role', role_id: child, parent_id: null } })
    })
    cy.on('dragfree', 'node', (evt) => {
      positions.current[evt.target.id()] = { ...evt.target.position() }
    })
    return () => {
      cy.destroy()
      cyRef.current = null
      ehRef.current = null
    }
  }, [])

  useEffect(() => {
    const cy = cyRef.current
    if (!cy) return
    const dark = theme === 'dark'
    cy.style([
      {
        selector: 'node',
        style: {
          shape: 'round-rectangle', width: 176, height: 54, 'background-color': dark ? '#16302a' : '#fffdf7',
          'border-width': 1.5, 'border-color': dark ? '#6bbf95' : '#146b4a', label: 'data(label)', color: dark ? '#eee8d3' : '#16221a',
          'font-size': 10, 'font-family': 'Inter, system-ui, sans-serif', 'text-wrap': 'wrap', 'text-max-width': '160px',
          'text-valign': 'center', 'text-halign': 'center', 'overlay-opacity': 0,
        } as any,
      },
      { selector: 'node.new', style: { 'border-color': '#059669', 'border-width': 2.5, 'border-style': 'dashed' } },
      { selector: 'node.changed', style: { 'border-color': '#0284c7', 'border-width': 2.5 } },
      { selector: 'node.picked', style: { 'border-color': '#c26b47', 'border-width': 3 } },
      { selector: 'node.drop', style: { 'border-color': '#c26b47', 'border-width': 4, 'background-color': dark ? '#3a2a20' : '#fdf0e8' } },
      { selector: 'node.dim', style: { opacity: 0.3 } },
      {
        selector: 'edge',
        style: { width: 1.5, 'curve-style': 'bezier', 'target-arrow-shape': 'triangle', 'arrow-scale': 0.8,
          'line-color': dark ? '#6bbf95' : '#2e8064', 'target-arrow-color': dark ? '#6bbf95' : '#2e8064', 'overlay-opacity': 0 } as any,
      },
      { selector: 'edge.moved', style: { 'line-color': '#0284c7', 'target-arrow-color': '#0284c7', width: 2.5 } },
      { selector: '.eh-handle', style: { 'background-color': '#22c55e', width: 12, height: 12, shape: 'ellipse', 'border-width': 2, 'border-color': '#fff' } },
    ] as any)
  }, [theme])

  // Sync elements; place new roles below their parent and keep everything else where it was.
  useEffect(() => {
    const cy = cyRef.current
    if (!cy) return
    const wanted = new Set(elements.map((e) => e.data.id as string))
    const fresh = Object.keys(positions.current).length === 0
    const layout = fresh ? roleLayout(state) : null
    cy.batch(() => {
      cy.elements().forEach((el) => {
        if (!wanted.has(el.id())) el.remove()
      })
      for (const e of elements) {
        const id = e.data.id as string
        const el = cy.getElementById(id)
        if (el.nonempty()) {
          el.data(e.data)
          el.classes(e.classes as string)
          continue
        }
        if (e.data.source) continue
        let pos = layout?.[id] ?? positions.current[id]
        if (!pos) {
          const parent = state.roles[id]?.parent_id
          const p = parent ? positions.current[parent] ?? cy.getElementById(parent).position() : null
          const siblings = parent ? Object.values(state.roles).filter((r) => r.parent_id === parent).length : 1
          pos = p ? { x: p.x + (siblings - 1) * 40, y: p.y + 104 } : { x: 0, y: 0 }
        }
        positions.current[id] = pos
        cy.add({ group: 'nodes', ...e, position: { ...pos } } as ElementDefinition)
      }
      for (const e of elements) {
        if (!e.data.source || cy.getElementById(e.data.id as string).nonempty()) continue
        cy.add({ group: 'edges', ...e } as ElementDefinition)
      }
    })
    if (needsFit.current && cy.nodes().nonempty()) {
      needsFit.current = false
      cy.fit(undefined, 40)
      if (cy.zoom() > 1.2) cy.zoom({ level: 1.2, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } })
      // A big hierarchy fits only at a zoom too small to read: start readable, at the top.
      if (cy.zoom() < 0.75) {
        const bb = cy.nodes().boundingBox()
        cy.zoom(0.75)
        cy.pan({ x: cy.width() / 2 - ((bb.x1 + bb.x2) / 2) * 0.75, y: 30 - bb.y1 * 0.75 })
      }
    }
  }, [elements, state])

  useEffect(() => {
    const cy = cyRef.current
    const eh = ehRef.current
    if (!cy || !eh) return
    if (tool === 'draw') {
      try { eh.enableDrawMode() } catch { /* idempotent */ }
      cy.nodes().ungrabify()
    } else {
      try { eh.disableDrawMode() } catch { /* idempotent */ }
      cy.nodes().grabify()
    }
    if (containerRef.current) containerRef.current.style.cursor = tool === 'draw' ? 'crosshair' : ''
  }, [tool, elements])

  // Search: dim everything but the matches.
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? Object.values(state.roles).filter((r) => r.name.toLowerCase().includes(q)).sort((a, b) => a.name.localeCompare(b.name)) : []
  }, [query, state.roles])
  useEffect(() => {
    const cy = cyRef.current
    if (!cy) return
    const keep = new Set(matches.map((m) => m.id))
    cy.nodes().forEach((n) => {
      n.toggleClass('dim', keep.size > 0 && !keep.has(n.id()))
    })
  }, [matches, elements])

  const autoLayout = () => {
    const cy = cyRef.current
    if (!cy) return
    const pos = roleLayout(state)
    positions.current = { ...pos }
    cy.layout({ name: 'preset', positions: (n: any) => pos[n.id()] ?? n.position(), fit: true, padding: 40, animate: true, animationDuration: 250 } as any).run()
  }
  const zoom = (f: number) => {
    const cy = cyRef.current
    if (!cy) return
    cy.zoom({ level: Math.max(cy.minZoom(), Math.min(cy.maxZoom(), cy.zoom() * f)), renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } })
  }
  const fit = () => cyRef.current?.fit(undefined, 40)
  const goTo = (id: string) => {
    const cy = cyRef.current
    onSelect(id)
    setQuery('')
    if (cy) cy.animate({ center: { eles: cy.getElementById(id) }, zoom: Math.max(cy.zoom(), 1) } as any, { duration: 250 })
  }

  // Users dropped from the side panel onto a role.
  const roleAt = (e: React.DragEvent): string | null => {
    const cy = cyRef.current
    const box = containerRef.current?.getBoundingClientRect()
    if (!cy || !box) return null
    const x = e.clientX - box.left
    const y = e.clientY - box.top
    const hit = cy.nodes().filter((n) => {
      const b = n.renderedBoundingBox()
      return x >= b.x1 && x <= b.x2 && y >= b.y1 && y <= b.y2
    })
    return hit.nonempty() ? hit.first().id() : null
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="Graph tool" className="flex items-center gap-1 rounded-md border border-grove-border bg-grove-surface p-0.5 dark:border-grove-border-dk dark:bg-grove-surface-dk">
          <button type="button" role="tab" aria-selected={tool === 'move'} onClick={() => setTool('move')}
            className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium ${tool === 'move' ? 'bg-primary-700 text-grove-canvas' : ''}`}>
            <MousePointer className="h-3 w-3" /> Move
          </button>
          <button type="button" role="tab" aria-selected={tool === 'draw'} onClick={() => setTool('draw')}
            className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium ${tool === 'draw' ? 'bg-green-600 text-white' : ''}`}>
            <Pencil className="h-3 w-3" /> Draw parent
          </button>
        </div>
        <button type="button" className={BTN} onClick={autoLayout}><LayoutGrid className="h-3.5 w-3.5" /> Auto-layout</button>
        <button type="button" className={BTN} onClick={() => zoom(1.25)} aria-label="Zoom in"><Plus className="h-3.5 w-3.5" /></button>
        <button type="button" className={BTN} onClick={() => zoom(0.8)} aria-label="Zoom out"><Minus className="h-3.5 w-3.5" /></button>
        <button type="button" className={BTN} onClick={fit}><Maximize2 className="h-3.5 w-3.5" /> Fit</button>
        <div className="relative ml-auto">
          <Search className={`absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 ${MUTED}`} aria-hidden />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a role" aria-label="Find a role"
            className="w-48 rounded-md border border-grove-border bg-grove-surface py-1.5 pl-7 pr-2 text-xs dark:border-grove-border-dk dark:bg-grove-surface-dk" />
          {matches.length > 0 && (
            <ul className="absolute right-0 z-20 mt-1 max-h-60 w-60 overflow-auto rounded-md border border-grove-border bg-grove-surface p-1 shadow-grove-lift dark:border-grove-border-dk dark:bg-grove-surface-dk">
              {matches.slice(0, 12).map((r) => (
                <li key={r.id}>
                  <button type="button" onClick={() => goTo(r.id)} className="w-full truncate rounded px-2 py-1 text-left text-sm hover:bg-primary-50 dark:hover:bg-primary-900/20">{r.name}</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {confirm && (
        <div role="alertdialog" aria-label="Confirm change" className="flex flex-wrap items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-100">
          <span className="flex-1">{confirm.message}</span>
          <button type="button" className="rounded bg-amber-700 px-2.5 py-1 text-xs font-medium text-white hover:bg-amber-800"
            onClick={() => { apply(confirm.op); setConfirm(null) }}>
            {confirm.op.op === 'move_role' && confirm.op.parent_id === null ? 'Make top level' : 'Replace parent'}
          </button>
          <button type="button" className="rounded border border-amber-400 px-2.5 py-1 text-xs" onClick={() => setConfirm(null)}>Cancel</button>
        </div>
      )}

      <div
        ref={containerRef}
        data-testid="role-graph"
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes(DRAG_USER)) return
          e.preventDefault()
          setDropTarget(roleAt(e))
        }}
        onDragLeave={() => setDropTarget(null)}
        onDrop={(e) => {
          const user = e.dataTransfer.getData(DRAG_USER)
          const role = roleAt(e)
          setDropTarget(null)
          if (!user) return
          e.preventDefault()
          if (!role) return onError('Drop the user onto a role.')
          if (state.users[user] !== role) apply({ op: 'move_user', user_id: user, role_id: role })
        }}
        className="h-[560px] w-full rounded-lg border border-grove-border bg-grove-canvas dark:border-grove-border-dk dark:bg-grove-canvas-dk"
      />
      <p className={`text-[11px] ${MUTED}`}>
        Move: drag roles to place them. Draw parent: drag from a role to the role it should report to (one parent each;
        replacing a parent asks first). Right-click a parent line to make a role top level. Drag a user from the panel onto a
        role to move them. Several top-level roles are fine.
      </p>
    </div>
  )
}
