'use client'

/**
 * v2 Anomalies — access + session detections in one feed.
 *
 * Structure: title → hero callout (the impossible-travel money moment) →
 * KPI strip → category tabs → anomaly card grid. All data from the
 * shared ANOMALIES mock.
 */

import { useState } from 'react'
import {
  AlertTriangle, Flame, Users, Radar, Plane, ArrowRight,
} from 'lucide-react'
import { Reveal, Stagger, StaggerItem, CountUp } from '@/components/v2/motion'
import {
  PageTitle, V2Card, StatCard, SeverityChip, Pill,
  SectionHeading, Segmented, type Severity,
} from '@/components/v2/primitives'
import { ANOMALIES } from '@/lib/v2/mock-data'

type Anomaly = (typeof ANOMALIES.access)[number]

const ALL_ANOMALIES: Anomaly[] = [...ANOMALIES.access, ...ANOMALIES.session]

const CATEGORY_OPTIONS = [
  { key: 'all', label: 'All', count: ALL_ANOMALIES.length },
  { key: 'access', label: 'Access', count: ANOMALIES.access.length },
  { key: 'session', label: 'Session', count: ANOMALIES.session.length },
]

export default function AnomaliesPage() {
  const [category, setCategory] = useState('all')

  const filtered = ALL_ANOMALIES.filter(
    (a) => category === 'all' || a.category === category,
  )

  return (
    <div className="space-y-10">
      <Reveal>
        <PageTitle
          eyebrow="Attention · detection"
          title="Anomalies"
          subtitle="Access outliers surfaced by the Mahalanobis + GMM ensemble, plus session anomalies from LoginHistory rules — impossible travel, brute force, new geographies."
        />
      </Reveal>

      {/* Hero callout — the demo's money moment */}
      <Reveal delay={0.05}>
        <V2Card hero className="p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center">
            <span className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-copper-50 text-copper-600 ring-1 ring-copper-200 dark:bg-copper-900/25 dark:text-copper-400 dark:ring-copper-800">
              <Plane className="h-7 w-7" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <SeverityChip severity="high" />
                <Pill tone="copper">Session</Pill>
                <span className="v2-micro font-mono text-grove-ink/55 dark:text-grove-ink-dk/55">
                  IMPOSSIBLE_TRAVEL
                </span>
              </div>
              <p className="v2-display mt-3 text-2xl font-semibold text-grove-ink dark:text-grove-ink-dk">
                Frankfurt → Singapore in 2.1 hours
              </p>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-grove-ink/65 dark:text-grove-ink-dk/65">
                Priya Sharma — your VP of Finance — authenticated successfully from both
                locations on Jul 14. That distance is not coverable in that window; one of
                these sessions is not her.
              </p>
            </div>
            <div className="lg:ml-auto lg:text-right">
              <p className="v2-micro text-grove-ink/55 dark:text-grove-ink-dk/55">Anomaly score</p>
              <p className="v2-num v2-shimmer-text mt-1 text-5xl font-semibold text-grove-ink dark:text-grove-ink-dk">
                <CountUp value={0.95} format={(n) => n.toFixed(2)} />
              </p>
              <span className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-primary-700 transition-colors hover:text-copper-600 dark:text-primary-400 dark:hover:text-copper-400">
                Investigate session <ArrowRight className="h-4 w-4" />
              </span>
            </div>
          </div>
        </V2Card>
      </Reveal>

      {/* KPI strip */}
      <Stagger className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <StaggerItem>
          <StatCard label="Total anomalies" value={ANOMALIES.total} icon={Radar} delta="access + session" />
        </StaggerItem>
        <StaggerItem>
          <StatCard label="Critical" value={ANOMALIES.critical} icon={Flame} delta="triage today" deltaTone="bad" />
        </StaggerItem>
        <StaggerItem>
          <StatCard label="High" value={ANOMALIES.high} icon={AlertTriangle} delta="review this week" deltaTone="bad" />
        </StaggerItem>
        <StaggerItem>
          <StatCard label="Affected users" value={ANOMALIES.affectedUsers} icon={Users} delta="of 1,180 active" />
        </StaggerItem>
      </Stagger>

      {/* Category tabs + card list */}
      <Reveal>
        <div className="space-y-5">
          <SectionHeading
            title="Detections"
            hint="Sorted by ensemble anomaly score"
            actions={<Segmented options={CATEGORY_OPTIONS} value={category} onChange={setCategory} />}
          />
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            {filtered.map((a) => (
              <V2Card key={a.id} lift className="p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <SeverityChip severity={a.severity as Severity} />
                  <Pill tone={a.category === 'access' ? 'mint' : 'copper'}>
                    {a.category === 'access' ? 'Access' : 'Session'}
                  </Pill>
                  <span className="v2-micro ml-auto font-mono text-grove-ink/50 dark:text-grove-ink-dk/50">
                    {a.type}
                  </span>
                </div>
                <div className="mt-4 flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-base font-semibold text-grove-ink dark:text-grove-ink-dk">
                      {a.user}
                    </p>
                    <p className="mt-1.5 text-sm leading-relaxed text-grove-ink/65 dark:text-grove-ink-dk/65">
                      {a.reason}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="v2-num text-2xl font-semibold text-grove-ink dark:text-grove-ink-dk">
                      <CountUp value={a.score} format={(n) => n.toFixed(2)} />
                    </p>
                    <p className="v2-micro text-grove-ink/45 dark:text-grove-ink-dk/45">score</p>
                  </div>
                </div>
              </V2Card>
            ))}
          </div>
        </div>
      </Reveal>
    </div>
  )
}
