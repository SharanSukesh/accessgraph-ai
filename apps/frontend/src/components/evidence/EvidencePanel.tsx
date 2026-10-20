'use client'

/**
 * Evidence and review for a finding, anomaly or Priority Action (roadmap
 * items 20 and 10): where it came from and when, which snapshot, how
 * complete the input was, how sure Newton is, the permission it needed and
 * the method's version; and the reviewer's verdict (useful, not useful,
 * expected) with a reason. Admins and analysts can review.
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Badge } from '@/components/shared/Badge'
import { apiClient } from '@/lib/api/client'
import { useAuth } from '@/lib/auth/AuthContext'

interface Evidence {
  source: string
  collectedAt: string | null
  snapshot: { id: string; takenAt: string; label: string } | null
  coverage: string[]
  confidence: 'confirmed' | 'inferred' | 'sampled' | 'unknown'
  permission: { needed: string; had: boolean }
  methodology: string
}
interface Review { status: 'useful' | 'not_useful' | 'expected'; reason: string | null; reviewer: string | null; at: string | null; isDemo: boolean }

const MUTED = 'text-grove-ink/65 dark:text-grove-ink-dk/65'
const CONFIDENCE = {
  confirmed: ['Confirmed', 'success', 'Counted from complete reads.'],
  inferred: ['Inferred', 'info', 'A rule or model over complete reads, not a direct count.'],
  sampled: ['Sampled', 'warning', 'From a sample or an estimate.'],
  unknown: ['Unknown', 'default', 'An input wasn’t read, so this isn’t measured.'],
} as const
const VERDICTS = [['useful', 'Useful'], ['not_useful', 'Not useful'], ['expected', 'Expected']] as const
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—')

export function EvidencePanel({ orgId, kind, itemId }: { orgId: string; kind: 'finding' | 'anomaly' | 'recommendation'; itemId: string }) {
  const { canWrite } = useAuth()
  const qc = useQueryClient()
  const { data } = useQuery({
    queryKey: ['evidence', orgId, kind, itemId],
    queryFn: () => apiClient.get<{ evidence: Evidence; review: Review | null }>(`/orgs/${orgId}/evidence/${kind}/${itemId}`),
  })
  const [reason, setReason] = useState('')
  useEffect(() => setReason(data?.review?.reason ?? ''), [data?.review?.reason, itemId])
  const save = useMutation({
    mutationFn: (status: string | null) => apiClient.put(`/orgs/${orgId}/reviews`, { kind, item_id: itemId, status, reason }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['evidence', orgId, kind, itemId] }),
  })
  if (!data) return null
  const e = data.evidence
  const [label, variant, help] = CONFIDENCE[e.confidence]
  return (
    <div className="space-y-3 rounded-lg border border-grove-border p-3 text-xs dark:border-grove-border-dk" data-testid="evidence">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-grove-ink/80 dark:text-grove-ink-dk/80">Evidence</span>
        <Badge variant={variant} size="sm" title={help}>{label}</Badge>
      </div>
      <dl className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-1">
        <dt className={MUTED}>Source</dt><dd>{e.source}</dd>
        <dt className={MUTED}>Collected</dt><dd>{when(e.collectedAt)}</dd>
        <dt className={MUTED}>Snapshot</dt>
        <dd>{e.snapshot ? <Link className="text-primary-700 hover:underline dark:text-primary-300" href={`/orgs/${orgId}/snapshots?snap=${e.snapshot.id}`}>{e.snapshot.label} ({when(e.snapshot.takenAt)})</Link> : 'Not recorded (before snapshots)'}</dd>
        <dt className={MUTED}>Coverage</dt><dd>{e.coverage.join('; ')}</dd>
        <dt className={MUTED}>Needs</dt><dd>{e.permission.needed} · {e.permission.had ? 'Newton had it' : 'not granted, so not read'}</dd>
        <dt className={MUTED}>Method</dt><dd>{e.methodology}</dd>
      </dl>
      <div className="space-y-2 border-t border-grove-border pt-2 dark:border-grove-border-dk">
        <p className="font-semibold text-grove-ink/80 dark:text-grove-ink-dk/80">
          Review{data.review && <span className={`ml-1 font-normal ${MUTED}`}>· {VERDICTS.find(([k]) => k === data.review!.status)?.[1]} by {data.review.reviewer}, {when(data.review.at)}{data.review.isDemo ? ' (demo: not counted)' : ''}</span>}
        </p>
        {canWrite ? (
          <>
            <textarea aria-label="Reason" value={reason} onChange={(ev) => setReason(ev.target.value)} rows={2} placeholder="Why (optional)"
              className="w-full rounded-md bg-grove-surface px-2 py-1 ring-1 ring-grove-border dark:bg-grove-canvas-dk dark:ring-grove-border-dk" />
            <div className="flex flex-wrap gap-2">
              {VERDICTS.map(([k, l]) => (
                <button key={k} type="button" disabled={save.isPending} onClick={() => save.mutate(k)} aria-pressed={data.review?.status === k}
                  className={`rounded-full px-3 py-1 font-medium ring-1 ${data.review?.status === k ? 'bg-primary-700 text-grove-canvas ring-primary-700' : 'ring-grove-border dark:ring-grove-border-dk'}`}>{l}</button>
              ))}
              {data.review && <button type="button" className={`px-2 ${MUTED} hover:underline`} onClick={() => save.mutate(null)}>Clear</button>}
            </div>
          </>
        ) : !data.review && <p className={MUTED}>Not reviewed.</p>}
      </div>
    </div>
  )
}
