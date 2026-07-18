'use client'

/**
 * v2 primitive kit — cards, chips, stat tiles, and the small chart
 * marks every mock page composes.
 *
 * Chart conventions (per the dataviz method):
 *  - Data encoded by LENGTH/POSITION with a constant evergreen fill;
 *    color never carries identity on its own.
 *  - Severity/status colors are semantic and always ship with a text
 *    label and count — never color-alone.
 *  - Thin marks, rounded data-ends, 2px surface gaps between segments,
 *    recessive grids, tabular numerals.
 */

import { type ReactNode } from 'react'
import { type LucideIcon } from 'lucide-react'
import { CountUp } from './motion'

// ---------------------------------------------------------------- type

export function Eyebrow({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <p className={`v2-micro text-copper-600 dark:text-copper-400 ${className}`}>
      {children}
    </p>
  )
}

export function PageTitle({
  eyebrow,
  title,
  subtitle,
  actions,
}: {
  eyebrow: string
  title: string
  subtitle?: string
  actions?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <Eyebrow>{eyebrow}</Eyebrow>
        <h1 className="v2-display mt-2 text-4xl font-semibold text-grove-ink dark:text-grove-ink-dk">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-grove-ink/65 dark:text-grove-ink-dk/65">
            {subtitle}
          </p>
        )}
      </div>
      {actions && <div className="flex items-center gap-3">{actions}</div>}
    </div>
  )
}

// ---------------------------------------------------------------- cards

export function V2Card({
  children,
  hero = false,
  lift = false,
  ink = false,
  className = '',
  onClick,
}: {
  children: ReactNode
  hero?: boolean
  lift?: boolean
  ink?: boolean
  className?: string
  onClick?: () => void
}) {
  return (
    <div
      onClick={onClick}
      className={[
        'v2-card',
        hero && 'v2-card-hero',
        lift && 'v2-card-lift',
        ink && 'v2-card-ink',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </div>
  )
}

// ---------------------------------------------------------------- chips

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info'

const SEVERITY_STYLES: Record<Severity, string> = {
  critical:
    'bg-red-50 text-red-800 ring-red-200 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-900',
  high: 'bg-orange-50 text-orange-800 ring-orange-200 dark:bg-orange-950/40 dark:text-orange-300 dark:ring-orange-900',
  medium:
    'bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900',
  low: 'bg-primary-50 text-primary-700 ring-primary-200 dark:bg-primary-900/30 dark:text-primary-400 dark:ring-primary-800',
  info: 'bg-grove-canvas text-grove-ink/75 ring-grove-border dark:bg-grove-surface-dk dark:text-grove-ink-dk/75 dark:ring-grove-border-dk',
}

export function SeverityChip({ severity, label }: { severity: Severity; label?: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ring-1 ${SEVERITY_STYLES[severity]}`}
    >
      {label ?? severity}
    </span>
  )
}

export function Pill({
  children,
  tone = 'neutral',
}: {
  children: ReactNode
  tone?: 'neutral' | 'mint' | 'copper'
}) {
  const tones = {
    neutral:
      'bg-grove-canvas text-grove-ink/70 ring-grove-border dark:bg-grove-canvas-dk dark:text-grove-ink-dk/70 dark:ring-grove-border-dk',
    mint: 'bg-primary-50 text-primary-700 ring-primary-200 dark:bg-primary-900/30 dark:text-primary-400 dark:ring-primary-800',
    copper:
      'bg-copper-50 text-copper-700 ring-copper-200 dark:bg-copper-900/30 dark:text-copper-400 dark:ring-copper-800',
  }
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${tones[tone]}`}
    >
      {children}
    </span>
  )
}

// ---------------------------------------------------------------- stat tile

export function StatCard({
  label,
  value,
  format,
  suffix,
  icon: Icon,
  delta,
  deltaTone = 'neutral',
  spark,
  className = '',
}: {
  label: string
  value: number
  format?: (n: number) => string
  suffix?: string
  icon?: LucideIcon
  delta?: string
  deltaTone?: 'good' | 'bad' | 'neutral'
  spark?: number[]
  className?: string
}) {
  const deltaColors = {
    good: 'text-primary-600 dark:text-primary-400',
    bad: 'text-red-600 dark:text-red-400',
    neutral: 'text-grove-ink/55 dark:text-grove-ink-dk/55',
  }
  return (
    <V2Card ink className={`p-5 ${className}`}>
      <div className="flex items-start justify-between">
        <p className="v2-micro text-grove-ink/55 dark:text-grove-ink-dk/55">{label}</p>
        {Icon && (
          <span className="rounded-lg bg-copper-50 p-1.5 text-copper-600 ring-1 ring-copper-100 dark:bg-copper-900/25 dark:text-copper-400 dark:ring-copper-900">
            <Icon className="h-4 w-4" />
          </span>
        )}
      </div>
      <div className="mt-3 flex items-baseline gap-1.5">
        <span className="v2-num text-3xl font-semibold text-grove-ink dark:text-grove-ink-dk">
          <CountUp value={value} format={format} />
        </span>
        {suffix && (
          <span className="text-sm text-grove-ink/55 dark:text-grove-ink-dk/55">{suffix}</span>
        )}
      </div>
      <div className="mt-2 flex items-end justify-between gap-3">
        {delta ? (
          <p className={`text-xs font-medium ${deltaColors[deltaTone]}`}>{delta}</p>
        ) : (
          <span />
        )}
        {spark && <Sparkline data={spark} className="h-8 w-24 shrink-0" />}
      </div>
    </V2Card>
  )
}

// ---------------------------------------------------------------- charts

/** Single-series line sparkline. 2px stroke, faint area, endpoint dot. */
export function Sparkline({
  data,
  className = '',
}: {
  data: number[]
  className?: string
}) {
  const w = 96
  const h = 32
  const pad = 3
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const pts = data.map((v, i) => [
    pad + (i / (data.length - 1)) * (w - pad * 2),
    h - pad - ((v - min) / range) * (h - pad * 2),
  ])
  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')
  const area = `${line} L${pts[pts.length - 1][0].toFixed(1)},${h} L${pts[0][0].toFixed(1)},${h} Z`
  const last = pts[pts.length - 1]
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={className} aria-hidden="true">
      <path d={area} className="fill-primary-600/10 dark:fill-primary-400/10" />
      <path
        d={line}
        fill="none"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="stroke-primary-600 dark:stroke-primary-400"
      />
      <circle cx={last[0]} cy={last[1]} r="2.5" className="fill-copper-500 dark:fill-copper-400" />
    </svg>
  )
}

/**
 * Horizontal labeled bar rows — constant evergreen fill (length is the
 * encoding), value direct-labeled at the row end.
 */
export function HBarRow({
  label,
  value,
  max,
  display,
  highlight = false,
}: {
  label: string
  value: number
  max: number
  display?: string
  highlight?: boolean
}) {
  const pct = Math.max(2, (value / max) * 100)
  return (
    <div className="group flex items-center gap-3 py-1.5">
      <span className="w-36 shrink-0 truncate text-xs font-medium text-grove-ink/75 dark:text-grove-ink-dk/75">
        {label}
      </span>
      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-grove-canvas dark:bg-grove-canvas-dk">
        <div
          className={`v2-bar-fill h-full rounded-full transition-all duration-200 ${
            highlight
              ? 'bg-copper-500 dark:bg-copper-400'
              : 'bg-primary-600 group-hover:bg-primary-500 dark:bg-primary-400'
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="v2-num w-16 shrink-0 text-right text-xs font-semibold text-grove-ink dark:text-grove-ink-dk">
        {display ?? value.toLocaleString()}
      </span>
    </div>
  )
}

/**
 * Segmented tier bar + legend with counts. Status colors are semantic
 * and every segment is labeled in the legend — never color-alone.
 * 2px gaps between segments per mark spec.
 */
export function TierBar({
  tiers,
  className = '',
}: {
  tiers: { label: string; count: number; severity: Severity }[]
  className?: string
}) {
  const total = tiers.reduce((s, t) => s + t.count, 0) || 1
  const fills: Record<Severity, string> = {
    critical: 'bg-red-700 dark:bg-red-400',
    high: 'bg-orange-600 dark:bg-orange-400',
    medium: 'bg-amber-600 dark:bg-amber-400',
    low: 'bg-primary-600 dark:bg-primary-400',
    info: 'bg-grove-border dark:bg-grove-border-dk',
  }
  return (
    <div className={className}>
      <div className="flex h-3 gap-0.5 overflow-hidden rounded-full">
        {tiers.map((t) => (
          <div
            key={t.label}
            className={`${fills[t.severity]} h-full rounded-sm transition-all duration-300`}
            style={{ width: `${Math.max(1.5, (t.count / total) * 100)}%` }}
            title={`${t.label}: ${t.count}`}
          />
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
        {tiers.map((t) => (
          <span key={t.label} className="flex items-center gap-1.5 text-xs text-grove-ink/70 dark:text-grove-ink-dk/70">
            <span className={`h-2 w-2 rounded-full ${fills[t.severity]}`} />
            {t.label}
            <span className="v2-num font-semibold text-grove-ink dark:text-grove-ink-dk">
              {t.count.toLocaleString()}
            </span>
          </span>
        ))}
      </div>
    </div>
  )
}

/** Circular score gauge — value 0–100, band label in the center. */
export function ScoreRing({
  score,
  size = 148,
  label,
  className = '',
}: {
  score: number
  size?: number
  label?: string
  className?: string
}) {
  const stroke = 10
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const filled = (score / 100) * c
  const band =
    score >= 80
      ? 'text-primary-600 dark:text-primary-400'
      : score >= 60
      ? 'text-amber-600 dark:text-amber-400'
      : 'text-red-600 dark:text-red-400'
  return (
    <div className={`relative inline-flex items-center justify-center ${className}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        {/* Track ring — deliberately higher-contrast than the surface
            so the unfilled remainder reads clearly in dark mode. */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          className="stroke-grove-ink/10 dark:stroke-grove-ink-dk/20"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${filled} ${c - filled}`}
          className={`${band} stroke-current transition-all duration-700`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`v2-num text-4xl font-semibold ${band}`}>
          <CountUp value={score} />
        </span>
        {label && (
          <span className="v2-micro mt-1 text-grove-ink/55 dark:text-grove-ink-dk/55">{label}</span>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- table

export function V2Table({
  head,
  children,
  className = '',
}: {
  head: string[]
  children: ReactNode
  className?: string
}) {
  return (
    <div className={`overflow-x-auto ${className}`}>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-grove-border dark:border-grove-border-dk">
            {head.map((h) => (
              <th
                key={h}
                className="v2-micro whitespace-nowrap px-4 py-3 text-left text-grove-ink/55 dark:text-grove-ink-dk/55"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-grove-border/60 dark:divide-grove-border-dk/60">
          {children}
        </tbody>
      </table>
    </div>
  )
}

export function V2Row({
  children,
  onClick,
  className = '',
}: {
  children: ReactNode
  onClick?: () => void
  className?: string
}) {
  return (
    <tr
      onClick={onClick}
      className={`transition-colors duration-150 ${
        onClick ? 'cursor-pointer hover:bg-primary-50/60 dark:hover:bg-primary-900/15' : ''
      } ${className}`}
    >
      {children}
    </tr>
  )
}

export function Td({ children, className = '' }: { children?: ReactNode; className?: string }) {
  return <td className={`px-4 py-3 text-grove-ink/85 dark:text-grove-ink-dk/85 ${className}`}>{children}</td>
}

// ---------------------------------------------------------------- misc

export function SectionHeading({
  title,
  hint,
  actions,
}: {
  title: string
  hint?: string
  actions?: ReactNode
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="v2-display text-xl font-semibold text-grove-ink dark:text-grove-ink-dk">
          {title}
        </h2>
        {hint && <p className="mt-1 text-xs text-grove-ink/55 dark:text-grove-ink-dk/55">{hint}</p>}
      </div>
      {actions}
    </div>
  )
}

/** Segmented control for tab pickers (Sprawl types, Schema tabs, …). */
export function Segmented({
  options,
  value,
  onChange,
}: {
  options: { key: string; label: string; count?: number }[]
  value: string
  onChange: (key: string) => void
}) {
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-xl bg-grove-canvas p-1 ring-1 ring-grove-border dark:bg-grove-canvas-dk dark:ring-grove-border-dk">
      {options.map((o) => {
        const active = o.key === value
        return (
          <button
            key={o.key}
            onClick={() => onChange(o.key)}
            className={`rounded-lg px-3.5 py-1.5 text-sm font-medium transition-all duration-200 ${
              active
                ? 'bg-primary-700 text-white shadow-sm dark:bg-primary-400 dark:text-grove-canvas-dk'
                : 'text-grove-ink/65 hover:text-grove-ink dark:text-grove-ink-dk/65 dark:hover:text-grove-ink-dk'
            }`}
          >
            {o.label}
            {o.count != null && (
              <span className={`v2-num ml-1.5 text-xs ${active ? 'opacity-80' : 'opacity-60'}`}>
                {o.count.toLocaleString()}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
