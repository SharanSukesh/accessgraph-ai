'use client'

/**
 * Objects Page
 * Browse Salesforce objects and their access patterns
 */

import { useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Database, Search, Filter, Shield, AlertTriangle, Sparkles, Loader2 } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/shared/Card'
import { Button } from '@/components/shared/Button'
import { Badge } from '@/components/shared/Badge'
import { ErrorState } from '@/components/shared/ErrorState'
import { EmptyState } from '@/components/shared/EmptyState'
import { TableSkeleton } from '@/components/shared/LoadingSkeleton'
import { PageHeader } from '@/components/shared/PageHeader'
import { useObjects } from '@/lib/api/hooks/useObjects'
import {
  useDataQualityLatest,
  useDataQualityObjects,
  useRunDataQuality,
  type ObjectScore,
} from '@/lib/api/hooks/useDataQuality'

export default function ObjectsPage() {
  const params = useParams()
  const router = useRouter()
  const orgId = params.orgId as string

  const [search, setSearch] = useState('')
  const [sensitiveFilter, setSensitiveFilter] = useState<string>('')

  const { data: objects, isLoading, error } = useObjects(orgId, {
    search,
    sensitive: sensitiveFilter || undefined,
  })

  // Data-quality overlay — worst-first scores plus the org-wide KPI.
  // Hydrates on first paint; no-op if the engine has never run.
  const { data: dqSummary } = useDataQualityLatest(orgId)
  const { data: dqObjects } = useDataQualityObjects(orgId)
  const runDq = useRunDataQuality(orgId)

  // Index scores by object apiName so the objects table can pick each
  // row's score in O(1) inside the render loop.
  const scoresByApiName = useMemo(() => {
    const map = new Map<string, ObjectScore>()
    for (const s of dqObjects?.objects ?? []) {
      map.set(s.object_name, s)
    }
    return map
  }, [dqObjects])

  // Split analysed count into scored (has records) vs empty for the
  // KPI subtext. Backend excludes empties from avg_score already; the
  // frontend just needs the two counts to render "N scored · M empty".
  const { scoredCount, emptyCount } = useMemo(() => {
    let scored = 0
    let empty = 0
    for (const s of dqObjects?.objects ?? []) {
      if (s.record_count === 0) empty++
      else scored++
    }
    return { scoredCount: scored, emptyCount: empty }
  }, [dqObjects])

  if (error) {
    return (
      <ErrorState
        message="Failed to load objects. Please try again."
        onRetry={() => window.location.reload()}
      />
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Database}
        title="Salesforce Objects"
        subtitle="Browse objects and analyze access patterns"
        actions={
          <Button
            variant="secondary"
            size="sm"
            onClick={() => runDq.mutate()}
            disabled={runDq.isPending}
            aria-label={
              dqSummary?.has_data
                ? 'Re-run data quality analysis'
                : 'Analyse data quality'
            }
          >
            {runDq.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4 mr-2" />
            )}
            {runDq.isPending
              ? 'Analysing…'
              : dqSummary?.has_data
              ? 'Re-analyse quality'
              : 'Analyse quality'}
          </Button>
        }
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
        <Card variant="bordered" className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-grove-ink/65 dark:text-grove-ink-dk/65">
                Total Objects
              </p>
              <p className="mt-2 text-3xl font-bold text-grove-ink dark:text-grove-ink-dk">
                {isLoading ? '...' : objects?.length || 0}
              </p>
            </div>
            <div className="p-3 rounded-lg bg-primary-100 dark:bg-primary-900">
              <Database className="h-6 w-6 text-primary-600 dark:text-primary-400" />
            </div>
          </div>
        </Card>

        <Card variant="bordered" className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-grove-ink/65 dark:text-grove-ink-dk/65">
                Sensitive
              </p>
              <p className="mt-2 text-3xl font-bold text-orange-600 dark:text-orange-400">
                {isLoading
                  ? '...'
                  : objects?.filter((o: any) => o.isSensitive).length || 0}
              </p>
            </div>
            <div className="p-3 rounded-lg bg-orange-100 dark:bg-orange-900">
              <Shield className="h-6 w-6 text-orange-600 dark:text-orange-400" />
            </div>
          </div>
        </Card>

        <Card variant="bordered" className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-grove-ink/65 dark:text-grove-ink-dk/65">
                Custom
              </p>
              <p className="mt-2 text-3xl font-bold text-primary-700 dark:text-primary-400">
                {isLoading
                  ? '...'
                  : objects?.filter((o: any) => o.isCustom).length || 0}
              </p>
            </div>
          </div>
        </Card>

        <Card variant="bordered" className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-grove-ink/65 dark:text-grove-ink-dk/65">
                With Anomalies
              </p>
              <p className="mt-2 text-3xl font-bold text-red-600 dark:text-red-400">
                {isLoading
                  ? '...'
                  : objects?.filter((o: any) => o.anomalyCount > 0).length || 0}
              </p>
            </div>
            <div className="p-3 rounded-lg bg-red-100 dark:bg-red-900">
              <AlertTriangle className="h-6 w-6 text-red-600 dark:text-red-400" />
            </div>
          </div>
        </Card>

        {/* Data quality KPI — an aggregate view of the per-object scores.
            "Not analysed" state points the user at the header button. */}
        <Card variant="bordered" className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-grove-ink/65 dark:text-grove-ink-dk/65">
                Data Quality
              </p>
              {dqSummary?.has_data ? (
                <>
                  {scoredCount > 0 ? (
                    <p
                      className={`mt-2 text-3xl font-bold ${qualityToneClass(
                        dqSummary.avg_score,
                      )}`}
                    >
                      {Math.round(dqSummary.avg_score)}
                    </p>
                  ) : (
                    // A score of 0 out of 100 reads as "terrible", so
                    // when *nothing* got scored (all objects empty or
                    // skipped) we render "—" instead. The subtext then
                    // explains what actually happened.
                    <p className="mt-2 text-3xl font-bold text-grove-ink/40 dark:text-grove-ink-dk/40">
                      —
                    </p>
                  )}
                  <p
                    className="text-xs text-grove-ink/55 dark:text-grove-ink-dk/55 mt-1"
                    title={
                      dqSummary.objects_skipped > 0
                        ? `${dqSummary.objects_skipped} object${
                            dqSummary.objects_skipped === 1 ? '' : 's'
                          } skipped — see server log for reasons`
                        : undefined
                    }
                  >
                    {scoredCount} scored
                    {emptyCount > 0 && ` · ${emptyCount} empty`}
                    {dqSummary.objects_skipped > 0 &&
                      ` · ${dqSummary.objects_skipped} skipped`}
                  </p>
                </>
              ) : (
                <>
                  <p className="mt-2 text-3xl font-bold text-grove-ink/40 dark:text-grove-ink-dk/40">
                    —
                  </p>
                  <p className="text-xs text-grove-ink/55 dark:text-grove-ink-dk/55 mt-1">
                    Not analysed
                  </p>
                </>
              )}
            </div>
            <div className="p-3 rounded-lg bg-copper-100 dark:bg-copper-900/25">
              <Sparkles className="h-6 w-6 text-copper-600 dark:text-copper-400" />
            </div>
          </div>
        </Card>
      </div>

      {/* Data quality diagnostics — only when the last run had 0 scored
          objects, so the user gets a concrete answer to "why is it —?".
          The banner enumerates skip reasons + tells them which objects
          were legitimately empty. Hides itself the moment the run
          produces real scores. */}
      {dqSummary?.has_data && scoredCount === 0 && (
        <DataQualityDiagnostics
          summary={dqSummary}
          scoredCount={scoredCount}
          emptyCount={emptyCount}
        />
      )}

      {/* Filters */}
      <Card variant="bordered">
        <CardContent className="py-4">
          <div className="flex flex-col sm:flex-row gap-4">
            {/* Search */}
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-grove-ink/50" />
              <input
                type="text"
                placeholder="Search objects..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-grove-border dark:border-grove-border-dk rounded-lg bg-grove-surface dark:bg-grove-surface-dk text-grove-ink dark:text-grove-ink-dk focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>

            {/* Sensitive Filter */}
            <select
              value={sensitiveFilter}
              onChange={(e) => setSensitiveFilter(e.target.value)}
              className="px-4 py-2 border border-grove-border dark:border-grove-border-dk rounded-lg bg-grove-surface dark:bg-grove-surface-dk text-grove-ink dark:text-grove-ink-dk focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            >
              <option value="">All Objects</option>
              <option value="sensitive">Sensitive Only</option>
              <option value="standard">Standard Only</option>
              <option value="custom">Custom Only</option>
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Objects Table */}
      <Card variant="bordered">
        <CardHeader>
          <CardTitle>
            {objects ? `${objects.length} Objects` : 'Objects'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <TableSkeleton rows={10} />
          ) : objects && objects.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-primary-50/40 dark:bg-primary-900/10 border-b border-grove-border dark:border-grove-border-dk">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-grove-ink/55 dark:text-grove-ink-dk/55 uppercase tracking-wider">
                      Object
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-grove-ink/55 dark:text-grove-ink-dk/55 uppercase tracking-wider">
                      API Name
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-grove-ink/55 dark:text-grove-ink-dk/55 uppercase tracking-wider">
                      Type
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-grove-ink/55 dark:text-grove-ink-dk/55 uppercase tracking-wider">
                      Sensitivity
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-grove-ink/55 dark:text-grove-ink-dk/55 uppercase tracking-wider">
                      Users with Access
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-grove-ink/55 dark:text-grove-ink-dk/55 uppercase tracking-wider">
                      Quality
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-grove-ink/55 dark:text-grove-ink-dk/55 uppercase tracking-wider">
                      Anomalies
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-grove-surface dark:bg-grove-canvas-dk divide-y divide-gray-200 dark:divide-gray-800">
                  {objects.map((obj: any) => (
                    <tr
                      key={obj.id}
                      className="hover:bg-primary-50/40 dark:hover:bg-primary-900/15 cursor-pointer transition-colors"
                      onClick={() => router.push(`/orgs/${orgId}/objects/${obj.id}`)}
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <Database className="h-5 w-5 text-grove-ink/50 mr-3" />
                          <div className="text-sm font-medium text-grove-ink dark:text-grove-ink-dk">
                            {obj.label}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-grove-ink dark:text-grove-ink-dk font-mono">
                          {obj.apiName}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <Badge variant={obj.isCustom ? 'info' : 'default'} size="sm">
                          {obj.isCustom ? 'Custom' : 'Standard'}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {obj.isSensitive ? (
                          <Badge variant="warning" size="sm">
                            Sensitive
                          </Badge>
                        ) : (
                          <Badge variant="default" size="sm">
                            Standard
                          </Badge>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-grove-ink dark:text-grove-ink-dk">
                        {obj.userCount || 0}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <QualityCell score={scoresByApiName.get(obj.apiName)} />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {obj.anomalyCount > 0 ? (
                          <Badge variant="danger" size="sm">
                            {obj.anomalyCount}
                          </Badge>
                        ) : (
                          <span className="text-sm text-grove-ink/50">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              title="No Objects Found"
              description="No objects match your current filters or data is not yet synced"
              icon="database"
            />
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ---------- Data-quality presentational helpers ----------

/**
 * Cell for the Quality column. Renders "-" for objects not yet analysed
 * (e.g. system objects skipped by the engine), and a coloured badge with
 * the score otherwise. Keeps the row compact — the drill-down lives on
 * the object detail page.
 */
function QualityCell({ score }: { score: ObjectScore | undefined }) {
  if (!score) {
    return <span className="text-sm text-grove-ink/40 dark:text-grove-ink-dk/40">—</span>
  }
  // Empty object — analysed but nothing to score. Show a neutral pill
  // instead of a fake number so the average KPI stays honest.
  if (score.record_count === 0) {
    return (
      <span
        className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium tabular-nums ring-1 bg-grove-canvas dark:bg-grove-surface-dk text-grove-ink/60 dark:text-grove-ink-dk/60 ring-grove-border dark:ring-grove-border-dk"
        title="No records — nothing to score"
      >
        0 records
      </span>
    )
  }
  const rounded = Math.round(score.score)
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold tabular-nums ring-1 ${qualityChipClasses(
        score.score,
      )}`}
      title={`Completeness ${Math.round(
        score.completeness_pct,
      )}% · Dupes ${Math.round(
        score.duplicate_pct,
      )}% · Stale ${Math.round(score.staleness_pct)}%`}
    >
      {rounded}
    </span>
  )
}

/**
 * Map a 0-100 score to a semantic tone. Thresholds intentionally
 * conservative: an org has to be doing quite well to reach the green
 * band, so the badge stays actionable — a mid-70s org still shows amber.
 */
function qualityToneClass(score: number): string {
  if (score >= 85) return 'text-primary-700 dark:text-primary-400'
  if (score >= 65) return 'text-copper-600 dark:text-copper-400'
  return 'text-red-600 dark:text-red-400'
}

function qualityChipClasses(score: number): string {
  if (score >= 85)
    return 'bg-primary-50 text-primary-700 ring-primary-200 dark:bg-primary-900/25 dark:text-primary-300 dark:ring-primary-800'
  if (score >= 65)
    return 'bg-copper-50 text-copper-700 ring-copper-200 dark:bg-copper-900/25 dark:text-copper-400 dark:ring-copper-800'
  return 'bg-red-50 text-red-700 ring-red-200 dark:bg-red-900/25 dark:text-red-400 dark:ring-red-800'
}

// ---------- Data-quality diagnostic banner ----------
//
// Renders only when the last run produced zero scored objects. Shows
// the skip-reason breakdown so operators can see exactly WHY the score
// came out empty (permission, malformed query, no records, etc.) with
// a plain-English gloss for each category.

interface DiagnosticProps {
  summary: import('@/lib/api/hooks/useDataQuality').DataQualitySummary
  scoredCount: number
  emptyCount: number
}

const SKIP_REASON_LABELS: Record<string, { title: string; hint: string }> = {
  describe_failed: {
    title: 'Describe failed',
    hint: 'Salesforce refused the describe call — usually a permission gap on the connected user.',
  },
  no_last_modified: {
    title: 'No LastModifiedDate',
    hint: "The object has no LastModifiedDate field — can't compute staleness.",
  },
  no_inspectable_fields: {
    title: 'No inspectable fields',
    hint: "The object has no fields we can score for completeness (all calculated / auto-number / encrypted).",
  },
  count_failed: {
    title: 'Record count failed',
    hint: 'The `SELECT COUNT()` query returned an error — usually FLS or object-level permission.',
  },
  empty: {
    title: 'Empty object',
    hint: 'The object has zero records — nothing to score against yet.',
  },
  sample_failed: {
    title: 'Sample query failed',
    hint: 'The sample SOQL rejected — usually a MALFORMED_QUERY on a compound / restricted field. Check the server log for the failing SOQL.',
  },
  sample_empty: {
    title: 'Sample returned empty',
    hint: 'Count said N > 0 but sample came back with no rows — usually row-level sharing filtering everything out.',
  },
  error: {
    title: 'Unexpected error',
    hint: 'The analysis crashed on this object. Check the server log for the traceback.',
  },
}

function DataQualityDiagnostics({ summary, scoredCount, emptyCount }: DiagnosticProps) {
  const reasons = Object.entries(summary.skip_reasons ?? {})
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])

  return (
    <Card variant="bordered" className="border-copper-200 dark:border-copper-800 bg-copper-50/40 dark:bg-copper-900/10">
      <CardContent className="py-5">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-copper-100 dark:bg-copper-900/25 flex-shrink-0">
            <AlertTriangle className="h-5 w-5 text-copper-600 dark:text-copper-400" />
          </div>
          <div className="flex-1 min-w-0 space-y-3">
            <div>
              <p className="text-sm font-semibold text-grove-ink dark:text-grove-ink-dk">
                No objects scored on the last run
              </p>
              <p className="text-xs text-grove-ink/65 dark:text-grove-ink-dk/65 mt-0.5">
                {summary.objects_analyzed} object{summary.objects_analyzed === 1 ? '' : 's'} attempted
                {' · '}
                {scoredCount} scored
                {emptyCount > 0 && ` · ${emptyCount} empty`}
                {summary.objects_skipped > 0 &&
                  ` · ${summary.objects_skipped} skipped`}
              </p>
            </div>

            {reasons.length > 0 && (
              <div>
                <p className="text-[10px] font-mono uppercase tracking-[0.14em] text-grove-ink/55 dark:text-grove-ink-dk/55 mb-2">
                  Skip reasons
                </p>
                <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {reasons.map(([reason, count]) => {
                    const label = SKIP_REASON_LABELS[reason] ?? {
                      title: reason,
                      hint: '',
                    }
                    return (
                      <li
                        key={reason}
                        className="flex items-start gap-2 px-3 py-2 rounded-lg bg-grove-surface dark:bg-grove-surface-dk border border-grove-border dark:border-grove-border-dk"
                      >
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-copper-100 dark:bg-copper-900/25 text-copper-700 dark:text-copper-400 text-xs font-semibold tabular-nums flex-shrink-0">
                          {count}
                        </span>
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-grove-ink dark:text-grove-ink-dk">
                            {label.title}
                          </p>
                          {label.hint && (
                            <p className="text-[11px] text-grove-ink/60 dark:text-grove-ink-dk/60 mt-0.5">
                              {label.hint}
                            </p>
                          )}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
