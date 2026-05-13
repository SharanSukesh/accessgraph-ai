'use client'

/**
 * Reporting Graph editor.
 *
 * Drag-and-drop canvas (Cytoscape + edgehandles) for admins to construct
 * the org's reporting hierarchy. Two edge types: manager and delegated-
 * approver. Saving the diff PATCHes the corresponding Salesforce User
 * records via the backend's /reporting-graph/apply endpoint, which gates
 * the write on OrgUserRole.ORG_ADMIN.
 *
 * Pending edits live entirely client-side until the admin clicks Save —
 * gives them a chance to review the full diff before committing.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import {
  AlertCircle,
  GitBranch,
  Search,
  Save,
  X as XIcon,
  Plus,
  Trash2,
  MousePointer,
  Pencil,
} from 'lucide-react'
import cytoscape, { Core, ElementDefinition } from 'cytoscape'
// @ts-expect-error — cytoscape-edgehandles has no bundled types
import edgehandles from 'cytoscape-edgehandles'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/shared/Card'
import { Button } from '@/components/shared/Button'
import { Badge } from '@/components/shared/Badge'
import { ErrorState } from '@/components/shared/ErrorState'
import { TableSkeleton } from '@/components/shared/LoadingSkeleton'
import {
  useReportingGraph,
  useApplyReportingGraphEdits,
  type ReportingGraphEdge,
  type RelationshipEdit,
  type RelationshipField,
} from '@/lib/api/hooks/useReportingGraph'

// Register edgehandles plugin once at module load
if (typeof window !== 'undefined') {
  try {
    cytoscape.use(edgehandles)
  } catch {
    /* already registered — fine */
  }
}

type PendingEdit = RelationshipEdit & {
  kind: 'add' | 'remove' | 'update'
  // For UI display
  source_name?: string
  target_name?: string
}

export default function ReportingGraphPage() {
  const params = useParams()
  const orgId = params.orgId as string

  const { data: graph, isLoading, error } = useReportingGraph(orgId)
  const apply = useApplyReportingGraphEdits(orgId)

  const cyRef = useRef<Core | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [search, setSearch] = useState('')
  const [edgeMode, setEdgeMode] = useState<RelationshipField>('ManagerId')
  // The Cytoscape 'ehcomplete' listener captures values at canvas-build time,
  // so a useState alone would be stale when the user toggles modes after the
  // canvas mounts. The ref is the source of truth read inside the listener.
  const edgeModeRef = useRef<RelationshipField>('ManagerId')
  useEffect(() => {
    edgeModeRef.current = edgeMode
  }, [edgeMode])
  const [pending, setPending] = useState<PendingEdit[]>([])
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  // Canvas tool state. Move = node drag works for repositioning; Draw =
  // node drag creates a new edge. Mutually exclusive because the same
  // drag gesture can't do both.
  const [tool, setTool] = useState<'move' | 'draw'>('move')
  // Stash the edgehandles instance + on/off so the toolbar button can
  // flip modes without re-mounting Cytoscape.
  const ehRef = useRef<any>(null)

  // --- Build the Cytoscape graph from the API response ---
  const elements = useMemo<ElementDefinition[]>(() => {
    if (!graph) return []
    const out: ElementDefinition[] = []
    for (const n of graph.nodes) {
      out.push({
        data: {
          id: n.user_sf_id,
          label: n.name,
          department: n.department || '',
        },
      })
    }
    for (const e of graph.edges) {
      out.push({
        data: {
          id: `${e.source}__${e.edge_type}__${e.target}`,
          source: e.source,
          target: e.target,
          edge_type: e.edge_type,
          // Direction label so it's obvious who manages whom at a glance.
          // Arrow + label both point from junior (source) → senior (target).
          label:
            e.edge_type === 'manager'
              ? '→ manager'
              : '→ delegated',
        },
        classes: e.edge_type === 'manager' ? 'edge-manager' : 'edge-delegated',
      })
    }
    return out
  }, [graph])

  // --- Initialize Cytoscape once + each time elements change ---
  useEffect(() => {
    if (!containerRef.current || !graph) return
    const cy = cytoscape({
      container: containerRef.current,
      elements,
      // Nodes must remain user-grabbable so admins can reposition the
      // org chart. Pan/zoom enabled. Layout runs once to seed positions;
      // afterwards positions are sticky.
      autoungrabify: false,
      autounselectify: false,
      userPanningEnabled: true,
      userZoomingEnabled: true,
      boxSelectionEnabled: false,
      layout: {
        name: 'cose',
        animate: false,
        fit: true,
        nodeRepulsion: 12000,
        idealEdgeLength: 90,
        edgeElasticity: 100,
      } as any,
      style: [
        {
          selector: 'node',
          style: {
            'background-color': '#6366f1',
            label: 'data(label)',
            color: '#fff',
            'font-size': 10,
            'text-valign': 'center',
            'text-halign': 'center',
            'text-outline-color': '#312e81',
            'text-outline-width': 1.5,
            width: 36,
            height: 36,
          },
        },
        {
          selector: 'node:selected',
          style: {
            'background-color': '#facc15',
            'text-outline-color': '#854d0e',
          },
        },
        {
          selector: 'edge',
          style: {
            width: 2,
            'curve-style': 'bezier',
            'target-arrow-shape': 'triangle',
            'arrow-scale': 1.4,
            opacity: 0.85,
            label: 'data(label)',
            'font-size': 8,
            color: '#6b7280',
            'text-background-color': '#fff',
            'text-background-opacity': 0.85,
            'text-background-padding': '2px',
          },
        },
        {
          selector: '.edge-manager',
          style: {
            'line-color': '#6366f1',
            'target-arrow-color': '#6366f1',
          },
        },
        {
          selector: '.edge-delegated',
          style: {
            'line-color': '#0ea5e9',
            'target-arrow-color': '#0ea5e9',
            'line-style': 'dashed',
          },
        },
        {
          selector: '.pending-add-manager',
          style: {
            'line-color': '#22c55e',
            'target-arrow-color': '#22c55e',
            width: 3,
          },
        },
        {
          selector: '.pending-add-delegated',
          style: {
            'line-color': '#22c55e',
            'target-arrow-color': '#22c55e',
            'line-style': 'dashed',
            width: 3,
          },
        },
        {
          selector: '.pending-remove',
          style: {
            'line-color': '#ef4444',
            'target-arrow-color': '#ef4444',
            opacity: 0.4,
          },
        },
        {
          selector: '.eh-handle',
          style: {
            'background-color': '#22c55e',
            width: 12,
            height: 12,
            shape: 'ellipse',
            'overlay-opacity': 0,
            'border-width': 2,
            'border-color': '#fff',
          },
        },
      ],
    })
    cyRef.current = cy

    // Initialize edgehandles. In v4 of the plugin, "draw mode" means every
    // node-drag creates an edge — which conflicts with node-drag-to-move.
    // We expose a toolbar toggle ("Move" vs "Draw") to switch between
    // them. enableDrawMode() / disableDrawMode() is driven by a separate
    // useEffect that reacts to the `tool` state below.
    const eh = (cy as any).edgehandles({
      preview: false,
      hoverDelay: 120,
      snap: true,
      noEdgeEventsInDraw: false,
      handleNodes: 'node',
      edgeType: () => 'flat',
    })
    ehRef.current = eh

    cy.on('ehcomplete', (_evt: any, sourceNode: any, targetNode: any, addedEdge: any) => {
      const src = sourceNode.id()
      const tgt = targetNode.id()
      if (!src || !tgt || src === tgt) {
        addedEdge.remove()
        return
      }
      // Read the current edge mode from the ref, not the closure — the
      // useState value would be stale because this listener was bound at
      // canvas-build time.
      const field: RelationshipField = edgeModeRef.current
      const sourceName = sourceNode.data('label')
      const targetName = targetNode.data('label')
      const edgeClass =
        field === 'ManagerId'
          ? 'pending-add-manager'
          : 'pending-add-delegated'
      const edgeLabel =
        field === 'ManagerId'
          ? `→ manager (pending)`
          : `→ delegated (pending)`
      // Replace the auto-created edge with a styled pending edge
      addedEdge.remove()
      cy.add({
        group: 'edges',
        data: {
          id: `pending__${field}__${src}__${tgt}`,
          source: src,
          target: tgt,
          label: edgeLabel,
        },
        classes: edgeClass,
      })
      setPending(prev => [
        ...prev.filter(p =>
          !(p.user_sf_id === src && p.field === field),
        ),
        {
          user_sf_id: src,
          field,
          new_value: tgt,
          kind: 'add',
          source_name: sourceName,
          target_name: targetName,
        },
      ])
    })

    cy.on('tap', 'node', evt => {
      setSelectedNodeId(evt.target.id())
    })
    cy.on('tap', evt => {
      if (evt.target === cy) setSelectedNodeId(null)
    })
    // Right-click an edge → mark for removal (or drop a pending add)
    cy.on('cxttap', 'edge', evt => {
      const edge = evt.target
      const edgeId = (edge.data('id') as string) || ''
      // pending-add edges have IDs like "pending__ManagerId__sf1__sf2"
      if (edgeId.startsWith('pending__')) {
        const parts = edgeId.split('__')
        const field = (parts[1] as RelationshipField) || 'ManagerId'
        const src = edge.data('source')
        setPending(prev => prev.filter(p => !(p.user_sf_id === src && p.field === field)))
        edge.remove()
        return
      }
      const edgeType = edge.data('edge_type') as 'manager' | 'delegated_approver' | undefined
      if (!edgeType) return
      const field: RelationshipField =
        edgeType === 'manager' ? 'ManagerId' : 'DelegatedApproverId'
      edge.addClass('pending-remove')
      setPending(prev => [
        ...prev.filter(p =>
          !(p.user_sf_id === edge.data('source') && p.field === field),
        ),
        {
          user_sf_id: edge.data('source'),
          field,
          new_value: null,
          kind: 'remove',
          source_name: edge.source().data('label'),
          target_name: edge.target().data('label'),
        },
      ])
    })

    return () => {
      cy.destroy()
      cyRef.current = null
      ehRef.current = null
    }
    // edgeMode intentionally NOT in deps — the listener captures the
    // closure value at edge-creation time via the ref-less approach above
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elements, graph])

  // Sync the Cytoscape edge-handle draw mode with the toolbar `tool`.
  // Also force the cursor + node grabbability to match so the canvas
  // feels right in each mode.
  useEffect(() => {
    const cy = cyRef.current
    const eh = ehRef.current
    if (!cy || !eh) return
    if (tool === 'draw') {
      try {
        eh.enableDrawMode()
      } catch {
        /* idempotent on the plugin's side */
      }
      cy.nodes().ungrabify()
      if (containerRef.current) {
        containerRef.current.style.cursor = 'crosshair'
      }
    } else {
      try {
        eh.disableDrawMode()
      } catch {
        /* idempotent */
      }
      cy.nodes().grabify()
      if (containerRef.current) {
        containerRef.current.style.cursor = ''
      }
    }
  }, [tool])

  // --- Filter the user list in the left panel ---
  const filteredNodes = useMemo(() => {
    if (!graph) return []
    const q = search.trim().toLowerCase()
    return graph.nodes
      .filter(n =>
        !q ||
        n.name.toLowerCase().includes(q) ||
        (n.department || '').toLowerCase().includes(q),
      )
      .slice(0, 30)
  }, [graph, search])

  const selectedNode = useMemo(() => {
    if (!graph || !selectedNodeId) return null
    return graph.nodes.find(n => n.user_sf_id === selectedNodeId) || null
  }, [graph, selectedNodeId])

  const handleRevert = (edit: PendingEdit) => {
    setPending(prev =>
      prev.filter(p => !(p.user_sf_id === edit.user_sf_id && p.field === edit.field)),
    )
    // Refresh Cytoscape so the canvas re-renders without the pending edge
    if (graph && cyRef.current) {
      cyRef.current.elements().remove()
      cyRef.current.add(elements)
      cyRef.current.layout({ name: 'cose', animate: false, fit: true } as any).run()
    }
  }

  const handleSave = async () => {
    setConfirmOpen(false)
    const edits: RelationshipEdit[] = pending.map(p => ({
      user_sf_id: p.user_sf_id,
      field: p.field,
      new_value: p.new_value,
    }))
    const result = await apply.mutateAsync(edits)
    // Drop succeeded edits from pending; keep failures so the admin sees them
    const failed = new Set(
      result.results
        .filter(r => !r.success)
        .map(r => `${r.user_sf_id}::${r.field}`),
    )
    setPending(prev =>
      prev.filter(p => failed.has(`${p.user_sf_id}::${p.field}`)),
    )
  }

  if (error) {
    return <ErrorState message="Failed to load reporting graph" />
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-indigo-100 dark:bg-indigo-900/40">
            <GitBranch className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Reporting Graph
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Drag from a user to another to set their manager or delegated
              approver. Save writes back to Salesforce User records.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={pending.length > 0 ? 'info' : 'default'} size="sm">
            {pending.length} pending {pending.length === 1 ? 'edit' : 'edits'}
          </Badge>
          <Button
            variant="primary"
            size="md"
            disabled={pending.length === 0 || apply.isPending}
            onClick={() => setConfirmOpen(true)}
          >
            <Save className="h-4 w-4 mr-2" />
            {apply.isPending ? 'Saving…' : `Save changes (${pending.length})`}
          </Button>
        </div>
      </div>

      {/* Tool + edge-mode toolbar. Two independent groups: which CANVAS
          TOOL is active (move vs draw) and, when drawing, which EDGE TYPE
          gets created. Putting both in one row keeps the controls close
          to the canvas so the active mode is hard to miss. */}
      <div className="flex items-center gap-3 text-sm flex-wrap p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700">
        {/* Canvas tool toggle */}
        <div className="flex items-center gap-1 bg-white dark:bg-gray-900 rounded-md border border-gray-200 dark:border-gray-700 p-0.5">
          <button
            onClick={() => setTool('move')}
            className={`px-3 py-1.5 rounded text-xs font-medium transition flex items-center gap-1.5 ${
              tool === 'move'
                ? 'bg-indigo-600 text-white shadow'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
            title="Drag node bodies to reposition them"
          >
            <MousePointer className="h-3 w-3" />
            Move
          </button>
          <button
            onClick={() => setTool('draw')}
            className={`px-3 py-1.5 rounded text-xs font-medium transition flex items-center gap-1.5 ${
              tool === 'draw'
                ? 'bg-green-600 text-white shadow'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
            title="Drag from one node to another to create an edge"
          >
            <Pencil className="h-3 w-3" />
            Draw edges
          </button>
        </div>

        {/* Edge type — only meaningful when drawing */}
        <div
          className={`flex items-center gap-2 transition ${
            tool === 'draw' ? 'opacity-100' : 'opacity-40 pointer-events-none'
          }`}
        >
          <span className="text-gray-600 dark:text-gray-400 text-xs">Edge type:</span>
          <button
            onClick={() => setEdgeMode('ManagerId')}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${
              edgeMode === 'ManagerId'
                ? 'bg-indigo-600 text-white shadow'
                : 'bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
          >
            Manager (solid)
          </button>
          <button
            onClick={() => setEdgeMode('DelegatedApproverId')}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${
              edgeMode === 'DelegatedApproverId'
                ? 'bg-sky-600 text-white shadow'
                : 'bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
          >
            Delegated approver (dashed)
          </button>
        </div>

        <div className="ml-auto text-xs text-gray-500 max-w-md text-right">
          {tool === 'move' ? (
            <>
              <strong>Move mode</strong>: click+drag a node to reposition.
              Switch to <strong>Draw</strong> to create edges.
            </>
          ) : (
            <>
              <strong>Draw mode</strong>: drag from a{' '}
              <strong>subordinate</strong> to their{' '}
              <strong>
                {edgeMode === 'ManagerId' ? 'manager' : 'delegated approver'}
              </strong>
              . Arrow points to the senior. Right-click an edge to remove it.
            </>
          )}
        </div>
      </div>

      {/* Three-column layout */}
      <div className="grid grid-cols-12 gap-4" style={{ height: '650px' }}>
        {/* Left: user filter / list */}
        <Card variant="bordered" className="col-span-3 overflow-hidden flex flex-col">
          <CardHeader>
            <CardTitle>Users ({graph?.nodes.length ?? 0})</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto p-0">
            <div className="p-3 sticky top-0 bg-white dark:bg-gray-900 z-10 border-b border-gray-200 dark:border-gray-800">
              <div className="relative">
                <Search className="absolute left-2.5 top-2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search users or departments…"
                  className="w-full pl-8 pr-2 py-1.5 text-sm rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800"
                />
              </div>
            </div>
            <div className="p-2 space-y-1">
              {isLoading ? (
                <TableSkeleton rows={6} />
              ) : (
                filteredNodes.map(n => (
                  <button
                    key={n.user_sf_id}
                    onClick={() => {
                      setSelectedNodeId(n.user_sf_id)
                      const cy = cyRef.current
                      if (cy) {
                        cy.$(`#${n.user_sf_id}`).select()
                        cy.center(cy.$(`#${n.user_sf_id}`))
                      }
                    }}
                    className={`w-full text-left px-2 py-1.5 rounded text-sm ${
                      selectedNodeId === n.user_sf_id
                        ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-900 dark:text-indigo-100'
                        : 'hover:bg-gray-100 dark:hover:bg-gray-800'
                    }`}
                  >
                    <div className="font-medium truncate">{n.name}</div>
                    <div className="text-xs text-gray-500 truncate">
                      {n.department || '—'}
                    </div>
                  </button>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* Middle: Cytoscape canvas */}
        <Card variant="bordered" className="col-span-6 overflow-hidden">
          <div
            ref={containerRef}
            className="w-full h-full bg-gray-50 dark:bg-gray-900"
            style={{ minHeight: '650px' }}
          />
        </Card>

        {/* Right: selected node + pending edits */}
        <Card variant="bordered" className="col-span-3 overflow-hidden flex flex-col">
          <CardHeader>
            <CardTitle>Selected user</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto">
            {!selectedNode ? (
              <p className="text-sm text-gray-500 italic">
                Click a node to inspect.
              </p>
            ) : (
              <div className="space-y-1 mb-4">
                <p className="text-sm font-semibold">{selectedNode.name}</p>
                <p className="text-xs text-gray-500 font-mono">{selectedNode.user_sf_id}</p>
                <p className="text-xs">
                  Department: <strong>{selectedNode.department || '—'}</strong>
                </p>
              </div>
            )}

            <div className="border-t border-gray-200 dark:border-gray-800 pt-3">
              <p className="text-xs uppercase tracking-wide text-gray-500 mb-2">
                Pending edits ({pending.length})
              </p>
              {pending.length === 0 ? (
                <p className="text-xs text-gray-500 italic">
                  No pending edits. Drag between users to add one.
                </p>
              ) : (
                <ul className="space-y-2">
                  {pending.map(p => (
                    <li
                      key={`${p.user_sf_id}::${p.field}`}
                      className="flex items-start gap-2 text-xs"
                    >
                      <div
                        className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center ${
                          p.kind === 'remove'
                            ? 'bg-red-100 text-red-600'
                            : 'bg-green-100 text-green-600'
                        }`}
                      >
                        {p.kind === 'remove' ? (
                          <Trash2 className="h-3 w-3" />
                        ) : (
                          <Plus className="h-3 w-3" />
                        )}
                      </div>
                      <div className="flex-1">
                        <p className="font-medium">
                          {p.kind === 'remove' ? 'Clear' : 'Set'}{' '}
                          {p.field === 'ManagerId' ? 'manager' : 'delegated approver'}
                        </p>
                        <p className="text-gray-500">
                          {p.source_name || p.user_sf_id}
                          {p.kind !== 'remove' && (
                            <>
                              {' → '}
                              {p.target_name || p.new_value}
                            </>
                          )}
                        </p>
                      </div>
                      <button
                        onClick={() => handleRevert(p)}
                        className="text-gray-400 hover:text-gray-600"
                        title="Revert this edit"
                      >
                        <XIcon className="h-3 w-3" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Confirmation modal */}
      {confirmOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-4"
          onClick={() => setConfirmOpen(false)}
        >
          <div
            className="bg-white dark:bg-gray-900 rounded-lg shadow-xl max-w-lg w-full p-6"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start gap-3 mb-4">
              <AlertCircle className="h-5 w-5 text-amber-500 mt-0.5 flex-shrink-0" />
              <div>
                <h2 className="text-lg font-semibold">
                  Apply {pending.length} {pending.length === 1 ? 'change' : 'changes'} to Salesforce?
                </h2>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  This will PATCH the corresponding User records in Salesforce.
                  Audit log entries are written for each successful change.
                  Requires ORG_ADMIN role.
                </p>
              </div>
            </div>
            <ul className="max-h-64 overflow-y-auto space-y-1.5 mb-4 text-sm border-t border-b border-gray-200 dark:border-gray-800 py-3">
              {pending.map(p => (
                <li
                  key={`${p.user_sf_id}::${p.field}`}
                  className="text-gray-700 dark:text-gray-300"
                >
                  <span className="text-gray-500">
                    {p.kind === 'remove' ? 'Clear' : 'Set'} {p.field}:
                  </span>{' '}
                  <strong>{p.source_name || p.user_sf_id}</strong>
                  {p.kind !== 'remove' && (
                    <>
                      {' → '}
                      <strong>{p.target_name || p.new_value}</strong>
                    </>
                  )}
                </li>
              ))}
            </ul>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => setConfirmOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                disabled={apply.isPending}
                onClick={handleSave}
              >
                {apply.isPending ? 'Saving…' : 'Confirm'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
