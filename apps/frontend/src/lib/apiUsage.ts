/**
 * Display helpers for the Health Report's API usage card and the API Usage
 * page. The data is the snapshot's metrics.api_usage (backend
 * services/api_usage.py).
 */

export interface UsageShare {
  id?: string | null
  name: string
  requests: number
  share_pct: number
  other?: boolean
}

/** A caller or API family with its count on each day of the trend. */
export interface UsageSource extends UsageShare {
  series: number[]
}

export interface ResourceRow {
  api_family: string | null
  resource: string
  requests: number
  share_pct: number
}

export interface ObjectRow {
  name: string
  requests: number
  share_pct: number
}

export interface ApexEndpoint {
  url_mapping: string | null
  apex_class: string | null
  namespace: string | null
  requests: number
  share_pct: number
}

export interface UsageDay {
  date: string
  requests: number
  counting: number
  pct_of_limit: number | null
}

export interface ApiUsage {
  status: 'ok' | 'unavailable' | 'no_logs'
  reason: string | null
  read_status?: string | null
  coverage_note: string
  limit: { max: number; remaining: number; used: number } | null
  days_collected: number
  first_day?: string
  last_day?: string
  single_day?: boolean
  total_requests?: number
  daily_average?: number
  trend?: UsageDay[]
  peak?: UsageDay
  by_app?: UsageShare[]
  by_family?: UsageShare[]
  by_user?: UsageShare[] | null
  users_hidden_reason?: string | null
  connected_apps?: { name: string; last_used_at: string | null }[]
  // The API Usage page (absent on Health Reports run before it existed).
  apps?: UsageSource[]
  users?: UsageSource[] | null
  families?: UsageSource[]
  detail_days?: number
  detail_first_day?: string | null
  by_resource?: ResourceRow[]
  by_object?: ObjectRow[]
  objects_note?: string
  apex_rest?: ApexEndpoint[]
  apex_rest_read?: boolean
}

/** What Salesforce's documents say counts against the daily limit (checked 18 Oct 2026). */
export const WHAT_COUNTS = [
  'The daily limit is an allocation of inbound API requests: REST, SOAP, Bulk, Bulk 2.0 and most Connect REST APIs. Calls from some Salesforce connected apps, such as the mobile app, don’t count (Salesforce Developer Limits and Allocations Quick Reference).',
  'Apex can spend it too: most ConnectApi calls made from Apex count toward the allocation (Apex Developer Guide).',
]

/** Unconfirmed in Salesforce's documentation, so shown with the data it affects. */
export const DETAIL_UNVERIFIED =
  'Not confirmed in Salesforce’s documentation: how the log writes an Apex REST request’s resource (Newton looks for the /services/apexrest/ path) and how it lists several objects in one request.'

export const APEX_REST_NOTE =
  'An Apex REST request is shown as the @RestResource URL mapping it reaches and the class behind it, never its full path. Newton reads each class’s mapping and keeps only that, never the code.'

export interface Tile {
  label: string
  value: string
  note?: string
  warn?: boolean
}

/** The four headline figures: total, daily average, today against the limit, the peak day.
 *  Values are compact; each note carries the exact count the card always showed. */
export function usageTiles(u: ApiUsage): Tile[] {
  const n = (v: number) => v.toLocaleString('en-GB')
  const days = u.days_collected
  const tiles: Tile[] = [
    {
      label: days > 1 ? `${days}-day total` : 'Requests',
      value: compact(u.total_requests ?? 0),
      note: `${n(u.total_requests ?? 0)} · ${periodLabel(u)}`,
    },
    { label: 'Daily average', value: compact(u.daily_average ?? 0), note: `${n(u.daily_average ?? 0)} requests a day` },
  ]
  if (u.limit) {
    const pct = Math.round((u.limit.used / u.limit.max) * 100)
    tiles.push({
      label: 'Today so far',
      value: `${compact(u.limit.used)} of ${compact(u.limit.max)}`,
      note: `${n(u.limit.used)} of ${n(u.limit.max)} · ${pct}% of the daily limit`,
      warn: pct >= NEAR_LIMIT_PCT,
    })
  } else {
    tiles.push({ label: 'Today so far', value: '—', note: 'Limit not read' })
  }
  const p = u.peak
  if (p) {
    tiles.push({
      label: 'Peak day',
      value: p.pct_of_limit != null ? `${p.pct_of_limit}% of limit` : compact(p.counting),
      note: `${dayLabel(p.date, true)} · ${n(p.counting)} counted`,
      warn: isNearLimit(p),
    })
  }
  return tiles
}

/** Connected apps, largest first, without the "Other" bucket. */
export function topSources(u: ApiUsage, n = 3): UsageShare[] {
  return (u.apps ?? u.by_app ?? []).filter((a) => !a.other).slice(0, n)
}

/** Days at or above NEAR_LIMIT_PCT of the limit. */
export function nearLimitDays(u: ApiUsage): UsageDay[] {
  return (u.trend ?? []).filter(isNearLimit)
}

/** "/supportchat/v1/*" -> "/services/apexrest/supportchat/v1/*" (namespace first when there is one). */
export function apexEndpoint(e: ApexEndpoint): string {
  if (!e.url_mapping || !e.url_mapping.startsWith('/')) return e.url_mapping ?? ''
  return `/services/apexrest${e.namespace ? `/${e.namespace}` : ''}${e.url_mapping}`
}

/** A day at or above this share of the daily limit is marked "near the limit". */
export const NEAR_LIMIT_PCT = 90

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "2026-09-14" -> "14 Sep" (or "14 Sep 2026"); fixed English months, UTC. */
export function dayLabel(iso: string, withYear = false): string {
  const [y, m, d] = iso.split('-').map(Number)
  return `${d} ${MONTHS[m - 1]}${withYear ? ` ${y}` : ''}`
}

/** "14 Sep to 13 Oct 2026 (30 days)", or the yesterday-only explanation. */
export function periodLabel(u: ApiUsage): string {
  if (!u.last_day) return ''
  if (u.days_collected <= 1) return `${dayLabel(u.last_day, true)} only`
  return `${dayLabel(u.first_day ?? u.last_day)} to ${dayLabel(u.last_day, true)} (${u.days_collected} days)`
}

export const SINGLE_DAY_NOTE =
  'Salesforce keeps this log for one day, so a trend builds up as later Health Report runs add the day they find. A daily collector is planned.'

/** 393,000 -> "393K"; 1,015,000 -> "1.02M". */
export function compact(n: number): string {
  if (n >= 1_000_000) return `${Math.round(n / 10_000) / 100}M`
  if (n >= 10_000) return `${Math.round(n / 1000)}K`
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}K`
  return String(n)
}

export function isNearLimit(d: UsageDay): boolean {
  return d.pct_of_limit != null && d.pct_of_limit >= NEAR_LIMIT_PCT
}

/** Headline sentence: the top consumer and its share. */
export function headline(u: ApiUsage): string | null {
  const top = u.by_app?.find((a) => !a.other)
  if (!top || !u.total_requests) return null
  return `${top.name} made ${top.share_pct}% of requests`
}

/** Round axis ticks from 0 up to at least max: 0, 500K, 1M rather than 0, 508K, 1.02M. */
export function niceTicks(max: number, count = 3): number[] {
  if (max <= 0) return [0]
  const raw = max / count
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag
  const out: number[] = []
  for (let v = 0; v <= max + 1e-9; v += step) out.push(v)
  return out
}
