/**
 * The People view at scale (Org chart > People): the manager tree built from
 * the reporting graph, with direct and total reports, chains to the top,
 * and which people to draw for the collapsed view, focus mode and filters.
 * Pure functions; the graph canvas and the tree table both read these.
 */

import type { PersonFlag, ReportingGraphEdge, ReportingGraphNode } from '@/lib/api/hooks/useReportingGraph'

export type Person = ReportingGraphNode

export const FLAG_LABELS: Record<PersonFlag, string> = {
  no_manager: 'No manager',
  manager_inactive: 'Inactive manager',
  manager_loop: 'Manager loop',
  delegated_approver_inactive: 'Inactive delegated approver',
}

export interface People {
  byId: Map<string, Person>
  /** Manager of each person (only when the manager is a known user). */
  managerOf: Map<string, string>
  /** Delegated approver of each person (only when known). */
  approverOf: Map<string, string>
  /** People shown by default: active users, and inactive ones someone active still reports to or delegates to. */
  shown: Set<string>
  /** Shown direct reports, by name. */
  reports: Map<string, string[]>
  /** The top of the tree: shown people with no shown manager, and one person from each manager loop. */
  roots: string[]
  /** All shown people below each person. */
  total: Map<string, number>
}

const byName = (people: Map<string, Person>) => (a: string, b: string) =>
  (people.get(a)?.name ?? a).localeCompare(people.get(b)?.name ?? b)

export function buildPeople(nodes: Person[], edges: ReportingGraphEdge[]): People {
  const byId = new Map(nodes.map((n) => [n.user_sf_id, n]))
  const managerOf = new Map<string, string>()
  const approverOf = new Map<string, string>()
  for (const e of edges) {
    if (!byId.has(e.source) || !byId.has(e.target) || e.source === e.target) continue
    ;(e.edge_type === 'manager' ? managerOf : approverOf).set(e.source, e.target)
  }
  // Inactive people stay in the tree when an active person still points at them.
  const shown = new Set(nodes.filter((n) => n.is_active).map((n) => n.user_sf_id))
  for (const id of [...shown]) {
    for (const target of [managerOf.get(id), approverOf.get(id)]) {
      let t = target
      const seen = new Set<string>()
      while (t && !shown.has(t) && !seen.has(t)) {
        seen.add(t)
        shown.add(t)
        t = managerOf.get(t)
      }
    }
  }
  const reports = new Map<string, string[]>()
  for (const id of shown) {
    const m = managerOf.get(id)
    if (m && shown.has(m)) reports.set(m, [...(reports.get(m) ?? []), id])
  }
  const order = byName(byId)
  for (const list of reports.values()) list.sort(order)
  const total = new Map<string, number>()
  const count = (id: string, path: Set<string>): number => {
    if (total.has(id)) return total.get(id)!
    if (path.has(id)) return 0 // a cycle in the data: count nobody twice
    path.add(id)
    const n = (reports.get(id) ?? []).reduce((sum, r) => sum + 1 + count(r, path), 0)
    path.delete(id)
    total.set(id, n)
    return n
  }
  const roots = [...shown].filter((id) => !shown.has(managerOf.get(id) ?? ''))
  // A manager loop has no top: start each loop at its first member by name, so nobody is unreachable.
  const reached = new Set<string>()
  const reach = (id: string) => {
    const stack = [id]
    while (stack.length) {
      const cur = stack.pop()!
      if (reached.has(cur)) continue
      reached.add(cur)
      stack.push(...(reports.get(cur) ?? []))
    }
  }
  roots.forEach(reach)
  for (const id of [...shown].sort(order)) {
    if (reached.has(id)) continue
    // Walk up until the chain repeats; the loop is the part that repeats.
    const path: string[] = []
    let cur = id
    while (!path.includes(cur) && managerOf.has(cur) && shown.has(managerOf.get(cur)!)) {
      path.push(cur)
      cur = managerOf.get(cur)!
    }
    const at = path.indexOf(cur)
    const start = (at >= 0 ? path.slice(at) : [cur]).sort(order)[0]
    roots.push(start)
    reach(start)
  }
  for (const id of shown) count(id, new Set())
  roots.sort((a, b) => (total.get(b) ?? 0) - (total.get(a) ?? 0) || order(a, b))
  return { byId, managerOf, approverOf, shown, reports, roots, total }
}

/** The chain from the top down to (and including) a person. */
export function chainTo(people: People, id: string): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  let cur: string | undefined = id
  while (cur && !seen.has(cur)) {
    seen.add(cur)
    out.unshift(cur)
    cur = people.managerOf.get(cur)
  }
  return out
}

export interface Filters {
  department: string
  role: string
  profile: string
  highRisk: boolean
  inactive: boolean
  flag: PersonFlag | ''
  /** Free text: name, title, role or department. */
  text: string
}

export const NO_FILTERS: Filters = { department: '', role: '', profile: '', highRisk: false, inactive: false, flag: '', text: '' }

export function hasFilters(f: Filters): boolean {
  return !!(f.department || f.role || f.profile || f.highRisk || f.inactive || f.flag || f.text.trim())
}

export function matchesFilters(p: Person, f: Filters): boolean {
  const q = f.text.trim().toLowerCase()
  return (
    (!f.department || p.department === f.department) &&
    (!f.role || p.role_name === f.role) &&
    (!f.profile || p.profile_name === f.profile) &&
    (!f.highRisk || p.risk_level === 'high' || p.risk_level === 'critical') &&
    // Inactive is a filter of its own; otherwise inactive people appear only as someone's manager or approver.
    (f.inactive ? !p.is_active : true) &&
    (!f.flag || (p.flags ?? []).includes(f.flag)) &&
    (!q || [p.name, p.title, p.role_name, p.department].some((v) => (v ?? '').toLowerCase().includes(q)))
  )
}

/** Values to offer in a filter's drop-down, A-Z. */
export function filterOptions(nodes: Person[], key: 'department' | 'role_name' | 'profile_name'): string[] {
  return [...new Set(nodes.map((n) => n[key]).filter((v): v is string => !!v))].sort((a, b) => a.localeCompare(b))
}

export interface Visible {
  /** People to draw. */
  ids: Set<string>
  /** Drawn only to connect the matches to the top (shown faded). */
  context: Set<string>
  /** People matching the filters (empty when there are none). */
  matches: string[]
  mode: 'collapsed' | 'focus' | 'filtered'
}

/**
 * Who the graph draws:
 *   focus     the person's chain up to the top, the person, their direct reports;
 *   filtered  everyone matching, plus their chains to the top as faded context;
 *   collapsed the top of the tree, opened one manager at a time (expanded).
 */
export function visiblePeople(people: People, expanded: Set<string>, focusId: string | null, filters: Filters): Visible {
  if (focusId && people.byId.has(focusId)) {
    const chain = chainTo(people, focusId)
    const ids = new Set([...chain, ...(people.reports.get(focusId) ?? [])])
    return { ids, context: new Set(), matches: [], mode: 'focus' }
  }
  if (hasFilters(filters)) {
    const pool = filters.inactive ? [...people.byId.keys()] : [...people.shown]
    const matches = pool.filter((id) => matchesFilters(people.byId.get(id)!, filters))
    const ids = new Set<string>()
    const context = new Set<string>()
    for (const id of matches) {
      for (const c of chainTo(people, id)) {
        ids.add(c)
        if (c !== id) context.add(c)
      }
    }
    for (const id of matches) context.delete(id)
    return { ids, context, matches, mode: 'filtered' }
  }
  const ids = new Set<string>()
  const stack = [...people.roots]
  while (stack.length) {
    const id = stack.pop()!
    if (ids.has(id)) continue
    ids.add(id)
    if (expanded.has(id)) stack.push(...(people.reports.get(id) ?? []))
  }
  return { ids, context: new Set(), matches: [], mode: 'collapsed' }
}

export type SortKey = 'name' | 'title' | 'role' | 'manager' | 'direct' | 'total'

export interface TreeRow {
  id: string
  depth: number
  person: Person
  manager: string | null
  direct: number
  total: number
  /** Has reports to open or close. */
  expandable: boolean
  open: boolean
  /** Shown only to connect a match to the top. */
  context: boolean
}

/**
 * The tree table's rows: depth-first, siblings sorted by the chosen column.
 * With filters, every match and its chain is shown, opened; without, rows
 * open as managers are expanded.
 */
export function treeRows(
  people: People,
  expanded: Set<string>,
  filters: Filters,
  sort: { key: SortKey; desc: boolean },
): TreeRow[] {
  const filtered = hasFilters(filters)
  const vis = filtered ? visiblePeople(people, expanded, null, filters) : null
  const name = (id: string | undefined) => (id ? people.byId.get(id)?.name ?? null : null)
  const value = (id: string): string | number => {
    const p = people.byId.get(id)!
    switch (sort.key) {
      case 'title': return p.title ?? ''
      case 'role': return p.role_name ?? ''
      case 'manager': return name(people.managerOf.get(id)) ?? ''
      case 'direct': return people.reports.get(id)?.length ?? 0
      case 'total': return people.total.get(id) ?? 0
      default: return p.name
    }
  }
  const cmp = (a: string, b: string) => {
    const va = value(a)
    const vb = value(b)
    const r = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb))
    return (sort.desc ? -r : r) || (people.byId.get(a)!.name).localeCompare(people.byId.get(b)!.name)
  }
  const kids = (id: string) => (people.reports.get(id) ?? []).filter((k) => !vis || vis.ids.has(k))
  let tops = filtered
    ? [...vis!.ids].filter((id) => !vis!.ids.has(people.managerOf.get(id) ?? ''))
    : people.roots
  // Matches inside a manager loop have no top of their own.
  if (filtered && tops.length === 0 && vis!.ids.size) tops = [[...vis!.ids].sort()[0]]
  const out: TreeRow[] = []
  const done = new Set<string>()
  const walk = (ids: string[], depth: number) => {
    for (const id of [...ids].sort(cmp)) {
      if (done.has(id)) continue // a manager loop comes back round
      done.add(id)
      const children = kids(id)
      const open = filtered ? children.length > 0 : expanded.has(id)
      out.push({
        id,
        depth,
        person: people.byId.get(id)!,
        manager: name(people.managerOf.get(id)),
        direct: people.reports.get(id)?.length ?? 0,
        total: people.total.get(id) ?? 0,
        expandable: (people.reports.get(id)?.length ?? 0) > 0,
        open,
        context: !!vis?.context.has(id),
      })
      if (open) walk(children, depth + 1)
    }
  }
  walk(tops, 0)
  return out
}

/** How many active people carry each flag. */
export function flagCounts(nodes: Person[]): Record<PersonFlag, number> {
  const out: Record<PersonFlag, number> = { no_manager: 0, manager_inactive: 0, manager_loop: 0, delegated_approver_inactive: 0 }
  for (const n of nodes) for (const f of n.flags ?? []) out[f] += 1
  return out
}

export const NODE_W = 184
export const NODE_H = 62
const GAP_X = 18
const LEVEL_H = 112
const ROW_GAP = 24

/**
 * Top-down positions for the drawn people: each manager centred over their
 * drawn reports, and the top-level managers wrapped into rows no wider than
 * maxWidth so a wide org stays readable. `children` lists the drawn reports.
 */
export function treeLayout(
  tops: string[],
  children: (id: string) => string[],
  maxWidth = 1700,
  all: string[] = [],
): Record<string, { x: number; y: number }> {
  const width = new Map<string, number>()
  const depthOf = new Map<string, number>()
  const measure = (id: string, seen: Set<string>): number => {
    if (seen.has(id)) return NODE_W
    seen.add(id)
    const kids = children(id)
    const w = Math.max(NODE_W, kids.reduce((s, k) => s + measure(k, seen), 0) + GAP_X * Math.max(0, kids.length - 1))
    width.set(id, w)
    return w
  }
  const deepest = (id: string, seen: Set<string>): number => {
    if (seen.has(id)) return 0
    seen.add(id)
    return 1 + Math.max(0, ...children(id).map((k) => deepest(k, seen)))
  }
  const pos: Record<string, { x: number; y: number }> = {}
  const place = (id: string, left: number, top: number, depth: number, seen: Set<string>) => {
    if (seen.has(id)) return
    seen.add(id)
    const w = width.get(id) ?? NODE_W
    pos[id] = { x: left + w / 2, y: top + depth * LEVEL_H }
    depthOf.set(id, depth)
    const kids = children(id)
    const used = kids.reduce((s, k) => s + (width.get(k) ?? NODE_W), 0) + GAP_X * Math.max(0, kids.length - 1)
    let x = left + (w - used) / 2
    for (const k of kids) {
      place(k, x, top, depth + 1, seen)
      x += (width.get(k) ?? NODE_W) + GAP_X
    }
  }
  // Anyone the tops don't reach (a loop with nothing above it) starts a tree of its own.
  const covered = new Set<string>()
  const cover = (id: string) => {
    if (covered.has(id)) return
    covered.add(id)
    children(id).forEach(cover)
  }
  tops.forEach(cover)
  tops = [...tops]
  for (const id of all) {
    if (!covered.has(id)) {
      tops.push(id)
      cover(id)
    }
  }
  const seen = new Set<string>()
  for (const t of tops) measure(t, seen)
  let x = 0
  let rowTop = 0
  let rowDepth = 1
  const placed = new Set<string>()
  for (const t of tops) {
    const w = width.get(t) ?? NODE_W
    if (x > 0 && x + w > maxWidth) {
      rowTop += rowDepth * LEVEL_H + ROW_GAP
      x = 0
      rowDepth = 1
    }
    place(t, x, rowTop, 0, placed)
    rowDepth = Math.max(rowDepth, deepest(t, new Set()))
    x += w + GAP_X * 3
  }
  return pos
}
