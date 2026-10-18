/**
 * Display helpers for the Health Report's API usage card. The data is the
 * snapshot's metrics.api_usage (backend services/api_usage.py).
 */

export interface UsageShare {
  id?: string | null
  name: string
  requests: number
  share_pct: number
  other?: boolean
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
