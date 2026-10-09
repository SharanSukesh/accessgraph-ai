'use client'

/**
 * "Privacy level" card on the Privacy & Data page: shows the client
 * org's current level and lets org admins change it, with an inline
 * confirmation that spells out what happens to data already stored.
 */

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle, Info, RefreshCw } from 'lucide-react'
import { apiClient, ApiError } from '@/lib/api/client'
import { orgKeys, useSyncOrg } from '@/lib/api/hooks/useOrgs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/shared/Card'
import { Badge } from '@/components/shared/Badge'
import { Button } from '@/components/shared/Button'
import { PrivacyLevelPicker } from '@/components/shared/PrivacyLevelPicker'
import {
  AGGREGATES_REMOVAL_EFFECT,
  PRIVACY_LEVELS,
  PRIVACY_STRICTNESS,
  TIGHTENING_EFFECTS,
  type PrivacyMode,
} from '@/lib/privacy'

interface PrivacyModeState {
  mode: PrivacyMode
  allow_record_aggregates: boolean
  changed_by?: string
  changed_at?: string
  label: string
}

interface PrivacyModeUpdate extends PrivacyModeState {
  purged: Record<string, number>
}

type Draft = { mode: PrivacyMode; aggregates: boolean }

export const privacyModeKey = (orgId: string) => ['privacy-mode', orgId] as const

/** Compares two settings: what gets removed now, and whether a re-sync is needed. */
function describeChange(from: Draft, to: Draft) {
  const removals: string[] = []
  const fromRank = PRIVACY_STRICTNESS[from.mode]
  const toRank = PRIVACY_STRICTNESS[to.mode]
  // Outside metadata_only, record aggregates are always allowed.
  const fromAgg = from.mode !== 'metadata_only' || from.aggregates
  const toAgg = to.mode !== 'metadata_only' || to.aggregates

  if (toRank > fromRank && to.mode !== 'full') removals.push(...TIGHTENING_EFFECTS[to.mode])
  if (fromAgg && !toAgg) removals.push(AGGREGATES_REMOVAL_EFFECT)
  const needsResync = toRank < fromRank || (!fromAgg && toAgg)
  return { removals, needsResync }
}

function purgedSummary(purged: Record<string, number>): string[] {
  return Object.entries(purged)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([table, n]) => `${n.toLocaleString()} ${table.replace(/_/g, ' ')}`)
}

export function PrivacyLevelCard({ orgId, isAdmin }: { orgId: string; isAdmin: boolean }) {
  const queryClient = useQueryClient()
  const sync = useSyncOrg(orgId)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [result, setResult] = useState<{ update: PrivacyModeUpdate; needsResync: boolean } | null>(
    null,
  )

  const { data: current, isLoading, isError } = useQuery({
    queryKey: privacyModeKey(orgId),
    queryFn: () => apiClient.get<PrivacyModeState>(`/orgs/${orgId}/privacy/mode`),
  })

  const save = useMutation({
    mutationFn: (next: Draft) =>
      apiClient.put<PrivacyModeUpdate>(`/orgs/${orgId}/privacy/mode`, {
        mode: next.mode,
        allow_record_aggregates: next.mode === 'metadata_only' ? next.aggregates : true,
      }),
    onSuccess: (update, next) => {
      const prev = current
        ? { mode: current.mode, aggregates: current.allow_record_aggregates }
        : next
      setResult({ update, needsResync: describeChange(prev, next).needsResync })
      setDraft(null)
      setConfirming(false)
      queryClient.setQueryData(privacyModeKey(orgId), update)
      queryClient.invalidateQueries({ queryKey: privacyModeKey(orgId) })
      queryClient.invalidateQueries({ queryKey: ['privacy-inventory', orgId] })
      queryClient.invalidateQueries({ queryKey: orgKeys.all })
    },
  })

  const mode = current?.mode ?? 'full'
  const saved: Draft = { mode, aggregates: !!current?.allow_record_aggregates }
  const changed =
    !!draft &&
    (draft.mode !== saved.mode ||
      (draft.mode === 'metadata_only' && draft.aggregates !== saved.aggregates))
  const change = draft ? describeChange(saved, draft) : null

  const startEditing = () => {
    setResult(null)
    save.reset()
    setDraft(saved)
  }
  const cancel = () => {
    setDraft(null)
    setConfirming(false)
    save.reset()
  }

  return (
    <Card variant="bordered">
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle>Privacy level</CardTitle>
          {current && (
            <Badge variant={mode === 'full' ? 'default' : 'info'}>{PRIVACY_LEVELS[mode].label}</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="h-16 animate-pulse rounded-lg bg-primary-50/50 dark:bg-primary-900/10" />
        ) : isError || !current ? (
          <p className="text-sm text-red-600 dark:text-red-400">Could not load the privacy level.</p>
        ) : (
          <>
            <div>
              <p className="text-sm leading-relaxed text-grove-ink/75 dark:text-grove-ink-dk/75">
                {PRIVACY_LEVELS[mode].detail}
              </p>
              {mode === 'metadata_only' && (
                <p className="mt-1.5 text-sm text-grove-ink/75 dark:text-grove-ink-dk/75">
                  Aggregate record statistics:{' '}
                  <span className="font-medium text-grove-ink dark:text-grove-ink-dk">
                    {current.allow_record_aggregates ? 'allowed (counts only)' : 'not allowed'}
                  </span>
                </p>
              )}
              <p className="mt-2 text-xs text-grove-ink/55 dark:text-grove-ink-dk/55">
                {current.changed_by
                  ? `Set by ${current.changed_by}${
                      current.changed_at ? ` on ${new Date(current.changed_at).toLocaleString()}` : ''
                    }`
                  : 'Default level; not changed since the org was connected.'}
              </p>
            </div>

            {result && (
              <SaveResult
                result={result}
                onSync={() => sync.mutate()}
                syncState={sync.isPending ? 'pending' : sync.isSuccess ? 'started' : sync.isError ? 'failed' : 'idle'}
              />
            )}

            {isAdmin && !draft && (
              <Button variant="secondary" size="sm" onClick={startEditing}>
                Change privacy level
              </Button>
            )}

            {isAdmin && draft && !confirming && (
              <div className="space-y-3 border-t border-grove-border pt-4 dark:border-grove-border-dk">
                <PrivacyLevelPicker
                  name="privacy-level"
                  value={draft.mode}
                  onChange={(m) => setDraft({ ...draft, mode: m })}
                  aggregates={draft.aggregates}
                  onAggregatesChange={(a) => setDraft({ ...draft, aggregates: a })}
                />
                <div className="flex items-center gap-2">
                  <Button size="sm" disabled={!changed} onClick={() => setConfirming(true)}>
                    Review change
                  </Button>
                  <Button variant="secondary" size="sm" onClick={cancel}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {isAdmin && draft && confirming && change && (
              <div className="space-y-3 border-t border-grove-border pt-4 dark:border-grove-border-dk">
                <p className="text-sm font-semibold text-grove-ink dark:text-grove-ink-dk">
                  Change from {PRIVACY_LEVELS[saved.mode].label} to {PRIVACY_LEVELS[draft.mode].label}
                  {draft.mode === 'metadata_only' &&
                    (draft.aggregates ? ', with aggregate statistics' : ', without aggregate statistics')}
                  ?
                </p>
                {change.removals.length > 0 && (
                  <div className="rounded-lg border border-red-200 bg-red-50/60 p-3 dark:border-red-900 dark:bg-red-900/10">
                    <p className="flex items-center gap-2 text-sm font-medium text-red-800 dark:text-red-300">
                      <AlertTriangle className="h-4 w-4 shrink-0" />
                      This changes data Newton already holds, immediately. It cannot be undone.
                    </p>
                    <ul className="mt-2 list-disc space-y-1 pl-9 text-sm text-red-800/90 dark:text-red-300/90">
                      {change.removals.map((r) => (
                        <li key={r}>{r}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {change.needsResync && (
                  <div className="flex items-start gap-2 rounded-lg border border-primary-200 bg-primary-50/60 p-3 text-sm text-primary-800 dark:border-primary-800 dark:bg-primary-900/15 dark:text-primary-300">
                    <Info className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                      Newton does not hold the newly allowed data yet. It is pulled at the next
                      sync, so run Sync from Salesforce after saving.
                    </span>
                  </div>
                )}
                {save.isError && (
                  <p className="text-sm text-red-600 dark:text-red-400">
                    {save.error instanceof ApiError && save.error.status === 403
                      ? 'Only org admins can change the privacy level.'
                      : `Could not save: ${(save.error as Error).message}`}
                  </p>
                )}
                <div className="flex items-center gap-2">
                  <Button
                    variant={change.removals.length > 0 ? 'danger' : 'primary'}
                    size="sm"
                    disabled={save.isPending}
                    onClick={() => save.mutate(draft)}
                  >
                    {save.isPending
                      ? 'Saving…'
                      : change.removals.length > 0
                        ? 'Change level and remove data'
                        : 'Change level'}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={save.isPending}
                    onClick={() => setConfirming(false)}
                  >
                    Back
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}

function SaveResult({
  result,
  onSync,
  syncState,
}: {
  result: { update: PrivacyModeUpdate; needsResync: boolean }
  onSync: () => void
  syncState: 'idle' | 'pending' | 'started' | 'failed'
}) {
  const lines = purgedSummary(result.update.purged ?? {})
  return (
    <div className="space-y-2 rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-900/10 dark:text-emerald-200">
      <p className="flex items-center gap-2 font-medium">
        <CheckCircle className="h-4 w-4 shrink-0" />
        Privacy level set to {result.update.label}.
      </p>
      {lines.length > 0 ? (
        <div>
          <p>Removed or masked:</p>
          <ul className="mt-1 list-disc pl-5">
            {lines.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </div>
      ) : (
        !result.needsResync && <p>No stored data needed changing.</p>
      )}
      {result.needsResync && (
        <div className="flex flex-wrap items-center gap-3">
          <span>Run a sync to pull the newly allowed data.</span>
          {syncState === 'started' ? (
            <span className="font-medium">Sync started.</span>
          ) : (
            <Button variant="secondary" size="sm" onClick={onSync} disabled={syncState === 'pending'}>
              <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${syncState === 'pending' ? 'animate-spin' : ''}`} />
              {syncState === 'failed' ? 'Retry sync' : 'Sync now'}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
