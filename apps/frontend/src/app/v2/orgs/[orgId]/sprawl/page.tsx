'use client'

/**
 * v2 Sprawl — merged four-surface dead-weight inventory.
 *
 * One Segmented picker switches everything below between the four
 * scans (packages / reports / automations / integrations): a KPI
 * strip of tier counts, a tier-distribution bar, and the item list.
 * Reports gets the "9,203 of 12,847" hero callout.
 */

import { useState } from 'react'
import { Package, FileBarChart, Workflow, Plug, Archive } from 'lucide-react'
import { Reveal, Stagger, StaggerItem, CountUp } from '@/components/v2/motion'
import {
  PageTitle, V2Card, StatCard, TierBar, SeverityChip,
  SectionHeading, Segmented, type Severity,
} from '@/components/v2/primitives'
import { SPRAWL } from '@/lib/v2/mock-data'

type SprawlKey = 'packages' | 'reports' | 'automations' | 'integrations'

type SprawlItem = { name: string; tier: string; usage: string; meta: string[] }

type SprawlView = {
  icon: typeof Package
  noun: string
  stats: { label: string; value: number }[]
  tiers: { label: string; count: number; severity: Severity }[]
  tierSeverity: Record<string, Severity>
  items: SprawlItem[]
}

const VIEWS: Record<SprawlKey, SprawlView> = {
  packages: {
    icon: Package,
    noun: 'installed packages',
    stats: [
      { label: 'Total packages', value: SPRAWL.packages.total },
      { label: 'Active', value: SPRAWL.packages.active },
      { label: 'Underused', value: SPRAWL.packages.underused },
      { label: 'Unused', value: SPRAWL.packages.unused },
    ],
    tiers: [
      { label: 'unused', count: SPRAWL.packages.unused, severity: 'high' },
      { label: 'underused', count: SPRAWL.packages.underused, severity: 'medium' },
      { label: 'active', count: SPRAWL.packages.active, severity: 'low' },
    ],
    tierSeverity: { unused: 'high', underused: 'medium', active: 'low' },
    items: SPRAWL.packages.items.map((i) => ({
      name: i.name, tier: i.tier, usage: i.usage,
      meta: ['Managed package', `Installed ${i.installed}`],
    })),
  },
  reports: {
    icon: FileBarChart,
    noun: 'reports scanned',
    stats: [
      { label: 'Total reports', value: SPRAWL.reports.total },
      { label: 'Live', value: SPRAWL.reports.live },
      { label: 'Zombie', value: SPRAWL.reports.zombie },
      { label: 'Orphaned', value: SPRAWL.reports.orphaned },
      { label: 'Duplicate', value: SPRAWL.reports.duplicate },
    ],
    tiers: [
      { label: 'zombie', count: SPRAWL.reports.zombie, severity: 'high' },
      { label: 'orphaned', count: SPRAWL.reports.orphaned, severity: 'medium' },
      { label: 'duplicate', count: SPRAWL.reports.duplicate, severity: 'medium' },
      { label: 'live', count: SPRAWL.reports.live, severity: 'low' },
    ],
    tierSeverity: { zombie: 'high', orphaned: 'medium', duplicate: 'medium', live: 'low' },
    items: SPRAWL.reports.items.map((i) => ({
      name: i.name, tier: i.tier, usage: i.usage,
      meta: ['Report', `Owner ${i.owner}`],
    })),
  },
  automations: {
    icon: Workflow,
    noun: 'automations scanned',
    stats: [
      { label: 'Total automations', value: SPRAWL.automations.total },
      { label: 'Active', value: SPRAWL.automations.active },
      { label: 'Dormant', value: SPRAWL.automations.dormant },
      { label: 'Broken', value: SPRAWL.automations.broken },
      { label: 'Orphaned', value: SPRAWL.automations.orphaned },
    ],
    tiers: [
      { label: 'broken', count: SPRAWL.automations.broken, severity: 'critical' },
      { label: 'dormant', count: SPRAWL.automations.dormant, severity: 'high' },
      { label: 'orphaned', count: SPRAWL.automations.orphaned, severity: 'medium' },
      { label: 'active', count: SPRAWL.automations.active, severity: 'low' },
    ],
    tierSeverity: { broken: 'critical', dormant: 'high', orphaned: 'medium', active: 'low' },
    items: SPRAWL.automations.items.map((i) => ({
      name: i.name, tier: i.tier, usage: i.usage, meta: [i.type],
    })),
  },
  integrations: {
    icon: Plug,
    noun: 'integration endpoints',
    stats: [
      { label: 'Total integrations', value: SPRAWL.integrations.total },
      { label: 'Healthy', value: SPRAWL.integrations.healthy },
      { label: 'Stale', value: SPRAWL.integrations.stale },
      { label: 'Broken', value: SPRAWL.integrations.broken },
      { label: 'Unknown', value: SPRAWL.integrations.unknown },
    ],
    tiers: [
      { label: 'broken', count: SPRAWL.integrations.broken, severity: 'critical' },
      { label: 'stale', count: SPRAWL.integrations.stale, severity: 'high' },
      { label: 'unknown', count: SPRAWL.integrations.unknown, severity: 'medium' },
      { label: 'healthy', count: SPRAWL.integrations.healthy, severity: 'low' },
    ],
    tierSeverity: { broken: 'critical', stale: 'high', unknown: 'medium', healthy: 'low' },
    items: SPRAWL.integrations.items.map((i) => ({
      name: i.name, tier: i.tier, usage: i.usage, meta: [i.type],
    })),
  },
}

export default function SprawlPage() {
  const [type, setType] = useState<SprawlKey>('packages')
  const view = VIEWS[type]
  const Icon = view.icon
  const statCols =
    view.stats.length === 5
      ? 'grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5'
      : 'grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4'

  return (
    <div className="space-y-10">
      <Reveal>
        <PageTitle
          eyebrow="Optimize · cleanup"
          title="Sprawl"
          subtitle="Dead weight across packages, reports, automations, and integrations"
        />
      </Reveal>

      <Reveal delay={0.05}>
        <Segmented
          options={[
            { key: 'packages', label: 'Packages', count: SPRAWL.packages.total },
            { key: 'reports', label: 'Reports', count: SPRAWL.reports.total },
            { key: 'automations', label: 'Automations', count: SPRAWL.automations.total },
            { key: 'integrations', label: 'Integrations', count: SPRAWL.integrations.total },
          ]}
          value={type}
          onChange={(k) => setType(k as SprawlKey)}
        />
      </Reveal>

      {/* Reports-only hero callout */}
      {type === 'reports' && (
        <Reveal key="reports-hero">
          <V2Card hero className="p-8">
            <div className="flex flex-col items-start gap-6 lg:flex-row lg:items-center">
              <span className="rounded-xl bg-copper-50 p-3 text-copper-600 ring-1 ring-copper-100 dark:bg-copper-900/25 dark:text-copper-400 dark:ring-copper-900">
                <Archive className="h-6 w-6" />
              </span>
              <div>
                <p className="v2-micro text-grove-ink/55 dark:text-grove-ink-dk/55">
                  Zombie report burden
                </p>
                <p className="mt-2 text-3xl font-semibold leading-snug text-grove-ink dark:text-grove-ink-dk">
                  <span className="v2-num v2-shimmer-text text-5xl font-semibold">
                    <CountUp value={9203} />
                  </span>{' '}
                  <span className="text-grove-ink/60 dark:text-grove-ink-dk/60">of</span>{' '}
                  <span className="v2-num text-5xl font-semibold">
                    <CountUp value={12847} />
                  </span>
                </p>
                <p className="mt-2 text-sm text-grove-ink/65 dark:text-grove-ink-dk/65">
                  reports haven&apos;t been viewed in 12 months — archive them to shrink
                  folder search and metadata deploys
                </p>
              </div>
            </div>
          </V2Card>
        </Reveal>
      )}

      {/* Tier count strip — re-keyed per type so the stagger replays */}
      <Stagger key={`stats-${type}`} className={statCols}>
        {view.stats.map((s, i) => (
          <StaggerItem key={s.label}>
            <StatCard label={s.label} value={s.value} icon={i === 0 ? Icon : undefined} />
          </StaggerItem>
        ))}
      </Stagger>

      {/* Tier distribution */}
      <Reveal key={`tiers-${type}`}>
        <V2Card className="p-6">
          <SectionHeading
            title="Tier distribution"
            hint={`How the ${view.stats[0].value.toLocaleString()} ${view.noun} break down`}
          />
          <TierBar tiers={view.tiers} />
        </V2Card>
      </Reveal>

      {/* Item list */}
      <div key={`items-${type}`} className="space-y-4">
        <Reveal>
          <SectionHeading
            title="Flagged items"
            hint="Representative sample from the latest scan"
          />
        </Reveal>
        <Stagger className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {view.items.map((item) => (
            <StaggerItem key={item.name}>
              <V2Card lift className="h-full p-5">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-semibold text-grove-ink dark:text-grove-ink-dk">
                    {item.name}
                  </p>
                  <SeverityChip
                    severity={view.tierSeverity[item.tier] ?? 'info'}
                    label={item.tier}
                  />
                </div>
                <p className="mt-2 text-xs leading-relaxed text-grove-ink/60 dark:text-grove-ink-dk/60">
                  {item.usage}
                </p>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
                  {item.meta.map((m) => (
                    <span key={m} className="v2-micro text-grove-ink/45 dark:text-grove-ink-dk/45">
                      {m}
                    </span>
                  ))}
                </div>
              </V2Card>
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </div>
  )
}
