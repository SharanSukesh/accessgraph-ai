'use client'

/**
 * Pieces shared by the Health Report's API usage card and the API Usage
 * page (roadmap item 5): the headline figures, the daily chart against the
 * limit, source tables with a share bar and a trend line, and the notes.
 */

import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Info } from 'lucide-react'
import {
  type ApiUsage,
  type Tile,
  type UsageDay,
  NEAR_LIMIT_PCT,
  SINGLE_DAY_NOTE,
  compact,
  dayLabel,
  isNearLimit,
  nearLimitDays,
  niceTicks,
  usageTiles,
} from '@/lib/apiUsage'

export const MUTED = 'text-grove-ink/60 dark:text-grove-ink-dk/60'
const LABEL = 'text-xs font-semibold text-grove-ink/80 dark:text-grove-ink-dk/80'

export function UsageTiles({ usage }: { usage: ApiUsage }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {usageTiles(usage).map((t: Tile) => (
        <div key={t.label} className="rounded-lg border border-grove-border bg-grove-canvas/40 px-3 py-2.5 dark:border-grove-border-dk dark:bg-grove-surface-dk/40">
          <p className={`text-[11px] font-medium uppercase tracking-wide ${MUTED}`}>{t.label}</p>
          <p className={`v2-num mt-0.5 text-xl font-semibold ${t.warn ? 'text-amber-700 dark:text-amber-300' : 'text-grove-ink dark:text-grove-ink-dk'}`}>
            {t.value}
          </p>
          {t.note && <p className={`text-[11px] ${MUTED}`}>{t.note}</p>}
        </div>
      ))}
    </div>
  )
}

/** The daily chart with its legend, a table toggle and the days near the limit. */
export function DailySection({ usage, showNearDays = true }: { usage: ApiUsage; showNearDays?: boolean }) {
  const [table, setTable] = useState(false)
  const trend = usage.trend ?? []
  if (trend.length < 2) return null
  const near = nearLimitDays(usage)
  return (
    <div>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <p className={LABEL}>Requests counted against the limit, per day</p>
        <div className={`flex items-center gap-3 text-[11px] ${MUTED}`}>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-sky-600 dark:bg-sky-400" aria-hidden /> Day</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-amber-500 dark:bg-amber-400" aria-hidden /> {NEAR_LIMIT_PCT}% of the limit or more</span>
          <button type="button" className="underline underline-offset-2" onClick={() => setTable((t) => !t)}>
            {table ? 'Show chart' : 'Show as table'}
          </button>
        </div>
      </div>
      {table ? <DayTable trend={trend} maxHeight="max-h-64" /> : <DailyChart trend={trend} limit={usage.limit?.max ?? null} />}
      {showNearDays && near.length > 0 && (
        <p className="mt-1 flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-300">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {near.length === 1 ? '1 day' : `${near.length} days`} at {NEAR_LIMIT_PCT}% of today&apos;s limit or more:{' '}
          {near.map((d) => `${dayLabel(d.date)} (${d.pct_of_limit}%)`).join(', ')}
        </p>
      )}
    </div>
  )
}

/** Day-by-day figures; extra columns (e.g. the busiest app) come from the page. */
export function DayTable({
  trend,
  maxHeight = '',
  extra,
}: {
  trend: UsageDay[]
  maxHeight?: string
  extra?: { head: string; cell: (d: UsageDay, i: number) => React.ReactNode }
}) {
  return (
    <div className={`overflow-auto rounded-md border border-grove-border bg-grove-surface dark:border-grove-border-dk dark:bg-grove-surface-dk ${maxHeight}`}>
      <table className="w-full text-xs">
        <thead className={`sticky top-0 bg-grove-surface dark:bg-grove-surface-dk ${MUTED}`}>
          <tr className="border-b border-grove-border dark:border-grove-border-dk">
            <th className="px-3 py-2 text-left font-medium">Day</th>
            <th className="px-3 py-2 text-right font-medium">Counted</th>
            <th className="px-3 py-2 text-right font-medium">% of limit</th>
            <th className="px-3 py-2 text-right font-medium">All requests</th>
            {extra && <th className="px-3 py-2 text-left font-medium">{extra.head}</th>}
          </tr>
        </thead>
        <tbody className="v2-num divide-y divide-grove-border dark:divide-grove-border-dk">
          {trend.map((d, i) => (
            <tr key={d.date} className={isNearLimit(d) ? 'bg-amber-50/60 dark:bg-amber-900/10' : ''}>
              <td className="px-3 py-1.5">{dayLabel(d.date, true)}</td>
              <td className="px-3 py-1.5 text-right">{d.counting.toLocaleString('en-GB')}</td>
              <td className={`px-3 py-1.5 text-right ${isNearLimit(d) ? 'font-semibold text-amber-700 dark:text-amber-300' : ''}`}>
                {d.pct_of_limit == null ? '—' : `${d.pct_of_limit}%`}
              </td>
              <td className="px-3 py-1.5 text-right">{d.requests.toLocaleString('en-GB')}</td>
              {extra && <td className="px-3 py-1.5 text-left font-sans">{extra.cell(d, i)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** A source's requests per day as a small line; the hover title gives the range. */
export function Sparkline({ series, dates }: { series: number[]; dates: string[] }) {
  if (series.length < 2) return <span className={MUTED}>—</span>
  const W = 96
  const H = 22
  const max = Math.max(...series) || 1
  const pts = series.map((v, i) => `${((i / (series.length - 1)) * (W - 2) + 1).toFixed(1)},${(H - 2 - (v / max) * (H - 4)).toFixed(1)}`)
  const peak = series.indexOf(Math.max(...series))
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img"
      aria-label={`Requests per day, ${dayLabel(dates[0])} to ${dayLabel(dates[dates.length - 1])}; highest ${series[peak].toLocaleString('en-GB')} on ${dayLabel(dates[peak])}`}>
      <title>{`Highest ${series[peak].toLocaleString('en-GB')} on ${dayLabel(dates[peak], true)}`}</title>
      <polyline points={pts.join(' ')} fill="none" strokeWidth={1.5} strokeLinejoin="round" className="stroke-sky-600 dark:stroke-sky-400" />
    </svg>
  )
}

export interface Column<T> {
  head: string
  align?: 'left' | 'right'
  cell: (row: T) => React.ReactNode
  className?: string
}

/** A card-style table: clear row dividers, a sticky header, the top `limit` rows and "Show all". */
export function UsageTable<T>({
  title,
  rows,
  columns,
  rowKey,
  limit = 10,
  empty,
  note,
}: {
  title: string
  rows: T[]
  columns: Column<T>[]
  rowKey: (row: T) => string
  limit?: number
  empty?: string
  note?: React.ReactNode
}) {
  const [all, setAll] = useState(false)
  const shown = all ? rows : rows.slice(0, limit)
  return (
    <section className="overflow-hidden rounded-lg border border-grove-border bg-grove-surface dark:border-grove-border-dk dark:bg-grove-surface-dk">
      <header className="flex items-center justify-between gap-2 border-b border-grove-border px-4 py-2.5 dark:border-grove-border-dk">
        <h3 className="text-sm font-semibold text-grove-ink dark:text-grove-ink-dk">{title}</h3>
        <span className={`v2-num text-xs ${MUTED}`}>{rows.length.toLocaleString('en-GB')}</span>
      </header>
      {rows.length === 0 ? (
        <p className={`px-4 py-3 text-xs ${MUTED}`}>{empty ?? 'Nothing recorded.'}</p>
      ) : (
        <div className="max-h-[32rem] overflow-auto">
          <table className="w-full text-sm">
            <thead className={`sticky top-0 z-[1] bg-grove-surface text-xs dark:bg-grove-surface-dk ${MUTED}`}>
              <tr className="border-b border-grove-border dark:border-grove-border-dk">
                {columns.map((c) => (
                  <th key={c.head} className={`px-4 py-2 font-medium ${c.align === 'right' ? 'text-right' : 'text-left'}`}>{c.head}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-grove-border dark:divide-grove-border-dk">
              {shown.map((r) => (
                <tr key={rowKey(r)} className="hover:bg-primary-50/30 dark:hover:bg-primary-900/10">
                  {columns.map((c) => (
                    <td key={c.head} className={`px-4 py-2 align-middle ${c.align === 'right' ? 'v2-num text-right' : ''} ${c.className ?? ''}`}>
                      {c.cell(r)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {(rows.length > limit || note) && (
        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-grove-border px-4 py-2 text-xs dark:border-grove-border-dk">
          <span className={MUTED}>{note}</span>
          {rows.length > limit && (
            <button type="button" className="font-medium text-primary-700 hover:underline dark:text-primary-300" onClick={() => setAll((v) => !v)}>
              {all ? `Show top ${limit}` : `Show all ${rows.length.toLocaleString('en-GB')}`}
            </button>
          )}
        </footer>
      )}
    </section>
  )
}

/** A share of all requests as a bar plus its percentage. */
export function ShareBar({ pct, other = false }: { pct: number; other?: boolean }) {
  return (
    <span className="flex items-center gap-2">
      <span className="h-2 w-28 shrink-0 rounded-full bg-grove-border/60 dark:bg-grove-border-dk" aria-hidden>
        <span
          className={`block h-2 rounded-full ${other ? 'bg-grove-ink/30 dark:bg-grove-ink-dk/30' : 'bg-sky-600 dark:bg-sky-400'}`}
          style={{ width: `${Math.max(1.5, Math.min(100, pct))}%` }}
        />
      </span>
      <span className="v2-num w-12 text-right text-xs text-grove-ink/75 dark:text-grove-ink-dk/75">{pct}%</span>
    </span>
  )
}

/** The notes every view keeps: one-day log, unread log, what's counted, what Newton keeps. */
export function UsageNotes({ usage }: { usage: ApiUsage }) {
  return (
    <>
      {usage.single_day && (
        <p className="flex items-start gap-2 rounded-md bg-grove-border/40 px-3 py-2 text-xs text-grove-ink/80 dark:bg-grove-border-dk/40 dark:text-grove-ink-dk/80">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> {SINGLE_DAY_NOTE}
        </p>
      )}
      {usage.read_status && usage.read_status !== 'ok' && (
        <p className="text-xs text-amber-700 dark:text-amber-300">
          This run couldn&apos;t read the log; showing the days earlier runs kept.
        </p>
      )}
    </>
  )
}

export function UsageFootnote({ usage }: { usage: ApiUsage }) {
  return (
    <p className="text-[11px] text-grove-ink/50 dark:text-grove-ink-dk/50">
      {usage.coverage_note} Newton keeps daily counts only, never the log rows. The limit line is today&apos;s
      limit from Salesforce.
    </p>
  )
}

/** Daily requests counted against the limit, with the limit as a reference line. */
export function DailyChart({ trend, limit }: { trend: UsageDay[]; limit: number | null }) {
  const [hover, setHover] = useState<number | null>(null)
  // Drawn at the real pixel width so text stays at its set size.
  const box = useRef<HTMLDivElement>(null)
  const [W, setW] = useState(640)
  useEffect(() => {
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const H = 190
  const left = 44
  const right = 8
  const top = 12
  const bottom = 22
  const pw = W - left - right
  const ph = H - top - bottom
  const yMax = Math.max(limit ?? 0, ...trend.map((d) => d.counting)) * 1.08 || 1
  const slot = pw / trend.length
  const barW = Math.max(2, slot - 2)
  const y = (v: number) => top + ph - (v / yMax) * ph
  const ticks = niceTicks(yMax / 1.08)
  const peak = trend.reduce((best, d, i) => (d.counting > trend[best].counting ? i : best), 0)
  const active = hover ?? null
  const tip = active != null ? trend[active] : null

  return (
    <div className="relative" ref={box}>
      <svg
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        className="block"
        role="img"
        aria-label={`Daily API requests counted against the limit, ${trend.length} days`}
        onMouseLeave={() => setHover(null)}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={left} x2={W - right} y1={y(t)} y2={y(t)} className="stroke-grove-border dark:stroke-grove-border-dk" strokeWidth={1} />
            <text x={left - 6} y={y(t) + 3} textAnchor="end" className="fill-grove-ink/50 dark:fill-grove-ink-dk/50" fontSize={10}>
              {compact(Math.round(t))}
            </text>
          </g>
        ))}
        {trend.map((d, i) => {
          const x = left + i * slot + (slot - barW) / 2
          const h = Math.max(1, y(0) - y(d.counting))
          const near = isNearLimit(d)
          return (
            <g key={d.date} onMouseEnter={() => setHover(i)}>
              {/* Hit target: the whole column, not just the bar. */}
              <rect x={left + i * slot} y={top} width={slot} height={ph} fill="transparent" />
              <rect
                x={x}
                y={y(0) - h}
                width={barW}
                height={h}
                rx={Math.min(2, barW / 2)}
                className={
                  near
                    ? 'fill-amber-500 dark:fill-amber-400'
                    : active === i
                      ? 'fill-sky-700 dark:fill-sky-300'
                      : 'fill-sky-600 dark:fill-sky-400'
                }
              />
            </g>
          )
        })}
        {limit != null && (
          <g>
            <line x1={left} x2={W - right} y1={y(limit)} y2={y(limit)} strokeDasharray="4 3" strokeWidth={1.5} className="stroke-grove-ink/70 dark:stroke-grove-ink-dk/70" />
            <text x={W - right} y={y(limit) - 4} textAnchor="end" fontSize={10} className="fill-grove-ink/75 dark:fill-grove-ink-dk/75">
              Daily limit {limit.toLocaleString('en-GB')}
            </text>
          </g>
        )}
        {trend.length > 1 && (
          <text
            x={left + peak * slot + (slot + barW) / 2 + 4}
            y={y(trend[peak].counting) + 10}
            textAnchor="start"
            fontSize={10}
            fontWeight={600}
            className="fill-grove-ink dark:fill-grove-ink-dk"
          >
            {compact(trend[peak].counting)}
          </text>
        )}
        {[0, trend.length - 1].filter((v, i, a) => a.indexOf(v) === i).map((i) => (
          <text key={i} x={i === 0 ? left : W - right} y={H - 6} textAnchor={i === 0 ? 'start' : 'end'} fontSize={10} className="fill-grove-ink/50 dark:fill-grove-ink-dk/50">
            {dayLabel(trend[i].date)}
          </text>
        ))}
      </svg>
      {tip && (
        <div
          className="pointer-events-none absolute top-0 z-10 rounded-md border border-grove-border bg-grove-surface px-2.5 py-1.5 text-xs shadow-grove-lift dark:border-grove-border-dk dark:bg-grove-surface-dk"
          style={{ left: `${Math.min(78, ((left + (active as number) * slot) / W) * 100)}%` }}
        >
          <p className="font-semibold text-grove-ink dark:text-grove-ink-dk">{dayLabel(tip.date, true)}</p>
          <p className="v2-num text-grove-ink/75 dark:text-grove-ink-dk/75">
            {tip.counting.toLocaleString('en-GB')} counted against the limit
            {tip.pct_of_limit != null && ` (${tip.pct_of_limit}%)`}
          </p>
          {tip.requests !== tip.counting && (
            <p className={`v2-num ${MUTED}`}>{tip.requests.toLocaleString('en-GB')} requests in all</p>
          )}
          {isNearLimit(tip) && <p className="text-amber-700 dark:text-amber-300">Near the limit</p>}
        </div>
      )}
    </div>
  )
}

export function Unavailable({ usage }: { usage: ApiUsage }) {
  return (
    <div className="space-y-3 text-sm">
      <p className="flex items-start gap-2 text-grove-ink/80 dark:text-grove-ink-dk/80">
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {usage.reason}
      </p>
      {usage.limit && (
        <p className="v2-num text-xs text-grove-ink/70 dark:text-grove-ink-dk/70">
          Org total today so far: {usage.limit.used.toLocaleString('en-GB')} of {usage.limit.max.toLocaleString('en-GB')} daily API requests
        </p>
      )}
      {!!usage.connected_apps?.length && (
        <div>
          <p className="text-xs font-semibold text-grove-ink/80 dark:text-grove-ink-dk/80">
            Connected apps and when they were last used (from Integration Sprawl)
          </p>
          <ul className="mt-1 text-xs text-grove-ink/70 dark:text-grove-ink-dk/70">
            {usage.connected_apps.map((a) => (
              <li key={a.name}>
                {a.name}: {a.last_used_at ? dayLabel(a.last_used_at.slice(0, 10), true) : 'not recorded'}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
