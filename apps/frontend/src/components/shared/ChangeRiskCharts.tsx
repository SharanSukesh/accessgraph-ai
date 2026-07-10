/**
 * Grove-themed SVG chart primitives for the Change-Risk Radar page.
 *
 * All charts are inline SVG (no external library) so the visual
 * language stays consistent with the Grove design system. Palette is
 * driven by the Tailwind color tokens declared in tailwind.config; we
 * reference them via hex constants below so charts render identically
 * in both themes without a CSS variable dance.
 *
 * The three components exported:
 *   - TierDonut       — blast-tier distribution ring
 *   - DailyActivityBars — 30-day activity histogram, per-day dominant tier
 *   - HorizontalBarChart — generic ranked bar list (used for sections)
 */
'use client'

import { useMemo, useState } from 'react'

// ----------------------------------------------------------------------
// Palette — reads Grove semantic tones. The four blast tiers each get
// a Grove-tuned color; muted variants back them up for tooltips + track
// elements.
// ----------------------------------------------------------------------

export const TIER_COLORS = {
  critical: '#dc2626', // red-600
  high: '#c26b47', // copper-500 (Grove warm accent)
  medium: '#d97706', // amber-600
  low: '#094230', // primary-700 (Grove evergreen)
} as const

export const TIER_COLORS_DARK = {
  critical: '#f87171', // red-400
  high: '#d8794a', // copper-mid dark
  medium: '#fbbf24', // amber-400
  low: '#6bbf95', // primary-400 (Grove mint)
} as const

export const TIER_LABELS: Record<keyof typeof TIER_COLORS, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
}

// Reusable tier ordering — critical → low reads left-to-right as
// worst-to-best on legends and donut segments.
export const TIER_ORDER: (keyof typeof TIER_COLORS)[] = [
  'critical',
  'high',
  'medium',
  'low',
]

// ----------------------------------------------------------------------
// TierDonut — blast-radius distribution donut
// ----------------------------------------------------------------------

interface TierDonutProps {
  /** Absolute counts per tier. Missing keys treated as 0. */
  counts: Partial<Record<keyof typeof TIER_COLORS, number>>
  /** Diameter in px. Defaults to 180. */
  size?: number
  /** Ring stroke width — pushes the hole size. */
  stroke?: number
}

/**
 * Renders a donut ring of tier segments. Center shows the total event
 * count with a small caption. Segments render clockwise starting at
 * 12 o'clock. Zero-total collapses to a single evergreen track ring
 * rather than trying to divide by zero.
 */
export function TierDonut({
  counts,
  size = 180,
  stroke = 22,
}: TierDonutProps) {
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const total = TIER_ORDER.reduce((sum, t) => sum + (counts[t] ?? 0), 0)

  // Pre-compute segment offsets so we can render in one pass.
  const segments = useMemo(() => {
    if (total === 0) return []
    let cumulative = 0
    return TIER_ORDER.map((tier) => {
      const value = counts[tier] ?? 0
      if (value === 0) return null
      const length = (value / total) * circumference
      const offset = cumulative
      cumulative += length
      return { tier, length, offset }
    }).filter(Boolean) as { tier: keyof typeof TIER_COLORS; length: number; offset: number }[]
  }, [counts, total, circumference])

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label="Blast tier distribution"
      className="block"
    >
      {/* Track ring — always visible; segments overlay it. */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        strokeWidth={stroke}
        className="stroke-grove-border dark:stroke-grove-border-dk"
      />

      {/* Segments. Rotate so 0-offset lines up at 12 o'clock. */}
      <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
        {segments.map(({ tier, length, offset }) => (
          <circle
            key={tier}
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={stroke}
            strokeLinecap="butt"
            stroke={TIER_COLORS[tier]}
            className={`stroke-current text-[${TIER_COLORS[tier]}] dark:text-[${TIER_COLORS_DARK[tier]}]`}
            style={{
              strokeDasharray: `${length} ${circumference}`,
              strokeDashoffset: -offset,
              // Explicit color via inline style so it works even when
              // Tailwind's JIT hasn't seen the arbitrary hex.
              color: TIER_COLORS[tier],
            }}
          >
            <title>
              {TIER_LABELS[tier]}: {(counts[tier] ?? 0).toLocaleString()} events
            </title>
          </circle>
        ))}
      </g>

      {/* Center label — total events */}
      <text
        x={size / 2}
        y={size / 2 - 4}
        textAnchor="middle"
        dominantBaseline="middle"
        className="fill-grove-ink dark:fill-grove-ink-dk font-bold"
        style={{ fontSize: size * 0.16, fontVariantNumeric: 'tabular-nums' }}
      >
        {total.toLocaleString()}
      </text>
      <text
        x={size / 2}
        y={size / 2 + size * 0.13}
        textAnchor="middle"
        dominantBaseline="middle"
        className="fill-grove-ink/55 dark:fill-grove-ink-dk/55"
        style={{
          fontSize: size * 0.07,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
        }}
      >
        events
      </text>
    </svg>
  )
}

// ----------------------------------------------------------------------
// DailyActivityBars — 30-day time histogram
// ----------------------------------------------------------------------

interface DailyActivityBarsProps {
  /** Sparse day → count map from the backend. */
  byDay: Record<string, number>
  /** Optional per-day dominant-tier map, for coloring bars by risk. */
  tierByDay?: Record<string, keyof typeof TIER_COLORS>
  /** Optional previous-run sparse day → count map. When provided,
   *  drawn as a thin evergreen line overlay for trend comparison. */
  previousByDay?: Record<string, number>
  /** How many days back to render. Defaults to 30. */
  days?: number
  /** SVG dimensions. */
  width?: number
  height?: number
  /** Called when user hovers a bar — powers an inline tooltip caption. */
  onHover?: (payload: { date: string; count: number } | null) => void
}

/**
 * Renders `days` bars in reverse-chronological → chronological order.
 * Gaps in the input (zero-event days) are filled so the timeline shows
 * a continuous axis. Bar height is proportional to the max value in
 * the visible window.
 *
 * Color: if `tierByDay` is provided, bars use the dominant tier's
 * color; otherwise they use the evergreen brand.
 */
export function DailyActivityBars({
  byDay,
  tierByDay,
  previousByDay,
  days = 30,
  width = 640,
  height = 120,
  onHover,
}: DailyActivityBarsProps) {
  // Build a continuous day array ending today (UTC).
  const timeline = useMemo(() => {
    const today = new Date()
    today.setUTCHours(0, 0, 0, 0)
    const items: { date: string; count: number; prevCount: number }[] = []
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today)
      d.setUTCDate(today.getUTCDate() - i)
      const iso = d.toISOString().slice(0, 10)
      items.push({
        date: iso,
        count: byDay[iso] ?? 0,
        prevCount: previousByDay?.[iso] ?? 0,
      })
    }
    return items
  }, [byDay, previousByDay, days])

  // Normalise both series against the joint max so the overlay line
  // and the bars share a vertical scale.
  const hasPrevious = Boolean(
    previousByDay && Object.keys(previousByDay).length > 0
  )
  const max = Math.max(
    1,
    ...timeline.map((t) => t.count),
    ...(hasPrevious ? timeline.map((t) => t.prevCount) : [0])
  )
  const barGap = 2
  const totalGap = barGap * (timeline.length - 1)
  const barWidth = (width - totalGap) / timeline.length
  const chartHeight = height - 24 // reserve room for x-axis labels

  // Themed tooltip state — replaces the browser's default white
  // `<title>` popup so hover feedback stays in the Grove theme.
  // `xPct` is the tooltip's horizontal position as a fraction of the
  // rendered chart width; because we use a viewBox + preserveAspectRatio
  // the SVG scales but percentages are stable.
  const [tip, setTip] = useState<{
    date: string
    count: number
    prevCount: number
    xPct: number
  } | null>(null)

  return (
    <div className="relative">
    <svg
      width="100%"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`Daily activity, last ${days} days`}
      preserveAspectRatio="xMidYMid meet"
      className="block"
    >
      {/* Zero baseline */}
      <line
        x1={0}
        y1={chartHeight}
        x2={width}
        y2={chartHeight}
        strokeWidth={1}
        className="stroke-grove-border dark:stroke-grove-border-dk"
      />

      {/* Previous-run trend line — drawn UNDER the bars so bars stay
          the primary visual anchor. Point-per-day polyline; dashed
          + semi-transparent so it reads as "context" not "primary". */}
      {hasPrevious && (
        <polyline
          fill="none"
          stroke={TIER_COLORS.low}
          strokeWidth={1.5}
          strokeDasharray="3 3"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.55}
          points={timeline
            .map((t, i) => {
              const x = i * (barWidth + barGap) + barWidth / 2
              const y =
                chartHeight -
                (t.prevCount / max) * (chartHeight - 4)
              return `${x.toFixed(1)},${y.toFixed(1)}`
            })
            .join(' ')}
        >
          <title>Previous run's activity for comparison</title>
        </polyline>
      )}

      {timeline.map((t, i) => {
        const barHeight = t.count === 0 ? 2 : (t.count / max) * (chartHeight - 4)
        const x = i * (barWidth + barGap)
        const y = chartHeight - barHeight
        const tier = tierByDay?.[t.date]
        const fill =
          t.count === 0
            ? 'transparent'
            : tier
            ? TIER_COLORS[tier]
            : TIER_COLORS.low
        const opacity = t.count === 0 ? 0.6 : 0.9

        // Hover hit-target — spans the full column so users don't
        // have to precisely hit a thin bar. Transparent fill so it's
        // invisible.
        const hitTargetX = x
        const hitTargetWidth = barWidth + barGap
        // Tooltip x anchor as a % of the chart width.
        const xPct = ((x + barWidth / 2) / width) * 100

        return (
          <g
            key={t.date}
            onMouseEnter={() => {
              onHover?.({ date: t.date, count: t.count })
              setTip({
                date: t.date,
                count: t.count,
                prevCount: t.prevCount,
                xPct,
              })
            }}
            onMouseLeave={() => {
              onHover?.(null)
              setTip(null)
            }}
          >
            {t.count === 0 && (
              // Zero-day placeholder — a thin cream track so users can
              // still perceive the axis rhythm.
              <rect
                x={x}
                y={chartHeight - 2}
                width={barWidth}
                height={2}
                className="fill-grove-border dark:fill-grove-border-dk"
              />
            )}
            {t.count > 0 && (
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={barHeight}
                rx={1.5}
                style={{ fill, opacity }}
              />
            )}
            {/* Invisible column-wide hit target for easier hover.
                Sits on top so the mouse events fire even when the
                bar itself is zero-height. */}
            <rect
              x={hitTargetX}
              y={0}
              width={hitTargetWidth}
              height={chartHeight}
              fill="transparent"
            />
          </g>
        )
      })}

      {/* Sparse x-axis labels — first, middle, last day */}
      {[0, Math.floor(timeline.length / 2), timeline.length - 1].map((i) => {
        const t = timeline[i]
        if (!t) return null
        const label = new Date(t.date).toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
        })
        const anchor = i === 0 ? 'start' : i === timeline.length - 1 ? 'end' : 'middle'
        const x =
          i === 0
            ? 0
            : i === timeline.length - 1
            ? width
            : i * (barWidth + barGap) + barWidth / 2
        return (
          <text
            key={`xlabel-${i}`}
            x={x}
            y={height - 4}
            textAnchor={anchor as 'start' | 'middle' | 'end'}
            className="fill-grove-ink/55 dark:fill-grove-ink-dk/55"
            style={{
              fontSize: 10,
              fontFamily: 'ui-monospace, monospace',
              letterSpacing: '0.06em',
            }}
          >
            {label}
          </text>
        )
      })}
    </svg>

    {/* Grove-themed tooltip — sits absolutely inside the wrapper div,
        anchored by percentage so it tracks the bar even across
        viewport resizes. Renders both current and previous-run counts
        when a comparison overlay is active. */}
    {tip && (
      <div
        role="tooltip"
        className="pointer-events-none absolute -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md border border-grove-border dark:border-grove-border-dk bg-grove-surface dark:bg-grove-surface-dk shadow-grove-lift px-2.5 py-1.5 text-xs z-20"
        style={{
          // Sit above the chart, shifted up so the arrow doesn't
          // touch the tallest bar. Percentage x anchor keeps position
          // accurate under responsive scaling.
          left: `${tip.xPct}%`,
          top: 0,
          marginTop: -8,
        }}
      >
        <div className="text-[10px] font-mono uppercase tracking-[0.12em] text-grove-ink/55 dark:text-grove-ink-dk/55">
          {new Date(tip.date).toLocaleDateString(undefined, {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
          })}
        </div>
        <div className="mt-0.5 flex items-baseline gap-1.5">
          <span className="text-sm font-semibold tabular-nums text-grove-ink dark:text-grove-ink-dk">
            {tip.count.toLocaleString()}
          </span>
          <span className="text-[11px] text-grove-ink/65 dark:text-grove-ink-dk/65">
            event{tip.count === 1 ? '' : 's'}
          </span>
        </div>
        {hasPrevious && (
          <div className="mt-0.5 text-[11px] text-grove-ink/55 dark:text-grove-ink-dk/55">
            Prev run: <span className="tabular-nums">{tip.prevCount}</span>
          </div>
        )}
      </div>
    )}
    </div>
  )
}

// ----------------------------------------------------------------------
// HourlyActivityBars — 24-bar chart showing hour-of-day distribution
// ----------------------------------------------------------------------

interface HourlyActivityBarsProps {
  /** Sparse hour → count map (backend keys as strings for JSON). */
  byHour: Record<string, number>
  /** Business hours start (0-24). Region between start and end is
   *  shaded as "business hours". */
  businessStart: number
  /** Business hours end (0-24). Exclusive. */
  businessEnd: number
  /** Timezone label shown in the tooltip and axis caption. */
  timezoneLabel?: string
  width?: number
  height?: number
}

/**
 * Renders 24 bars, one per hour of day, showing when changes are
 * landing in the user's business timezone. Shades the business-hours
 * region so users can eyeball whether their config actually catches
 * the deploy window they care about.
 *
 * Tooltip is themed to match DailyActivityBars.
 */
export function HourlyActivityBars({
  byHour,
  businessStart,
  businessEnd,
  timezoneLabel,
  width = 640,
  height = 110,
}: HourlyActivityBarsProps) {
  const hours = useMemo(
    () =>
      Array.from({ length: 24 }, (_, h) => ({
        hour: h,
        count: byHour[String(h)] ?? 0,
      })),
    [byHour],
  )
  const max = Math.max(1, ...hours.map((h) => h.count))
  const barGap = 3
  const totalGap = barGap * (hours.length - 1)
  const barWidth = (width - totalGap) / hours.length
  const chartHeight = height - 22

  // Business-hours shading — from start hour to end hour.
  const startX =
    businessStart >= 0 && businessStart <= 24
      ? businessStart * (barWidth + barGap) - barGap / 2
      : 0
  const endX =
    businessEnd >= 0 && businessEnd <= 24
      ? businessEnd * (barWidth + barGap) - barGap / 2
      : width
  const shadeWidth = Math.max(0, endX - startX)

  const [tip, setTip] = useState<{ hour: number; count: number; xPct: number } | null>(
    null,
  )

  return (
    <div className="relative">
      <svg
        width="100%"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Hourly activity distribution"
        preserveAspectRatio="xMidYMid meet"
        className="block"
      >
        {/* Business-hours shading region — soft evergreen band so
            the eye can distinguish "in-window" from "off-hours" at
            a glance. Renders under the bars. */}
        {shadeWidth > 0 && (
          <rect
            x={startX}
            y={0}
            width={shadeWidth}
            height={chartHeight}
            className="fill-primary-50 dark:fill-primary-900/25"
            opacity={0.7}
          />
        )}
        {/* Zero baseline */}
        <line
          x1={0}
          y1={chartHeight}
          x2={width}
          y2={chartHeight}
          strokeWidth={1}
          className="stroke-grove-border dark:stroke-grove-border-dk"
        />
        {hours.map((h) => {
          const barHeight = h.count === 0 ? 2 : (h.count / max) * (chartHeight - 4)
          const x = h.hour * (barWidth + barGap)
          const y = chartHeight - barHeight
          const inBusiness = h.hour >= businessStart && h.hour < businessEnd
          // In-window bars stay evergreen; off-hours bars use the
          // copper accent so the tone reinforces the shading region.
          const fill = h.count === 0
            ? 'transparent'
            : inBusiness
            ? TIER_COLORS.low
            : TIER_COLORS.high
          const xPct = ((x + barWidth / 2) / width) * 100
          return (
            <g
              key={h.hour}
              onMouseEnter={() =>
                setTip({ hour: h.hour, count: h.count, xPct })
              }
              onMouseLeave={() => setTip(null)}
            >
              {h.count === 0 && (
                <rect
                  x={x}
                  y={chartHeight - 2}
                  width={barWidth}
                  height={2}
                  className="fill-grove-border dark:fill-grove-border-dk"
                />
              )}
              {h.count > 0 && (
                <rect
                  x={x}
                  y={y}
                  width={barWidth}
                  height={barHeight}
                  rx={1.5}
                  style={{ fill, opacity: 0.9 }}
                />
              )}
              {/* Column-wide hover hit target */}
              <rect
                x={x}
                y={0}
                width={barWidth + barGap}
                height={chartHeight}
                fill="transparent"
              />
            </g>
          )
        })}
        {/* Sparse x-axis labels — 0, 6, 12, 18, 23 */}
        {[0, 6, 12, 18, 23].map((h) => {
          const x = h * (barWidth + barGap) + barWidth / 2
          return (
            <text
              key={`hlabel-${h}`}
              x={x}
              y={height - 4}
              textAnchor="middle"
              className="fill-grove-ink/55 dark:fill-grove-ink-dk/55"
              style={{
                fontSize: 10,
                fontFamily: 'ui-monospace, monospace',
                letterSpacing: '0.06em',
              }}
            >
              {String(h).padStart(2, '0')}:00
            </text>
          )
        })}
      </svg>
      {tip && (
        <div
          role="tooltip"
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md border border-grove-border dark:border-grove-border-dk bg-grove-surface dark:bg-grove-surface-dk shadow-grove-lift px-2.5 py-1.5 text-xs z-20"
          style={{ left: `${tip.xPct}%`, top: 0, marginTop: -8 }}
        >
          <div className="text-[10px] font-mono uppercase tracking-[0.12em] text-grove-ink/55 dark:text-grove-ink-dk/55">
            {String(tip.hour).padStart(2, '0')}:00 – {String((tip.hour + 1) % 24).padStart(2, '0')}:00
            {timezoneLabel && ` (${timezoneLabel})`}
          </div>
          <div className="mt-0.5 flex items-baseline gap-1.5">
            <span className="text-sm font-semibold tabular-nums text-grove-ink dark:text-grove-ink-dk">
              {tip.count.toLocaleString()}
            </span>
            <span className="text-[11px] text-grove-ink/65 dark:text-grove-ink-dk/65">
              event{tip.count === 1 ? '' : 's'}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

// ----------------------------------------------------------------------
// HorizontalBarChart — ranked bars for section / actor breakdowns
// ----------------------------------------------------------------------

interface HorizontalBarChartProps {
  items: { label: string; value: number; tone?: 'primary' | 'copper' }[]
  onSelect?: (label: string) => void
  activeSelection?: string
}

export function HorizontalBarChart({
  items,
  onSelect,
  activeSelection,
}: HorizontalBarChartProps) {
  const max = Math.max(1, ...items.map((i) => i.value))
  return (
    <ul className="space-y-2">
      {items.map((item) => {
        const pct = (item.value / max) * 100
        const isActive = activeSelection === item.label
        const barTone =
          item.tone === 'copper'
            ? 'bg-copper-500 dark:bg-copper-400'
            : 'bg-primary-500 dark:bg-primary-400'
        const rowTone = isActive
          ? 'bg-primary-50/60 dark:bg-primary-900/25'
          : ''
        return (
          <li key={item.label}>
            <button
              type="button"
              onClick={() => onSelect?.(item.label)}
              className={`w-full text-left group px-2 py-1.5 rounded-lg hover:bg-primary-50/40 dark:hover:bg-primary-900/15 transition-colors ${rowTone}`}
              title={`Filter to ${item.label}`}
            >
              <div className="flex items-center justify-between gap-2 text-xs mb-1">
                <span className="truncate text-grove-ink dark:text-grove-ink-dk font-medium">
                  {item.label}
                </span>
                <span className="tabular-nums text-grove-ink/70 dark:text-grove-ink-dk/70">
                  {item.value.toLocaleString()}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-grove-border/60 dark:bg-grove-border-dk/60 overflow-hidden">
                <div
                  className={`h-full rounded-full ${barTone} transition-[width] duration-500 ease-out`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

// ----------------------------------------------------------------------
// ComponentActivityChart — component-type breakdown
// ----------------------------------------------------------------------

/** Human-readable label + Grove accent for each component-type key.
 *  Order matters: primary CRM building blocks (Apex / Flow) first,
 *  UI (LWC / Aura) middle, user-owned content (Report / Dashboard) last. */
const COMPONENT_META: {
  key: string
  label: string
  color: string
}[] = [
  { key: 'apex_class', label: 'Apex Classes', color: '#094230' }, // primary-700
  { key: 'apex_trigger', label: 'Apex Triggers', color: '#146b4a' }, // primary-600
  { key: 'flow', label: 'Flows', color: '#c26b47' }, // copper-500
  { key: 'aura_bundle', label: 'Aura Bundles', color: '#d97706' }, // amber-600
  { key: 'lwc_bundle', label: 'LWC Bundles', color: '#a2542f' }, // copper-600
  { key: 'report', label: 'Reports', color: '#7d3f21' }, // copper-700
  { key: 'dashboard', label: 'Dashboards', color: '#062e22' }, // primary-800
]

interface ComponentActivityChartProps {
  /** Backend's `component_activity` rollup — see the ChangeRiskSummary type. */
  activity: Record<
    string,
    {
      count: number
      top: {
        id: string | null
        name: string | null
        last_modified: string | null
        actor: string | null
      }[]
    }
  >
  /** Optional callback when a component type is clicked (for future
   *  drill-down). Currently unused; UI reserves the interaction. */
  onSelectType?: (type: string) => void
}

/**
 * Renders a horizontal bar per component type (Apex / Flow / LWC / etc.)
 * showing the total-modified count in the window. Below the bars,
 * lists the top-N modified names for each type as small pills.
 *
 * Zero-activity types are collapsed to a muted "0" so users can still
 * see "we track this, it just didn't move" — an important consulting
 * signal when a client thinks changes are happening in a place they're
 * not.
 */
export function ComponentActivityChart({
  activity,
  onSelectType,
}: ComponentActivityChartProps) {
  const rows = COMPONENT_META.map((meta) => {
    const entry = activity[meta.key]
    return {
      ...meta,
      count: entry?.count ?? 0,
      top: entry?.top ?? [],
    }
  })
  const max = Math.max(1, ...rows.map((r) => r.count))
  const hasAny = rows.some((r) => r.count > 0)

  if (!hasAny) {
    return (
      <p className="text-xs italic text-grove-ink/45 dark:text-grove-ink-dk/45">
        No component modifications in the window — either the org's
        quiet or the API user lacks Tooling API access.
      </p>
    )
  }

  return (
    <div className="space-y-4">
      {rows.map((row) => {
        const dim = row.count === 0
        const pct = (row.count / max) * 100
        return (
          <div key={row.key}>
            <div className="flex items-center justify-between gap-2 mb-1">
              <button
                type="button"
                onClick={() => onSelectType?.(row.key)}
                disabled={dim || !onSelectType}
                className={
                  dim
                    ? 'text-xs font-medium text-grove-ink/40 dark:text-grove-ink-dk/40 cursor-default'
                    : 'text-xs font-medium text-grove-ink dark:text-grove-ink-dk text-left'
                }
              >
                <span
                  className="inline-block w-2.5 h-2.5 rounded-sm mr-1.5 align-middle"
                  style={{ backgroundColor: row.color, opacity: dim ? 0.35 : 1 }}
                  aria-hidden
                />
                {row.label}
              </button>
              <span
                className={
                  dim
                    ? 'text-xs tabular-nums text-grove-ink/40 dark:text-grove-ink-dk/40'
                    : 'text-xs tabular-nums text-grove-ink/85 dark:text-grove-ink-dk/85'
                }
              >
                {row.count.toLocaleString()}
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-grove-border/60 dark:bg-grove-border-dk/60 overflow-hidden">
              <div
                className="h-full rounded-full transition-[width] duration-500 ease-out"
                style={{
                  width: `${pct}%`,
                  backgroundColor: row.color,
                  opacity: dim ? 0.35 : 0.9,
                }}
              />
            </div>
            {row.top.length > 0 && (
              <ul className="mt-1.5 flex flex-wrap gap-1.5">
                {row.top.slice(0, 3).map((item) => (
                  <li
                    key={item.id ?? item.name ?? Math.random()}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono bg-grove-canvas dark:bg-grove-surface-dk ring-1 ring-grove-border dark:ring-grove-border-dk"
                    title={
                      item.actor
                        ? `${item.name} — last modified by ${item.actor}`
                        : (item.name ?? undefined)
                    }
                  >
                    <span className="text-grove-ink/85 dark:text-grove-ink-dk/85 truncate max-w-[180px]">
                      {item.name ?? '(unnamed)'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ----------------------------------------------------------------------
// Blast tier legend — reusable next to the donut
// ----------------------------------------------------------------------

interface TierLegendProps {
  counts: Partial<Record<keyof typeof TIER_COLORS, number>>
  percentages?: Partial<Record<keyof typeof TIER_COLORS, number>>
}

/** Renders a small labeled legend below/next to the donut. Values +
 *  percentages are optional depending on what the backend returned. */
export function TierLegend({ counts, percentages }: TierLegendProps) {
  const total = TIER_ORDER.reduce((s, t) => s + (counts[t] ?? 0), 0)
  return (
    <ul className="space-y-1.5">
      {TIER_ORDER.map((tier) => {
        const count = counts[tier] ?? 0
        const pct =
          percentages?.[tier] ??
          (total > 0 ? Math.round((count / total) * 100) : 0)
        return (
          <li
            key={tier}
            className="flex items-center gap-2 text-xs"
          >
            <span
              className="w-3 h-3 rounded-sm flex-shrink-0"
              style={{ backgroundColor: TIER_COLORS[tier] }}
              aria-hidden
            />
            <span className="text-grove-ink dark:text-grove-ink-dk">
              {TIER_LABELS[tier]}
            </span>
            <span className="ml-auto tabular-nums text-grove-ink/70 dark:text-grove-ink-dk/70">
              {count.toLocaleString()}
              <span className="text-grove-ink/50 dark:text-grove-ink-dk/50 ml-1">
                ({pct}%)
              </span>
            </span>
          </li>
        )
      })}
    </ul>
  )
}
