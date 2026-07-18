'use client'

/**
 * v2 Equity — the GAEA access-equity engine surface.
 *
 * Structure: title → KPI strip (index / most disadvantaged / VIP set)
 * → utility-by-department bars → potential hero (0.61 → 0.78) →
 * suggested grants list. All data from the shared mock module.
 */

import { Scale, UserX, Crown, ArrowRight, Users, Check, X } from 'lucide-react'
import { Reveal, Stagger, StaggerItem, CountUp } from '@/components/v2/motion'
import {
  PageTitle, V2Card, StatCard, SeverityChip, Pill,
  SectionHeading, HBarRow,
} from '@/components/v2/primitives'
import { EQUITY } from '@/lib/v2/mock-data'

const WORST_GROUP = EQUITY.disadvantaged

export default function EquityPage() {
  return (
    <div className="space-y-10">
      <Reveal>
        <PageTitle
          eyebrow="Optimize · fairness"
          title="Equity"
          subtitle="Graph-based access equity — who can't reach what they need"
        />
      </Reveal>

      {/* KPI strip */}
      <Stagger className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        <StaggerItem>
          <StatCard
            label="Equity index"
            value={EQUITY.index}
            format={(n) => n.toFixed(2)}
            icon={Scale}
            delta="org-wide access utility"
          />
        </StaggerItem>
        <StaggerItem>
          <StatCard
            label="Most disadvantaged"
            value={0.31}
            format={(n) => n.toFixed(2)}
            icon={UserX}
            delta="Customer Success — lowest utility"
            deltaTone="bad"
          />
        </StaggerItem>
        <StaggerItem>
          <StatCard
            label="VIP set"
            value={EQUITY.vips}
            icon={Crown}
            delta="users pinned as untouchable"
          />
        </StaggerItem>
      </Stagger>

      {/* Utility by department */}
      <Reveal>
        <V2Card className="p-6">
          <SectionHeading
            title="Access utility by department"
            hint="Normalized 0–1 · how much of the access each group needs it can actually reach"
          />
          <div className="space-y-1">
            {EQUITY.groups.map((g) => {
              const worst = g.name === WORST_GROUP
              return (
                <div key={g.name} className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <HBarRow
                      label={g.name}
                      value={g.utility * 100}
                      max={100}
                      display={g.utility.toFixed(2)}
                      highlight={worst}
                    />
                  </div>
                  {worst && (
                    <span className="shrink-0">
                      <SeverityChip severity="high" label="lowest" />
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </V2Card>
      </Reveal>

      {/* Potential hero */}
      <Reveal delay={0.05}>
        <V2Card hero className="p-8">
          <div className="flex flex-col items-center gap-2 text-center">
            <p className="v2-micro text-grove-ink/55 dark:text-grove-ink-dk/55">
              Equity potential
            </p>
            <div className="mt-2 flex items-center gap-6">
              <span className="v2-num text-6xl font-semibold text-grove-ink/60 dark:text-grove-ink-dk/60">
                <CountUp value={EQUITY.index} format={(n) => n.toFixed(2)} />
              </span>
              <ArrowRight className="h-10 w-10 animate-pulse text-copper-500 dark:text-copper-400" />
              <span className="v2-num v2-shimmer-text text-6xl font-semibold text-primary-700 dark:text-primary-400">
                <CountUp value={EQUITY.potential} format={(n) => n.toFixed(2)} />
              </span>
            </div>
            <p className="mt-3 text-sm text-grove-ink/60 dark:text-grove-ink-dk/60">
              if the 3 suggested grants are applied
            </p>
          </div>
        </V2Card>
      </Reveal>

      {/* Suggested grants */}
      <div>
        <Reveal>
          <SectionHeading
            title="Suggested grants"
            hint="Minimal additive grants with the biggest equity lift — nothing is ever revoked"
          />
        </Reveal>
        <Stagger className="space-y-4">
          {EQUITY.recommendations.map((r) => (
            <StaggerItem key={r.id}>
              <V2Card lift className="p-6">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-grove-ink dark:text-grove-ink-dk">
                      {r.action}
                    </p>
                    <div className="mt-2.5 flex flex-wrap items-center gap-3">
                      <Pill tone="mint">{r.gain}</Pill>
                      <span className="flex items-center gap-1.5 text-xs text-grove-ink/60 dark:text-grove-ink-dk/60">
                        <Users className="h-3.5 w-3.5" />
                        <span className="v2-num font-semibold text-grove-ink dark:text-grove-ink-dk">
                          {r.users.toLocaleString()}
                        </span>
                        users affected
                      </span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button className="inline-flex items-center gap-1.5 rounded-xl bg-primary-700 px-3.5 py-1.5 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:bg-primary-600 hover:shadow-md dark:bg-primary-400 dark:text-grove-canvas-dk dark:hover:bg-primary-300">
                      <Check className="h-4 w-4" /> Apply
                    </button>
                    <button className="inline-flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-sm font-semibold text-grove-ink/60 transition-all duration-200 hover:bg-grove-canvas hover:text-grove-ink dark:text-grove-ink-dk/60 dark:hover:bg-grove-canvas-dk dark:hover:text-grove-ink-dk">
                      <X className="h-4 w-4" /> Dismiss
                    </button>
                  </div>
                </div>
              </V2Card>
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </div>
  )
}
