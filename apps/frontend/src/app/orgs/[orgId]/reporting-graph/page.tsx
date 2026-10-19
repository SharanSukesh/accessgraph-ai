'use client'

/**
 * Reporting Graph editor (Org chart > People).
 *
 * Built for 500-600 users: the graph opens collapsed at the top of the
 * hierarchy (each manager with direct and total reports, opened on click),
 * focus mode shows one person's chain to the top and their direct reports,
 * filters narrow by department, role, profile, high risk or inactive, and a
 * tree table is the alternative to the graph. Flags call out people with no
 * manager, inactive managers and inactive delegated approvers
 * (components/people, lib/peopleTree.ts).
 *
 * Editing: draw from a person to another (Cytoscape + edgehandles) to set
 * their manager or delegated approver. Saving the diff PATCHes the
 * corresponding Salesforce User records via the backend's
 * /reporting-graph/apply endpoint, which gates the write on
 * OrgUserRole.ORG_ADMIN.
 *
 * Pending edits live entirely client-side until the admin clicks Save —
 * gives them a chance to review the full diff before committing.
 */

import { useMemo, useState } from 'react'
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
  AlertCircle,
  ChevronRight,
  ListTree,
  Network,
  Users2,
  Search,
  Save,
  X as XIcon,
  Plus,
  Trash2,
  MousePointer,
  Pencil,
} from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/shared/Card'
import { Button } from '@/components/shared/Button'
import { Badge } from '@/components/shared/Badge'
import { PageHeader } from '@/components/shared/PageHeader'
import { PrivacyGate, PrivacyUnavailable } from '@/components/shared/PrivacyNotice'
import { isPrivacyModeError } from '@/lib/api/client'
import { Reveal } from '@/components/v2/motion'
import { ErrorState } from '@/components/shared/ErrorState'
import { TableSkeleton } from '@/components/shared/LoadingSkeleton'
import { RoleHierarchyView } from '@/components/roles/RoleHierarchyView'
import { OrgRoleDesign } from '@/components/roles/OrgRoleDesign'
import { useAuth } from '@/lib/auth/AuthContext'
import {
  useReportingGraph,
  useApplyReportingGraphEdits,
  type PersonFlag,
  type RelationshipEdit,
  type RelationshipField,
} from '@/lib/api/hooks/useReportingGraph'
import { PeopleCanvas, roleColor } from '@/components/people/PeopleCanvas'
import { PeopleTreeTable } from '@/components/people/PeopleTreeTable'
import {
  FLAG_LABELS,
  type Filters,
  NO_FILTERS,
  type SortKey,
  buildPeople,
  chainTo,
  filterOptions,
  flagCounts,
  hasFilters,
  treeRows,
  visiblePeople,
} from '@/lib/peopleTree'

type PendingEdit = RelationshipEdit & {
  kind: 'add' | 'remove' | 'update'
  // For UI display
  source_name?: string
  target_name?: string
}

type OrgChartView = 'roles' | 'design' | 'people'

/** Roles (the role hierarchy, read-only), Design (role hierarchy drafts,
 * never sent to Salesforce) or People (managers and delegated approvers,
 * editable). Kept in the URL so a link opens the same view. */
function ViewToggle({ view }: { view: OrgChartView }) {
  const router = useRouter()
  const pathname = usePathname()
  return (
    <div role="tablist" aria-label="Org chart view" className="flex items-center gap-1 rounded-md border border-grove-border bg-grove-surface p-0.5 dark:border-grove-border-dk dark:bg-grove-canvas-dk">
      {(['roles', 'design', 'people'] as const).map((v) => (
        <button
          key={v}
          role="tab"
          aria-selected={view === v}
          onClick={() => router.replace(`${pathname}?view=${v}`)}
          className={`rounded px-3 py-1.5 text-xs font-medium transition ${
            view === v ? 'bg-primary-700 text-grove-canvas shadow' : 'text-grove-ink/65 hover:bg-primary-50 dark:text-grove-ink-dk/65 dark:hover:bg-primary-900/20'
          }`}
        >
          {v === 'roles' ? 'Roles' : v === 'design' ? 'Design' : 'People'}
        </button>
      ))}
    </div>
  )
}

export default function ReportingGraphPage() {
  const params = useParams()
  const requested = useSearchParams().get('view')
  const view: OrgChartView = requested === 'people' || requested === 'design' ? requested : 'roles'
  const { currentOrg } = useAuth()
  if (view === 'design') {
    return (
      <div className="space-y-4">
        <Reveal>
          <PageHeader
            icon={Users2}
            title="Org Chart"
            eyebrow="Admin · hierarchy"
            subtitle="Design changes to the role hierarchy, see who gains or loses access, and export them for the client to apply. Drafts stay in Newton."
            actions={<ViewToggle view="design" />}
          />
        </Reveal>
        <OrgRoleDesign orgId={params.orgId as string} isDemo={!!currentOrg?.is_demo} />
      </div>
    )
  }
  if (view === 'roles') {
    return (
      <div className="space-y-4">
        <Reveal>
          <PageHeader
            icon={Users2}
            title="Org Chart"
            eyebrow="Admin · hierarchy"
            subtitle="The role hierarchy from the last sync: who sits in each role and what rolls up to it. Read-only."
            actions={<ViewToggle view="roles" />}
          />
        </Reveal>
        <RoleHierarchyView orgId={params.orgId as string} />
      </div>
    )
  }
  return (
    <PrivacyGate
      feature="reporting_graph"
      header={<PageHeader icon={Users2} title="Org Chart" eyebrow="Admin · hierarchy" actions={<ViewToggle view="people" />} />}
    >
      <ReportingGraphContent />
    </PrivacyGate>
  )
}

function ReportingGraphContent() {
  const params = useParams()
  const orgId = params.orgId as string

  const { data: graph, isLoading, error } = useReportingGraph(orgId)
  const apply = useApplyReportingGraphEdits(orgId)

  const [edgeMode, setEdgeMode] = useState<RelationshipField>('ManagerId')
  const [pending, setPending] = useState<PendingEdit[]>([])
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  // Toast for save outcomes (errors or partial-success messages).
  const [toast, setToast] = useState<
    { kind: 'success' | 'error' | 'warning'; message: string } | null
  >(null)
  // Move = drag nodes to reposition; Draw = drag from a person to another to set a relationship.
  const [tool, setTool] = useState<'move' | 'draw'>('move')
  // At scale: graph or tree table; which managers are open; focus on one person; filters.
  const [layout, setLayout] = useState<'graph' | 'table'>('graph')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [focusId, setFocusId] = useState<string | null>(null)
  const [filters, setFilters] = useState<Filters>(NO_FILTERS)
  const [find, setFind] = useState('')
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'total', desc: true })

  const people = useMemo(() => buildPeople(graph?.nodes ?? [], graph?.edges ?? []), [graph])
  const visible = useMemo(() => visiblePeople(people, expanded, focusId, filters), [people, expanded, focusId, filters])
  const isolated = useMemo(
    () => people.roots.filter((id) => !(people.reports.get(id)?.length) && !(people.byId.get(id)?.flags ?? []).includes('manager_inactive')),
    [people],
  )
  const rows = useMemo(() => treeRows(people, expanded, filters, sort), [people, expanded, filters, sort])
  const counts = useMemo(() => flagCounts(graph?.nodes ?? []), [graph])
  const options = useMemo(() => ({
    department: filterOptions(graph?.nodes ?? [], 'department'),
    role: filterOptions(graph?.nodes ?? [], 'role_name'),
    profile: filterOptions(graph?.nodes ?? [], 'profile_name'),
  }), [graph])
  const found = useMemo(() => {
    const q = find.trim().toLowerCase()
    if (!q) return []
    return [...people.shown]
      .map((id) => people.byId.get(id)!)
      .filter((n) => [n.name, n.title, n.department].some((v) => (v ?? '').toLowerCase().includes(q)))
      .slice(0, 8)
  }, [find, people])
  const filtered = hasFilters(filters)
  const nameOf = (id: string | null | undefined) => (id ? people.byId.get(id)?.name ?? id : '')

  const focusOn = (id: string) => {
    setFocusId(id)
    setSelectedNodeId(id)
    setFilters(NO_FILTERS)
    setFind('')
  }
  const toggle = (id: string) => {
    if (visible.mode === 'focus') {
      if (id !== focusId) focusOn(id)
      return
    }
    if (visible.mode !== 'collapsed' || !people.reports.get(id)?.length) return
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }
  const setFilter = (patch: Partial<Filters>) => {
    setFocusId(null)
    setFilters((f) => ({ ...f, ...patch }))
  }

  // Pending edits are state; the canvas draws them (pending adds, committed edges marked for removal).
  const draw = (src: string, tgt: string, field: RelationshipField) =>
    setPending((prev) => [
      ...prev.filter((p) => !(p.user_sf_id === src && p.field === field)),
      { user_sf_id: src, field, new_value: tgt, kind: 'add', source_name: nameOf(src), target_name: nameOf(tgt) },
    ])
  const markCommittedEdgeForRemoval = (
    userSfId: string,
    field: RelationshipField,
    targetUserSfId: string,
    sourceName?: string,
    targetName?: string,
  ) =>
    setPending((prev) => [
      ...prev.filter((p) => !(p.user_sf_id === userSfId && p.field === field)),
      { user_sf_id: userSfId, field, new_value: null, kind: 'remove', source_name: sourceName, target_name: targetName || targetUserSfId },
    ])
  const removeEdge = (src: string, field: RelationshipField) => {
    const target = field === 'ManagerId' ? people.managerOf.get(src) : people.approverOf.get(src)
    if (target) markCommittedEdgeForRemoval(src, field, target, nameOf(src), nameOf(target))
  }
  const dropPending = (src: string, field: RelationshipField) =>
    setPending((prev) => prev.filter((p) => !(p.user_sf_id === src && p.field === field)))
  const handleRevert = (edit: PendingEdit) => dropPending(edit.user_sf_id, edit.field)

  const selectedNode = useMemo(() => {
    if (!graph || !selectedNodeId) return null
    return graph.nodes.find(n => n.user_sf_id === selectedNodeId) || null
  }, [graph, selectedNodeId])

  // The selected user's committed manager / delegated approver and any pending change.
  const selectedRelationships = useMemo(() => {
    if (!graph || !selectedNodeId) return null
    const findTarget = (field: RelationshipField) => {
      const target = field === 'ManagerId' ? people.managerOf.get(selectedNodeId) : people.approverOf.get(selectedNodeId)
      return target ? { target_id: target, target_name: nameOf(target) } : null
    }
    const findPending = (field: RelationshipField) =>
      pending.find(p => p.user_sf_id === selectedNodeId && p.field === field) || null
    return {
      manager: { committed: findTarget('ManagerId'), pending: findPending('ManagerId') },
      delegated: { committed: findTarget('DelegatedApproverId'), pending: findPending('DelegatedApproverId') },
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph, people, selectedNodeId, pending])

  const handleSave = async () => {
    setConfirmOpen(false)
    setToast(null)
    const edits: RelationshipEdit[] = pending.map(p => ({ user_sf_id: p.user_sf_id, field: p.field, new_value: p.new_value }))
    try {
      const result = await apply.mutateAsync(edits)
      const failedKeys = new Set(result.results.filter(r => !r.success).map(r => `${r.user_sf_id}::${r.field}`))
      // Succeeded edits leave the pending list; failed ones stay to retry or revert.
      setPending(prev => prev.filter(p => failedKeys.has(`${p.user_sf_id}::${p.field}`)))
      if (result.failed === 0) {
        setToast({ kind: 'success', message: `Saved ${result.succeeded} ${result.succeeded === 1 ? 'change' : 'changes'} to Salesforce.` })
      } else if (result.succeeded > 0) {
        setToast({ kind: 'warning', message: `Partial save: ${result.succeeded} succeeded, ${result.failed} failed. Failed rows remain in the pending list.` })
      } else {
        const firstError = result.results.find(r => r.error)?.error
        setToast({ kind: 'error', message: firstError ? `Save failed: ${firstError}` : 'Save failed. All edits returned errors.' })
      }
    } catch (err: any) {
      let message = 'Save failed.'
      if (err?.status === 403) {
        message =
          'Permission denied. You need an ORG_ADMIN role to edit the reporting graph. ' +
          '(If no ORG_ADMIN is configured yet, this falls back to allowing any user — ' +
          'so this error means someone has explicitly locked it down.)'
      } else if (isPrivacyModeError(err)) {
        message = err.message
      } else if (typeof err?.data?.detail === 'string') {
        message = `Save failed: ${err.data.detail}`
      } else if (err?.message) {
        message = `Save failed: ${err.message}`
      }
      setToast({ kind: 'error', message })
    }
  }

  if (error) {
    if (isPrivacyModeError(error)) return <PrivacyUnavailable message={error.message} />
    return <ErrorState message="Failed to load reporting graph" />
  }

  const SELECT = 'w-full rounded border border-grove-border bg-grove-surface px-2 py-1.5 text-xs dark:border-grove-border-dk dark:bg-grove-surface-dk'
  const LABEL = 'text-[11px] font-semibold uppercase tracking-wide text-grove-ink/55 dark:text-grove-ink-dk/55'
  const chain = focusId ? chainTo(people, focusId) : []
  const shownCount = layout === 'table' ? rows.length : visible.ids.size

  return (
    <div className="space-y-4">
      {/* Toast banner — surfaces save outcomes (success / partial / error /
          403). Persists until dismissed; the user shouldn't miss a save
          failure because of a fading toast. */}
      {toast && (
        <div
          className={`flex items-start gap-3 p-3 rounded-lg border text-sm ${
            toast.kind === 'success'
              ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-800 dark:text-green-200'
              : toast.kind === 'warning'
                ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200'
                : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-800 dark:text-red-200'
          }`}
          role="status"
        >
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <p className="flex-1">{toast.message}</p>
          <button
            onClick={() => setToast(null)}
            className="text-current opacity-70 hover:opacity-100"
            title="Dismiss"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>
      )}

      <Reveal>
        <PageHeader
          icon={Users2}
          title="Org Chart"
          eyebrow="Admin · hierarchy"
          subtitle="Open managers to see their teams, focus on one person, or filter. In the graph, draw from a person to another to set their manager or delegated approver; Save writes back to Salesforce User records."
          actions={
            <>
              <ViewToggle view="people" />
              <Badge variant={pending.length > 0 ? 'info' : 'default'} size="sm">
                {pending.length} pending {pending.length === 1 ? 'edit' : 'edits'}
              </Badge>
              <Button variant="primary" size="md" disabled={pending.length === 0 || apply.isPending} onClick={() => setConfirmOpen(true)}>
                <Save className="h-4 w-4 mr-2" />
                {apply.isPending ? 'Saving…' : `Save changes (${pending.length})`}
              </Button>
            </>
          }
        />
      </Reveal>

      {/* Layout, canvas tool and edge type. Editing happens in the graph. */}
      <div className="flex items-center gap-3 text-sm flex-wrap p-3 rounded-lg bg-primary-50/40 dark:bg-primary-900/10 border border-grove-border dark:border-grove-border-dk">
        <div role="tablist" aria-label="Layout" className="flex items-center gap-1 bg-grove-surface dark:bg-grove-canvas-dk rounded-md border border-grove-border dark:border-grove-border-dk p-0.5">
          {(['graph', 'table'] as const).map((l) => (
            <button key={l} role="tab" aria-selected={layout === l} onClick={() => setLayout(l)}
              className={`px-3 py-1.5 rounded text-xs font-medium transition flex items-center gap-1.5 ${layout === l ? 'bg-primary-700 text-grove-canvas shadow' : 'text-grove-ink/65 dark:text-grove-ink-dk/65 hover:bg-primary-50 dark:hover:bg-primary-900/20'}`}>
              {l === 'graph' ? <Network className="h-3 w-3" /> : <ListTree className="h-3 w-3" />}
              {l === 'graph' ? 'Graph' : 'Tree table'}
            </button>
          ))}
        </div>
        {layout === 'graph' && (
          <>
            <div className="flex items-center gap-1 bg-grove-surface dark:bg-grove-canvas-dk rounded-md border border-grove-border dark:border-grove-border-dk p-0.5">
              <button onClick={() => setTool('move')} title="Drag people to reposition them"
                className={`px-3 py-1.5 rounded text-xs font-medium transition flex items-center gap-1.5 ${tool === 'move' ? 'bg-primary-700 text-grove-canvas shadow' : 'text-grove-ink/65 dark:text-grove-ink-dk/65 hover:bg-primary-50 dark:hover:bg-primary-900/20'}`}>
                <MousePointer className="h-3 w-3" />
                Move
              </button>
              <button onClick={() => setTool('draw')} title="Drag from one person to another to create an edge"
                className={`px-3 py-1.5 rounded text-xs font-medium transition flex items-center gap-1.5 ${tool === 'draw' ? 'bg-green-600 text-white shadow' : 'text-grove-ink/65 dark:text-grove-ink-dk/65 hover:bg-primary-50 dark:hover:bg-primary-900/20'}`}>
                <Pencil className="h-3 w-3" />
                Draw edges
              </button>
            </div>
            <div className={`flex items-center gap-2 transition ${tool === 'draw' ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
              <span className="text-grove-ink/65 dark:text-grove-ink-dk/65 text-xs">Edge type:</span>
              <button onClick={() => setEdgeMode('ManagerId')}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${edgeMode === 'ManagerId' ? 'bg-primary-700 text-grove-canvas shadow' : 'bg-grove-surface dark:bg-grove-canvas-dk border border-grove-border dark:border-grove-border-dk text-grove-ink/65 dark:text-grove-ink-dk/65 hover:bg-primary-50 dark:hover:bg-grove-surface-dk'}`}>
                Manager (solid)
              </button>
              <button onClick={() => setEdgeMode('DelegatedApproverId')}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${edgeMode === 'DelegatedApproverId' ? 'bg-sky-600 text-white shadow' : 'bg-grove-surface dark:bg-grove-canvas-dk border border-grove-border dark:border-grove-border-dk text-grove-ink/65 dark:text-grove-ink-dk/65 hover:bg-primary-50 dark:hover:bg-grove-surface-dk'}`}>
                Delegated approver (dashed)
              </button>
            </div>
          </>
        )}
        <div className="ml-auto flex items-center gap-3 text-xs text-grove-ink/60 dark:text-grove-ink-dk/60">
          <span className="v2-num">
            Showing {shownCount.toLocaleString('en-GB')} of {people.shown.size.toLocaleString('en-GB')} people
          </span>
          {visible.mode === 'collapsed' && expanded.size > 0 && (
            <button type="button" className="underline underline-offset-2" onClick={() => setExpanded(new Set())}>Collapse all</button>
          )}
        </div>
      </div>

      {focusId && (
        <nav aria-label="Reporting chain" className="flex flex-wrap items-center gap-1 rounded-lg border border-grove-border bg-grove-surface px-3 py-2 text-sm dark:border-grove-border-dk dark:bg-grove-surface-dk">
          <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-grove-ink/55 dark:text-grove-ink-dk/55">Focus</span>
          {chain.length > 0 && people.managerOf.has(chain[0]) && (
            <span className="mr-1 rounded border border-amber-400 px-1.5 text-[11px] font-medium text-amber-800 dark:border-amber-600 dark:text-amber-200"
              title="Following managers up comes back round; the chain starts where it repeats.">
              Manager loop
            </span>
          )}
          {chain.map((id, i) => (
            <span key={id} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-grove-ink/40 dark:text-grove-ink-dk/40" aria-hidden />}
              {id === focusId ? (
                <span className="font-semibold" aria-current="page">{nameOf(id)}</span>
              ) : (
                <button type="button" className="text-primary-700 hover:underline dark:text-primary-300" onClick={() => focusOn(id)}>{nameOf(id)}</button>
              )}
            </span>
          ))}
          <span className="ml-1 text-xs text-grove-ink/55 dark:text-grove-ink-dk/55">
            · {people.reports.get(focusId)?.length ?? 0} direct reports
          </span>
          <button type="button" onClick={() => setFocusId(null)}
            className="ml-auto inline-flex items-center gap-1 rounded border border-grove-border px-2 py-1 text-xs dark:border-grove-border-dk">
            <XIcon className="h-3 w-3" /> Exit focus
          </button>
        </nav>
      )}

      <div className="grid grid-cols-12 gap-4 lg:h-[680px]">
        {/* Left: find a person, filters, flags */}
        <Card variant="bordered" className="col-span-12 lg:col-span-3 overflow-hidden flex flex-col">
          <CardContent className="flex-1 space-y-4 overflow-y-auto p-3">
            <div className="relative">
              <label className={LABEL} htmlFor="people-find">Find a person</label>
              <div className="relative mt-1">
                <Search className="absolute left-2.5 top-2 h-4 w-4 text-grove-ink/50 dark:text-grove-ink-dk/50" />
                <input id="people-find" type="text" value={find} onChange={(e) => setFind(e.target.value)}
                  placeholder="Name, title or department…"
                  className="w-full pl-8 pr-2 py-1.5 text-sm rounded border border-grove-border dark:border-grove-border-dk bg-grove-surface dark:bg-grove-surface-dk" />
              </div>
              {found.length > 0 && (
                <ul role="listbox" aria-label="People" className="absolute z-20 mt-1 w-full rounded-md border border-grove-border bg-grove-surface p-1 shadow-grove-lift dark:border-grove-border-dk dark:bg-grove-surface-dk">
                  {found.map((n) => (
                    <li key={n.user_sf_id}>
                      <button type="button" role="option" aria-selected={false} onClick={() => focusOn(n.user_sf_id)}
                        className="w-full rounded px-2 py-1.5 text-left text-sm hover:bg-primary-50 dark:hover:bg-primary-900/20">
                        <span className="block truncate font-medium">{n.name}</span>
                        <span className="block truncate text-xs text-grove-ink/55 dark:text-grove-ink-dk/55">{[n.title, n.department].filter(Boolean).join(' · ') || '—'}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-1 text-[11px] text-grove-ink/55 dark:text-grove-ink-dk/55">Focus shows their chain to the top and their direct reports.</p>
            </div>

            <fieldset className="space-y-2">
              <legend className={LABEL}>Filters</legend>
              <select aria-label="Department" className={SELECT} value={filters.department} onChange={(e) => setFilter({ department: e.target.value })}>
                <option value="">All departments</option>
                {options.department.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
              <select aria-label="Role" className={SELECT} value={filters.role} onChange={(e) => setFilter({ role: e.target.value })}>
                <option value="">All roles</option>
                {options.role.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
              <select aria-label="Profile" className={SELECT} value={filters.profile} onChange={(e) => setFilter({ profile: e.target.value })}>
                <option value="">All profiles</option>
                {options.profile.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="accent-primary-700" checked={filters.highRisk} onChange={(e) => setFilter({ highRisk: e.target.checked })} />
                High risk
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="accent-primary-700" checked={filters.inactive} onChange={(e) => setFilter({ inactive: e.target.checked })} />
                Inactive
              </label>
              <input type="text" aria-label="Filter by text" value={filters.text} onChange={(e) => setFilter({ text: e.target.value })}
                placeholder="Text in name, title, role…" className={SELECT} />
              {filtered && (
                <button type="button" className="text-xs font-medium text-primary-700 hover:underline dark:text-primary-300" onClick={() => setFilters(NO_FILTERS)}>
                  Clear filters
                </button>
              )}
            </fieldset>

            <div>
              <p className={LABEL}>Needs a look</p>
              <ul className="mt-1 space-y-1">
                {/* Salesforce doesn't allow manager loops, so that row shows only when the data has one. */}
                {(Object.keys(FLAG_LABELS) as PersonFlag[]).filter((f) => f !== 'manager_loop' || counts[f] > 0).map((f) => (
                  <li key={f}>
                    <button type="button" aria-pressed={filters.flag === f}
                      onClick={() => setFilter({ flag: filters.flag === f ? '' : f })}
                      className={`flex w-full items-center justify-between rounded border px-2 py-1.5 text-left text-xs ${filters.flag === f ? 'border-amber-500 bg-amber-50 dark:border-amber-600 dark:bg-amber-900/20' : 'border-grove-border hover:bg-primary-50/40 dark:border-grove-border-dk dark:hover:bg-primary-900/15'}`}>
                      <span className="flex items-center gap-1.5"><AlertCircle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" aria-hidden />{FLAG_LABELS[f]}</span>
                      <span className="v2-num font-semibold">{counts[f]}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            {filtered && (
              <div>
                <p className={LABEL}>{visible.matches.length.toLocaleString('en-GB')} {visible.matches.length === 1 ? 'match' : 'matches'}</p>
                <ul className="mt-1 space-y-0.5">
                  {visible.matches.slice(0, 100).map((id) => (
                    <li key={id}>
                      <button type="button" onClick={() => focusOn(id)} className="w-full truncate rounded px-2 py-1 text-left text-sm hover:bg-primary-50 dark:hover:bg-primary-900/20">
                        {nameOf(id)}
                      </button>
                    </li>
                  ))}
                </ul>
                {visible.matches.length > 100 && <p className="mt-1 text-[11px] text-grove-ink/55 dark:text-grove-ink-dk/55">The first 100; the {layout === 'graph' ? 'graph' : 'table'} shows them all.</p>}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Middle: the graph or the tree table */}
        <Card variant="bordered" className="col-span-12 lg:col-span-6 overflow-hidden">
          {isLoading ? (
            <div className="p-4"><TableSkeleton rows={8} /></div>
          ) : layout === 'graph' ? (
            <PeopleCanvas
              people={people}
              visible={visible}
              expanded={expanded}
              pending={pending}
              selectedId={selectedNodeId}
              tool={tool}
              edgeMode={edgeMode}
              isolated={isolated}
              onSelect={setSelectedNodeId}
              onToggle={toggle}
              onDraw={draw}
              onRemoveEdge={removeEdge}
              onDropPending={dropPending}
              onIsolatedClick={() => setFilter({ ...NO_FILTERS, flag: 'no_manager' })}
            />
          ) : (
            <PeopleTreeTable
              rows={rows}
              sort={sort}
              onSort={(key) => setSort((s) => ({ key, desc: s.key === key ? !s.desc : key === 'direct' || key === 'total' }))}
              onToggle={(id) => setExpanded((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next })}
              selectedId={selectedNodeId}
              onSelect={setSelectedNodeId}
              filtered={filtered}
            />
          )}
        </Card>

        {/* Right: selected node + pending edits */}
        <Card variant="bordered" className="col-span-12 lg:col-span-3 overflow-hidden flex flex-col">
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle>Selected user</CardTitle>
              {selectedNode && (
                <button
                  type="button"
                  onClick={() => focusOn(selectedNode.user_sf_id)}
                  className="rounded border border-grove-border px-2 py-1 text-xs font-medium hover:bg-primary-50/40 dark:border-grove-border-dk dark:hover:bg-primary-900/15"
                >
                  Focus
                </button>
              )}
            </div>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto">
            {!selectedNode ? (
              <p className="text-sm text-grove-ink/55 dark:text-grove-ink-dk/55 italic">
                Click a node to inspect.
              </p>
            ) : (
              <div className="space-y-3 mb-4">
                <div className="flex items-center gap-2">
                  <span
                    className="inline-block w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: roleColor(selectedNode.role_depth) }}
                    title={
                      selectedNode.role_depth == null
                        ? 'No role assigned'
                        : `Role depth ${selectedNode.role_depth} (0 = top)`
                    }
                  />
                  <p className="text-sm font-semibold flex-1 truncate">{selectedNode.name}</p>
                </div>
                <p className="text-xs text-grove-ink/55 dark:text-grove-ink-dk/55 font-mono break-all">
                  {selectedNode.user_sf_id}
                </p>
                <dl className="text-xs space-y-1.5">
                  {selectedNode.title && (
                    <div className="flex gap-1.5">
                      <dt className="text-grove-ink/55 dark:text-grove-ink-dk/55 w-20 flex-shrink-0">Title</dt>
                      <dd className="font-medium">{selectedNode.title}</dd>
                    </div>
                  )}
                  <div className="flex gap-1.5">
                    <dt className="text-grove-ink/55 dark:text-grove-ink-dk/55 w-20 flex-shrink-0">Department</dt>
                    <dd className="font-medium">{selectedNode.department || '—'}</dd>
                  </div>
                  <div className="flex gap-1.5">
                    <dt className="text-grove-ink/55 dark:text-grove-ink-dk/55 w-20 flex-shrink-0">Role</dt>
                    <dd className="font-medium">
                      {selectedNode.role_name || <span className="text-grove-ink/50 dark:text-grove-ink-dk/50">—</span>}
                      {selectedNode.role_depth != null && (
                        <span className="ml-1.5 text-grove-ink/50 dark:text-grove-ink-dk/50">
                          (depth {selectedNode.role_depth})
                        </span>
                      )}
                    </dd>
                  </div>
                  <div className="flex gap-1.5">
                    <dt className="text-grove-ink/55 dark:text-grove-ink-dk/55 w-20 flex-shrink-0">Profile</dt>
                    <dd className="font-medium">
                      {selectedNode.profile_name || <span className="text-grove-ink/50 dark:text-grove-ink-dk/50">—</span>}
                    </dd>
                  </div>
                  <div className="flex gap-1.5">
                    <dt className="text-grove-ink/55 dark:text-grove-ink-dk/55 w-20 flex-shrink-0">Reports</dt>
                    <dd className="font-medium v2-num">
                      {people.reports.get(selectedNode.user_sf_id)?.length ?? 0} direct · {people.total.get(selectedNode.user_sf_id) ?? 0} total
                    </dd>
                  </div>
                  {selectedNode.risk_level && (
                    <div className="flex gap-1.5">
                      <dt className="text-grove-ink/55 dark:text-grove-ink-dk/55 w-20 flex-shrink-0">Risk</dt>
                      <dd className="font-medium capitalize">{selectedNode.risk_level}</dd>
                    </div>
                  )}
                  {(selectedNode.flags ?? []).length > 0 && (
                    <div className="flex gap-1.5">
                      <dt className="text-grove-ink/55 dark:text-grove-ink-dk/55 w-20 flex-shrink-0">Needs a look</dt>
                      <dd className="font-medium text-amber-700 dark:text-amber-300">
                        {(selectedNode.flags ?? []).map((f) => FLAG_LABELS[f]).join(', ')}
                      </dd>
                    </div>
                  )}
                  <div className="flex gap-1.5">
                    <dt className="text-grove-ink/55 dark:text-grove-ink-dk/55 w-20 flex-shrink-0">Status</dt>
                    <dd>
                      <Badge
                        variant={selectedNode.is_active ? 'success' : 'default'}
                        size="sm"
                      >
                        {selectedNode.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </dd>
                  </div>
                </dl>
              </div>
            )}

            {/* Current relationships — gives the admin a one-click way to
                clear a manager or delegated approver. Mirrors right-click
                on the canvas edge, but doesn't require finding the edge. */}
            {selectedNode && selectedRelationships && (
              <div className="border-t border-grove-border dark:border-grove-border-dk pt-3 mb-4">
                <p className="text-xs uppercase tracking-wide text-grove-ink/55 dark:text-grove-ink-dk/55 mb-2">
                  Current relationships
                </p>
                <ul className="space-y-2">
                  {(['ManagerId', 'DelegatedApproverId'] as RelationshipField[]).map(field => {
                    const slot =
                      field === 'ManagerId'
                        ? selectedRelationships.manager
                        : selectedRelationships.delegated
                    const label =
                      field === 'ManagerId' ? 'Manager' : 'Delegated approver'
                    const markedForRemoval = slot.pending?.kind === 'remove'
                    const pendingAdd =
                      slot.pending?.kind === 'add' ? slot.pending : null
                    return (
                      <li
                        key={field}
                        className="flex items-center gap-2 text-xs"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-grove-ink/55 dark:text-grove-ink-dk/55">{label}</p>
                          {pendingAdd ? (
                            <p className="font-medium text-green-700 dark:text-green-400 truncate">
                              → {pendingAdd.target_name || pendingAdd.new_value} (pending)
                            </p>
                          ) : slot.committed ? (
                            <p
                              className={`font-medium truncate ${
                                markedForRemoval
                                  ? 'line-through text-red-600 dark:text-red-400'
                                  : 'text-grove-ink dark:text-grove-ink-dk'
                              }`}
                            >
                              {slot.committed.target_name}
                            </p>
                          ) : (
                            <p className="italic text-grove-ink/50 dark:text-grove-ink-dk/50">None</p>
                          )}
                        </div>
                        {/* Action button:
                            - committed + not yet marked → Clear
                            - committed + marked for removal → Undo
                            - pending add → handled in Pending edits below
                            - no value → no button */}
                        {slot.committed && !pendingAdd && (
                          markedForRemoval ? (
                            <button
                              onClick={() => slot.pending && handleRevert(slot.pending)}
                              className="px-2 py-1 text-xs rounded border border-grove-border dark:border-grove-border-dk text-grove-ink/65 dark:text-grove-ink-dk/65 hover:bg-primary-50/40 dark:hover:bg-primary-900/15"
                              title="Undo the pending removal"
                            >
                              Undo
                            </button>
                          ) : (
                            <button
                              onClick={() =>
                                markCommittedEdgeForRemoval(
                                  selectedNode.user_sf_id,
                                  field,
                                  slot.committed!.target_id,
                                  selectedNode.name,
                                  slot.committed!.target_name,
                                )
                              }
                              className="px-2 py-1 text-xs rounded border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-1"
                              title={`Clear this user's ${label.toLowerCase()} in Salesforce on next save`}
                            >
                              <Trash2 className="h-3 w-3" />
                              Clear
                            </button>
                          )
                        )}
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}

            <div className="border-t border-grove-border dark:border-grove-border-dk pt-3">
              <p className="text-xs uppercase tracking-wide text-grove-ink/55 dark:text-grove-ink-dk/55 mb-2">
                Pending edits ({pending.length})
              </p>
              {pending.length === 0 ? (
                <p className="text-xs text-grove-ink/55 dark:text-grove-ink-dk/55 italic">
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
                        <p className="text-grove-ink/55 dark:text-grove-ink-dk/55">
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
                        className="text-grove-ink/50 dark:text-grove-ink-dk/50 hover:text-grove-ink/70 dark:text-grove-ink-dk/70"
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
            className="bg-grove-surface dark:bg-grove-canvas-dk rounded-lg shadow-xl max-w-lg w-full p-6"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start gap-3 mb-4">
              <AlertCircle className="h-5 w-5 text-amber-500 mt-0.5 flex-shrink-0" />
              <div>
                <h2 className="text-lg font-semibold">
                  Apply {pending.length} {pending.length === 1 ? 'change' : 'changes'} to Salesforce?
                </h2>
                <p className="text-sm text-grove-ink/65 dark:text-grove-ink-dk/65 mt-1">
                  This will PATCH the corresponding User records in Salesforce.
                  Audit log entries are written for each successful change.
                  Requires ORG_ADMIN role.
                </p>
              </div>
            </div>
            <ul className="max-h-64 overflow-y-auto space-y-1.5 mb-4 text-sm border-t border-b border-grove-border dark:border-grove-border-dk py-3">
              {pending.map(p => (
                <li
                  key={`${p.user_sf_id}::${p.field}`}
                  className="text-grove-ink/85 dark:text-grove-ink-dk/85"
                >
                  <span className="text-grove-ink/55 dark:text-grove-ink-dk/55">
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
