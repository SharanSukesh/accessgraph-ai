'use client'

/**
 * Schema > Objects: objects whose data is unhealthy (stale, mostly empty,
 * fields never populated), each with its reason and the caveats on its
 * counts, plus the thresholds that decide it. From the latest Data
 * Quality run; thresholds apply to the next run.
 */

import Link from 'next/link'
import { useState } from 'react'
import { AlertTriangle, SlidersHorizontal } from 'lucide-react'
import { Badge } from '@/components/shared/Badge'
import { Button } from '@/components/shared/Button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/shared/Card'
import {
  type CriticalObjectSettings,
  type ObjectScore,
  useCriticalObjectSettings,
  useSaveCriticalObjectSettings,
} from '@/lib/api/hooks/useDataQuality'
import { countCaveats, criticalObjects } from '@/lib/criticalObjects'

const FIELDS: { key: keyof CriticalObjectSettings; label: string; unit: string }[] = [
  { key: 'stale_days', label: 'A record is stale after', unit: 'days' },
  { key: 'stale_share_pct', label: 'Flag an object when stale records reach', unit: '%' },
  { key: 'min_fill_pct', label: 'Flag an object when average fill rate is below', unit: '%' },
  { key: 'large_object_records', label: 'Sample objects larger than', unit: 'records' },
  { key: 'sample_size', label: 'Sample size for large objects', unit: 'records' },
]

function Thresholds({ orgId, canEdit }: { orgId: string; canEdit: boolean }) {
  const { data } = useCriticalObjectSettings(orgId)
  const save = useSaveCriticalObjectSettings(orgId)
  const [draft, setDraft] = useState<Partial<CriticalObjectSettings>>({})
  if (!data) return null
  const value = (k: keyof CriticalObjectSettings) => draft[k] ?? data.settings[k]
  return (
    <form
      className="space-y-3 rounded-lg border border-grove-border p-4 dark:border-grove-border-dk"
      onSubmit={(e) => {
        e.preventDefault()
        save.mutate(draft, { onSuccess: () => setDraft({}) })
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {FIELDS.map((f) => (
          <label key={f.key} className="text-xs text-grove-ink/75 dark:text-grove-ink-dk/75">
            {f.label}
            <span className="mt-1 flex items-center gap-2">
              <input
                type="number"
                min={data.limits[f.key]?.[0]}
                max={data.limits[f.key]?.[1]}
                disabled={!canEdit}
                value={value(f.key)}
                onChange={(e) => setDraft({ ...draft, [f.key]: Number(e.target.value) })}
                className="w-28 rounded border border-grove-border bg-grove-surface px-2 py-1 font-mono text-sm dark:border-grove-border-dk dark:bg-grove-surface-dk"
              />
              <span>{f.unit}</span>
            </span>
          </label>
        ))}
      </div>
      <div className="flex items-center gap-3">
        {canEdit && (
          <Button type="submit" size="sm" variant="secondary" disabled={!Object.keys(draft).length || save.isPending}>
            Save thresholds
          </Button>
        )}
        <p className="text-xs text-grove-ink/55 dark:text-grove-ink-dk/55">
          {save.isSuccess ? 'Saved. ' : ''}Thresholds apply to the next Data Quality run and are stored with it.
        </p>
      </div>
    </form>
  )
}

export function CriticalObjectsPanel({
  orgId,
  scores,
  hasRun,
  canEdit,
}: {
  orgId: string
  scores?: ObjectScore[]
  hasRun: boolean
  canEdit: boolean
}) {
  const [showThresholds, setShowThresholds] = useState(false)
  const list = criticalObjects(scores)
  return (
    <Card variant="bordered">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" aria-hidden />
            Critical objects
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={() => setShowThresholds((v) => !v)}>
            <SlidersHorizontal className="mr-2 h-4 w-4" aria-hidden /> Thresholds
          </Button>
        </div>
        <p className="mt-1 text-xs text-grove-ink/60 dark:text-grove-ink-dk/60">
          Objects whose data is stale, mostly empty or carries fields nobody fills in, from the latest Data Quality run.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {showThresholds && <Thresholds orgId={orgId} canEdit={canEdit} />}
        {!hasRun ? (
          <p className="text-sm text-grove-ink/60 dark:text-grove-ink-dk/60">Run Data Quality to find critical objects.</p>
        ) : list.length === 0 ? (
          <p className="text-sm text-grove-ink/60 dark:text-grove-ink-dk/60">No critical objects at the current thresholds.</p>
        ) : (
          <ul className="divide-y divide-grove-border dark:divide-grove-border-dk">
            {list.map((o) => (
              <li key={o.object_name} className="py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/orgs/${orgId}/objects/${o.object_name}`}
                    className="text-sm font-semibold text-grove-ink hover:underline dark:text-grove-ink-dk"
                  >
                    {o.object_label || o.object_name}
                  </Link>
                  <span className="font-mono text-xs text-grove-ink/50 dark:text-grove-ink-dk/50">{o.object_name}</span>
                  {(o.critical_flags ?? []).map((f) => (
                    <Badge key={f.code} variant="warning" size="sm">{f.label}</Badge>
                  ))}
                </div>
                <ul className="mt-1 space-y-0.5 text-sm text-grove-ink/80 dark:text-grove-ink-dk/80">
                  {(o.critical_flags ?? []).map((f) => (
                    <li key={f.code}>{f.reason}</li>
                  ))}
                </ul>
                {countCaveats(o).length > 0 && (
                  <p className="mt-1 text-xs italic text-grove-ink/55 dark:text-grove-ink-dk/55">
                    {countCaveats(o).join(' · ')}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
