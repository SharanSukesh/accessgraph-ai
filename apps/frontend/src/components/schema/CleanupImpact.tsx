'use client'

/**
 * Cleanup impact (roadmap item 13): can this field be deleted? Never "safe
 * to delete": the verdict, what references it, where Newton looked and
 * where it couldn't, and how many records hold a value. The card shows the
 * first 10 references; View all opens the paged list.
 */

import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle2, CircleDashed, Info } from 'lucide-react'
import { Badge } from '@/components/shared/Badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/shared/Card'
import { TableSkeleton } from '@/components/shared/LoadingSkeleton'
import { apiClient } from '@/lib/api/client'
import type { Paged } from '@/lib/list/listState'

export type ImpactLevel = 'candidate' | 'unmeasured' | 'unused_populated' | 'inactive_only' | 'in_use' | 'standard'

export interface ImpactReference {
  source: string
  kind: string
  name: string
  active: boolean | null
  detail: string
  foundBy: string[]
}

export interface FieldImpact {
  object: string
  field: string
  label: string | null
  custom: boolean
  verdict: { level: ImpactLevel; title: string; text: string; confidence: 'High' | 'Medium' | 'Low' }
  sources: { source: string; status: 'checked' | 'not read'; note: string }[]
  notCheckable: string[]
  population: { populated: number; records: number | null; estimated: boolean; run_at: string | null } | null
}

const MUTED = 'text-grove-ink/65 dark:text-grove-ink-dk/65'
const PREVIEW = 10
export const LEVEL_BADGE: Record<ImpactLevel, 'success' | 'warning' | 'danger' | 'info' | 'default'> = {
  candidate: 'success', unmeasured: 'info', unused_populated: 'warning', inactive_only: 'warning', in_use: 'danger',
  standard: 'default',
}

export function ReferencesTable({ refs }: { refs: ImpactReference[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-grove-border text-sm dark:divide-grove-border-dk">
        <thead>
          <tr className={`text-left text-xs uppercase ${MUTED}`}>
            <th className="px-3 py-2 font-medium">Where</th>
            <th className="px-3 py-2 font-medium">Name</th>
            <th className="px-3 py-2 font-medium">How</th>
            <th className="px-3 py-2 font-medium">Found by</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-grove-border dark:divide-grove-border-dk">
          {refs.map((r) => (
            <tr key={`${r.kind}|${r.name}`}>
              <td className="px-3 py-2">
                {r.kind}
                {r.active === false && <Badge variant="default" size="sm" className="ml-2">Inactive</Badge>}
              </td>
              <td className="px-3 py-2 font-mono text-xs">{r.name}</td>
              <td className={`px-3 py-2 ${MUTED}`}>{r.detail || '—'}</td>
              <td className={`px-3 py-2 text-xs ${MUTED}`}>
                {[...new Set(r.foundBy.map((f) => (f === 'Dependency index' ? 'Salesforce dependency index' : "Newton's scan")))].join(', ')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function ImpactVerdict({ impact }: { impact: FieldImpact }) {
  const v = impact.verdict
  const Icon = v.level === 'candidate' ? CheckCircle2 : v.level === 'in_use' ? AlertTriangle : v.level === 'unmeasured' ? CircleDashed : Info
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Icon className="h-5 w-5" aria-hidden />
        <Badge variant={LEVEL_BADGE[v.level]}>{v.title}</Badge>
        <span className={`text-xs ${MUTED}`}>Confidence: {v.confidence}</span>
      </div>
      <p className="text-sm">{v.text}</p>
      <p className={`text-xs ${MUTED}`}>
        {impact.population == null
          ? 'Population: not measured (Data Quality inspects up to 20 fields per object).'
          : `Population: ${impact.population.populated.toLocaleString('en-US')} of ${(impact.population.records ?? 0).toLocaleString('en-US')} ${
              impact.population.estimated ? 'sampled records' : 'records'} hold a value${
              impact.population.run_at ? ` (Data Quality, ${new Date(impact.population.run_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })})` : ''}.`}
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <p className="mb-1 text-xs font-semibold text-grove-ink/80 dark:text-grove-ink-dk/80">Where Newton looked</p>
          <ul className="space-y-1 text-xs">
            {impact.sources.map((s) => (
              <li key={s.source}>
                <span className={s.status === 'checked' ? '' : 'line-through'}>{s.source}</span>
                <span className={MUTED}> · {s.status === 'checked' ? 'checked' : 'not read'}{s.note ? `: ${s.note}` : ''}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="mb-1 text-xs font-semibold text-grove-ink/80 dark:text-grove-ink-dk/80">What Newton can&apos;t check</p>
          <ul className={`list-disc space-y-1 pl-4 text-xs ${MUTED}`}>
            {impact.notCheckable.map((n) => <li key={n}>{n}</li>)}
          </ul>
        </div>
      </div>
    </div>
  )
}

export function CleanupImpactCard({ orgId, fieldId }: { orgId: string; fieldId: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['field-impact', orgId, fieldId, 'preview'],
    queryFn: () => apiClient.get<Paged<ImpactReference, { impact: FieldImpact }>>(
      `/orgs/${orgId}/fields/${encodeURIComponent(fieldId)}/impact?page=1&page_size=25`),
  })
  return (
    <Card variant="bordered">
      <CardHeader>
        <CardTitle>Can this field be deleted?</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? (
          <p className={`text-sm ${MUTED}`}>{(error as Error).message}</p>
        ) : isLoading || !data ? (
          <TableSkeleton rows={3} />
        ) : (
          <>
            <ImpactVerdict impact={data.impact} />
            <p className="text-xs font-semibold text-grove-ink/80 dark:text-grove-ink-dk/80">
              References ({data.total})
            </p>
            {data.total === 0 ? (
              <p className={`text-sm ${MUTED}`}>None found in the sources checked.</p>
            ) : (
              <ReferencesTable refs={data.items.slice(0, PREVIEW)} />
            )}
            {data.total > PREVIEW && (
              <Link href={`/orgs/${orgId}/fields/${encodeURIComponent(fieldId)}/impact`}
                className="inline-block text-xs font-medium text-primary-700 hover:underline dark:text-primary-300">
                View all {data.total} references
              </Link>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
