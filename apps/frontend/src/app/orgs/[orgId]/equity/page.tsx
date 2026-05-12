'use client'

/**
 * Equity Page (GAEA — Graph Augmentation for Equitable Access)
 *
 * Distinct from Recommendations: surfaces an Equity Index, per-department
 * access-utility bars, the most-disadvantaged group, and the policy's
 * suggested grants. Reads /orgs/{id}/equity/diagnostic for headline
 * metrics + /orgs/{id}/recommendations?track=equity for the proposal list.
 * Mutating call (generate) lives behind a button.
 */

import { useParams } from 'next/navigation'
import { Info, Scale, Sparkles, TrendingUp, Users as UsersIcon } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/shared/Card'
import { Button } from '@/components/shared/Button'
import { Badge } from '@/components/shared/Badge'
import { ErrorState } from '@/components/shared/ErrorState'
import { EmptyState } from '@/components/shared/EmptyState'
import { TableSkeleton } from '@/components/shared/LoadingSkeleton'
import {
  useEquityDiagnostic,
  useGenerateEquityRecommendations,
  type EquityDiagnostic,
} from '@/lib/api/hooks/useEquity'
import { useRecommendations } from '@/lib/api/hooks/useRecommendations'


// "5m ago" / "2h ago" / "3d ago". Keeps the dep surface small (no
// date-fns just for this). Returns "just now" for the first minute and
// drops to a localized date string after ~7 days.
function formatTimeAgo(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const diff = Math.max(0, Date.now() - then)
  const m = Math.floor(diff / 60_000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d ago`
  return new Date(iso).toLocaleDateString()
}


// Plain-English summary of what the snapshot says. Driven by the same
// fields the UI cards render — keeps the narration in sync with the
// numbers above it. Returns null when there's no data to narrate.
function narrate(d: EquityDiagnostic): string | null {
  if (!d.has_data) return null
  if (d.vip_count === 0) {
    return (
      "No VIP nodes detected. The equity policy needs at least one user " +
      "marked as a VIP to compute disparity. Set ManagerId on a user in " +
      "Salesforce, or pin one via the vip_designations table, then click " +
      "Generate again."
    )
  }
  const depts = Object.entries(d.per_dept_utilities)
  if (depts.length === 0) {
    return (
      `Found ${d.vip_count} VIP${d.vip_count === 1 ? '' : 's'} but no ` +
      "department groups to compare across. Junior users may have null " +
      "Department values — populate Department in Salesforce and resync."
    )
  }
  const tied = new Set(depts.map(([, v]) => v.toFixed(3))).size === 1
  const dept = d.most_disadvantaged_group
  const manages = d.edge_type_counts?.manages ?? 0
  const roleAbove = d.edge_type_counts?.role_above ?? 0
  if (tied) {
    const u = depts[0][1]
    const hops = u > 0 ? (1 / u).toFixed(1) : '∞'
    return (
      `All ${depts.length} departments are tied at utility ${u.toFixed(2)} ` +
      `(~${hops} hops to the nearest VIP). With ${manages} manager and ` +
      `${roleAbove} role-hierarchy edges, the graph has limited structural ` +
      "variation — populate ManagerId on more users to differentiate groups."
    )
  }
  const worstUtil = depts.find(([k]) => k === dept)?.[1] ?? 0
  const worstHops = worstUtil > 0 ? (1 / worstUtil).toFixed(1) : '∞'
  return (
    `${dept} juniors have the lowest access (~${worstHops} hops to the ` +
    `nearest of your ${d.vip_count} VIP${d.vip_count === 1 ? '' : 's'}). ` +
    `The policy suggested ${d.recommendations_generated} grant${
      d.recommendations_generated === 1 ? '' : 's'
    } to lift them.`
  )
}


// Empty-state copy for the suggested grants section. Different message
// based on which signal is missing, so admins know what to fix instead
// of seeing a generic "no data" placeholder.
function suggestedGrantsEmpty(
  d: EquityDiagnostic | undefined,
): { title: string; description: string } {
  if (!d?.has_data) {
    return {
      title: 'No equity snapshot yet',
      description:
        'Click "Generate recommendations" above to compute the first batch.',
    }
  }
  if (d.vip_count === 0) {
    return {
      title: 'No VIPs to anchor recommendations',
      description:
        'Set ManagerId on a user in Salesforce, or pin one via the ' +
        'vip_designations table. Then click Generate again.',
    }
  }
  if (d.recommendations_generated === 0) {
    return {
      title: 'No improvements found',
      description:
        'The policy could not find grants that meaningfully reduce ' +
        'disparity for the current data. Try syncing the org for fresh ' +
        'permission state, or increasing the budget.',
    }
  }
  return {
    title: 'No equity recommendations',
    description:
      'Recommendations may have been cleared. Click "Generate ' +
      'recommendations" to run a fresh batch.',
  }
}

export default function EquityPage() {
  const params = useParams()
  const orgId = params.orgId as string

  const {
    data: diagnostic,
    isLoading: diagnosticLoading,
    error: diagnosticError,
  } = useEquityDiagnostic(orgId)

  const {
    data: equityRecs,
    isLoading: recsLoading,
  } = useRecommendations(orgId, { track: 'equity' })

  const generateMutation = useGenerateEquityRecommendations(orgId)
  const narration = diagnostic ? narrate(diagnostic) : null
  const emptyState = suggestedGrantsEmpty(diagnostic)

  const handleGenerate = () => generateMutation.mutate(undefined)

  if (diagnosticError) {
    return <ErrorState message="Failed to load equity diagnostic" />
  }

  const hasData = diagnostic?.has_data

  // Sort departments by utility ascending — worst first, so the bars
  // immediately call out the disadvantaged groups.
  const sortedDepts = diagnostic
    ? Object.entries(diagnostic.per_dept_utilities).sort(
        ([, a], [, b]) => a - b,
      )
    : []
  const maxUtil = sortedDepts.length
    ? Math.max(...sortedDepts.map(([, v]) => v))
    : 1

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-indigo-100 dark:bg-indigo-900/40">
            <Scale className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Equity
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              GAEA-driven recommendations to balance access across teams
            </p>
            {hasData && diagnostic?.snapshot_at && (
              <p className="text-xs text-gray-500 dark:text-gray-500 mt-0.5">
                Last computed {formatTimeAgo(diagnostic.snapshot_at)}
              </p>
            )}
          </div>
        </div>
        <Button
          variant="primary"
          size="md"
          onClick={handleGenerate}
          disabled={generateMutation.isPending}
        >
          <Sparkles className="h-4 w-4 mr-2" />
          {generateMutation.isPending ? 'Computing…' : 'Generate recommendations'}
        </Button>
      </div>

      {/* Plain-English narration of the snapshot */}
      {narration && (
        <Card variant="bordered" className="border-indigo-200 dark:border-indigo-800 bg-indigo-50/50 dark:bg-indigo-900/10">
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              <Info className="h-5 w-5 text-indigo-600 dark:text-indigo-400 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-indigo-900 dark:text-indigo-100">
                {narration}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Headline metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card variant="bordered" className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                Equity Index
              </p>
              <p className="mt-2 text-3xl font-bold text-indigo-600 dark:text-indigo-400">
                {diagnosticLoading
                  ? '…'
                  : hasData
                  ? diagnostic!.equity_index.toFixed(2)
                  : '—'}
              </p>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-500">
                1.0 = perfect parity, 0.0 = maximal inequality
              </p>
            </div>
            <TrendingUp className="h-8 w-8 text-indigo-400" />
          </div>
        </Card>

        <Card variant="bordered" className="p-6">
          <div>
            <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
              Most disadvantaged
            </p>
            <p className="mt-2 text-3xl font-bold text-orange-600 dark:text-orange-400">
              {diagnosticLoading
                ? '…'
                : diagnostic?.most_disadvantaged_group || '—'}
            </p>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-500">
              Group with the lowest avg access to VIP nodes
            </p>
          </div>
        </Card>

        <Card variant="bordered" className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                VIP set size
              </p>
              <p className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">
                {diagnosticLoading ? '…' : diagnostic?.vip_count ?? 0}
              </p>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-500">
                Users identified as opportunity/authority nodes
              </p>
            </div>
            <UsersIcon className="h-8 w-8 text-gray-400" />
          </div>
        </Card>
      </div>

      {/* Per-department utility bars */}
      <Card variant="bordered">
        <CardHeader>
          <CardTitle>Per-department access utility</CardTitle>
        </CardHeader>
        <CardContent>
          {diagnosticLoading ? (
            <TableSkeleton rows={4} />
          ) : sortedDepts.length === 0 ? (
            <EmptyState
              title="No data yet"
              description="Click 'Generate recommendations' to compute the first equity snapshot."
            />
          ) : (
            <div className="space-y-3">
              {sortedDepts.map(([dept, util], i) => {
                const widthPct = (util / Math.max(maxUtil, 1e-6)) * 100
                const isWorst = i === 0 && sortedDepts.length > 1
                return (
                  <div key={dept}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
                        {dept}
                        {isWorst && (
                          <Badge variant="warning" size="sm">
                            worst
                          </Badge>
                        )}
                      </span>
                      <span className="text-sm tabular-nums text-gray-600 dark:text-gray-400">
                        {util.toFixed(3)}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          isWorst
                            ? 'bg-orange-500'
                            : 'bg-indigo-500'
                        }`}
                        style={{ width: `${widthPct}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edge type counts (debug-y but useful) */}
      {hasData && diagnostic?.edge_type_counts && (
        <Card variant="bordered">
          <CardHeader>
            <CardTitle>Graph composition</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              {Object.entries(diagnostic.edge_type_counts).map(([edge, count]) => (
                <div key={edge} className="flex justify-between items-baseline">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300 capitalize">
                    {edge.replace(/_/g, ' ')}
                  </span>
                  <span className="text-sm tabular-nums text-gray-600 dark:text-gray-400">
                    {count}
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-gray-500 dark:text-gray-500">
              Edges in the heterogeneous user graph the policy operates on.
              <code className="ml-1 text-indigo-600 dark:text-indigo-400">manages</code>{' '}
              edges come from User.ManagerId,{' '}
              <code className="text-indigo-600 dark:text-indigo-400">role_above</code>{' '}
              from the role hierarchy,{' '}
              <code className="text-indigo-600 dark:text-indigo-400">ps_overlap</code>{' '}
              from shared permission sets.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Suggested grants */}
      <Card variant="bordered">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>
              Suggested grants{' '}
              {equityRecs && (
                <span className="text-sm font-normal text-gray-500">
                  ({equityRecs.length})
                </span>
              )}
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {recsLoading ? (
            <TableSkeleton rows={5} />
          ) : equityRecs && equityRecs.length > 0 ? (
            <div className="space-y-3">
              {equityRecs.map((rec: any) => (
                <div
                  key={rec.id}
                  className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="info" size="sm">
                        <Scale className="h-3 w-3 mr-1 inline" />
                        Equity
                      </Badge>
                      <Badge variant="default" size="sm">
                        {rec.status?.replace(/_/g, ' ')}
                      </Badge>
                    </div>
                  </div>
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                    {rec.title}
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    {rec.description}
                  </p>
                  {rec.rationale && (
                    <p className="text-xs text-gray-500 dark:text-gray-500 mt-2 italic">
                      {rec.rationale}
                    </p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              title={emptyState.title}
              description={emptyState.description}
            />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
