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

import { useState } from 'react'
import { useParams } from 'next/navigation'
import {
  Check,
  ExternalLink,
  Info,
  Scale,
  Sparkles,
  TrendingUp,
  Users as UsersIcon,
  X as XIcon,
} from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/shared/Card'
import { Button } from '@/components/shared/Button'
import { Badge } from '@/components/shared/Badge'
import { ErrorState } from '@/components/shared/ErrorState'
import { EmptyState } from '@/components/shared/EmptyState'
import { TableSkeleton } from '@/components/shared/LoadingSkeleton'
import {
  useEquityDiagnostic,
  useEquityHistory,
  useGenerateEquityRecommendations,
  useUserDisparity,
  type EquityDiagnostic,
  type EquityHistoryPoint,
} from '@/lib/api/hooks/useEquity'
import {
  useRecommendations,
  useUpdateRecommendationStatus,
} from '@/lib/api/hooks/useRecommendations'


// Construct a Salesforce deep-link that opens the New PermissionSetAssignment
// page pre-filled with the rec's user + PS IDs. Lightning's defaultFieldValues
// query param picks up AssigneeId and PermissionSetId automatically.
function salesforceDeepLink(
  instanceUrl: string | null | undefined,
  userSfId: string | undefined,
  psSfId: string | undefined,
): string | null {
  if (!instanceUrl || !userSfId || !psSfId) return null
  // Strip trailing slash
  const base = instanceUrl.replace(/\/$/, '')
  return (
    `${base}/lightning/o/PermissionSetAssignment/new?` +
    `defaultFieldValues=AssigneeId=${encodeURIComponent(userSfId)},` +
    `PermissionSetId=${encodeURIComponent(psSfId)}`
  )
}


// Tiny inline-SVG sparkline. Returns null when there are fewer than 2
// points (no trend to draw). Keeps the dep surface small — no recharts
// just for a tiny graph.
function Sparkline({ points }: { points: EquityHistoryPoint[] }) {
  if (points.length < 2) return null
  const W = 260
  const H = 40
  const PAD = 4
  const xs = points.map((_, i) => i)
  const ys = points.map(p => p.equity_index)
  const yMin = Math.min(...ys, 0)
  const yMax = Math.max(...ys, 1)
  const xMin = xs[0]
  const xMax = xs[xs.length - 1]
  const sx = (x: number) =>
    PAD + ((x - xMin) / Math.max(1e-6, xMax - xMin)) * (W - 2 * PAD)
  const sy = (y: number) =>
    H - PAD - ((y - yMin) / Math.max(1e-6, yMax - yMin)) * (H - 2 * PAD)
  const d = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${sx(i).toFixed(1)} ${sy(p.equity_index).toFixed(1)}`)
    .join(' ')
  const lastX = sx(points.length - 1)
  const lastY = sy(points[points.length - 1].equity_index)
  return (
    <svg width={W} height={H} className="overflow-visible">
      <path d={d} stroke="rgb(99 102 241)" strokeWidth="1.5" fill="none" />
      <circle cx={lastX} cy={lastY} r="2.5" fill="rgb(99 102 241)" />
    </svg>
  )
}


// Slide-in side panel showing per-user disparity stats. Opens when the
// user clicks a target_entity_id in a suggested-grant card.
function UserDisparityDrawer({
  orgId,
  userSfId,
  onClose,
}: {
  orgId: string
  userSfId: string | null
  onClose: () => void
}) {
  const { data, isLoading, error } = useUserDisparity(
    orgId,
    userSfId || undefined,
  )
  const open = !!userSfId
  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/40 z-40 transition-opacity ${
          open ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />
      {/* Drawer */}
      <aside
        className={`fixed right-0 top-0 h-full w-full sm:w-96 bg-white dark:bg-gray-900 shadow-xl z-50 transform transition-transform overflow-y-auto ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              User disparity
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
            >
              <XIcon className="h-5 w-5" />
            </button>
          </div>
          {!open ? null : isLoading ? (
            <p className="text-sm text-gray-500">Loading…</p>
          ) : error ? (
            <p className="text-sm text-red-600">Failed to load user disparity.</p>
          ) : !data ? (
            <p className="text-sm text-gray-500">No data.</p>
          ) : (
            <div className="space-y-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-500">
                  Salesforce user
                </p>
                <p className="text-sm font-mono text-gray-900 dark:text-white">
                  {data.user_sf_id}
                </p>
                {data.is_vip && (
                  <Badge variant="info" size="sm">
                    VIP
                  </Badge>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-gray-500">Department</p>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    {data.department || '—'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Distance to nearest VIP</p>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    {data.distance_to_nearest_vip == null
                      ? '∞ (unreachable)'
                      : data.distance_to_nearest_vip.toFixed(2) + ' hops'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">This user's utility</p>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    {data.inverse_distance_utility.toFixed(3)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Dept avg</p>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    {data.department_avg_utility.toFixed(3)}
                  </p>
                </div>
                <div className="col-span-2">
                  <p className="text-xs text-gray-500">Org avg (juniors)</p>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    {data.org_avg_utility.toFixed(3)}
                  </p>
                </div>
              </div>
              <p className="text-xs text-gray-500 italic pt-2 border-t border-gray-200 dark:border-gray-700">
                Higher utility = shorter path to a VIP. Lower distance is
                better. Equity recommendations target users whose utility
                drags their department's average down.
              </p>
            </div>
          )}
        </div>
      </aside>
    </>
  )
}


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

  const { data: history } = useEquityHistory(orgId, 30)
  const generateMutation = useGenerateEquityRecommendations(orgId)
  const updateStatus = useUpdateRecommendationStatus()
  const narration = diagnostic ? narrate(diagnostic) : null
  const emptyState = suggestedGrantsEmpty(diagnostic)

  // Side-panel state: which user's disparity drill-down is open
  const [drawerUserSfId, setDrawerUserSfId] = useState<string | null>(null)

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
          <div className="flex items-start justify-between">
            <div className="flex-1">
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
              {/* Trend sparkline — last 30 snapshots */}
              {history && history.length >= 2 && (
                <div className="mt-3">
                  <Sparkline points={history} />
                  <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                    Trend across last {history.length} runs
                  </p>
                </div>
              )}
            </div>
            <TrendingUp className="h-8 w-8 text-indigo-400 flex-shrink-0" />
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
              {equityRecs.map((rec: any) => {
                const aa = rec.affected_access || {}
                const psId = aa.ps_id as string | undefined
                const userSfId = (rec.target_entity_id || aa.user_id) as string | undefined
                const sfLink = salesforceDeepLink(
                  diagnostic?.salesforce_instance_url,
                  userSfId,
                  psId,
                )
                const isApplied = rec.status === 'applied'
                const isDismissed = rec.status === 'rejected' || rec.status === 'dismissed'
                const isInactive = isApplied || isDismissed
                return (
                  <div
                    key={rec.id}
                    className={`p-4 border rounded-lg transition ${
                      isInactive
                        ? 'border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/30 opacity-60'
                        : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="info" size="sm">
                          <Scale className="h-3 w-3 mr-1 inline" />
                          Equity
                        </Badge>
                        <Badge
                          variant={
                            isApplied
                              ? 'success'
                              : isDismissed
                              ? 'default'
                              : 'warning'
                          }
                          size="sm"
                        >
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
                    {/* Action row */}
                    <div className="flex items-center gap-2 mt-3 flex-wrap">
                      {/* Open user disparity drawer */}
                      {userSfId && (
                        <button
                          onClick={() => setDrawerUserSfId(userSfId)}
                          className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
                        >
                          View user disparity
                        </button>
                      )}
                      {/* Spacer */}
                      <div className="flex-1" />
                      {/* Salesforce deep-link */}
                      {sfLink && !isInactive && (
                        <a
                          href={sfLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded text-xs font-medium border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                        >
                          <ExternalLink className="h-3 w-3" />
                          Open in Salesforce
                        </a>
                      )}
                      {/* Apply / Dismiss */}
                      {!isInactive && (
                        <>
                          <button
                            onClick={() =>
                              updateStatus.mutate({ recId: rec.id, status: 'rejected' })
                            }
                            disabled={updateStatus.isPending}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                          >
                            <XIcon className="h-3 w-3" />
                            Dismiss
                          </button>
                          <button
                            onClick={() =>
                              updateStatus.mutate({ recId: rec.id, status: 'applied' })
                            }
                            disabled={updateStatus.isPending}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded text-xs font-medium bg-indigo-600 text-white hover:bg-indigo-700"
                          >
                            <Check className="h-3 w-3" />
                            Mark applied
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <EmptyState
              title={emptyState.title}
              description={emptyState.description}
            />
          )}
        </CardContent>
      </Card>

      {/* Per-user disparity drawer (slides in when a target user is clicked) */}
      <UserDisparityDrawer
        orgId={orgId}
        userSfId={drawerUserSfId}
        onClose={() => setDrawerUserSfId(null)}
      />
    </div>
  )
}
