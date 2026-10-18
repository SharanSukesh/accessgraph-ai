'use client'

/**
 * Health Report: API usage by source (roadmap item 5). Which connected app,
 * integration user and API family spends the daily API requests, and the
 * daily trend against the limit. Reads metrics.api_usage from the snapshot.
 */

import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Info } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/shared/Card'
import {
  type ApiUsage,
  type UsageDay,
  type UsageShare,
  SINGLE_DAY_NOTE,
  compact,
  dayLabel,
  headline,
  isNearLimit,
  NEAR_LIMIT_PCT,
  niceTicks,
  periodLabel,
} from '@/lib/apiUsage'

const MUTED = 'text-grove-ink/60 dark:text-grove-ink-dk/60'

function ShareBars({ title, items }: { title: string; items: UsageShare[] }) {
  if (!items.length) return null
  const max = Math.max(...items.map((i) => i.requests))
  return (
    <div>
      <p className="mb-2 text-xs font-semibold text-grove-ink/80 dark:text-grove-ink-dk/80">{title}</p>
      <ul className="space-y-1.5">
        {items.map((i) => (
          <li key={`${i.id ?? i.name}`} className="grid grid-cols-[minmax(0,40%)_1fr_auto] items-center gap-2 text-xs">
            <span className="truncate text-grove-ink dark:text-grove-ink-dk" title={i.name}>{i.name}</span>
            <span className="h-2.5 rounded-r bg-grove-border/60 dark:bg-grove-border-dk" aria-hidden>
              <span
                className={`block h-2.5 rounded-r ${i.other ? 'bg-grove-ink/30 dark:bg-grove-ink-dk/30' : 'bg-sky-600 dark:bg-sky-400'}`}
                style={{ width: `${Math.max(1, (i.requests / max) * 100)}%` }}
              />
            </span>
            <span className={`v2-num w-24 text-right ${MUTED}`}>
              {i.share_pct}% · {compact(i.requests)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Daily requests counted against the limit, with the limit as a reference line. */
function DailyChart({ trend, limit }: { trend: UsageDay[]; limit: number | null }) {
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

function Unavailable({ usage }: { usage: ApiUsage }) {
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

export function ApiUsageCard({ usage, action }: { usage?: ApiUsage | null; action?: React.ReactNode }) {
  const [table, setTable] = useState(false)
  if (!usage) return null
  const trend = usage.trend ?? []
  const nearDays = trend.filter(isNearLimit)
  const title = headline(usage)

  return (
    <Card variant="bordered">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle>API usage by source</CardTitle>
          {action}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {usage.status !== 'ok' ? (
          <Unavailable usage={usage} />
        ) : (
          <>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                {title && <p className="text-lg font-semibold text-grove-ink dark:text-grove-ink-dk">{title}</p>}
                <p className={`text-xs ${MUTED}`}>
                  {periodLabel(usage)} · {usage.total_requests?.toLocaleString('en-GB')} requests,{' '}
                  {usage.daily_average?.toLocaleString('en-GB')} a day on average
                </p>
              </div>
              {usage.limit && (
                <p className={`v2-num text-xs ${MUTED}`}>
                  Today so far: {usage.limit.used.toLocaleString('en-GB')} of {usage.limit.max.toLocaleString('en-GB')}
                </p>
              )}
            </div>

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

            {trend.length > 1 && (
              <div>
                <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-grove-ink/80 dark:text-grove-ink-dk/80">
                    Requests counted against the limit, per day
                  </p>
                  <div className={`flex items-center gap-3 text-[11px] ${MUTED}`}>
                    <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-sky-600 dark:bg-sky-400" aria-hidden /> Day</span>
                    <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-amber-500 dark:bg-amber-400" aria-hidden /> {NEAR_LIMIT_PCT}% of the limit or more</span>
                    <button type="button" className="underline underline-offset-2" onClick={() => setTable((t) => !t)}>
                      {table ? 'Show chart' : 'Show as table'}
                    </button>
                  </div>
                </div>
                {table ? (
                  <div className="max-h-64 overflow-auto">
                    <table className="w-full text-xs">
                      <thead className={MUTED}>
                        <tr><th className="text-left font-medium">Day</th><th className="text-right font-medium">Counted</th><th className="text-right font-medium">% of limit</th><th className="text-right font-medium">All requests</th></tr>
                      </thead>
                      <tbody className="v2-num">
                        {trend.map((d) => (
                          <tr key={d.date}>
                            <td>{dayLabel(d.date, true)}</td>
                            <td className="text-right">{d.counting.toLocaleString('en-GB')}</td>
                            <td className="text-right">{d.pct_of_limit == null ? '—' : `${d.pct_of_limit}%`}</td>
                            <td className="text-right">{d.requests.toLocaleString('en-GB')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <DailyChart trend={trend} limit={usage.limit?.max ?? null} />
                )}
                {nearDays.length > 0 && (
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-300">
                    <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                    {nearDays.length === 1 ? '1 day' : `${nearDays.length} days`} at {NEAR_LIMIT_PCT}% of today&apos;s limit or more:{' '}
                    {nearDays.map((d) => `${dayLabel(d.date)} (${d.pct_of_limit}%)`).join(', ')}
                  </p>
                )}
              </div>
            )}

            <div className="grid gap-5 md:grid-cols-2">
              <ShareBars title="By connected app" items={usage.by_app ?? []} />
              <div className="space-y-5">
                {usage.by_user ? (
                  <ShareBars title="By integration user" items={usage.by_user} />
                ) : (
                  usage.users_hidden_reason && <p className={`text-xs ${MUTED}`}>{usage.users_hidden_reason}</p>
                )}
                <ShareBars title="By API family" items={usage.by_family ?? []} />
              </div>
            </div>
          </>
        )}
        <p className="text-[11px] text-grove-ink/50 dark:text-grove-ink-dk/50">
          {usage.coverage_note} Newton keeps daily counts only, never the log rows. The limit line is today&apos;s
          limit from Salesforce.
        </p>
      </CardContent>
    </Card>
  )
}
