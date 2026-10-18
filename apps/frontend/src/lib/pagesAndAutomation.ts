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
}
