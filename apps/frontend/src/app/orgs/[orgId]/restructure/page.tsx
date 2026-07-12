'use client'

/**
 * Restructure Studio.
 *
 * Consultants' interactive canvas for the GAEA Optimal Org Restructure
 * feature. Layout:
 *
 *   Header:          Explainer card + KPI strip (current → projected)
 *   Filter row:      move_type + blast_tier + status chips
 *   Move list:       cards with impact chips + accept/reject actions
 *   Constraints:     per-user-per-object preservation pins
 *   Plan drawer:     CSV export of the accepted-move sequence
 *
 * Fully backed by the /orgs/{id}/restructure/* endpoints. Everything
 * uses react-query so mutations invalidate the right caches and the
 * UI stays reactive.
 */

import { useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import {
  Wrench,
  Sparkles,
  Loader2,
  AlertTriangle,
  Scale,
  Users,
  Layers,
  Boxes,
  Zap,
  ChevronLeft,
  ChevronRight,
  X as XIcon,
  Check,
  Download,
  Search,
  MessageSquare,
  Info,
  BookOpen,
  ShieldCheck,
  Pin,
  Filter,
  HelpCircle,
} from 'lucide-react'
import { Card, CardContent } from '@/components/shared/Card'
import { Button } from '@/components/shared/Button'
import { ErrorState } from '@/components/shared/ErrorState'
import { EmptyState } from '@/components/shared/EmptyState'
import { TableSkeleton } from '@/components/shared/LoadingSkeleton'
import { PageHeader } from '@/components/shared/PageHeader'
import {
  useRestructureLatest,
  useRestructureMoves,
  useRunRestructure,
  useUpdateRestructureMove,
  useDeepAnalyzeMove,
  useRestructureConstraints,
  useCreateConstraint,
  useDeleteConstraint,
  type RestructureMove,
  type RestructureMoveType,
  type RestructureBlastTier,
} from '@/lib/api/hooks/useRestructure'
import { endpoints } from '@/lib/api/endpoints'

// ============================================================================
// Constants — move-type visual metadata
// ============================================================================

interface MoveTypeMeta {
  label: string
  short: string
  icon: React.ComponentType<{ className?: string }>
  color: string // tailwind fragment
  desc: string
}

const MOVE_TYPE_META: Record<RestructureMoveType, MoveTypeMeta> = {
  MERGE_PERMISSION_SETS: {
    label: 'Merge Permission Sets',
    short: 'MERGE PS',
    icon: Layers,
    color: 'bg-primary-100 text-primary-800 dark:bg-primary-900/40 dark:text-primary-200',
    desc: 'Combine two near-identical Permission Sets into one',
  },
  RETIRE_UNUSED_PS: {
    label: 'Retire Unused Permission Set',
    short: 'RETIRE PS',
    icon: XIcon,
    color: 'bg-primary-100 text-primary-800 dark:bg-primary-900/40 dark:text-primary-200',
    desc: 'Drop a Permission Set with zero assignments',
  },
  REASSIGN_TO_ROLE: {
    label: 'Reassign to Role',
    short: 'REASSIGN ROLE',
    icon: Users,
    color: 'bg-grove-mint/20 text-grove-mint dark:bg-grove-mint/25',
    desc: 'Move a user under a different role for better graph position',
  },
  MERGE_ROLES: {
    label: 'Merge Roles',
    short: 'MERGE ROLES',
    icon: Boxes,
    color: 'bg-grove-mint/20 text-grove-mint dark:bg-grove-mint/25',
    desc: 'Combine two roles with high member+access overlap',
  },
  FLATTEN_ROLE_LEVEL: {
    label: 'Flatten Role Level',
    short: 'FLATTEN',
    icon: ChevronRight,
    color: 'bg-grove-mint/20 text-grove-mint dark:bg-grove-mint/25',
    desc: 'Remove an intermediate role that adds no differentiation',
  },
  REPARENT_ROLE: {
    label: 'Reparent Role',
    short: 'REPARENT',
    icon: GitBranchIcon,
    color: 'bg-grove-mint/20 text-grove-mint dark:bg-grove-mint/25',
    desc: 'Change a role\'s parent for better rollup positioning',
  },
  REASSIGN_MANAGER: {
    label: 'Reassign Manager',
    short: 'REASSIGN MGR',
    icon: Zap,
    color: 'bg-copper-100 text-copper-700 dark:bg-copper-900/25 dark:text-copper-300',
    desc: 'Change User.ManagerId for approval-chain equity',
  },
}

function GitBranchIcon({ className }: { className?: string }) {
  return <Sparkles className={className} />
}

const BLAST_META: Record<
  RestructureBlastTier,
  { label: string; classes: string }
> = {
  low: {
    label: 'LOW',
    classes: 'bg-primary-100 text-primary-800 dark:bg-primary-900/25 dark:text-primary-300',
  },
  medium: {
    label: 'MEDIUM',
    classes: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/25 dark:text-yellow-300',
  },
  high: {
    label: 'HIGH',
    classes: 'bg-copper-100 text-copper-700 dark:bg-copper-900/25 dark:text-copper-300',
  },
  critical: {
    label: 'CRITICAL',
    classes: 'bg-red-100 text-red-700 dark:bg-red-900/25 dark:text-red-300',
  },
}

// ============================================================================
// Page
// ============================================================================

const PAGE_SIZE = 30

export default function RestructurePage() {
  const params = useParams()
  const orgId = params.orgId as string

  const [moveTypeFilter, setMoveTypeFilter] = useState<string | undefined>()
  const [blastFilter, setBlastFilter] = useState<string | undefined>()
  const [statusFilter, setStatusFilter] = useState<string | undefined>()
  const [page, setPage] = useState(0)
  const [selectedMove, setSelectedMove] = useState<RestructureMove | null>(
    null,
  )
  const [showConfig, setShowConfig] = useState(false)
  const [showHelp, setShowHelp] = useState(false)

  const {
    data: summary,
    isLoading: summaryLoading,
    error: summaryError,
  } = useRestructureLatest(orgId)

  const {
    data: movesPage,
    isLoading: movesLoading,
    error: movesError,
  } = useRestructureMoves(orgId, {
    move_type: moveTypeFilter,
    blast_tier: blastFilter,
    status: statusFilter,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  })

  const runMutation = useRunRestructure(orgId)
  const updateMove = useUpdateRestructureMove(orgId)

  const hasData = !!summary?.has_data
  const hasMoves = (movesPage?.moves.length ?? 0) > 0
  const hasFilters = !!(moveTypeFilter || blastFilter || statusFilter)

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Wrench}
        title="Restructure Studio"
        subtitle={
          <>
            Turn GAEA equity insights into a defensible org restructure
            plan. Miner surfaces candidate moves, simulator scores each on
            preservation + equity + blast, consultant accepts/rejects,
            exports a CSV of the accepted sequence.
          </>
        }
        actions={
          <div className="flex items-center gap-2">
            <Button
              onClick={() => runMutation.mutate()}
              disabled={runMutation.isPending}
              className="inline-flex items-center gap-2"
            >
              {runMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {runMutation.isPending ? 'Analysing…' : 'Run new analysis'}
            </Button>
            <Button
              variant="ghost"
              onClick={() => setShowConfig((v) => !v)}
              className="inline-flex items-center gap-2"
            >
              <Filter className="h-4 w-4" />
              Config
            </Button>
            <button
              type="button"
              onClick={() => setShowHelp(true)}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium text-grove-ink/70 dark:text-grove-ink-dk/70 hover:bg-grove-ink/5 dark:hover:bg-grove-ink-dk/10 transition-colors"
              title="How does this work?"
            >
              <HelpCircle className="h-4 w-4" />
              How it works
            </button>
          </div>
        }
      />

      <ExplainerCard />

      {runMutation.isError && (
        <ErrorState message={formatRunError(runMutation.error)} />
      )}

      {summaryError && (
        <ErrorState message="Failed to load restructure summary." />
      )}

      {summaryLoading && !summary ? (
        <Card variant="bordered">
          <CardContent className="py-6">
            <TableSkeleton rows={3} />
          </CardContent>
        </Card>
      ) : hasData ? (
        <>
          <KpiStrip summary={summary!} />

          <FilterRow
            moveTypeFilter={moveTypeFilter}
            blastFilter={blastFilter}
            statusFilter={statusFilter}
            typeCounts={summary?.move_type_counts ?? {}}
            blastCounts={summary?.blast_tier_counts ?? {}}
            onMoveType={(v) => {
              setMoveTypeFilter(v)
              setPage(0)
            }}
            onBlast={(v) => {
              setBlastFilter(v)
              setPage(0)
            }}
            onStatus={(v) => {
              setStatusFilter(v)
              setPage(0)
            }}
            onClear={() => {
              setMoveTypeFilter(undefined)
              setBlastFilter(undefined)
              setStatusFilter(undefined)
              setPage(0)
            }}
          />

          {movesError ? (
            <ErrorState message="Failed to load moves." />
          ) : movesLoading ? (
            <Card variant="bordered">
              <CardContent className="py-4">
                <TableSkeleton rows={6} />
              </CardContent>
            </Card>
          ) : hasMoves ? (
            <div>
              <div className="space-y-3">
                {movesPage!.moves.map((m) => (
                  <MoveCard
                    key={m.id}
                    move={m}
                    onSelect={() => setSelectedMove(m)}
                    onAccept={() =>
                      updateMove.mutate({
                        moveId: m.id,
                        move_status: 'accepted',
                      })
                    }
                    onReject={() =>
                      updateMove.mutate({
                        moveId: m.id,
                        move_status: 'rejected',
                      })
                    }
                  />
                ))}
              </div>
              <PaginationBar
                total={movesPage!.total}
                page={page}
                pageSize={PAGE_SIZE}
                onChange={setPage}
              />
            </div>
          ) : (
            <Card variant="bordered">
              <CardContent className="py-10">
                <EmptyState
                  title={
                    hasFilters
                      ? 'No moves match the current filters'
                      : 'No moves generated'
                  }
                  description={
                    hasFilters
                      ? 'Clear the filters or widen the tier / type selection.'
                      : 'The last run found nothing to propose — either the org is already well-consolidated or the miner thresholds are too strict. Try raising or lowering the config sliders.'
                  }
                  icon="search"
                />
              </CardContent>
            </Card>
          )}

          <ConstraintsPanel
            orgId={orgId}
            runId={summary?.run_id ?? undefined}
          />

          <PlanExportRow
            orgId={orgId}
            runId={summary?.run_id ?? undefined}
            summary={summary!}
          />
        </>
      ) : (
        <Card variant="bordered">
          <CardContent className="py-10">
            <EmptyState
              title="No restructure analysis yet"
              description="Click 'Run new analysis' above to have the miner + simulator generate the first plan."
              icon="search"
            />
          </CardContent>
        </Card>
      )}

      {selectedMove && (
        <MoveDrawer
          orgId={orgId}
          move={selectedMove}
          onClose={() => setSelectedMove(null)}
        />
      )}

      {showConfig && (
        <ConfigDialog
          onClose={() => setShowConfig(false)}
          onApply={(opts) => {
            setShowConfig(false)
            runMutation.mutate(opts)
          }}
          isPending={runMutation.isPending}
        />
      )}

      {showHelp && <HelpDialog onClose={() => setShowHelp(false)} />}
    </div>
  )
}

// ============================================================================
// Explainer
// ============================================================================

function ExplainerCard() {
  return (
    <Card variant="bordered" className="grove-copper-wash">
      <CardContent className="py-5">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-copper-100 dark:bg-copper-900/25 flex-shrink-0">
            <BookOpen className="h-5 w-5 text-copper-600 dark:text-copper-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-grove-ink dark:text-grove-ink-dk">
              What the Restructure Studio proposes
            </p>
            <p className="text-xs text-grove-ink/65 dark:text-grove-ink-dk/65 mt-0.5">
              Seven move types across two axes:{' '}
              <strong>object/field access</strong> (Permission Sets) and{' '}
              <strong>record access</strong> (Role hierarchy). Every move
              carries an auto-generated rationale, preservation
              percentages, equity delta, and blast tier — the consultant
              accepts / rejects each, exports a CSV of the accepted
              sequence.
            </p>
            <p className="text-xs text-grove-ink/55 dark:text-grove-ink-dk/55 mt-2">
              Uses GAEA utility scores as a signal but never modifies the
              equity engine. Fully additive.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ============================================================================
// KPI Strip — current → projected
// ============================================================================

function KpiStrip({
  summary,
}: {
  summary: ReturnType<typeof useRestructureLatest>['data']
}) {
  if (!summary) return null
  const cur = summary.current
  const proj = summary.projected
  return (
    <Card variant="bordered">
      <CardContent className="py-4">
        <div className="flex items-center justify-between gap-4 flex-wrap mb-2">
          <div className="text-[10px] font-mono uppercase tracking-wider text-grove-ink/60 dark:text-grove-ink-dk/60">
            Current → Projected (if every proposed move accepted)
          </div>
          <div className="text-[10px] font-mono text-grove-ink/50 dark:text-grove-ink-dk/50">
            {summary.moves_generated} moves •{' '}
            {summary.duration_ms
              ? `${(summary.duration_ms / 1000).toFixed(1)}s`
              : ''}
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiTile
            label="Equity Index"
            icon={Scale}
            current={cur?.equity_index}
            projected={proj?.equity_index}
            fmt={(v) => v.toFixed(2)}
            higherIsBetter
          />
          <KpiTile
            label="Permission Sets"
            icon={Layers}
            current={cur?.ps_count}
            projected={proj?.ps_count}
            fmt={(v) => v.toLocaleString()}
            higherIsBetter={false}
          />
          <KpiTile
            label="Roles"
            icon={Boxes}
            current={cur?.role_count}
            projected={proj?.role_count}
            fmt={(v) => v.toLocaleString()}
            higherIsBetter={false}
          />
          <KpiTile
            label="Licence Cost / mo"
            icon={ShieldCheck}
            current={cur?.monthly_license_cost}
            projected={proj?.monthly_license_cost}
            fmt={(v) => `$${v.toLocaleString()}`}
            higherIsBetter={false}
            nullText="—"
          />
        </div>
      </CardContent>
    </Card>
  )
}

function KpiTile({
  label,
  icon: Icon,
  current,
  projected,
  fmt,
  higherIsBetter,
  nullText = 'n/a',
}: {
  label: string
  icon: React.ComponentType<{ className?: string }>
  current: number | null | undefined
  projected: number | null | undefined
  fmt: (v: number) => string
  higherIsBetter: boolean
  nullText?: string
}) {
  const both = typeof current === 'number' && typeof projected === 'number'
  const delta = both ? (projected as number) - (current as number) : null
  const isImprovement =
    delta !== null && (higherIsBetter ? delta > 0 : delta < 0)
  const deltaCls = isImprovement
    ? 'text-grove-mint'
    : delta === 0
    ? 'text-grove-ink/50 dark:text-grove-ink-dk/50'
    : 'text-copper-600 dark:text-copper-400'
  return (
    <div className="rounded-md bg-grove-canvas dark:bg-grove-canvas-dk/40 ring-1 ring-grove-ink/10 dark:ring-grove-ink-dk/15 p-3">
      <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-grove-ink/60 dark:text-grove-ink-dk/60">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <div className="flex items-baseline gap-2 mt-1">
        <span className="text-xl font-semibold text-grove-ink dark:text-grove-ink-dk tabular-nums">
          {typeof current === 'number' ? fmt(current) : nullText}
        </span>
        {typeof projected === 'number' &&
          typeof current === 'number' &&
          projected !== current && (
            <>
              <span className="text-grove-ink/40 dark:text-grove-ink-dk/40">
                →
              </span>
              <span
                className={`text-xl font-semibold tabular-nums ${deltaCls}`}
              >
                {fmt(projected)}
              </span>
            </>
          )}
      </div>
      {typeof delta === 'number' && delta !== 0 && (
        <div className={`text-[11px] font-mono mt-0.5 ${deltaCls}`}>
          {delta > 0 ? '+' : ''}
          {fmt(delta)}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Filter row
// ============================================================================

function FilterRow({
  moveTypeFilter,
  blastFilter,
  statusFilter,
  typeCounts,
  blastCounts,
  onMoveType,
  onBlast,
  onStatus,
  onClear,
}: {
  moveTypeFilter?: string
  blastFilter?: string
  statusFilter?: string
  typeCounts: Record<string, number>
  blastCounts: Record<string, number>
  onMoveType: (v: string | undefined) => void
  onBlast: (v: string | undefined) => void
  onStatus: (v: string | undefined) => void
  onClear: () => void
}) {
  const hasAny = !!(moveTypeFilter || blastFilter || statusFilter)
  return (
    <Card variant="bordered">
      <CardContent className="py-3">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-[10px] font-mono uppercase tracking-wider text-grove-ink/55 dark:text-grove-ink-dk/55 flex items-center gap-1">
            <Filter className="h-3 w-3" />
            Type
          </span>
          <FilterChip
            active={!moveTypeFilter}
            label="All"
            onClick={() => onMoveType(undefined)}
          />
          {(Object.keys(MOVE_TYPE_META) as RestructureMoveType[])
            .filter((k) => (typeCounts[k] ?? 0) > 0)
            .map((k) => (
              <FilterChip
                key={k}
                active={moveTypeFilter === k}
                label={MOVE_TYPE_META[k].short}
                count={typeCounts[k]}
                onClick={() => onMoveType(k === moveTypeFilter ? undefined : k)}
              />
            ))}
          <span className="text-grove-ink/25 dark:text-grove-ink-dk/25">
            •
          </span>
          <span className="text-[10px] font-mono uppercase tracking-wider text-grove-ink/55 dark:text-grove-ink-dk/55">
            Blast
          </span>
          {(['low', 'medium', 'high', 'critical'] as const).map((b) => (
            <FilterChip
              key={b}
              active={blastFilter === b}
              label={b}
              count={blastCounts[b]}
              onClick={() => onBlast(b === blastFilter ? undefined : b)}
            />
          ))}
          <span className="text-grove-ink/25 dark:text-grove-ink-dk/25">
            •
          </span>
          <span className="text-[10px] font-mono uppercase tracking-wider text-grove-ink/55 dark:text-grove-ink-dk/55">
            Status
          </span>
          {(['proposed', 'accepted', 'rejected'] as const).map((s) => (
            <FilterChip
              key={s}
              active={statusFilter === s}
              label={s}
              onClick={() => onStatus(s === statusFilter ? undefined : s)}
            />
          ))}
          {hasAny && (
            <button
              type="button"
              onClick={onClear}
              className="ml-auto text-[11px] text-grove-ink/55 dark:text-grove-ink-dk/55 hover:text-grove-mint"
            >
              Clear all
            </button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function FilterChip({
  active,
  label,
  count,
  onClick,
}: {
  active: boolean
  label: string
  count?: number
  onClick: () => void
}) {
  const cls = active
    ? 'bg-grove-ink text-grove-canvas dark:bg-grove-ink-dk dark:text-grove-canvas-dk'
    : 'text-grove-ink/70 dark:text-grove-ink-dk/70 hover:bg-primary-50/40 dark:hover:bg-primary-900/15'
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2.5 py-1 rounded-full text-xs font-medium uppercase tracking-wider transition-colors ${cls}`}
    >
      {label}
      {typeof count === 'number' && (
        <span className="ml-1 tabular-nums opacity-70">{count}</span>
      )}
    </button>
  )
}

// ============================================================================
// Move card
// ============================================================================

function MoveCard({
  move,
  onSelect,
  onAccept,
  onReject,
}: {
  move: RestructureMove
  onSelect: () => void
  onAccept: () => void
  onReject: () => void
}) {
  const meta = MOVE_TYPE_META[move.move_type]
  const blast = BLAST_META[move.impact.blast_tier]
  const Icon = meta.icon
  const isAccepted = move.move_status === 'accepted'
  const isRejected = move.move_status === 'rejected'

  return (
    <Card
      variant="bordered"
      className={
        isAccepted
          ? 'ring-1 ring-grove-mint/40'
          : isRejected
          ? 'opacity-60'
          : ''
      }
    >
      <CardContent className="py-4">
        <div className="flex items-start gap-3">
          {/* Left: type badge (split-pill mimics the package sprawl style) */}
          <span
            className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[9px] font-mono uppercase tracking-wider ${meta.color} flex-shrink-0 mt-0.5`}
          >
            <Icon className="h-3 w-3" />
            {meta.short}
          </span>

          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-semibold text-grove-ink dark:text-grove-ink-dk truncate">
                {move.primary_component_name ?? '(unnamed)'}
              </h3>
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${blast.classes}`}
                title={`Blast score ${Math.round(move.impact.blast_score)}/100`}
              >
                {blast.label}
              </span>
              {move.constraint_violations.length > 0 && (
                <span
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider bg-red-100 text-red-700 dark:bg-red-900/25 dark:text-red-300"
                  title="This move would violate a preservation constraint. Consultant must waive to Accept."
                >
                  <AlertTriangle className="h-3 w-3" />
                  {move.constraint_violations.length} violation
                  {move.constraint_violations.length > 1 ? 's' : ''}
                </span>
              )}
              {isAccepted && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider bg-grove-mint/20 text-grove-mint">
                  <Check className="h-3 w-3" />
                  Accepted
                </span>
              )}
              {isRejected && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider bg-grove-ink/10 text-grove-ink/60 dark:bg-grove-ink-dk/15 dark:text-grove-ink-dk/60">
                  <XIcon className="h-3 w-3" />
                  Rejected
                </span>
              )}
            </div>

            {move.rationale && (
              <p className="text-xs text-grove-ink/75 dark:text-grove-ink-dk/75 leading-relaxed">
                {move.rationale}
              </p>
            )}

            {/* Impact chips */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs pt-1">
              <ImpactChip
                icon={Users}
                label="users"
                value={move.affected_user_ids.length}
              />
              {typeof move.impact.object_access_preserved_pct === 'number' && (
                <ImpactChip
                  icon={ShieldCheck}
                  label="object access preserved"
                  value={`${move.impact.object_access_preserved_pct.toFixed(0)}%`}
                />
              )}
              {typeof move.impact.equity_delta === 'number' &&
                move.impact.equity_delta !== 0 && (
                  <ImpactChip
                    icon={Scale}
                    label="equity"
                    value={
                      (move.impact.equity_delta > 0 ? '+' : '') +
                      move.impact.equity_delta.toFixed(3)
                    }
                    tone={
                      move.impact.equity_delta > 0 ? 'positive' : 'negative'
                    }
                  />
                )}
              {typeof move.impact.complexity_delta === 'number' &&
                move.impact.complexity_delta !== 0 && (
                  <ImpactChip
                    icon={Layers}
                    label="complexity"
                    value={
                      (move.impact.complexity_delta > 0 ? '+' : '') +
                      move.impact.complexity_delta
                    }
                    tone={
                      move.impact.complexity_delta < 0 ? 'positive' : 'negative'
                    }
                  />
                )}
              {typeof move.impact.sharing_rules_simplified === 'number' &&
                move.impact.sharing_rules_simplified > 0 && (
                  <ImpactChip
                    icon={Layers}
                    label="sharing rules simplified"
                    value={String(move.impact.sharing_rules_simplified)}
                    tone="positive"
                  />
                )}
              {move.impact.records_gained_by_object && (
                <ImpactChip
                  icon={Info}
                  label="records gained"
                  value={sumObjectCounts(
                    move.impact.records_gained_by_object,
                  ).toLocaleString()}
                  tone="positive"
                />
              )}
              {move.impact.records_lost_by_object &&
                sumObjectCounts(move.impact.records_lost_by_object) > 0 && (
                  <ImpactChip
                    icon={Info}
                    label="records lost"
                    value={sumObjectCounts(
                      move.impact.records_lost_by_object,
                    ).toLocaleString()}
                    tone="negative"
                  />
                )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={onSelect}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium text-grove-ink/85 dark:text-grove-ink-dk/85 hover:bg-primary-50/40 dark:hover:bg-primary-900/20 transition-colors"
              >
                <Search className="h-3 w-3" />
                Details
              </button>
              {!isAccepted && (
                <button
                  type="button"
                  onClick={onAccept}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium bg-grove-mint/15 text-grove-mint hover:bg-grove-mint/25 transition-colors"
                  disabled={move.constraint_violations.length > 0}
                  title={
                    move.constraint_violations.length > 0
                      ? 'Waive the constraint(s) before accepting'
                      : ''
                  }
                >
                  <Check className="h-3 w-3" />
                  Accept
                </button>
              )}
              {!isRejected && (
                <button
                  type="button"
                  onClick={onReject}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium text-grove-ink/60 dark:text-grove-ink-dk/60 hover:bg-grove-ink/5 dark:hover:bg-grove-ink-dk/10 transition-colors"
                >
                  <XIcon className="h-3 w-3" />
                  Reject
                </button>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function ImpactChip({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string | number
  tone?: 'positive' | 'negative'
}) {
  const cls =
    tone === 'positive'
      ? 'text-grove-mint'
      : tone === 'negative'
      ? 'text-copper-600 dark:text-copper-400'
      : 'text-grove-ink/70 dark:text-grove-ink-dk/70'
  return (
    <span className={`inline-flex items-center gap-1 ${cls}`}>
      <Icon className="h-3 w-3" />
      <span className="font-semibold tabular-nums">{value}</span>
      <span className="opacity-70">{label}</span>
    </span>
  )
}

function sumObjectCounts(o: Record<string, number>): number {
  return Object.values(o).reduce((sum, n) => sum + (n || 0), 0)
}

// ============================================================================
// Move detail drawer
// ============================================================================

function MoveDrawer({
  orgId,
  move: initialMove,
  onClose,
}: {
  orgId: string
  move: RestructureMove
  onClose: () => void
}) {
  // Local copy of the move so mutation results (deep-analyse, notes,
  // status changes) refresh the drawer without needing the parent to
  // re-emit. Seeded from the prop, updated by mutation onSuccess.
  const [move, setMove] = useState<RestructureMove>(initialMove)
  const deepAnalyze = useDeepAnalyzeMove(orgId)
  const updateMove = useUpdateRestructureMove(orgId)
  const [notes, setNotes] = useState(move.consultant_notes ?? '')
  const meta = MOVE_TYPE_META[move.move_type]
  const deepRan = !!move.impact.deep_analysis_at

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-end bg-black/40"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-grove-canvas dark:bg-grove-canvas-dk overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 bg-grove-canvas/95 dark:bg-grove-canvas-dk/95 backdrop-blur border-b border-grove-ink/10 dark:border-grove-ink-dk/15 px-6 py-4 flex items-center gap-3">
          <span
            className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[9px] font-mono uppercase tracking-wider ${meta.color}`}
          >
            {meta.short}
          </span>
          <h2 className="text-base font-semibold text-grove-ink dark:text-grove-ink-dk flex-1 truncate">
            {move.primary_component_name}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded hover:bg-grove-ink/10 dark:hover:bg-grove-ink-dk/10"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Rationale */}
          <section>
            <h3 className="text-[10px] font-mono uppercase tracking-wider text-grove-ink/60 dark:text-grove-ink-dk/60 mb-2">
              Rationale
            </h3>
            <p className="text-sm text-grove-ink/85 dark:text-grove-ink-dk/85 leading-relaxed">
              {move.rationale ?? '(none)'}
            </p>
          </section>

          {/* Impact detail */}
          <section>
            <h3 className="text-[10px] font-mono uppercase tracking-wider text-grove-ink/60 dark:text-grove-ink-dk/60 mb-2">
              Impact
            </h3>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <ImpactRow
                label="Users affected"
                value={move.affected_user_ids.length.toLocaleString()}
              />
              <ImpactRow
                label="Blast tier"
                value={`${move.impact.blast_tier} (${Math.round(move.impact.blast_score)}/100)`}
              />
              <ImpactRow
                label="Object access preserved"
                value={
                  move.impact.object_access_preserved_pct !== null
                    ? `${move.impact.object_access_preserved_pct.toFixed(1)}%`
                    : '—'
                }
              />
              <ImpactRow
                label="Field access preserved"
                value={
                  move.impact.field_access_preserved_pct !== null
                    ? `${move.impact.field_access_preserved_pct.toFixed(1)}%`
                    : '—'
                }
              />
              <ImpactRow
                label="Equity delta"
                value={
                  move.impact.equity_delta !== null
                    ? (move.impact.equity_delta > 0 ? '+' : '') +
                      move.impact.equity_delta.toFixed(3)
                    : '—'
                }
              />
              <ImpactRow
                label="Complexity delta"
                value={
                  move.impact.complexity_delta !== null
                    ? (move.impact.complexity_delta > 0 ? '+' : '') +
                      move.impact.complexity_delta
                    : '—'
                }
              />
              <ImpactRow
                label="Sharing rules simplified"
                value={
                  move.impact.sharing_rules_simplified !== null
                    ? String(move.impact.sharing_rules_simplified)
                    : '—'
                }
              />
              <ImpactRow
                label="Cost delta / mo"
                value={
                  move.impact.cost_delta_monthly !== null
                    ? `$${move.impact.cost_delta_monthly.toLocaleString()}`
                    : 'v2'
                }
              />
            </div>
          </section>

          {/* Deep analysis */}
          <section>
            <div className="flex items-center gap-2 mb-2">
              <h3 className="text-[10px] font-mono uppercase tracking-wider text-grove-ink/60 dark:text-grove-ink-dk/60">
                Deep Analysis (Option B — bounded probing)
              </h3>
              {deepRan && (
                <span className="text-[10px] font-mono text-grove-mint">
                  ran {formatTime(move.impact.deep_analysis_at)}
                </span>
              )}
            </div>
            {deepRan ? (
              <div className="grid grid-cols-2 gap-2 text-xs">
                <RecordDeltaTable
                  label="Records gained"
                  data={move.impact.records_gained_by_object}
                  tone="positive"
                />
                <RecordDeltaTable
                  label="Records lost"
                  data={move.impact.records_lost_by_object}
                  tone="negative"
                />
              </div>
            ) : (
              <div className="rounded-md border border-dashed border-grove-ink/15 dark:border-grove-ink-dk/20 p-4 flex items-center justify-between gap-3">
                <p className="text-xs text-grove-ink/60 dark:text-grove-ink-dk/60">
                  Option A symbolic scoring is shown by default. Run
                  Option B to get concrete record-count deltas against the
                  snapshot share tables (~5s, samples 1000 records per
                  key object).
                </p>
                <Button
                  onClick={() =>
                    deepAnalyze.mutate(
                      { moveId: move.id, sampleSize: 1000 },
                      {
                        onSuccess: (updated) => setMove(updated),
                      },
                    )
                  }
                  disabled={deepAnalyze.isPending}
                >
                  {deepAnalyze.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="h-4 w-4" />
                  )}
                  Deep analyse
                </Button>
              </div>
            )}
          </section>

          {/* Notes */}
          <section>
            <h3 className="text-[10px] font-mono uppercase tracking-wider text-grove-ink/60 dark:text-grove-ink-dk/60 mb-2 flex items-center gap-1">
              <MessageSquare className="h-3 w-3" />
              Consultant notes
            </h3>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={() =>
                notes !== (move.consultant_notes ?? '') &&
                updateMove.mutate({
                  moveId: move.id,
                  consultant_notes: notes.trim() || null,
                })
              }
              rows={3}
              placeholder="e.g. Aligned with the Q3 access review scope. Signed off by Sarah on 2026-07-15."
              className="w-full px-2 py-1.5 text-xs rounded bg-white dark:bg-grove-canvas-dk/50 text-grove-ink dark:text-grove-ink-dk ring-1 ring-grove-ink/15 dark:ring-grove-ink-dk/20 focus:ring-grove-mint/60 focus:outline-none resize-y"
            />
          </section>
        </div>
      </div>
    </div>
  )
}

function ImpactRow({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div className="flex justify-between gap-3 px-2 py-1 rounded bg-grove-canvas/50 dark:bg-grove-canvas-dk/30">
      <span className="text-grove-ink/60 dark:text-grove-ink-dk/60">
        {label}
      </span>
      <span className="text-grove-ink dark:text-grove-ink-dk font-semibold tabular-nums">
        {value}
      </span>
    </div>
  )
}

function RecordDeltaTable({
  label,
  data,
  tone,
}: {
  label: string
  data: Record<string, number> | null
  tone: 'positive' | 'negative'
}) {
  const total = data ? sumObjectCounts(data) : 0
  const cls =
    tone === 'positive'
      ? 'text-grove-mint'
      : 'text-copper-600 dark:text-copper-400'
  return (
    <div className="rounded-md bg-grove-canvas/50 dark:bg-grove-canvas-dk/30 p-3">
      <div className="text-[10px] font-mono uppercase tracking-wider text-grove-ink/60 dark:text-grove-ink-dk/60">
        {label}
      </div>
      <div className={`text-lg font-semibold tabular-nums mt-1 ${cls}`}>
        {total.toLocaleString()}
      </div>
      {data && Object.entries(data).map(([obj, n]) => (
        <div key={obj} className="text-[11px] flex justify-between mt-1">
          <span className="text-grove-ink/60 dark:text-grove-ink-dk/60 font-mono">
            {obj}
          </span>
          <span className="tabular-nums">{(n || 0).toLocaleString()}</span>
        </div>
      ))}
    </div>
  )
}

function formatTime(iso: string | null): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

// ============================================================================
// Constraints panel
// ============================================================================

function ConstraintsPanel({
  orgId,
  runId,
}: {
  orgId: string
  runId?: string
}) {
  const { data: constraints, isLoading } = useRestructureConstraints(
    orgId,
    runId,
  )
  const create = useCreateConstraint(orgId)
  const remove = useDeleteConstraint(orgId)
  const [userSfId, setUserSfId] = useState('')
  const [objectType, setObjectType] = useState('Account')
  const [reason, setReason] = useState('')

  return (
    <Card variant="bordered">
      <CardContent className="py-4">
        <div className="flex items-center gap-2 mb-3">
          <Pin className="h-4 w-4 text-grove-mint" />
          <h3 className="text-xs font-semibold uppercase tracking-wider text-grove-ink dark:text-grove-ink-dk">
            Preservation constraints
          </h3>
          <span className="text-xs text-grove-ink/55 dark:text-grove-ink-dk/55">
            {constraints?.length ?? 0} pinned
          </span>
        </div>
        <p className="text-xs text-grove-ink/60 dark:text-grove-ink-dk/60 mb-3">
          Pin a (user, object) pair to guarantee it's preserved. Moves
          that would violate a pin are blocked from Accept until the
          consultant waives.
        </p>

        {isLoading ? (
          <TableSkeleton rows={2} />
        ) : (
          <div className="space-y-1 mb-3">
            {(constraints ?? []).map((c) => (
              <div
                key={c.id}
                className="flex items-center gap-2 text-xs rounded px-2 py-1.5 bg-grove-canvas/50 dark:bg-grove-canvas-dk/30"
              >
                <Pin className="h-3 w-3 text-grove-mint" />
                <code className="font-mono">{c.user_sf_id}</code>
                <span className="text-grove-ink/50 dark:text-grove-ink-dk/50">
                  @
                </span>
                <span className="font-medium">{c.object_type}</span>
                {c.reason && (
                  <span className="text-grove-ink/55 dark:text-grove-ink-dk/55 italic ml-1">
                    — {c.reason}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() =>
                    remove.mutate({ constraintId: c.id })
                  }
                  className="ml-auto p-1 rounded hover:bg-grove-ink/10 dark:hover:bg-grove-ink-dk/10"
                  title="Remove"
                >
                  <XIcon className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="text"
            value={userSfId}
            onChange={(e) => setUserSfId(e.target.value)}
            placeholder="User SF ID (18-char)"
            className="flex-1 min-w-40 px-2 py-1.5 text-xs rounded bg-white dark:bg-grove-canvas-dk/50 ring-1 ring-grove-ink/15 dark:ring-grove-ink-dk/20 focus:ring-grove-mint/60 focus:outline-none"
          />
          <input
            type="text"
            value={objectType}
            onChange={(e) => setObjectType(e.target.value)}
            placeholder="Object type"
            className="w-32 px-2 py-1.5 text-xs rounded bg-white dark:bg-grove-canvas-dk/50 ring-1 ring-grove-ink/15 dark:ring-grove-ink-dk/20 focus:ring-grove-mint/60 focus:outline-none"
          />
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason (optional)"
            className="flex-1 min-w-40 px-2 py-1.5 text-xs rounded bg-white dark:bg-grove-canvas-dk/50 ring-1 ring-grove-ink/15 dark:ring-grove-ink-dk/20 focus:ring-grove-mint/60 focus:outline-none"
          />
          <Button
            variant="ghost"
            disabled={
              !userSfId.trim() || !objectType.trim() || create.isPending || !runId
            }
            onClick={() => {
              if (!runId) return
              create.mutate(
                {
                  run_id: runId,
                  user_sf_id: userSfId.trim(),
                  object_type: objectType.trim(),
                  reason: reason.trim() || null,
                },
                {
                  onSuccess: () => {
                    setUserSfId('')
                    setReason('')
                  },
                },
              )
            }}
          >
            {create.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Pin className="h-4 w-4" />
            )}
            Pin
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

// ============================================================================
// Plan export row
// ============================================================================

function PlanExportRow({
  orgId,
  runId,
  summary,
}: {
  orgId: string
  runId?: string
  summary: NonNullable<ReturnType<typeof useRestructureLatest>['data']>
}) {
  // For v1 we auto-collect accepted moves and generate CSV directly
  // from the moves list, without maintaining a formal Plan row. Formal
  // plans are still supported by the API + hooks but we skip the extra
  // click in the studio for now.
  const acceptedMoves = useRestructureMoves(orgId, {
    status: 'accepted',
  })
  const count = acceptedMoves.data?.moves.length ?? 0

  const downloadCsv = () => {
    if (!acceptedMoves.data?.moves) return
    const header =
      'move_id,move_type,primary_component,blast_tier,object_access_pct,equity_delta,complexity_delta,rationale\n'
    const rows = acceptedMoves.data.moves.map((m) => {
      const cells = [
        m.id,
        m.move_type,
        m.primary_component_name ?? '',
        m.impact.blast_tier,
        m.impact.object_access_preserved_pct?.toFixed(1) ?? '',
        m.impact.equity_delta?.toFixed(3) ?? '',
        String(m.impact.complexity_delta ?? ''),
        m.rationale ?? '',
      ]
      return cells
        .map((c) => {
          const s = String(c ?? '')
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
        })
        .join(',')
    })
    const csv = header + rows.join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `restructure-plan-${runId ?? 'latest'}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <Card variant="bordered">
      <CardContent className="py-3">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs text-grove-ink/60 dark:text-grove-ink-dk/60">
            Current Plan:
          </span>
          <span className="text-sm font-semibold text-grove-ink dark:text-grove-ink-dk">
            {count} accepted move{count === 1 ? '' : 's'}
          </span>
          <span className="text-xs text-grove-ink/40 dark:text-grove-ink-dk/40">
            of {summary.moves_generated} proposed
          </span>
          <Button
            variant="ghost"
            className="ml-auto inline-flex items-center gap-2"
            disabled={count === 0}
            onClick={downloadCsv}
          >
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

// ============================================================================
// Config dialog
// ============================================================================

function ConfigDialog({
  onClose,
  onApply,
  isPending,
}: {
  onClose: () => void
  onApply: (opts: {
    maxMoves: number
    psOverlapThreshold: number
    roleMemberOverlapThreshold: number
  }) => void
  isPending: boolean
}) {
  const [maxMoves, setMaxMoves] = useState(50)
  const [psOverlap, setPsOverlap] = useState(0.9)
  const [roleOverlap, setRoleOverlap] = useState(0.85)
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 overflow-y-auto pt-20 pb-10 px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-grove-canvas dark:bg-grove-canvas-dk rounded-lg shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 border-b border-grove-ink/10 dark:border-grove-ink-dk/15">
          <h2 className="text-base font-semibold text-grove-ink dark:text-grove-ink-dk">
            Analysis config
          </h2>
        </div>
        <div className="p-5 space-y-4">
          <ConfigSlider
            label="Max moves"
            value={maxMoves}
            min={5}
            max={200}
            step={5}
            onChange={setMaxMoves}
          />
          <ConfigSlider
            label="PS overlap threshold"
            value={psOverlap}
            min={0.5}
            max={1}
            step={0.05}
            onChange={setPsOverlap}
          />
          <ConfigSlider
            label="Role member overlap threshold"
            value={roleOverlap}
            min={0.5}
            max={1}
            step={0.05}
            onChange={setRoleOverlap}
          />
        </div>
        <div className="p-5 flex items-center justify-end gap-2 border-t border-grove-ink/10 dark:border-grove-ink-dk/15">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() =>
              onApply({
                maxMoves,
                psOverlapThreshold: psOverlap,
                roleMemberOverlapThreshold: roleOverlap,
              })
            }
            disabled={isPending}
          >
            {isPending && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
            Run analysis
          </Button>
        </div>
      </div>
    </div>
  )
}

function ConfigSlider({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
}) {
  return (
    <div>
      <div className="flex justify-between text-xs">
        <span className="text-grove-ink/70 dark:text-grove-ink-dk/70">
          {label}
        </span>
        <span className="tabular-nums font-semibold">{value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full mt-1 accent-grove-mint"
      />
    </div>
  )
}

// ============================================================================
// Help dialog — documentation the user can pull up any time
// ============================================================================

function HelpDialog({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 overflow-y-auto pt-16 pb-10 px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl bg-grove-canvas dark:bg-grove-canvas-dk rounded-lg shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 border-b border-grove-ink/10 dark:border-grove-ink-dk/15 flex items-center gap-3 sticky top-0 bg-grove-canvas/95 dark:bg-grove-canvas-dk/95 backdrop-blur">
          <BookOpen className="h-5 w-5 text-grove-mint flex-shrink-0" />
          <h2 className="text-base font-semibold text-grove-ink dark:text-grove-ink-dk flex-1">
            Restructure Studio — how it works
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded hover:bg-grove-ink/10 dark:hover:bg-grove-ink-dk/10"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>

        <div className="p-6 space-y-5 text-sm text-grove-ink/85 dark:text-grove-ink-dk/85 leading-relaxed">
          <HelpSection title="What this is">
            <p>
              An interactive canvas for consultants to review, accept,
              and export <strong>structural changes</strong> to a
              Salesforce org's access model. It surfaces candidate moves
              across two axes — <strong>object/field access</strong>{' '}
              (Permission Sets) and <strong>record access</strong>{' '}
              (Role hierarchy) — and scores each on multiple objectives
              so you can pick what matters for this engagement.
            </p>
          </HelpSection>

          <HelpSection title="How the analysis runs">
            <ol className="list-decimal ml-5 space-y-1.5">
              <li>
                Click <strong>Run new analysis</strong>. The backend
                loads every snapshot for the org (users, roles, PSets,
                assignments, permissions, sharing model) plus the
                latest GAEA equity output if one exists.
              </li>
              <li>
                Pattern miners scan for 7 candidate move types (see
                below). Each candidate carries a rationale citing the
                specific metric that triggered detection.
              </li>
              <li>
                The impact simulator scores every move on 5 axes:
                object/field access preservation, equity delta, cost
                delta, complexity delta, and blast radius.
              </li>
              <li>
                Results persist as a <strong>run</strong> with a list
                of proposed <strong>moves</strong>. The KPI strip shows
                current org state and projected state if every move is
                accepted.
              </li>
            </ol>
          </HelpSection>

          <HelpSection title="The 7 move types">
            <div className="space-y-2">
              <HelpMove
                title="Merge Permission Sets"
                desc="Combine two Permission Sets whose object + field permissions overlap heavily (Jaccard ≥ threshold, default 90%). Merger is a strict superset — no user loses access. Reduces admin surface area."
              />
              <HelpMove
                title="Retire Unused Permission Set"
                desc="A Permission Set with zero direct assignments. Safe to drop — nobody has it, so nobody's access changes."
              />
              <HelpMove
                title="Merge Roles"
                desc="Two roles whose members share ≥85% of their (Profile, PSet) signatures. Widens record visibility uniformly for both sets of members — never narrows."
              />
              <HelpMove
                title="Flatten Role Level"
                desc="A role with exactly one child role adds no differentiation. Removing it shortens record rollup for descendants."
              />
              <HelpMove
                title="Reparent Role"
                desc="A bottom-quartile role (by member utility) gets reparented under a top-utility role to improve rollup access."
              />
              <HelpMove
                title="Reassign to Role"
                desc="A user whose GAEA utility is below their role's average moves to a role whose members have better graph position. ≥5% projected equity lift."
              />
              <HelpMove
                title="Reassign Manager"
                desc="Approval-chain change (User.ManagerId, not User.UserRoleId). Suggests a higher-utility supervisor when the current manager is under-served."
              />
            </div>
          </HelpSection>

          <HelpSection title="Reading a move card">
            <p>Every card carries:</p>
            <ul className="list-disc ml-5 space-y-1">
              <li>
                <strong>Type badge</strong> (top-left) — one of the 7
                above.
              </li>
              <li>
                <strong>Primary component name</strong> — the main
                thing being changed, always shown with its Salesforce
                ID in parens for traceability.
              </li>
              <li>
                <strong>Blast tier</strong> — LOW / MEDIUM / HIGH /
                CRITICAL. Reflects both affected-user count and whether
                the move changes record-level visibility.
              </li>
              <li>
                <strong>Rationale</strong> — auto-generated. Cites the
                specific metric (Jaccard %, utility number, member
                count) that triggered detection.
              </li>
              <li>
                <strong>Impact chips</strong> — users affected, object
                access preserved, equity delta, complexity delta, and
                more. See the drawer for the full breakdown.
              </li>
              <li>
                <strong>Actions</strong> — Details (drawer),
                Accept, Reject.
              </li>
            </ul>
          </HelpSection>

          <HelpSection title="Deep Analysis (Option B)">
            <p>
              The default scoring is symbolic — fast, category-level.
              For any move you want a concrete record-count answer to,
              click <strong>Details</strong> then <strong>Deep analyse</strong>{' '}
              in the drawer. That runs a bounded probe (samples 1,000
              records per key object) against the org's snapshot share
              tables and returns actual before/after visibility counts
              per object.
            </p>
            <p className="text-xs text-grove-ink/60 dark:text-grove-ink-dk/60 italic">
              For PSet-only moves (merges + retires), record-level
              access doesn't change so the deep analysis returns zero
              gained / zero lost — that's the correct answer.
            </p>
          </HelpSection>

          <HelpSection title="Preservation constraints">
            <p>
              Sometimes a specific user MUST retain access to a specific
              object regardless of restructure gains — audit rules,
              regulatory constraints, a whale account owner. Pin them
              in the <strong>Preservation constraints</strong> panel.
              Any proposed move that would violate a pin gets a red
              warning badge and the Accept button is disabled until the
              consultant explicitly waives.
            </p>
          </HelpSection>

          <HelpSection title="Exporting the plan">
            <p>
              Once you've accepted the moves you want to execute, click{' '}
              <strong>Export CSV</strong> in the plan row. That gives
              you a CSV of the accepted sequence with every move's
              type, primary component, blast tier, and rationale — the
              handoff artifact for the client's admin team or your own
              deployment engineer.
            </p>
          </HelpSection>

          <HelpSection title="Config">
            <p>
              The <strong>Config</strong> button lets you tune the
              pattern miner:{' '}
              <strong>max moves</strong> (default 50),{' '}
              <strong>PS overlap threshold</strong> (default 90% —
              lower means more merge candidates, higher means stricter),
              and <strong>role member overlap threshold</strong>{' '}
              (default 85%). Save and re-run to regenerate the plan.
            </p>
          </HelpSection>

          <HelpSection title="Relationship to GAEA">
            <p>
              The Restructure Studio is <strong>fully additive</strong>{' '}
              to the GAEA equity engine. It reads GAEA's per-user
              utility scores as a scoring signal for the role and
              manager reassign moves, but does not modify the equity
              recommendations service, the R-GCN policy, or the
              Recommendation table in any way. Run GAEA + Restructure
              independently.
            </p>
          </HelpSection>
        </div>
      </div>
    </div>
  )
}

function HelpSection({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section>
      <h3 className="text-[10px] font-mono uppercase tracking-wider text-grove-mint mb-2">
        {title}
      </h3>
      <div className="space-y-2">{children}</div>
    </section>
  )
}

function HelpMove({
  title,
  desc,
}: {
  title: string
  desc: string
}) {
  return (
    <div className="rounded-md bg-grove-canvas/50 dark:bg-grove-canvas-dk/30 p-3">
      <div className="text-xs font-semibold text-grove-ink dark:text-grove-ink-dk">
        {title}
      </div>
      <div className="text-xs text-grove-ink/70 dark:text-grove-ink-dk/70 mt-1">
        {desc}
      </div>
    </div>
  )
}

// ============================================================================
// Pagination
// ============================================================================

function PaginationBar({
  total,
  page,
  pageSize,
  onChange,
}: {
  total: number
  page: number
  pageSize: number
  onChange: (next: number) => void
}) {
  if (total <= pageSize) {
    return (
      <p className="text-xs text-grove-ink/55 dark:text-grove-ink-dk/55 text-center py-3">
        {total.toLocaleString()} matching move{total === 1 ? '' : 's'}
      </p>
    )
  }
  const totalPages = Math.ceil(total / pageSize)
  const currentPage = page + 1
  const firstOnPage = page * pageSize + 1
  const lastOnPage = Math.min(total, (page + 1) * pageSize)
  return (
    <div className="flex items-center justify-between gap-3 py-3 mt-2 border-t border-grove-ink/10 dark:border-grove-ink-dk/15">
      <p className="text-xs text-grove-ink/65 dark:text-grove-ink-dk/65">
        Showing{' '}
        <span className="tabular-nums text-grove-ink dark:text-grove-ink-dk">
          {firstOnPage.toLocaleString()}–{lastOnPage.toLocaleString()}
        </span>{' '}
        of {total.toLocaleString()}
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onChange(Math.max(0, page - 1))}
          disabled={page === 0}
          className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs text-grove-ink/70 dark:text-grove-ink-dk/70 hover:text-grove-ink dark:hover:text-grove-ink-dk disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Prev
        </button>
        <span className="text-xs tabular-nums text-grove-ink/60 dark:text-grove-ink-dk/60">
          Page {currentPage} / {totalPages}
        </span>
        <button
          type="button"
          onClick={() => onChange(Math.min(totalPages - 1, page + 1))}
          disabled={currentPage >= totalPages}
          className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs text-grove-ink/70 dark:text-grove-ink-dk/70 hover:text-grove-ink dark:hover:text-grove-ink-dk disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Next
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}

// ============================================================================
// Helpers
// ============================================================================

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
