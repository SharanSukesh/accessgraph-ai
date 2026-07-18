'use client'

/**
 * v2 Restructure Studio — the org-restructure planning canvas.
 *
 * Structure: title → before/after KPI band → move-type filter →
 * move list (fit score + blast + accept/reject) → plan-export bar.
 * All data from the shared mock module.
 */

import { useState } from 'react'
import { ArrowRight, Users, Check, X, FileDown } from 'lucide-react'
import { Reveal, Stagger, StaggerItem, CountUp } from '@/components/v2/motion'
import {
  PageTitle, V2Card, Pill, SectionHeading, Segmented,
} from '@/components/v2/primitives'
import { RESTRUCTURE } from '@/lib/v2/mock-data'

type MoveFilter = 'all' | 'merge' | 'retire' | 'role'

const FILTER_TYPES: Record<Exclude<MoveFilter, 'all'>, string[]> = {
  merge: ['MERGE_PERMISSION_SETS'],
  retire: ['RETIRE_PS'],
  role: ['ROLE_FLATTEN', 'ROLE_MERGE'],
}

const KPI_BAND = [
  {
    label: 'Equity index',
    before: RESTRUCTURE.simulated.equityBefore.toFixed(2),
    after: RESTRUCTURE.simulated.equityAfter,
    format: (n: number) => n.toFixed(2),
  },
  {
    label: 'Permission sets',
    before: RESTRUCTURE.simulated.psBefore.toLocaleString(),
    after: RESTRUCTURE.simulated.psAfter,
    format: undefined as ((n: number) => string) | undefined,
  },
  {
    label: 'Roles',
    before: RESTRUCTURE.simulated.rolesBefore.toLocaleString(),
    after: RESTRUCTURE.simulated.rolesAfter,
    format: undefined as ((n: number) => string) | undefined,
  },
  {
    label: 'Moves simulated',
    before: '0',
    after: RESTRUCTURE.moves,
    format: undefined as ((n: number) => string) | undefined,
  },
]

export default function RestructureStudioPage() {
  const [filter, setFilter] = useState<MoveFilter>('all')

  const visibleMoves = RESTRUCTURE.sampleMoves.filter(
    (m) => filter === 'all' || FILTER_TYPES[filter].includes(m.type),
  )

  return (
    <div className="space-y-10">
      <Reveal>
        <PageTitle
          eyebrow="Optimize · org design"
          title="Restructure Studio"
          subtitle="Simulated moves that simplify the org without breaking anyone's access"
        />
      </Reveal>

      {/* Before → after KPI band */}
      <Reveal delay={0.05}>
        <V2Card hero className="p-8">
          <div className="grid grid-cols-2 gap-8 lg:grid-cols-4">
            {KPI_BAND.map((k) => (
              <div key={k.label}>
                <p className="v2-micro text-grove-ink/55 dark:text-grove-ink-dk/55">{k.label}</p>
                <div className="mt-3 flex items-center gap-2.5">
                  <span className="v2-num text-lg font-medium text-grove-ink/45 dark:text-grove-ink-dk/45">
                    {k.before}
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-copper-500 dark:text-copper-400" />
                  <span className="v2-num text-3xl font-semibold text-primary-700 dark:text-primary-400">
                    <CountUp value={k.after} format={k.format} />
                  </span>
                </div>
              </div>
            ))}
          </div>
        </V2Card>
      </Reveal>

      {/* Move-type filter */}
      <Reveal>
        <Segmented
          options={[
            { key: 'all', label: 'All', count: RESTRUCTURE.sampleMoves.length },
            { key: 'merge', label: 'Merge PS' },
            { key: 'retire', label: 'Retire PS' },
            { key: 'role', label: 'Role moves' },
          ]}
          value={filter}
          onChange={(k) => setFilter(k as MoveFilter)}
        />
      </Reveal>

      {/* Move list */}
      <div>
        <Reveal>
          <SectionHeading
            title="Proposed moves"
            hint="Ranked by fit score · every user keeps per-object access they have today"
          />
        </Reveal>
        <Stagger className="space-y-4">
          {visibleMoves.map((m) => (
            <StaggerItem key={m.id}>
              <V2Card lift ink className="p-6">
                <div className="flex flex-wrap items-center gap-6">
                  <div className="shrink-0 text-center">
                    <p className="v2-num text-3xl font-semibold text-grove-ink dark:text-grove-ink-dk">
                      <CountUp value={m.score} />
                    </p>
                    <p className="v2-micro mt-1 text-grove-ink/45 dark:text-grove-ink-dk/45">
                      fit score
                    </p>
                  </div>
                  <div className="hidden h-12 w-px bg-grove-border dark:bg-grove-border-dk sm:block" />
                  <div className="min-w-0 flex-1">
                    <Pill tone="neutral">
                      <span className="v2-micro font-mono">{m.type}</span>
                    </Pill>
                    <p className="mt-2 text-sm font-semibold text-grove-ink dark:text-grove-ink-dk">
                      {m.title}
                    </p>
                    <div className="mt-2.5 flex flex-wrap items-center gap-3">
                      <Pill tone={m.blast === 'Medium' ? 'copper' : 'mint'}>
                        blast: {m.blast}
                      </Pill>
                      <span className="flex items-center gap-1.5 text-xs text-grove-ink/60 dark:text-grove-ink-dk/60">
                        <Users className="h-3.5 w-3.5" />
                        <span className="v2-num font-semibold text-grove-ink dark:text-grove-ink-dk">
                          {m.users.toLocaleString()}
                        </span>
                        users affected
                      </span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button className="inline-flex items-center gap-1.5 rounded-xl bg-primary-700 px-3.5 py-1.5 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:bg-primary-600 hover:shadow-md dark:bg-primary-400 dark:text-grove-canvas-dk dark:hover:bg-primary-300">
                      <Check className="h-4 w-4" /> Accept
                    </button>
                    <button className="inline-flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-sm font-semibold text-grove-ink/60 transition-all duration-200 hover:bg-grove-canvas hover:text-grove-ink dark:text-grove-ink-dk/60 dark:hover:bg-grove-canvas-dk dark:hover:text-grove-ink-dk">
                      <X className="h-4 w-4" /> Reject
                    </button>
                  </div>
                </div>
              </V2Card>
            </StaggerItem>
          ))}
        </Stagger>
      </div>

      {/* Plan export bar */}
      <Reveal>
        <V2Card className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <p className="text-sm font-medium text-grove-ink/75 dark:text-grove-ink-dk/75">
              <span className="v2-num font-semibold text-grove-ink dark:text-grove-ink-dk">2</span>{' '}
              moves accepted · ready to export as a change plan
            </p>
            <button className="inline-flex items-center gap-2 rounded-xl border border-grove-border bg-white px-4 py-2 text-sm font-semibold text-grove-ink/80 shadow-sm transition-all duration-200 hover:border-grove-ink/25 hover:bg-grove-canvas dark:border-grove-border-dk dark:bg-grove-canvas-dk dark:text-grove-ink-dk/80 dark:hover:border-grove-ink-dk/25 dark:hover:bg-grove-surface-dk">
              <FileDown className="h-4 w-4" /> Export plan (CSV)
            </button>
          </div>
        </V2Card>
      </Reveal>
    </div>
  )
}
