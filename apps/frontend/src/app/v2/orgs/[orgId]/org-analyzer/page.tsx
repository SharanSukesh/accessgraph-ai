'use client'

/**
 * v2 Health Report — the flagship diagnostic surface.
 *
 * Structure: title + mock actions → hero (score ring + executive
 * summary + mini-stats) → Segmented tabs (Overview / Findings /
 * Cost savings). All data from the shared mock module.
 */

import { useState } from 'react'
import { Download, RefreshCw, Sparkles, ArrowRight } from 'lucide-react'
import { Reveal, Stagger, StaggerItem, CountUp } from '@/components/v2/motion'
import {
  PageTitle, V2Card, ScoreRing, SeverityChip, Pill,
  SectionHeading, Segmented, HBarRow, type Severity,
} from '@/components/v2/primitives'
import { HEALTH, fmtMoney } from '@/lib/v2/mock-data'

const TOTAL_SAVINGS = 214800
const FINDINGS_COUNT = 47
const CRITICAL_COUNT = 3

const SAVINGS_CATEGORIES = HEALTH.categories.filter((c) => c.savings > 0)
const MAX_CATEGORY_SAVINGS = Math.max(...SAVINGS_CATEGORIES.map((c) => c.savings))
const QUICK_WINS = HEALTH.topFindings.filter((f) => f.savings != null)

type Tab = 'overview' | 'findings' | 'savings'
type SeverityFilter = 'all' | 'critical' | 'high'

export default function HealthReportPage() {
  const [tab, setTab] = useState<Tab>('overview')
  const [sevFilter, setSevFilter] = useState<SeverityFilter>('all')

  const visibleFindings = HEALTH.topFindings.filter(
    (f) => sevFilter === 'all' || f.severity === sevFilter,
  )

  return (
    <div className="space-y-10">
      <Reveal>
        <PageTitle
          eyebrow="Optimize · diagnostics"
          title="Health Report"
          subtitle="Consulting-grade org-health scan — severity-ranked findings with dollar impact"
          actions={
            <>
              <button className="inline-flex items-center gap-2 rounded-xl border border-grove-border bg-white px-4 py-2 text-sm font-semibold text-grove-ink/80 shadow-sm transition-all duration-200 hover:border-grove-ink/25 hover:bg-grove-canvas dark:border-grove-border-dk dark:bg-grove-canvas-dk dark:text-grove-ink-dk/80 dark:hover:border-grove-ink-dk/25 dark:hover:bg-grove-surface-dk">
                <Download className="h-4 w-4" /> Download PDF
              </button>
              <button className="inline-flex items-center gap-2 rounded-xl bg-primary-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:bg-primary-600 hover:shadow-md dark:bg-primary-400 dark:text-grove-canvas-dk dark:hover:bg-primary-300">
                <RefreshCw className="h-4 w-4" /> Re-run analysis
              </button>
            </>
          }
        />
      </Reveal>

      {/* Hero — score ring + executive summary + mini-stats */}
      <Reveal delay={0.05}>
        <V2Card hero className="p-8">
          <div className="flex flex-col items-start gap-8 lg:flex-row lg:items-center">
            <ScoreRing score={HEALTH.score} label="health score" />
            <div className="hidden h-24 w-px bg-grove-border dark:bg-grove-border-dk lg:block" />
            <div className="max-w-2xl flex-1">
              <p className="v2-micro text-grove-ink/55 dark:text-grove-ink-dk/55">
                Executive summary
              </p>
              <p className="mt-2 text-sm leading-relaxed text-grove-ink/80 dark:text-grove-ink-dk/80">
                Meridian Industries scores 68/100 across the eight diagnostic categories, with{' '}
                {FINDINGS_COUNT} findings surfaced — {CRITICAL_COUNT} of them critical. The scan
                identifies {fmtMoney(TOTAL_SAVINGS)}/yr in recoverable spend, concentrated in
                License Waste, User Activity, and Storage &amp; Limits. Sharing Posture and
                Automation Hygiene carry the highest-severity risk items and should be triaged
                first.
              </p>
              <div className="mt-5 grid grid-cols-3 gap-4">
                {[
                  { label: 'Findings', value: FINDINGS_COUNT, format: undefined as ((n: number) => string) | undefined },
                  { label: 'Critical', value: CRITICAL_COUNT, format: undefined as ((n: number) => string) | undefined },
                  { label: 'Est. savings / yr', value: TOTAL_SAVINGS, format: (n: number) => fmtMoney(n) },
                ].map((s) => (
                  <div key={s.label}>
                    <p className="v2-num text-2xl font-semibold text-grove-ink dark:text-grove-ink-dk">
                      <CountUp value={s.value} format={s.format} />
                    </p>
                    <p className="v2-micro mt-1 text-grove-ink/50 dark:text-grove-ink-dk/50">{s.label}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </V2Card>
      </Reveal>

      {/* Tabs */}
      <Reveal>
        <Segmented
          options={[
            { key: 'overview', label: 'Overview' },
            { key: 'findings', label: 'Findings', count: HEALTH.topFindings.length },
            { key: 'savings', label: 'Cost savings' },
          ]}
          value={tab}
          onChange={(k) => setTab(k as Tab)}
        />
      </Reveal>

      {tab === 'overview' && (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
          <Reveal className="xl:col-span-3">
            <V2Card className="h-full p-6">
              <SectionHeading
                title="Category scores"
                hint="0–100 per diagnostic category · lower = more findings"
              />
              <div className="space-y-1">
                {HEALTH.categories.map((c) => (
                  <div key={c.name}>
                    <HBarRow
                      label={c.name}
                      value={c.score}
                      max={100}
                      display={`${c.score}`}
                      highlight={c.score < 60}
                    />
                    {c.savings > 0 && (
                      <p className="mb-1 ml-[9.75rem] text-[11px] font-medium text-copper-600 dark:text-copper-400">
                        {fmtMoney(c.savings)}/yr recoverable
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </V2Card>
          </Reveal>

          <Reveal delay={0.08} className="xl:col-span-2">
            <V2Card className="h-full p-6">
              <SectionHeading
                title="Quick wins"
                hint="Findings with direct dollar recovery"
              />
              <div className="space-y-3">
                {QUICK_WINS.map((f) => (
                  <div
                    key={f.id}
                    className="rounded-xl border border-grove-border/70 p-4 transition-all duration-200 hover:border-copper-300 hover:bg-copper-50/40 dark:border-grove-border-dk/70 dark:hover:border-copper-800 dark:hover:bg-copper-900/10"
                  >
                    <div className="flex items-center gap-2">
                      <span className="rounded-lg bg-copper-50 p-1.5 text-copper-600 ring-1 ring-copper-100 dark:bg-copper-900/25 dark:text-copper-400 dark:ring-copper-900">
                        <Sparkles className="h-3.5 w-3.5" />
                      </span>
                      <SeverityChip severity={f.severity as Severity} />
                    </div>
                    <p className="mt-2 text-sm font-semibold text-grove-ink dark:text-grove-ink-dk">
                      {f.title}
                    </p>
                    <p className="v2-num mt-1.5 text-xl font-semibold text-copper-600 dark:text-copper-400">
                      <CountUp value={f.savings ?? 0} format={(n) => fmtMoney(n)} />
                      <span className="ml-1 text-xs font-medium text-grove-ink/50 dark:text-grove-ink-dk/50">/ yr</span>
                    </p>
                  </div>
                ))}
              </div>
            </V2Card>
          </Reveal>
        </div>
      )}

      {tab === 'findings' && (
        <div className="space-y-5">
          <Reveal>
            <Segmented
              options={[
                { key: 'all', label: 'All', count: HEALTH.topFindings.length },
                { key: 'critical', label: 'Critical', count: HEALTH.topFindings.filter((f) => f.severity === 'critical').length },
                { key: 'high', label: 'High', count: HEALTH.topFindings.filter((f) => f.severity === 'high').length },
              ]}
              value={sevFilter}
              onChange={(k) => setSevFilter(k as SeverityFilter)}
            />
          </Reveal>
          <Stagger className="space-y-4">
            {visibleFindings.map((f) => (
              <StaggerItem key={f.id}>
                <V2Card lift className="p-6">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <SeverityChip severity={f.severity as Severity} />
                        <Pill tone="neutral">{f.category}</Pill>
                      </div>
                      <p className="mt-3 text-base font-semibold text-grove-ink dark:text-grove-ink-dk">
                        {f.title}
                      </p>
                      <p className="mt-1.5 text-sm leading-relaxed text-grove-ink/65 dark:text-grove-ink-dk/65">
                        {f.description}
                      </p>
                      <p className="mt-2 text-sm italic text-grove-ink/55 dark:text-grove-ink-dk/55">
                        → {f.action}
                      </p>
                    </div>
                    {f.savings != null && (
                      <div className="shrink-0 text-right">
                        <p className="v2-num text-2xl font-semibold text-copper-600 dark:text-copper-400">
                          {fmtMoney(f.savings)}
                        </p>
                        <p className="v2-micro mt-1 text-grove-ink/45 dark:text-grove-ink-dk/45">
                          per year
                        </p>
                      </div>
                    )}
                  </div>
                </V2Card>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      )}

      {tab === 'savings' && (
        <div className="space-y-6">
          <Reveal>
            <V2Card hero className="p-8 text-center">
              <p className="v2-micro text-grove-ink/55 dark:text-grove-ink-dk/55">
                Total identified annual savings
              </p>
              <p className="v2-num v2-shimmer-text mt-3 text-6xl font-semibold text-grove-ink dark:text-grove-ink-dk">
                <CountUp value={TOTAL_SAVINGS} format={(n) => fmtMoney(n)} />
              </p>
              <p className="mt-3 text-sm text-grove-ink/60 dark:text-grove-ink-dk/60">
                across license right-sizing, storage reclamation, and inactive seats
              </p>
            </V2Card>
          </Reveal>

          <Reveal delay={0.08}>
            <V2Card className="p-6">
              <SectionHeading
                title="Savings by category"
                hint="Where the recoverable spend lives"
                actions={
                  <span className="flex items-center gap-1 text-sm font-semibold text-primary-700 dark:text-primary-400">
                    3 categories <ArrowRight className="h-4 w-4" />
                  </span>
                }
              />
              <div className="space-y-1">
                {SAVINGS_CATEGORIES.map((c) => (
                  <HBarRow
                    key={c.name}
                    label={c.name}
                    value={c.savings}
                    max={MAX_CATEGORY_SAVINGS}
                    display={fmtMoney(c.savings)}
                    highlight={c.savings === MAX_CATEGORY_SAVINGS}
                  />
                ))}
              </div>
            </V2Card>
          </Reveal>
        </div>
      )}
    </div>
  )
}
