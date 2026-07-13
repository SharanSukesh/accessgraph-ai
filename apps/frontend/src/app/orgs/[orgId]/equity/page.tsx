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
  AlertTriangle,
  Check,
  CheckCircle2,
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
import { PageHeader } from '@/components/shared/PageHeader'
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


// Salesforce deep-link strategy:
//
// PermissionSetAssignment is a junction record — Lightning doesn't expose a
// standalone /lightning/o/PermissionSetAssignment/new page (it just redirects
// to "?count=1" with a "This record isn't supported" error). The only
// reliable, supported path is the user's Permission Set Assignments related
// list, where the admin clicks "Add Assignment" and picks the PS we
// recommended.
//
// We link there and rely on the rec card's title to tell the admin which PS
// to select. One click + one search vs. zero clicks — best we can do without
// programmatic API assignment, which isn't appropriate for a recommendation
// surface anyway (the admin reviews + applies, not us).
function salesforceDeepLink(
  instanceUrl: string | null | undefined,
  userSfId: string | undefined,
  psSfId: string | undefined,
): string | null {
  if (!instanceUrl || !userSfId) return null
  void psSfId  // included on the link below as a query hint for future use
  const base = instanceUrl.replace(/\/$/, '')
  return `${base}/lightning/r/User/${encodeURIComponent(userSfId)}/related/PermissionSetAssignments/view`
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
        className={`fixed right-0 top-0 h-full w-full sm:w-96 bg-grove-surface dark:bg-grove-canvas-dk shadow-xl z-50 transform transition-transform overflow-y-auto ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-grove-ink dark:text-grove-ink-dk">
              User disparity
            </h2>
            <button
              onClick={onClose}
              className="text-grove-ink/50 hover:text-grove-ink/70 dark:hover:text-grove-border"
            >
              <XIcon className="h-5 w-5" />
            </button>
          </div>
          {!open ? null : isLoading ? (
            <p className="text-sm text-grove-ink/55">Loading…</p>
          ) : error ? (
            <p className="text-sm text-red-600">Failed to load user disparity.</p>
          ) : !data ? (
            <p className="text-sm text-grove-ink/55">No data.</p>
          ) : (
            <div className="space-y-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-grove-ink/55">
                  Salesforce user
                </p>
                <p className="text-sm font-mono text-grove-ink dark:text-grove-ink-dk">
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
                  <p className="text-xs text-grove-ink/55">Department</p>
                  <p className="text-sm font-medium text-grove-ink dark:text-grove-ink-dk">
                    {data.department || '—'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-grove-ink/55">Distance to nearest VIP</p>
                  <p className="text-sm font-medium text-grove-ink dark:text-grove-ink-dk">
                    {data.distance_to_nearest_vip == null
                      ? '∞ (unreachable)'
                      : data.distance_to_nearest_vip.toFixed(2) + ' hops'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-grove-ink/55">This user's utility</p>
                  <p className="text-sm font-medium text-grove-ink dark:text-grove-ink-dk">
                    {data.inverse_distance_utility.toFixed(3)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-grove-ink/55">Dept avg</p>
                  <p className="text-sm font-medium text-grove-ink dark:text-grove-ink-dk">
                    {data.department_avg_utility.toFixed(3)}
                  </p>
                </div>
                <div className="col-span-2">
                  <p className="text-xs text-grove-ink/55">Org avg (juniors)</p>
                  <p className="text-sm font-medium text-grove-ink dark:text-grove-ink-dk">
                    {data.org_avg_utility.toFixed(3)}
                  </p>
                </div>
              </div>
              <p className="text-xs text-grove-ink/55 italic pt-2 border-t border-grove-border dark:border-grove-border-dk">
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


// Pulls the useful message out of whatever the mutation threw. The
// API client wraps HTTP errors in ApiError with `.errorData` — the
// backend surfaces the traceback message on the `detail` field. Falls
// through to `err.message` and finally a JSON dump so the user never
// sees "undefined".
function formatGenerateError(err: unknown): string {
  if (!err) return 'Unknown error'
  const e = err as Record<string, unknown> & { message?: string }
  const errorData = (e.errorData as Record<string, unknown> | undefined) ?? undefined
  const detail = errorData?.detail
  if (detail && typeof detail === 'object') {
    const d = detail as Record<string, unknown>
    const t = d.error_type as string | undefined
    const msg = (d.error as string | undefined) ?? (d.message as string | undefined)
    if (t && msg) return `${t}: ${msg}`
    if (msg) return msg
  }
  if (typeof detail === 'string') return detail
  if (e.message) return e.message
  try {
    return JSON.stringify(err)
  } catch {
    return String(err)
  }
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
      <PageHeader
        icon={Scale}
        title="Equity"
        subtitle={
          <>
            GAEA-driven recommendations to balance access across teams
            {hasData && diagnostic?.snapshot_at && (
              <span className="block text-xs text-grove-ink/55 dark:text-grove-ink-dk/55 mt-0.5">
                Last computed {formatTimeAgo(diagnostic.snapshot_at)}
              </span>
            )}
          </>
        }
        actions={
          <Button
            variant="primary"
            size="md"
            onClick={handleGenerate}
            disabled={generateMutation.isPending}
          >
            <Sparkles className="h-4 w-4 mr-2" />
            {generateMutation.isPending ? 'Computing…' : 'Generate recommendations'}
          </Button>
        }
      />

      {/* Generate-mutation status banners. Without these, a failed run
          was invisible — the user saw the "Computing…" spinner briefly
          then nothing else. */}
      {generateMutation.isError && (
        <Card variant="bordered" className="p-4 border-red-300 dark:border-red-800 bg-red-50/40 dark:bg-red-900/15">
          <div className="flex items-start gap-3 text-sm">
            <AlertTriangle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="font-semibold text-red-700 dark:text-red-400">
                Generation failed
              </div>
              <div className="text-red-700/80 dark:text-red-400/80 mt-1">
                {formatGenerateError(generateMutation.error)}
              </div>
              <div className="text-red-700/60 dark:text-red-400/60 mt-2 text-xs">
                Check the Railway backend logs — the full traceback is
                logged under "Equity recs generation failed for org …".
              </div>
            </div>
            <button
              type="button"
              onClick={() => generateMutation.reset()}
              className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30"
              title="Dismiss"
            >
              <XIcon className="h-4 w-4 text-red-500" />
            </button>
          </div>
        </Card>
      )}

      {generateMutation.isSuccess && generateMutation.data && (
        <Card variant="bordered" className="p-4 border-primary-300 dark:border-primary-800 bg-primary-50/40 dark:bg-primary-900/15">
          <div className="flex items-start gap-3 text-sm">
            <CheckCircle2 className="h-5 w-5 text-primary-600 dark:text-primary-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="font-semibold text-primary-800 dark:text-primary-300">
                Generation complete
              </div>
              <div className="text-primary-800/80 dark:text-primary-300/80 mt-1">
                Policy proposed{' '}
                <strong>
                  {generateMutation.data.recommendations_created}
                </strong>{' '}
                grant
                {generateMutation.data.recommendations_created === 1
                  ? ''
                  : 's'}
                . Equity Index now{' '}
                <strong>
                  {((generateMutation.data.equity_index ?? 0) * 100).toFixed(1)}%
                </strong>
                {generateMutation.data.most_disadvantaged_group && (
                  <>
                    {' '}
                    — most disadvantaged group:{' '}
                    <strong>
                      {generateMutation.data.most_disadvantaged_group}
                    </strong>
                  </>
                )}
                .
              </div>
            </div>
            <button
              type="button"
              onClick={() => generateMutation.reset()}
              className="p-1 rounded hover:bg-primary-100 dark:hover:bg-primary-900/30"
              title="Dismiss"
            >
              <XIcon className="h-4 w-4 text-primary-600 dark:text-primary-400" />
            </button>
          </div>
        </Card>
      )}

      {/* Plain-English narration of the snapshot */}
      {narration && (
        <Card variant="bordered" className="border-primary-200 dark:border-primary-800 bg-primary-50/60 dark:bg-primary-900/15">
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              <Info className="h-5 w-5 text-primary-700 dark:text-primary-400 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-primary-800 dark:text-primary-200">
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
              <p className="text-sm font-medium text-grove-ink/65 dark:text-grove-ink-dk/65">
                Equity Index
              </p>
              <p className="mt-2 text-3xl font-bold text-primary-700 dark:text-primary-400">
                {diagnosticLoading
                  ? '…'
                  : hasData
                  ? diagnostic!.equity_index.toFixed(2)
                  : '—'}
              </p>
              <p className="mt-1 text-xs text-grove-ink/55 dark:text-grove-ink-dk/55">
                1.0 = perfect parity, 0.0 = maximal inequality
              </p>
              {/* Trend sparkline — last 30 snapshots */}
              {history && history.length >= 2 && (
                <div className="mt-3">
                  <Sparkline points={history} />
                  <p className="text-xs text-grove-ink/55 dark:text-grove-ink-dk/55 mt-1">
                    Trend across last {history.length} runs
                  </p>
                </div>
              )}
            </div>
            <TrendingUp className="h-8 w-8 text-primary-400 flex-shrink-0" />
          </div>
        </Card>

        <Card variant="bordered" className="p-6">
          <div>
            <p className="text-sm font-medium text-grove-ink/65 dark:text-grove-ink-dk/65">
              Most disadvantaged
            </p>
            <p className="mt-2 text-3xl font-bold text-orange-600 dark:text-orange-400">
              {diagnosticLoading
                ? '…'
                : diagnostic?.most_disadvantaged_group || '—'}
            </p>
            <p className="mt-1 text-xs text-grove-ink/55 dark:text-grove-ink-dk/55">
              Group with the lowest avg access to VIP nodes
            </p>
          </div>
        </Card>

        <Card variant="bordered" className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-grove-ink/65 dark:text-grove-ink-dk/65">
                VIP set size
              </p>
              <p className="mt-2 text-3xl font-bold text-grove-ink dark:text-grove-ink-dk">
                {diagnosticLoading ? '…' : diagnostic?.vip_count ?? 0}
              </p>
              <p className="mt-1 text-xs text-grove-ink/55 dark:text-grove-ink-dk/55">
                Users identified as opportunity/authority nodes
              </p>
            </div>
            <UsersIcon className="h-8 w-8 text-grove-ink/50" />
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
                      <span className="text-sm font-medium text-grove-ink/85 dark:text-grove-ink-dk/85 flex items-center gap-2">
                        {dept}
                        {isWorst && (
                          <Badge variant="warning" size="sm">
                            worst
                          </Badge>
                        )}
                      </span>
                      <span className="text-sm tabular-nums text-grove-ink/65 dark:text-grove-ink-dk/65">
                        {util.toFixed(3)}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-primary-50 dark:bg-primary-900/20 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          isWorst
                            ? 'bg-orange-500'
                            : 'bg-primary-600'
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
                  <span className="text-sm font-medium text-grove-ink/85 dark:text-grove-ink-dk/85 capitalize">
                    {edge.replace(/_/g, ' ')}
                  </span>
                  <span className="text-sm tabular-nums text-grove-ink/65 dark:text-grove-ink-dk/65">
                    {count}
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-grove-ink/55 dark:text-grove-ink-dk/55">
              Edges in the heterogeneous user graph the policy operates on.
              <code className="ml-1 text-primary-700 dark:text-primary-400">manages</code>{' '}
              edges come from User.ManagerId,{' '}
              <code className="text-primary-700 dark:text-primary-400">role_above</code>{' '}
              from the role hierarchy,{' '}
              <code className="text-primary-700 dark:text-primary-400">ps_overlap</code>{' '}
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
                <span className="text-sm font-normal text-grove-ink/55">
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
                        ? 'border-grove-border dark:border-grove-border-dk bg-grove-canvas dark:bg-grove-canvas-dk/30 opacity-60'
                        : 'border-grove-border dark:border-grove-border-dk hover:bg-primary-50/40 dark:hover:bg-primary-900/15'
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
                    <h3 className="text-sm font-semibold text-grove-ink dark:text-grove-ink-dk">
                      {rec.title}
                    </h3>
                    <p className="text-sm text-grove-ink/65 dark:text-grove-ink-dk/65 mt-1">
                      {rec.description}
                    </p>
                    {rec.rationale && (
                      <p className="text-xs text-grove-ink/55 dark:text-grove-ink-dk/55 mt-2 italic">
                        {rec.rationale}
                      </p>
                    )}
                    {/* Action row */}
                    <div className="flex items-center gap-2 mt-3 flex-wrap">
                      {/* Open user disparity drawer */}
                      {userSfId && (
                        <button
                          onClick={() => setDrawerUserSfId(userSfId)}
                          className="text-xs text-primary-700 dark:text-primary-400 hover:underline"
                        >
                          View user disparity
                        </button>
                      )}
                      {/* Spacer */}
                      <div className="flex-1" />
                      {/* Salesforce deep-link — opens the target user's
                          Permission Set Assignments related list. PSA
                          isn't a standalone-creatable record in Lightning
                          (defaultFieldValues is silently dropped + Salesforce
                          shows "record isn't supported"), so we land the
                          admin on the user's existing assignments and let
                          them click "Add Assignment" → pick the PS shown
                          in the rec title. Tooltip carries the PS id as a
                          reminder. */}
                      {sfLink && !isInactive && (
                        <a
                          href={sfLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={
                            psId
                              ? `Opens user's Permission Set Assignments. Add "${psId}".`
                              : "Opens user's Permission Set Assignments."
                          }
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded text-xs font-medium border border-grove-border dark:border-grove-border-dk text-grove-ink/85 dark:text-grove-ink-dk/85 hover:bg-primary-50 dark:hover:bg-primary-900/20"
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
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded text-xs font-medium text-grove-ink/65 dark:text-grove-ink-dk/65 hover:bg-primary-50 dark:hover:bg-primary-900/20"
                          >
                            <XIcon className="h-3 w-3" />
                            Dismiss
                          </button>
                          <button
                            onClick={() =>
                              updateStatus.mutate({ recId: rec.id, status: 'applied' })
                            }
                            disabled={updateStatus.isPending}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded text-xs font-medium bg-primary-700 text-grove-canvas hover:bg-primary-800"
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
