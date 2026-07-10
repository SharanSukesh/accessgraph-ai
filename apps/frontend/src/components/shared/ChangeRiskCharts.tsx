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

import { useMemo } from 'react'

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
  days = 30,
  width = 640,
  height = 120,
  onHover,
}: DailyActivityBarsProps) {
  // Build a continuous day array ending today (UTC).
  const timeline = useMemo(() => {
    const today = new Date()
    today.setUTCHours(0, 0, 0, 0)
    const items: { date: string; count: number }[] = []
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today)
      d.setUTCDate(today.getUTCDate() - i)
      const iso = d.toISOString().slice(0, 10)
      items.push({ date: iso, count: byDay[iso] ?? 0 })
    }
    return items
  }, [byDay, days])

  const max = Math.max(1, ...timeline.map((t) => t.count))
  const barGap = 2
  const totalGap = barGap * (timeline.length - 1)
  const barWidth = (width - totalGap) / timeline.length
  const chartHeight = height - 24 // reserve room for x-axis labels

  return (
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

        return (
          <g
            key={t.date}
            onMouseEnter={() => onHover?.({ date: t.date, count: t.count })}
            onMouseLeave={() => onHover?.(null)}
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
              >
                <title>
                  {new Date(t.date).toLocaleDateString(undefined, {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                  })}
                  : {t.count} events
                </title>
              </rect>
            )}
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
