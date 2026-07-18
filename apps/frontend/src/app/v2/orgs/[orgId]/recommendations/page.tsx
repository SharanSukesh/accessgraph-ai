'use client'

/**
 * v2 Priority Actions — the cross-track triage inbox.
 *
 * Structure: title → KPI strip (total / pending / in progress / done) →
 * track filter → 2/3 action list + 1/3 detail panel. Selecting a row
 * populates the detail panel; action buttons are visual-only mocks.
 */

import { useState } from 'react'
import {
  Inbox, CircleDashed, Loader2, CheckCircle2,
  Zap, TrendingUp, ArrowRight, Check, X,
} from 'lucide-react'
import { Reveal, Stagger, StaggerItem } from '@/components/v2/motion'
import {
  PageTitle, V2Card, StatCard, SeverityChip, Pill,
  SectionHeading, Segmented, type Severity,
} from '@/components/v2/primitives'
import { PRIORITY_ACTIONS } from '@/lib/v2/mock-data'

type Action = (typeof PRIORITY_ACTIONS)[number]

const TRACK_OPTIONS = [
  { key: 'all', label: 'All' },
  { key: 'security', label: 'Security' },
  { key: 'right-size', label: 'Right-size' },
  { key: 'equity', label: 'Equity' },
  { key: 'hygiene', label: 'Hygiene' },
]

const TRACK_LABELS: Record<string, string> = {
  security: 'Security',
  'right-size': 'Right-size',
  equity: 'Equity',
  hygiene: 'Hygiene',
}

/** Mock workflow status per action — visual flavor only. */
const STATUS: Record<string, { label: string; tone: 'neutral' | 'mint' | 'copper' }> = {
  pa1: { label: 'Pending', tone: 'neutral' },
  pa2: { label: 'In progress', tone: 'copper' },
  pa3: { label: 'Pending', tone: 'neutral' },
  pa4: { label: 'Pending', tone: 'neutral' },
  pa5: { label: 'Completed', tone: 'mint' },
  pa6: { label: 'Pending', tone: 'neutral' },
}

export default function RecommendationsPage() {
  const [track, setTrack] = useState('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const filtered = PRIORITY_ACTIONS.filter(
    (a) => track === 'all' || a.track === track,
  )
  const selected: Action | undefined = PRIORITY_ACTIONS.find((a) => a.id === selectedId)

  return (
    <div className="space-y-10">
      <Reveal>
        <PageTitle
          eyebrow="Attention · triage inbox"
          title="Priority Actions"
          subtitle="One unified inbox of recommendations across security, license right-sizing, access equity, and org hygiene — ranked by severity and payoff."
        />
      </Reveal>

      {/* KPI strip */}
      <Stagger className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <StaggerItem>
          <StatCard label="Total actions" value={6} icon={Inbox} delta="across 4 tracks" />
        </StaggerItem>
        <StaggerItem>
          <StatCard label="Pending" value={4} icon={CircleDashed} delta="awaiting triage" deltaTone="bad" />
        </StaggerItem>
        <StaggerItem>
          <StatCard label="In progress" value={1} icon={Loader2} delta="owner assigned" />
        </StaggerItem>
        <StaggerItem>
          <StatCard label="Completed" value={1} icon={CheckCircle2} delta="this week" deltaTone="good" />
        </StaggerItem>
      </Stagger>

      {/* Track filter */}
      <Reveal>
        <Segmented options={TRACK_OPTIONS} value={track} onChange={setTrack} />
      </Reveal>

      {/* List + detail */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Reveal className="xl:col-span-2">
          <V2Card className="h-full p-6">
            <SectionHeading
              title="Action queue"
              hint={`${filtered.length} of ${PRIORITY_ACTIONS.length} actions shown`}
            />
            <div className="space-y-2">
              {filtered.map((a) => {
                const active = a.id === selectedId
                return (
                  <button
                    key={a.id}
                    onClick={() => setSelectedId(a.id)}
                    className={`group block w-full rounded-xl border p-4 text-left transition-all duration-200 ${
                      active
                        ? 'border-primary-300 bg-primary-50/60 dark:border-primary-800 dark:bg-primary-900/15'
                        : 'border-transparent hover:border-grove-border hover:bg-grove-canvas dark:hover:border-grove-border-dk dark:hover:bg-grove-canvas-dk'
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <SeverityChip severity={a.severity as Severity} />
                      <Pill tone="neutral">{a.source}</Pill>
                      <Pill tone={STATUS[a.id]?.tone ?? 'neutral'}>{STATUS[a.id]?.label ?? 'Pending'}</Pill>
                      <ArrowRight
                        className={`ml-auto h-4 w-4 shrink-0 text-grove-ink/30 transition-transform duration-200 group-hover:translate-x-1 group-hover:text-copper-500 dark:text-grove-ink-dk/30 ${
                          active ? 'text-copper-500 dark:text-copper-400' : ''
                        }`}
                      />
                    </div>
                    <p className="mt-2 text-sm font-semibold text-grove-ink dark:text-grove-ink-dk">
                      {a.title}
                    </p>
                    <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-grove-ink/60 dark:text-grove-ink-dk/60">
                      {a.detail}
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Pill tone="mint">
                        <Zap className="h-3 w-3" /> Effort · {a.effort}
                      </Pill>
                      <Pill tone="copper">
                        <TrendingUp className="h-3 w-3" /> Impact · {a.impact}
                      </Pill>
                      <span className="v2-micro ml-auto text-grove-ink/45 dark:text-grove-ink-dk/45">
                        {TRACK_LABELS[a.track] ?? a.track}
                      </span>
                    </div>
                  </button>
                )
              })}
              {filtered.length === 0 && (
                <p className="rounded-xl bg-grove-canvas p-6 text-center text-sm text-grove-ink/55 dark:bg-grove-canvas-dk dark:text-grove-ink-dk/55">
                  No actions in this track.
                </p>
              )}
            </div>
          </V2Card>
        </Reveal>

        {/* Detail panel */}
        <Reveal delay={0.08}>
          <V2Card className="h-full p-6">
            {selected ? (
              <div className="flex h-full flex-col">
                <div className="flex flex-wrap items-center gap-2">
                  <SeverityChip severity={selected.severity as Severity} />
                  <Pill tone={STATUS[selected.id]?.tone ?? 'neutral'}>
                    {STATUS[selected.id]?.label ?? 'Pending'}
                  </Pill>
                </div>
                <h2 className="v2-display mt-4 text-xl font-semibold leading-snug text-grove-ink dark:text-grove-ink-dk">
                  {selected.title}
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-grove-ink/70 dark:text-grove-ink-dk/70">
                  {selected.detail}
                </p>

                <dl className="mt-6 space-y-3 border-t border-grove-border pt-5 dark:border-grove-border-dk">
                  {[
                    { dt: 'Source', dd: selected.source },
                    { dt: 'Track', dd: TRACK_LABELS[selected.track] ?? selected.track },
                    { dt: 'Effort', dd: selected.effort },
                    { dt: 'Impact', dd: selected.impact },
                  ].map((row) => (
                    <div key={row.dt} className="flex items-baseline justify-between gap-4">
                      <dt className="v2-micro text-grove-ink/55 dark:text-grove-ink-dk/55">{row.dt}</dt>
                      <dd className="text-sm font-semibold text-grove-ink dark:text-grove-ink-dk">{row.dd}</dd>
                    </div>
                  ))}
                </dl>

                <div className="mt-auto space-y-2 pt-8">
                  <button className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:bg-primary-600 dark:bg-primary-400 dark:text-grove-canvas-dk dark:hover:bg-primary-300">
                    <Loader2 className="h-4 w-4" /> Mark in progress
                  </button>
                  <button className="flex w-full items-center justify-center gap-2 rounded-xl bg-grove-canvas px-4 py-2.5 text-sm font-semibold text-grove-ink ring-1 ring-grove-border transition-all duration-200 hover:bg-primary-50 hover:text-primary-700 dark:bg-grove-canvas-dk dark:text-grove-ink-dk dark:ring-grove-border-dk dark:hover:bg-primary-900/20 dark:hover:text-primary-400">
                    <Check className="h-4 w-4" /> Complete
                  </button>
                  <button className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium text-grove-ink/55 transition-colors duration-200 hover:bg-red-50 hover:text-red-700 dark:text-grove-ink-dk/55 dark:hover:bg-red-950/30 dark:hover:text-red-400">
                    <X className="h-4 w-4" /> Dismiss
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex h-full min-h-[320px] flex-col items-center justify-center text-center">
                <span className="rounded-2xl bg-grove-canvas p-4 ring-1 ring-grove-border dark:bg-grove-canvas-dk dark:ring-grove-border-dk">
                  <Inbox className="h-6 w-6 text-grove-ink/40 dark:text-grove-ink-dk/40" />
                </span>
                <p className="mt-4 text-sm font-semibold text-grove-ink dark:text-grove-ink-dk">
                  Select an action
                </p>
                <p className="mt-1 max-w-[220px] text-xs leading-relaxed text-grove-ink/55 dark:text-grove-ink-dk/55">
                  Pick a recommendation from the queue to see its full context and next steps.
                </p>
              </div>
            )}
          </V2Card>
        </Reveal>
      </div>
    </div>
  )
}
