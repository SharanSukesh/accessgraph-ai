'use client'

/**
 * v2 Change Risk Radar — SetupAuditTrail, scored by blast radius.
 *
 * Structure: title → KPI strip → tier distribution + daily activity →
 * scored timeline with tier filter → off-hours callout. Blast scores
 * always ship with a tier text label — never color alone.
 */

import { useState } from 'react'
import {
  Activity, Radio, Users, Gauge, MoonStar, Clock,
} from 'lucide-react'
import { Reveal, Stagger, StaggerItem, CountUp } from '@/components/v2/motion'
import {
  PageTitle, V2Card, StatCard, SeverityChip, Pill, TierBar,
  SectionHeading, Segmented, type Severity,
} from '@/components/v2/primitives'
import { CHANGE_RISK } from '@/lib/v2/mock-data'

const UNIQUE_ACTORS = 9
const AVG_BLAST = 38

const TIER_OPTIONS = [
  { key: 'all', label: 'All' },
  { key: 'critical', label: 'Critical' },
  { key: 'high', label: 'High' },
  { key: 'medium', label: 'Medium' },
]

/** Blast-score chip: red ≥80, orange ≥65, amber ≥40, else green. */
function blastChipClasses(blast: number): string {
  if (blast >= 80)
    return 'bg-red-50 text-red-800 ring-red-200 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-900'
  if (blast >= 65)
    return 'bg-orange-50 text-orange-800 ring-orange-200 dark:bg-orange-950/40 dark:text-orange-300 dark:ring-orange-900'
  if (blast >= 40)
    return 'bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900'
  return 'bg-primary-50 text-primary-700 ring-primary-200 dark:bg-primary-900/30 dark:text-primary-400 dark:ring-primary-800'
}

export default function ChangeRiskPage() {
  const [tier, setTier] = useState('all')

  const activity = CHANGE_RISK.dailyActivity
  const maxActivity = Math.max(...activity)
  const maxIdx = activity.indexOf(maxActivity)

  const filtered = CHANGE_RISK.topChanges.filter(
    (c) => tier === 'all' || c.tier === tier,
  )

  return (
    <div className="space-y-10">
      <Reveal>
        <PageTitle
          eyebrow="Attention · change intelligence"
          title="Change Risk Radar"
          subtitle={`Every SetupAuditTrail event from the last ${CHANGE_RISK.windowDays} days, scored 0–100 by blast radius — how many users, records, and automations each change touches.`}
        />
      </Reveal>

      {/* KPI strip */}
      <Stagger className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <StaggerItem>
          <StatCard label="Events in window" value={CHANGE_RISK.totalChanges} icon={Activity} delta={`last ${CHANGE_RISK.windowDays} days`} />
        </StaggerItem>
        <StaggerItem>
          <StatCard label="High-blast (≥65)" value={22} icon={Radio} delta="4 critical · 18 high" deltaTone="bad" />
        </StaggerItem>
        <StaggerItem>
          <StatCard label="Unique actors" value={UNIQUE_ACTORS} icon={Users} delta="3 hold admin profiles" />
        </StaggerItem>
        <StaggerItem>
          <StatCard label="Avg blast radius" value={AVG_BLAST} icon={Gauge} delta="of 100 possible" />
        </StaggerItem>
      </Stagger>

      {/* Tier distribution + daily activity */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Reveal>
          <V2Card className="h-full p-6">
            <SectionHeading
              title="Blast-radius tiers"
              hint={`${CHANGE_RISK.totalChanges} changes bucketed by score`}
            />
            <TierBar
              className="mt-2"
              tiers={[
                { label: 'Critical', count: CHANGE_RISK.tiers.critical, severity: 'critical' },
                { label: 'High', count: CHANGE_RISK.tiers.high, severity: 'high' },
                { label: 'Medium', count: CHANGE_RISK.tiers.medium, severity: 'medium' },
                { label: 'Low', count: CHANGE_RISK.tiers.low, severity: 'low' },
              ]}
            />
            <p className="mt-5 text-xs leading-relaxed text-grove-ink/55 dark:text-grove-ink-dk/55">
              Critical and high tiers (score ≥65) are the changes worth a same-day review —
              they touch org-wide sharing, powerful permissions, or all-record automations.
            </p>
          </V2Card>
        </Reveal>

        <Reveal delay={0.08}>
          <V2Card className="h-full p-6">
            <SectionHeading
              title="Daily activity"
              hint="Setup changes per day · last 30 days"
            />
            <div className="flex h-28 items-end gap-0.5 pt-6">
              {activity.map((v, i) => (
                <div key={i} className="relative flex h-full flex-1 items-end">
                  {i === maxIdx && (
                    <span className="v2-num absolute -top-6 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-grove-ink px-1.5 py-0.5 text-[10px] font-semibold text-white dark:bg-grove-ink-dk dark:text-grove-canvas-dk">
                      {v} peak
                    </span>
                  )}
                  <div
                    className={`w-full rounded-t transition-colors duration-150 hover:bg-copper-500 dark:hover:bg-copper-400 ${
                      i === maxIdx
                        ? 'bg-copper-500 dark:bg-copper-400'
                        : 'bg-primary-600 dark:bg-primary-400'
                    }`}
                    style={{ height: `${Math.max(6, (v / maxActivity) * 100)}%` }}
                    title={`Day ${i + 1}: ${v} changes`}
                  />
                </div>
              ))}
            </div>
            <div className="mt-2 flex justify-between">
              <span className="v2-micro text-grove-ink/45 dark:text-grove-ink-dk/45">30 days ago</span>
              <span className="v2-micro text-grove-ink/45 dark:text-grove-ink-dk/45">today</span>
            </div>
          </V2Card>
        </Reveal>
      </div>

      {/* Timeline */}
      <Reveal>
        <V2Card className="p-6">
          <SectionHeading
            title="Highest-blast changes"
            hint="From SetupAuditTrail · sorted by blast score"
            actions={<Segmented options={TIER_OPTIONS} value={tier} onChange={setTier} />}
          />
          <div className="space-y-2">
            {filtered.map((c) => (
              <div
                key={c.id}
                className="flex items-start gap-4 rounded-xl border border-transparent p-4 transition-all duration-200 hover:border-grove-border hover:bg-grove-canvas dark:hover:border-grove-border-dk dark:hover:bg-grove-canvas-dk"
              >
                <div
                  className={`flex w-20 shrink-0 flex-col items-center rounded-xl px-2 py-2.5 ring-1 ${blastChipClasses(c.blast)}`}
                >
                  <span className="v2-num text-2xl font-semibold">
                    <CountUp value={c.blast} />
                  </span>
                  <span className="v2-micro mt-0.5">{c.tier}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-grove-ink dark:text-grove-ink-dk">
                      {c.action}
                    </p>
                    <SeverityChip severity={c.tier as Severity} />
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-grove-ink/55 dark:text-grove-ink-dk/55">
                    <span className="font-mono">{c.actor}</span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" /> {c.when}
                    </span>
                    <span>Touches: {c.touches}</span>
                  </div>
                </div>
              </div>
            ))}
            {filtered.length === 0 && (
              <p className="rounded-xl bg-grove-canvas p-6 text-center text-sm text-grove-ink/55 dark:bg-grove-canvas-dk dark:text-grove-ink-dk/55">
                No changes in this tier.
              </p>
            )}
          </div>
        </V2Card>
      </Reveal>

      {/* Off-hours callout */}
      <Reveal>
        <V2Card className="border-l-4 border-l-copper-500 p-6 dark:border-l-copper-400">
          <div className="flex items-start gap-4">
            <span className="rounded-lg bg-copper-50 p-2 text-copper-600 ring-1 ring-copper-100 dark:bg-copper-900/25 dark:text-copper-400 dark:ring-copper-900">
              <MoonStar className="h-5 w-5" />
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold text-grove-ink dark:text-grove-ink-dk">
                  23% of high-blast changes landed outside business hours
                </p>
                <Pill tone="copper">Off-hours pattern</Pill>
              </div>
              <p className="mt-1.5 max-w-2xl text-xs leading-relaxed text-grove-ink/60 dark:text-grove-ink-dk/60">
                5 of the 22 changes scoring ≥65 were made between 22:00 and 06:00 org-local time —
                including the Opportunity OWD change. Consider requiring change windows or
                approvals for setup edits that touch org-wide sharing.
              </p>
            </div>
          </div>
        </V2Card>
      </Reveal>
    </div>
  )
}
