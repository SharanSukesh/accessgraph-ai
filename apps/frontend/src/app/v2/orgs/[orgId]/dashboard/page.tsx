'use client'

/**
 * v2 Overview — the executive landing surface.
 *
 * Structure: hero (health ring + savings headline) → KPI strip →
 * sprawl quick-stats band → two-column triage panels (anomalous users
 * + priority actions). All data from the shared mock module.
 */

import Link from 'next/link'
import {
  Users, AlertTriangle, DollarSign, Stethoscope,
  ArrowRight, Flame, FileBarChart, Workflow, Plug,
} from 'lucide-react'
import { Reveal, Stagger, StaggerItem, CountUp } from '@/components/v2/motion'
import {
  PageTitle, V2Card, StatCard, ScoreRing, Sparkline,
  SeverityChip, Pill, SectionHeading, type Severity,
} from '@/components/v2/primitives'
import { ORG, OVERVIEW, PEOPLE, PRIORITY_ACTIONS, fmtMoney } from '@/lib/v2/mock-data'

export default function OverviewPage() {
  const anomalous = PEOPLE.filter((p) => p.anomaly)

  return (
    <div className="space-y-10">
      <Reveal>
        <PageTitle
          eyebrow="Engagement overview"
          title={ORG.name}
          subtitle={`${ORG.edition} · ${ORG.users.toLocaleString()} users · last synced ${ORG.lastSync}`}
        />
      </Reveal>

      {/* Hero — health score + headline savings */}
      <Reveal delay={0.05}>
        <V2Card hero className="p-8">
          <div className="flex flex-col items-start gap-8 lg:flex-row lg:items-center">
            <div className="flex items-center gap-8">
              <ScoreRing score={OVERVIEW.healthScore} label="Health score" />
              <div className="hidden h-24 w-px bg-grove-border dark:bg-grove-border-dk sm:block" />
              <div>
                <p className="v2-micro text-grove-ink/55 dark:text-grove-ink-dk/55">
                  Identified annual savings
                </p>
                <p className="v2-num v2-shimmer-text mt-2 text-5xl font-semibold text-grove-ink dark:text-grove-ink-dk">
                  <CountUp value={OVERVIEW.totalSavings} format={(n) => fmtMoney(n)} />
                </p>
                <p className="mt-2 text-sm text-grove-ink/65 dark:text-grove-ink-dk/65">
                  across license right-sizing, storage, and inactive seats
                </p>
              </div>
            </div>
            <div className="lg:ml-auto">
              <p className="v2-micro mb-2 text-grove-ink/55 dark:text-grove-ink-dk/55">
                Health trend · 7 runs
              </p>
              <Sparkline data={OVERVIEW.healthTrend} className="h-16 w-48" />
              <Link
                href={`/v2/orgs/${ORG.id}/org-analyzer`}
                className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-primary-700 transition-colors hover:text-copper-600 dark:text-primary-400 dark:hover:text-copper-400"
              >
                Open Health Report <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </V2Card>
      </Reveal>

      {/* KPI strip */}
      <Stagger className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <StaggerItem>
          <StatCard label="Active users" value={ORG.activeUsers} icon={Users} delta={`of ${ORG.users.toLocaleString()} total`} spark={[1102, 1120, 1148, 1155, 1161, 1174, 1180]} />
        </StaggerItem>
        <StaggerItem>
          <StatCard label="Open anomalies" value={OVERVIEW.openAnomalies} icon={AlertTriangle} delta="2 critical · 7 high" deltaTone="bad" />
        </StaggerItem>
        <StaggerItem>
          <StatCard label="Critical findings" value={OVERVIEW.criticalFindings} icon={Stethoscope} delta="from latest Health Report" deltaTone="bad" />
        </StaggerItem>
        <StaggerItem>
          <StatCard label="Recoverable / yr" value={186300} icon={DollarSign} format={(n) => fmtMoney(n)} delta="License Fit right-sizing" deltaTone="good" />
        </StaggerItem>
      </Stagger>

      {/* Sprawl quick stats band */}
      <Reveal>
        <V2Card className="p-6">
          <SectionHeading
            title="Where the dead weight is"
            hint="Live counts from the four sprawl scans"
            actions={
              <Link href={`/v2/orgs/${ORG.id}/sprawl`} className="flex items-center gap-1 text-sm font-semibold text-primary-700 hover:text-copper-600 dark:text-primary-400 dark:hover:text-copper-400">
                Open Sprawl <ArrowRight className="h-4 w-4" />
              </Link>
            }
          />
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[
              { icon: FileBarChart, label: 'Zombie reports', value: OVERVIEW.quickStats.zombieReports, hint: 'unviewed 12+ months' },
              { icon: Workflow, label: 'Dormant automations', value: OVERVIEW.quickStats.dormantAutomations, hint: '0 fires in 6 months' },
              { icon: Flame, label: 'Unused packages', value: OVERVIEW.quickStats.unusedPackages, hint: 'uninstall candidates' },
              { icon: Plug, label: 'Stale integrations', value: OVERVIEW.quickStats.staleIntegrations, hint: 'no API calls in 6 months' },
            ].map((s) => (
              <div key={s.label} className="group flex items-start gap-3 rounded-xl p-3 transition-colors hover:bg-grove-canvas dark:hover:bg-grove-canvas-dk">
                <span className="mt-0.5 rounded-lg bg-primary-50 p-2 text-primary-700 ring-1 ring-primary-100 transition-transform duration-200 group-hover:scale-110 dark:bg-primary-900/25 dark:text-primary-400 dark:ring-primary-900">
                  <s.icon className="h-4 w-4" />
                </span>
                <div>
                  <p className="v2-num text-2xl font-semibold text-grove-ink dark:text-grove-ink-dk">
                    <CountUp value={s.value} />
                  </p>
                  <p className="text-xs font-medium text-grove-ink/70 dark:text-grove-ink-dk/70">{s.label}</p>
                  <p className="text-[11px] text-grove-ink/45 dark:text-grove-ink-dk/45">{s.hint}</p>
                </div>
              </div>
            ))}
          </div>
        </V2Card>
      </Reveal>

      {/* Two-column triage */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Reveal>
          <V2Card className="h-full p-6">
            <SectionHeading
              title="Top anomalous users"
              hint="Flagged by the Mahalanobis + GMM ensemble"
              actions={
                <Link href={`/v2/orgs/${ORG.id}/anomalies`} className="flex items-center gap-1 text-sm font-semibold text-primary-700 hover:text-copper-600 dark:text-primary-400 dark:hover:text-copper-400">
                  All anomalies <ArrowRight className="h-4 w-4" />
                </Link>
              }
            />
            <div className="space-y-2">
              {anomalous.map((p) => (
                <Link
                  key={p.id}
                  href={`/v2/orgs/${ORG.id}/users/${p.id}`}
                  className="group flex items-center gap-4 rounded-xl border border-transparent p-3 transition-all duration-200 hover:border-grove-border hover:bg-grove-canvas dark:hover:border-grove-border-dk dark:hover:bg-grove-canvas-dk"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-700 text-sm font-bold text-white dark:bg-primary-400 dark:text-grove-canvas-dk">
                    {p.name.split(' ').map((w) => w[0]).join('')}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-grove-ink dark:text-grove-ink-dk">{p.name}</p>
                    <p className="truncate text-xs text-grove-ink/55 dark:text-grove-ink-dk/55">{p.title} · {p.dept}</p>
                  </div>
                  <div className="text-right">
                    <p className="v2-num text-lg font-semibold text-red-700 dark:text-red-400">{p.risk}</p>
                    <p className="v2-micro text-grove-ink/45 dark:text-grove-ink-dk/45">risk</p>
                  </div>
                  <ArrowRight className="h-4 w-4 shrink-0 text-grove-ink/30 transition-transform duration-200 group-hover:translate-x-1 group-hover:text-copper-500 dark:text-grove-ink-dk/30" />
                </Link>
              ))}
            </div>
          </V2Card>
        </Reveal>

        <Reveal delay={0.08}>
          <V2Card className="h-full p-6">
            <SectionHeading
              title="Priority actions"
              hint="Cross-track inbox — security, right-sizing, equity"
              actions={
                <Link href={`/v2/orgs/${ORG.id}/recommendations`} className="flex items-center gap-1 text-sm font-semibold text-primary-700 hover:text-copper-600 dark:text-primary-400 dark:hover:text-copper-400">
                  Open inbox <ArrowRight className="h-4 w-4" />
                </Link>
              }
            />
            <div className="space-y-2">
              {PRIORITY_ACTIONS.slice(0, 4).map((a) => (
                <div
                  key={a.id}
                  className="rounded-xl border border-transparent p-3 transition-all duration-200 hover:border-grove-border hover:bg-grove-canvas dark:hover:border-grove-border-dk dark:hover:bg-grove-canvas-dk"
                >
                  <div className="flex items-center gap-2">
                    <SeverityChip severity={a.severity as Severity} />
                    <Pill tone="neutral">{a.source}</Pill>
                  </div>
                  <p className="mt-2 text-sm font-semibold text-grove-ink dark:text-grove-ink-dk">{a.title}</p>
                  <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-grove-ink/60 dark:text-grove-ink-dk/60">{a.detail}</p>
                </div>
              ))}
            </div>
          </V2Card>
        </Reveal>
      </div>
    </div>
  )
}
