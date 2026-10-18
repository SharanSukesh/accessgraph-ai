/**
 * Page layouts, Lightning record pages, Apex classes and flows for a user
 * (backend services/ui_access.py, roadmap item 1).
 */

export interface LayoutRow {
  object: string
  record_type: string
  record_type_active: boolean
  /** Whether the profile can use this record type; null when not read. */
  available: boolean | null
  default: boolean | null
  layout: string
  why: string
}

export interface PageRow {
  object: string
  app: string | null
  record_type: string
  form_factor: 'Desktop' | 'Phone'
  page: string
  rule: string
  considered: string[]
}

export interface ApexRow {
  id: string
  name: string
  namespace: string | null
  via: string[][]
}

export interface FlowRow {
  id: string
  api_name: string
  label: string
  process_type: string | null
  trigger_type: string | null
  active: boolean
  restricted: boolean | null
  via: string[][]
  can_run: boolean | null
  why: string
}

export interface ApexSharing {
  summary: string
  notes: string[]
}

export interface PagesAndAutomation {
  available: boolean
  profile_api_name?: string | null
  reason?: string
  collected_at?: string | null
  profile?: string
  layouts?: LayoutRow[]
  layout_note?: string
  record_type_visibility_note?: string
  pages?: PageRow[]
  page_notes?: string[]
  apex?: ApexRow[]
  apex_total?: number
  apex_note?: string
  run_flows?: boolean | null
  run_flows_via?: string[][]
  flows?: FlowRow[]
  flows_total?: number
  notes?: string[]
  apex_sharing?: ApexSharing
}

/** Pages grouped for display: object -> app ("Any other app" last) -> rows. */
export function groupPages(rows: PageRow[]): { object: string; apps: { app: string; rows: PageRow[] }[] }[] {
  const byObject = new Map<string, Map<string, PageRow[]>>()
  for (const r of rows) {
    const apps = byObject.get(r.object) ?? new Map<string, PageRow[]>()
    const key = r.app ?? 'Any other app'
    apps.set(key, [...(apps.get(key) ?? []), r])
    byObject.set(r.object, apps)
  }
  return [...byObject.entries()].map(([object, apps]) => ({
    object,
    apps: [...apps.entries()]
      .sort(([a], [b]) => (a === 'Any other app' ? 1 : b === 'Any other app' ? -1 : a.localeCompare(b)))
      .map(([app, rows]) => ({ app, rows })),
  }))
}

/** "Can run", "Can't run" or "Runs on its own" / "Unknown", always in words. */
export function runLabel(f: FlowRow): string {
  if (f.can_run === true) return 'Can run'
  if (f.can_run === false) return "Can't run"
  return /Starts on its own/.test(f.why) ? 'Runs on its own' : 'Unknown'
}

export function pathLabel(path: string[]): string {
  return path.join(' → ')
}

export interface ProfileListing {
  users_allowed: boolean
  profiles: { id: string; name: string; api_name: string | null; active_users: number | null }[]
}

export interface SetAutomation {
  available: boolean
  reason?: string
  apex?: ApexRow[]
  apex_note?: string
  flows?: (Omit<FlowRow, 'can_run' | 'why'> & { via: string[][] })[]
  run_flows?: boolean | null
  notes?: string[]
  /** On a permission set group with a muting set. */
  muting_note?: string | null
}

/** One step of a "granted through" path, e.g. "Permission set group: Sales Bundle". */
export interface GrantStep {
  /** Access-graph node type, for the chip colour (components/graph/graphStyle.ts). */
  type: 'profile' | 'permission_set' | 'permission_set_group' | 'user'
  kind: string
  name: string
}

const STEP_KINDS: [string, GrantStep['type'], string][] = [
  ['Permission set group: ', 'permission_set_group', 'Group'],
  ['Permission set: ', 'permission_set', 'Permission set'],
  ['Profile: ', 'profile', 'Profile'],
]

export function grantStep(text: string): GrantStep {
  for (const [prefix, type, kind] of STEP_KINDS) {
    if (text.startsWith(prefix)) return { type, kind, name: text.slice(prefix.length) }
  }
  // "Flow User (user setting)": a setting on the user record.
  return { type: 'user', kind: 'User setting', name: text.replace(/ \(user setting\)$/, '') }
}

/** Case-insensitive match of a search against any of the values. */
export function matches(query: string, ...values: (string | null | undefined | string[][])[]): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return values.some((v) =>
    Array.isArray(v) ? v.some((path) => path.some((step) => step.toLowerCase().includes(q))) : (v ?? '').toLowerCase().includes(q),
  )
}

/** Rows grouped under their object, objects in A-Z order, rows kept in order. */
export function byObject<T extends { object: string }>(rows: T[]): { object: string; rows: T[] }[] {
  const out = new Map<string, T[]>()
  for (const r of rows) out.set(r.object, [...(out.get(r.object) ?? []), r])
  return [...out.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([object, rows]) => ({ object, rows }))
}

/** Record pages in display order: object, then app ("Any other app" last), then record type. */
export function sortPages(rows: PageRow[]): PageRow[] {
  const app = (r: PageRow) => (r.app == null ? '\uffff' : r.app)
  return [...rows].sort(
    (a, b) => a.object.localeCompare(b.object) || app(a).localeCompare(app(b)) || a.record_type.localeCompare(b.record_type),
  )
}
