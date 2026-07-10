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
              hint="Packages with real component activity (>=5 components) or at least one licence seat used."
            />
            <TierKpi
              label="Under-used"
              value={summary.packages_underused}
              icon={AlertTriangle}
              tone="copper"
              hint="Some components installed but low activity + few / no licences used. Candidate for right-sizing."
            />
            <TierKpi
              label="Unused"
              value={summary.packages_unused}
              icon={Boxes}
              tone="danger"
              hint="Zero components and zero licences used. Prime uninstall candidate."
            />
          </div>

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

  return (
    <Card variant="bordered">
      <CardContent className="py-4">
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

            {/* Component + licence strip */}
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
                  <span className="tabular-nums">
                    {pkg.licenses_used ?? 0} / {pkg.licenses_allowed} seats
                  </span>
                </span>
              )}
              <span className="ml-auto text-[10px] font-mono uppercase tracking-wider text-grove-ink/50 dark:text-grove-ink-dk/50">
                {totalComponents.toLocaleString()} components
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
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
