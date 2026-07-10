'use client'

/**
 * Managed-Package Sprawl page.
 *
 * Pulls every installed AppExchange package for the org, tiers each
 * by component + licence activity, and lays them out unused-first so
 * consultants can spot uninstall candidates immediately.
 */

import { useState } from 'react'
import { useParams } from 'next/navigation'
import {
  Package,
  Sparkles,
  Loader2,
  AlertTriangle,
  Users,
  Boxes,
  Cpu,
  Workflow,
  Database,
  GitBranch,
  FileStack,
  Play,
  CalendarClock,
  ChevronDown,
  Zap,
  Layers,
  Component,
} from 'lucide-react'
import { Card, CardContent } from '@/components/shared/Card'
import { Button } from '@/components/shared/Button'
import { ErrorState } from '@/components/shared/ErrorState'
import { EmptyState } from '@/components/shared/EmptyState'
import { TableSkeleton } from '@/components/shared/LoadingSkeleton'
import { PageHeader } from '@/components/shared/PageHeader'
import {
  usePackageSprawlLatest,
  usePackageSprawlPackages,
  useRunPackageSprawl,
  type InstalledPackage,
  type PackageTier,
} from '@/lib/api/hooks/usePackageSprawl'

export default function PackageSprawlPage() {
  const params = useParams()
  const orgId = params.orgId as string
  const [tier, setTier] = useState<PackageTier | undefined>(undefined)

  const {
    data: summary,
    isLoading: summaryLoading,
    error: summaryError,
  } = usePackageSprawlLatest(orgId)
  const {
    data: pkgPage,
    isLoading: pkgLoading,
    error: pkgError,
  } = usePackageSprawlPackages(orgId, { tier })
  const runMutation = useRunPackageSprawl(orgId)

  if (summaryError) {
    return (
      <ErrorState
        message="Failed to load package-sprawl summary."
        onRetry={() => window.location.reload()}
      />
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Package}
        title="Managed-Package Sprawl"
        subtitle={
          summary?.has_data && summary.snapshot_at
            ? `Last analysed ${formatRelative(summary.snapshot_at)} · ${summary.packages_total} package${summary.packages_total === 1 ? '' : 's'} installed`
            : 'AppExchange inventory + usage tiering'
        }
        actions={
          <Button
            variant="secondary"
            size="sm"
            onClick={() => runMutation.mutate()}
            disabled={runMutation.isPending}
          >
            {runMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4 mr-2" />
            )}
            {runMutation.isPending
              ? 'Analysing…'
              : summary?.has_data
              ? 'Re-analyse'
              : 'Analyse packages'}
          </Button>
        }
      />

      {runMutation.isError && (
        <Card
          variant="bordered"
          className="border-red-200 dark:border-red-800 bg-red-50/40 dark:bg-red-900/10"
        >
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-red-100 dark:bg-red-900/25 flex-shrink-0">
                <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-grove-ink dark:text-grove-ink-dk">
                  Analysis failed
                </p>
                <p className="text-xs text-grove-ink/70 dark:text-grove-ink-dk/70 mt-1 font-mono break-words">
                  {formatRunError(runMutation.error)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {!summary?.has_data && !summaryLoading && !runMutation.isPending && (
        <Card variant="bordered">
          <CardContent className="py-10">
            <EmptyState
              title="No package-sprawl data yet"
              description="Click Analyse packages to pull the org's AppExchange install list and tier each package by real usage."
              icon="data"
            />
          </CardContent>
        </Card>
      )}

      {summary?.has_data && (
        <>
          {/* KPI strip. */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <TierKpi
              label="Installed"
              value={summary.packages_total}
              icon={Package}
              tone="neutral"
              hint="Every managed package returned by InstalledSubscriberPackage."
            />
            <TierKpi
              label="Active"
              value={summary.packages_active}
              icon={Sparkles}
              tone="primary"
              hint="Package's namespace contains >= 5 Apex/Flow/Object components OR at least one licence seat is used. Currently a shallow signal — see the note below the KPI strip for detail."
            />
            <TierKpi
              label="Under-used"
              value={summary.packages_underused}
              icon={AlertTriangle}
              tone="copper"
              hint="Some components installed (1-4) but no licence usage. Warrants a manual check — could be genuinely light-use or could be surface inventory hiding real dependency."
            />
            <TierKpi
              label="Unused"
              value={summary.packages_unused}
              icon={Boxes}
              tone="danger"
              hint="Zero components in the namespace AND zero licence seats used. Strong uninstall candidate — but verify against actual code references before pulling the trigger."
            />
          </div>

          {/* Methodology caveat — surfaces the honest limitations of
              the current scoring so consultants don't act on it as
              gospel. Placed between the KPIs and the license roll-up
              so it's above-the-fold on any mid-sized viewport. */}
          <Card
            variant="bordered"
            className="border-copper-200 dark:border-copper-800 bg-copper-50/40 dark:bg-copper-900/10"
          >
            <CardContent className="py-4">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-copper-100 dark:bg-copper-900/25 flex-shrink-0">
                  <AlertTriangle className="h-5 w-5 text-copper-600 dark:text-copper-400" />
                </div>
                <div className="flex-1 min-w-0 space-y-2">
                  <p className="text-sm font-semibold text-grove-ink dark:text-grove-ink-dk">
                    How &ldquo;used&rdquo; is measured
                  </p>
                  <p className="text-xs text-grove-ink/75 dark:text-grove-ink-dk/75 leading-relaxed">
                    We now score each package on <strong>real wiring signals</strong>{' '}
                    pulled from Salesforce&rsquo;s Tooling API, not just what shipped in
                    the box. Any of the four signals coming back positive is enough to
                    promote a package to <strong>Active</strong>.
                  </p>
                  <ul className="text-xs text-grove-ink/75 dark:text-grove-ink-dk/75 leading-relaxed space-y-1 pl-4 list-disc marker:text-grove-mint">
                    <li>
                      <strong>Dependencies</strong> &mdash; customer components (Apex,
                      LWCs, Flows, Validation Rules, etc.) that reference something in
                      the package&rsquo;s namespace, via{' '}
                      <code className="font-mono text-[11px] text-copper-700 dark:text-copper-400">
                        MetadataComponentDependency
                      </code>
                      .
                    </li>
                    <li>
                      <strong>Records</strong> &mdash; row counts across every custom
                      object the package brought (bulk-count query per object, capped
                      per run to protect the timeout budget).
                    </li>
                    <li>
                      <strong>Async jobs</strong> &mdash; batches, queueables, and
                      futures for the package&rsquo;s Apex classes via{' '}
                      <code className="font-mono text-[11px]">AsyncApexJob</code>.
                    </li>
                    <li>
                      <strong>Scheduled jobs</strong> &mdash; live{' '}
                      <code className="font-mono text-[11px]">CronTrigger</code>{' '}
                      schedules for Apex in the package&rsquo;s namespace.
                    </li>
                  </ul>
                  <p className="text-xs text-grove-ink/70 dark:text-grove-ink-dk/70 leading-relaxed">
                    <strong>Licence seats</strong> still count too &mdash; any package
                    with real assigned seats stays Active even if code references are
                    thin. A signal chip shown as <em>&ldquo;&mdash;&rdquo;</em> means we
                    couldn&rsquo;t query it this run (missing Tooling permissions);
                    that&rsquo;s different from a genuine zero, so treat those packages
                    with extra caution before uninstalling.
                  </p>
                  <p className="text-xs text-grove-ink/60 dark:text-grove-ink-dk/60 leading-relaxed">
                    <strong>Still not covered:</strong> whether users are actively
                    clicking into package UI (that&rsquo;s{' '}
                    <code className="font-mono text-[11px]">LightningUsageByPage</code>{' '}
                    territory). Always spot-check heavily-referenced packages against a
                    real end-user before uninstalling anything flagged{' '}
                    <em>Unused</em>.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Licence roll-up (only if any packages have licence rows) */}
          {summary.total_licenses_allowed > 0 && (
            <Card variant="bordered">
              <CardContent className="py-4">
                <div className="flex items-center gap-4 flex-wrap">
                  <Users className="h-5 w-5 text-primary-700 dark:text-primary-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-grove-ink dark:text-grove-ink-dk">
                      {summary.total_licenses_used.toLocaleString()} of{' '}
                      {summary.total_licenses_allowed.toLocaleString()} package
                      licence seats used
                    </p>
                    <p className="text-xs text-grove-ink/55 dark:text-grove-ink-dk/55 mt-0.5">
                      Aggregate across every package that reported a PackageLicense row.
                      Untenanted seats are direct waste.
                    </p>
                  </div>
                  <div className="tabular-nums text-sm font-semibold text-primary-700 dark:text-primary-400">
                    {Math.round(
                      (summary.total_licenses_used /
                        summary.total_licenses_allowed) *
                        100,
                    )}
                    %
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Tier filter chips. */}
          <Card variant="bordered">
            <CardContent className="py-4">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-grove-ink/55 dark:text-grove-ink-dk/55">
                  Tier
                </span>
                <TierChip active={tier === undefined} onClick={() => setTier(undefined)}>
                  All
                  <span className="ml-1 tabular-nums opacity-60">
                    {summary.packages_total}
                  </span>
                </TierChip>
                <TierChip
                  tone="unused"
                  active={tier === 'unused'}
                  onClick={() => setTier('unused')}
                >
                  Unused
                  <span className="ml-1 tabular-nums opacity-60">
                    {summary.packages_unused}
                  </span>
                </TierChip>
                <TierChip
                  tone="underused"
                  active={tier === 'underused'}
                  onClick={() => setTier('underused')}
                >
                  Under-used
                  <span className="ml-1 tabular-nums opacity-60">
                    {summary.packages_underused}
                  </span>
                </TierChip>
                <TierChip
                  tone="active"
                  active={tier === 'active'}
                  onClick={() => setTier('active')}
                >
                  Active
                  <span className="ml-1 tabular-nums opacity-60">
                    {summary.packages_active}
                  </span>
                </TierChip>
              </div>
            </CardContent>
          </Card>

          {/* Package list. */}
          {pkgError ? (
            <ErrorState message="Failed to load package list." />
          ) : pkgLoading ? (
            <Card variant="bordered">
              <CardContent className="py-4">
                <TableSkeleton rows={6} />
              </CardContent>
            </Card>
          ) : pkgPage && pkgPage.packages.length > 0 ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {pkgPage.packages.map((pkg) => (
                <PackageCard key={pkg.id} pkg={pkg} />
              ))}
            </div>
          ) : (
            <Card variant="bordered">
              <CardContent className="py-10">
                <EmptyState
                  title={
                    tier
                      ? `No ${tier} packages`
                      : 'No packages returned'
                  }
                  description={
                    tier
                      ? 'Try a different tier or clear the filter.'
                      : 'The org has zero managed packages installed, or the connected user lacks View Setup and Configuration.'
                  }
                  icon="search"
                />
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}

// ============================================================================
// Presentational
// ============================================================================

function TierKpi({
  label,
  value,
  icon: Icon,
  tone,
  hint,
}: {
  label: string
  value: number
  icon: React.ComponentType<{ className?: string }>
  tone: 'primary' | 'copper' | 'danger' | 'neutral'
  hint: string
}) {
  const wrapperCls =
    tone === 'primary'
      ? 'p-3 rounded-lg bg-primary-50 dark:bg-primary-900/25 ring-1 ring-primary-200 dark:ring-primary-800'
      : tone === 'copper'
      ? 'p-3 rounded-lg bg-copper-100 dark:bg-copper-900/25 ring-1 ring-copper-200 dark:ring-copper-800'
      : tone === 'danger'
      ? 'p-3 rounded-lg bg-red-100 dark:bg-red-900/25 ring-1 ring-red-200 dark:ring-red-800'
      : 'p-3 rounded-lg bg-grove-canvas dark:bg-grove-surface-dk ring-1 ring-grove-border dark:ring-grove-border-dk'
  const iconCls =
    tone === 'primary'
      ? 'h-6 w-6 text-primary-700 dark:text-primary-400'
      : tone === 'copper'
      ? 'h-6 w-6 text-copper-600 dark:text-copper-400'
      : tone === 'danger'
      ? 'h-6 w-6 text-red-600 dark:text-red-400'
      : 'h-6 w-6 text-grove-ink/70 dark:text-grove-ink-dk/70'
  const valueCls =
    tone === 'danger'
      ? 'mt-2 text-3xl font-bold text-red-600 dark:text-red-400 tabular-nums'
      : tone === 'copper'
      ? 'mt-2 text-3xl font-bold text-copper-600 dark:text-copper-400 tabular-nums'
      : 'mt-2 text-3xl font-bold text-grove-ink dark:text-grove-ink-dk tabular-nums'

  return (
    <Card variant="bordered" className="p-6" title={hint}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-grove-ink/65 dark:text-grove-ink-dk/65">
            {label}
          </p>
          <p className={valueCls}>{value.toLocaleString()}</p>
        </div>
        <div className={wrapperCls}>
          <Icon className={iconCls} />
        </div>
      </div>
    </Card>
  )
}

function TierChip({
  tone,
  active,
  onClick,
  children,
}: {
  tone?: PackageTier
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  const cls = tone
    ? tierChipClasses(tone, active)
    : active
    ? 'bg-grove-ink text-grove-canvas dark:bg-grove-ink-dk dark:text-grove-canvas-dk'
    : 'text-grove-ink/70 dark:text-grove-ink-dk/70 hover:bg-primary-50/40 dark:hover:bg-primary-900/15'
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${cls}`}
    >
      {children}
    </button>
  )
}

function tierChipClasses(tier: PackageTier, active: boolean): string {
  const filled: Record<PackageTier, string> = {
    active:
      'bg-primary-50 text-primary-700 ring-1 ring-primary-200 dark:bg-primary-900/25 dark:text-primary-300 dark:ring-primary-800',
    underused:
      'bg-copper-100 text-copper-700 ring-1 ring-copper-200 dark:bg-copper-900/25 dark:text-copper-300 dark:ring-copper-800',
    unused:
      'bg-red-100 text-red-700 ring-1 ring-red-200 dark:bg-red-900/25 dark:text-red-300 dark:ring-red-800',
  }
  const outline: Record<PackageTier, string> = {
    active:
      'text-primary-700 dark:text-primary-400 hover:bg-primary-50/50 dark:hover:bg-primary-900/15',
    underused:
      'text-copper-700 dark:text-copper-400 hover:bg-copper-50 dark:hover:bg-copper-900/15',
    unused:
      'text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/15',
  }
  return active ? filled[tier] : outline[tier]
}

function PackageCard({ pkg }: { pkg: InstalledPackage }) {
  const totalComponents =
    pkg.apex_class_count + pkg.flow_count + pkg.custom_object_count
  // The entire header area is a toggle. We deliberately don't
  // preserve the expanded state across runs — the list is usually
  // "unused first" and users open a card only long enough to decide
  // uninstall / keep, then move on.
  const [expanded, setExpanded] = useState(false)

  return (
    <Card variant="bordered">
      <CardContent className="py-4">
        {/* Header: full-width click target. Using a real <button>
            keeps keyboard + a11y semantics for free; the visual
            styling is entirely on the inner div, so it still reads
            as a card, not a button. */}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-grove-mint focus-visible:ring-offset-2 focus-visible:ring-offset-grove-canvas dark:focus-visible:ring-offset-grove-canvas-dk rounded-md"
        >
        <div className="flex items-start gap-3">
          <TierDot tier={pkg.utilization_tier} />
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-semibold text-grove-ink dark:text-grove-ink-dk truncate">
                {pkg.name}
              </h3>
              <TierBadge tier={pkg.utilization_tier} />
              {pkg.is_deprecated && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-red-100 text-red-700 dark:bg-red-900/25 dark:text-red-300">
                  Deprecated
                </span>
              )}
              {pkg.is_beta && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-copper-100 text-copper-700 dark:bg-copper-900/25 dark:text-copper-300">
                  Beta
                </span>
              )}
              {/* Chevron sits at the far end of the title row. Rotates
                  180° on expand — no separate icon swap needed. */}
              <ChevronDown
                className={`ml-auto h-4 w-4 text-grove-ink/50 dark:text-grove-ink-dk/50 transition-transform ${expanded ? 'rotate-180' : ''}`}
                aria-hidden
              />
            </div>
            <div className="flex items-center gap-2 text-xs text-grove-ink/60 dark:text-grove-ink-dk/60 flex-wrap">
              {pkg.namespace_prefix && (
                <span className="font-mono">{pkg.namespace_prefix}</span>
              )}
              {pkg.version_number && (
                <>
                  {pkg.namespace_prefix && <span>·</span>}
                  <span>v{pkg.version_number}</span>
                </>
              )}
              {pkg.version_name && (
                <>
                  <span>·</span>
                  <span className="italic truncate">{pkg.version_name}</span>
                </>
              )}
            </div>
            {pkg.description && (
              <p className="text-xs text-grove-ink/70 dark:text-grove-ink-dk/70 line-clamp-2">
                {pkg.description}
              </p>
            )}

            {/* Wiring signal row — the real drivers of the tier
                decision. Each chip lights up when the underlying
                query returned a positive count. Null value = we
                couldn't query it (permissions / no Tooling); the
                chip is rendered dimmed with a "—" instead of hidden
                so the reader can tell the difference between
                "queried, got zero" and "couldn't query at all". */}
            <WiringSignalRow pkg={pkg} />

            {/* Package-shipped component strip — the "inventory"
                signals. Kept as secondary context now that wiring
                signals drive tiering. */}
            <div className="flex items-center gap-4 flex-wrap pt-1">
              <ComponentPill icon={Cpu} count={pkg.apex_class_count} label="Apex" />
              <ComponentPill icon={Workflow} count={pkg.flow_count} label="Flows" />
              <ComponentPill
                icon={Database}
                count={pkg.custom_object_count}
                label="Objects"
              />
              {typeof pkg.licenses_allowed === 'number' && (
                <span className="inline-flex items-center gap-1.5 text-xs text-grove-ink/70 dark:text-grove-ink-dk/70">
                  <Users className="h-3.5 w-3.5" />
                  {/* Salesforce returns -1 on PackageLicense.AllowedLicenses
                      to mean "unlimited seats". Render that as text rather
                      than a bogus negative number. Non-negative values
                      render as the usual "used / allowed seats" fraction. */}
                  {pkg.licenses_allowed < 0 ? (
                    <span className="tabular-nums">
                      {pkg.licenses_used ?? 0} used · unlimited seats
                    </span>
                  ) : (
                    <span className="tabular-nums">
                      {pkg.licenses_used ?? 0} / {pkg.licenses_allowed} seats
                    </span>
                  )}
                </span>
              )}
              <span className="ml-auto text-[10px] font-mono uppercase tracking-wider text-grove-ink/50 dark:text-grove-ink-dk/50">
                {totalComponents.toLocaleString()} components
              </span>
            </div>
          </div>
        </div>
        </button>

        {/* Detail drawer — only mounted when expanded so the closed-
            state DOM stays cheap on lists of 50+ packages. */}
        {expanded && <PackageDetail pkg={pkg} />}
      </CardContent>
    </Card>
  )
}

// PackageDetail is the "click to open" panel. Sections are opt-in:
// if the underlying evidence isn't there (no deps, no records, no
// licence), that section is skipped entirely so the panel doesn't
// pad out with empty scaffolding.
function PackageDetail({ pkg }: { pkg: InstalledPackage }) {
  const breakdown = pkg.evidence?.reasoning?.components_breakdown ?? {}
  const dependents = pkg.evidence?.top_dependents ?? []
  const recordCounts = pkg.evidence?.record_counts_by_object ?? {}
  const wiringSignals = pkg.evidence?.reasoning?.wiring_signals ?? []

  const hasComponentDetails =
    (breakdown.apex_class ?? 0) > 0 ||
    (breakdown.apex_trigger ?? 0) > 0 ||
    (breakdown.flow ?? 0) > 0 ||
    (breakdown.lwc ?? 0) > 0 ||
    (breakdown.aura ?? 0) > 0 ||
    (breakdown.custom_object ?? 0) > 0 ||
    // If all counts are null / zero we still want the block to render
    // *something* so the user knows the query happened. But if every
    // field is undefined (older run before v3), hide the section.
    breakdown.apex_trigger !== undefined ||
    breakdown.lwc !== undefined ||
    breakdown.aura !== undefined

  const recordEntries = Object.entries(recordCounts).sort(
    ([, a], [, b]) => b - a,
  )

  const hasRuntimeSignals =
    (pkg.async_job_count ?? 0) > 0 ||
    (pkg.scheduled_job_count ?? 0) > 0

  return (
    <div className="mt-4 pt-4 border-t border-grove-ink/10 dark:border-grove-ink-dk/10 space-y-6">
      <DetailWhereUsed pkg={pkg} dependents={dependents} />
      {hasComponentDetails && <DetailComponentsShipped breakdown={breakdown} />}
      {recordEntries.length > 0 && (
        <DetailRecordCounts entries={recordEntries} />
      )}
      {hasRuntimeSignals && <DetailRuntimeActivity pkg={pkg} />}
      {typeof pkg.licenses_allowed === 'number' && (
        <DetailLicensing pkg={pkg} />
      )}
      {wiringSignals.length === 0 && (
        <p className="text-xs italic text-grove-ink/50 dark:text-grove-ink-dk/50">
          No wiring signals fired for this package. Nothing in the org
          references it, no records live on its objects, and no jobs run
          from it — this is the profile of an install that can be safely
          uninstalled after a change-window notice.
        </p>
      )}
    </div>
  )
}

// "Where it's used" — the big one. If we have dependents we
// group them by MetadataComponentType so consultants can scan by
// category (all the Apex references together, all the Flow refs
// together, etc.). Falls back to graceful messages when the
// dependents list is empty for a good reason (permissions vs zero).
function DetailWhereUsed({
  pkg,
  dependents,
}: {
  pkg: InstalledPackage
  dependents: NonNullable<InstalledPackage['evidence']['top_dependents']>
}) {
  const depCount = pkg.dependency_count
  const grouped = dependents.reduce<Record<string, typeof dependents>>(
    (acc, d) => {
      const key = d.component_type ?? 'Other'
      acc[key] = acc[key] ?? []
      acc[key].push(d)
      return acc
    },
    {},
  )
  const typeKeys = Object.keys(grouped).sort()

  return (
    <section>
      <div className="flex items-center gap-2 mb-2">
        <GitBranch className="h-4 w-4 text-grove-mint" />
        <h4 className="text-xs font-semibold uppercase tracking-wider text-grove-ink dark:text-grove-ink-dk">
          Where it's used
        </h4>
        {typeof depCount === 'number' && (
          <span className="text-xs text-grove-ink/60 dark:text-grove-ink-dk/60 tabular-nums">
            {depCount.toLocaleString()} customer component{depCount === 1 ? '' : 's'} reference this package
          </span>
        )}
      </div>
      {depCount === null || depCount === undefined ? (
        <p className="text-xs italic text-grove-ink/55 dark:text-grove-ink-dk/55">
          MetadataComponentDependency wasn't queryable this run (missing
          Tooling permissions). We can't tell whether this package is
          referenced by any of your components.
        </p>
      ) : depCount === 0 ? (
        <p className="text-xs italic text-grove-ink/55 dark:text-grove-ink-dk/55">
          No customer components reference this package. Nothing in your
          Apex, LWCs, Flows, Validation Rules, or layouts touches its
          namespace.
        </p>
      ) : dependents.length === 0 ? (
        <p className="text-xs italic text-grove-ink/55 dark:text-grove-ink-dk/55">
          {depCount.toLocaleString()} references detected but the sample
          list came back empty — likely a permission gap on the
          MetadataComponent lookup. Aggregate count is still valid.
        </p>
      ) : (
        <div className="space-y-3">
          {typeKeys.map((typeKey) => (
            <div key={typeKey}>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-mono uppercase tracking-wider text-grove-ink/60 dark:text-grove-ink-dk/60">
                  {typeKey}
                </span>
                <span className="text-[10px] font-mono text-grove-ink/40 dark:text-grove-ink-dk/40 tabular-nums">
                  {grouped[typeKey].length}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {grouped[typeKey].map((d, i) => (
                  <span
                    key={`${d.component}-${i}`}
                    className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-mono bg-grove-canvas dark:bg-grove-canvas-dk/40 text-grove-ink/85 dark:text-grove-ink-dk/85 ring-1 ring-grove-ink/10 dark:ring-grove-ink-dk/15"
                    title={
                      d.ref_component
                        ? `${d.component} → ${d.ref_component} (${d.ref_type ?? 'component'})`
                        : `${d.component} references this package`
                    }
                  >
                    {d.component ?? '(unknown)'}
                  </span>
                ))}
              </div>
            </div>
          ))}
          {typeof depCount === 'number' && depCount > dependents.length && (
            <p className="text-[11px] italic text-grove-ink/45 dark:text-grove-ink-dk/45">
              Showing the top {dependents.length.toLocaleString()} of{' '}
              {depCount.toLocaleString()} references — the rest follow
              the same pattern.
            </p>
          )}
        </div>
      )}
    </section>
  )
}

// "What's inside" — the full shipped-component breakdown. Now that
// we query LWC / Aura / Trigger counts separately, this is the
// grid the client actually asked for.
function DetailComponentsShipped({
  breakdown,
}: {
  breakdown: NonNullable<
    InstalledPackage['evidence']['reasoning']
  >['components_breakdown']
}) {
  const cells: Array<{
    label: string
    count: number | null | undefined
    icon: React.ComponentType<{ className?: string }>
  }> = [
    { label: 'Apex classes', count: breakdown?.apex_class ?? 0, icon: Cpu },
    { label: 'Apex triggers', count: breakdown?.apex_trigger, icon: Zap },
    { label: 'Flows', count: breakdown?.flow ?? 0, icon: Workflow },
    { label: 'LWCs', count: breakdown?.lwc, icon: Component },
    { label: 'Aura bundles', count: breakdown?.aura, icon: Layers },
    { label: 'Custom objects', count: breakdown?.custom_object ?? 0, icon: Database },
  ]
  return (
    <section>
      <div className="flex items-center gap-2 mb-2">
        <Boxes className="h-4 w-4 text-grove-mint" />
        <h4 className="text-xs font-semibold uppercase tracking-wider text-grove-ink dark:text-grove-ink-dk">
          What's inside
        </h4>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {cells.map(({ label, count, icon: Icon }) => {
          const isNull = count === null || count === undefined
          const isEmpty = !isNull && count === 0
          const cls = isNull || isEmpty
            ? 'flex items-center gap-2 px-2.5 py-2 rounded-md bg-grove-canvas/50 dark:bg-grove-canvas-dk/20 text-grove-ink/40 dark:text-grove-ink-dk/40'
            : 'flex items-center gap-2 px-2.5 py-2 rounded-md bg-grove-canvas dark:bg-grove-canvas-dk/40 text-grove-ink/90 dark:text-grove-ink-dk/90 ring-1 ring-grove-ink/10 dark:ring-grove-ink-dk/15'
          return (
            <div
              key={label}
              className={cls}
              title={
                isNull
                  ? `${label}: not queried this run (missing Tooling access).`
                  : `${count?.toLocaleString()} ${label} shipped in this package.`
              }
            >
              <Icon className="h-3.5 w-3.5 flex-shrink-0" />
              <span className="text-sm font-semibold tabular-nums">
                {isNull ? '—' : count?.toLocaleString()}
              </span>
              <span className="text-[11px] opacity-80">{label}</span>
            </div>
          )
        })}
      </div>
    </section>
  )
}

// "Records held" — per-object row counts across the package's
// custom objects. Sorted descending so the biggest tables are top-
// of-list.
function DetailRecordCounts({
  entries,
}: {
  entries: [string, number][]
}) {
  const total = entries.reduce((sum, [, n]) => sum + n, 0)
  return (
    <section>
      <div className="flex items-center gap-2 mb-2">
        <FileStack className="h-4 w-4 text-grove-mint" />
        <h4 className="text-xs font-semibold uppercase tracking-wider text-grove-ink dark:text-grove-ink-dk">
          Records held
        </h4>
        <span className="text-xs text-grove-ink/60 dark:text-grove-ink-dk/60 tabular-nums">
          {total.toLocaleString()} total across {entries.length} object
          {entries.length === 1 ? '' : 's'}
        </span>
      </div>
      <div className="space-y-1">
        {entries.map(([obj, count]) => (
          <div
            key={obj}
            className="flex items-center gap-3 text-xs"
            title={`${count.toLocaleString()} rows in ${obj}`}
          >
            <code className="font-mono text-grove-ink/75 dark:text-grove-ink-dk/75 truncate flex-1">
              {obj}
            </code>
            <span className="tabular-nums font-semibold text-grove-ink dark:text-grove-ink-dk">
              {count.toLocaleString()}
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}

// "Runtime activity" — async / scheduled Apex from the namespace.
// Only shown when at least one fires; the wiring row on the closed
// card already surfaces the count.
function DetailRuntimeActivity({ pkg }: { pkg: InstalledPackage }) {
  return (
    <section>
      <div className="flex items-center gap-2 mb-2">
        <Play className="h-4 w-4 text-grove-mint" />
        <h4 className="text-xs font-semibold uppercase tracking-wider text-grove-ink dark:text-grove-ink-dk">
          Runtime activity
        </h4>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="flex items-center gap-2 px-2.5 py-2 rounded-md bg-grove-canvas dark:bg-grove-canvas-dk/40 ring-1 ring-grove-ink/10 dark:ring-grove-ink-dk/15">
          <Play className="h-3.5 w-3.5 text-grove-mint" />
          <span className="text-sm font-semibold tabular-nums text-grove-ink dark:text-grove-ink-dk">
            {(pkg.async_job_count ?? 0).toLocaleString()}
          </span>
          <span className="text-[11px] text-grove-ink/70 dark:text-grove-ink-dk/70">
            async Apex jobs (batches / queueables / futures)
          </span>
        </div>
        <div className="flex items-center gap-2 px-2.5 py-2 rounded-md bg-grove-canvas dark:bg-grove-canvas-dk/40 ring-1 ring-grove-ink/10 dark:ring-grove-ink-dk/15">
          <CalendarClock className="h-3.5 w-3.5 text-grove-mint" />
          <span className="text-sm font-semibold tabular-nums text-grove-ink dark:text-grove-ink-dk">
            {(pkg.scheduled_job_count ?? 0).toLocaleString()}
          </span>
          <span className="text-[11px] text-grove-ink/70 dark:text-grove-ink-dk/70">
            live CronTrigger schedules
          </span>
        </div>
      </div>
    </section>
  )
}

function DetailLicensing({ pkg }: { pkg: InstalledPackage }) {
  const allowed = pkg.licenses_allowed
  const used = pkg.licenses_used ?? 0
  const unlimited = typeof allowed === 'number' && allowed < 0
  const pct =
    !unlimited && typeof allowed === 'number' && allowed > 0
      ? Math.round((used / allowed) * 100)
      : null
  return (
    <section>
      <div className="flex items-center gap-2 mb-2">
        <Users className="h-4 w-4 text-grove-mint" />
        <h4 className="text-xs font-semibold uppercase tracking-wider text-grove-ink dark:text-grove-ink-dk">
          Licensing
        </h4>
      </div>
      <div className="flex items-center gap-3 flex-wrap text-xs text-grove-ink/85 dark:text-grove-ink-dk/85">
        <span className="tabular-nums">
          <strong>{used.toLocaleString()}</strong>{' '}
          {unlimited
            ? 'seats assigned · unlimited allowed'
            : `of ${allowed?.toLocaleString()} seats assigned`}
        </span>
        {pct !== null && (
          <>
            <span className="text-grove-ink/40 dark:text-grove-ink-dk/40">·</span>
            <span className="tabular-nums font-semibold text-grove-mint">
              {pct}%
            </span>
          </>
        )}
      </div>
    </section>
  )
}

// The wiring-signal row is the *why* behind the tier chip. Every
// package that ships components can look identical on inventory alone;
// what tells us it's actually load-bearing is whether other things in
// the org reach into it (MetadataComponentDependency), whether its
// custom objects hold records, and whether its Apex classes are being
// scheduled / batched. We surface all four so the reader can see the
// evidence rather than having to trust the tier chip.
function WiringSignalRow({ pkg }: { pkg: InstalledPackage }) {
  return (
    <div
      className="flex items-center gap-3 flex-wrap pt-0.5"
      title="Real wiring signals — any positive count promotes this package to the Active tier."
    >
      <SignalChip
        icon={GitBranch}
        count={pkg.dependency_count}
        label="deps"
        tooltip="Other components in the org that reference something in this package (MetadataComponentDependency)."
      />
      <SignalChip
        icon={FileStack}
        count={pkg.record_count_total}
        label="records"
        tooltip="Total records held across this package's custom objects."
      />
      <SignalChip
        icon={Play}
        count={pkg.async_job_count}
        label="async jobs"
        tooltip="AsyncApexJob rows for Apex classes in this package's namespace (batches, queueables, futures)."
      />
      <SignalChip
        icon={CalendarClock}
        count={pkg.scheduled_job_count}
        label="scheduled"
        tooltip="Active CronTrigger schedules for Apex in this package's namespace."
      />
    </div>
  )
}

// SignalChip has three distinct states that PackageCard's reader must
// be able to tell apart at a glance:
//   - positive count  → mint accent, chip is "on"
//   - zero            → dim ink, chip is "queried but empty"
//   - null            → dim + literal "—" for the count, chip is
//                       "we couldn't check this signal" (missing perm
//                       or no Tooling access). Never collapse null to
//                       zero — misreading "no permission" as "no
//                       activity" is exactly how a real package gets
//                       flagged as Unused.
function SignalChip({
  icon: Icon,
  count,
  label,
  tooltip,
}: {
  icon: React.ComponentType<{ className?: string }>
  count: number | null | undefined
  label: string
  tooltip: string
}) {
  const isNull = count === null || count === undefined
  const isActive = !isNull && (count ?? 0) > 0
  const cls = isActive
    ? 'inline-flex items-center gap-1.5 text-xs text-grove-mint dark:text-grove-mint tabular-nums font-medium'
    : 'inline-flex items-center gap-1.5 text-xs text-grove-ink/40 dark:text-grove-ink-dk/40 tabular-nums'
  const value = isNull
    ? '—'
    : (count as number).toLocaleString()
  const resolvedTooltip = isNull
    ? `${tooltip} — not queried this run (missing permissions or no Tooling access).`
    : tooltip
  return (
    <span className={cls} title={resolvedTooltip}>
      <Icon className="h-3.5 w-3.5" />
      {value}
      <span className="opacity-60">{label}</span>
    </span>
  )
}

function ComponentPill({
  icon: Icon,
  count,
  label,
}: {
  icon: React.ComponentType<{ className?: string }>
  count: number
  label: string
}) {
  const dim = count === 0
  return (
    <span
      className={
        dim
          ? 'inline-flex items-center gap-1.5 text-xs text-grove-ink/40 dark:text-grove-ink-dk/40 tabular-nums'
          : 'inline-flex items-center gap-1.5 text-xs text-grove-ink/85 dark:text-grove-ink-dk/85 tabular-nums'
      }
      title={`${count.toLocaleString()} ${label} components in this package's namespace`}
    >
      <Icon className="h-3.5 w-3.5" />
      {count.toLocaleString()}
      <span className="opacity-60">{label}</span>
    </span>
  )
}

function TierBadge({ tier }: { tier: PackageTier }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${tierChipClasses(tier, true)}`}
    >
      {tier}
    </span>
  )
}

function TierDot({ tier }: { tier: PackageTier }) {
  const cls =
    tier === 'unused'
      ? 'bg-red-500'
      : tier === 'underused'
      ? 'bg-copper-500'
      : 'bg-primary-500'
  return (
    <span
      className={`mt-1 h-2.5 w-2.5 rounded-full flex-shrink-0 ring-2 ring-grove-canvas dark:ring-grove-canvas-dk ${cls}`}
      aria-hidden
    />
  )
}

// ---------- Formatting ----------

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime()
  const now = Date.now()
  const diffSec = Math.round((now - then) / 1000)
  if (diffSec < 60) return 'just now'
  const diffMin = Math.round(diffSec / 60)
  if (diffMin < 60) return `${diffMin} min ago`
  const diffHr = Math.round(diffMin / 60)
  if (diffHr < 24) return `${diffHr} hr ago`
  const diffDay = Math.round(diffHr / 24)
  if (diffDay < 30) return `${diffDay}d ago`
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  } catch {
    return iso
  }
}

function formatRunError(err: unknown): string {
  if (!err) return 'Unknown error'
  const e = err as Record<string, unknown> & { message?: string }
  const errorData = (e.errorData as Record<string, unknown> | undefined) ?? undefined
  const detail = errorData?.detail as Record<string, unknown> | string | undefined
  if (detail && typeof detail === 'object') {
    const t = detail.error_type as string | undefined
    const msg = detail.error as string | undefined
    if (t && msg) return `${t}: ${msg}`
    if (msg) return msg
  }
  if (typeof detail === 'string') return detail
  if (e.message) return e.message
  return JSON.stringify(err)
}
