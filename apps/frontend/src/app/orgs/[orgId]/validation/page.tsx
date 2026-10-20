'use client'

/**
 * Validation report (roadmap item 10): how many reviewed findings, anomalies
 * and Priority Actions proved useful, overall, by module and by type, always
 * with the counts, never a single score. Reviews on a demo org are labelled
 * and never count.
 */

import { useParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { ClipboardCheck } from 'lucide-react'
import { Badge } from '@/components/shared/Badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/shared/Card'
import { TableSkeleton } from '@/components/shared/LoadingSkeleton'
import { PageHeader } from '@/components/shared/PageHeader'
import { apiClient } from '@/lib/api/client'

interface Tally { reviewed: number; useful: number; notUseful: number; expected: number; precision: number | null }
interface Report {
  title: string; org: string; period: [string, string] | null; isDemo: boolean; note: string; overall: Tally; demoReviews: number
  byModule: (Tally & { module: string })[]; byType: (Tally & { type: string })[]
  recent: { title: string; module: string; status: string; reason: string | null; reviewer: string | null; at: string | null; isDemo: boolean }[]
}

const MUTED = 'text-grove-ink/65 dark:text-grove-ink-dk/65'
const pct = (t: Tally) => (t.precision == null ? 'Not measured' : `${Math.round(t.precision * 100)}% (${t.useful} of ${t.useful + t.notUseful})`)
const STATUS = { useful: ['Useful', 'success'], not_useful: ['Not useful', 'danger'], expected: ['Expected', 'default'] } as const

function TallyTable({ rows, first }: { rows: (Tally & { name: string })[]; first: string }) {
  if (!rows.length) return <p className={`text-sm ${MUTED}`}>No reviews yet.</p>
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-grove-border text-sm dark:divide-grove-border-dk">
        <thead><tr className={`text-left text-xs uppercase ${MUTED}`}>
          <th className="px-3 py-2 font-medium">{first}</th><th className="px-3 py-2 text-right font-medium">Reviewed</th>
          <th className="px-3 py-2 text-right font-medium">Useful</th><th className="px-3 py-2 text-right font-medium">Not useful</th>
          <th className="px-3 py-2 text-right font-medium">Expected</th><th className="px-3 py-2 text-right font-medium">Precision</th>
        </tr></thead>
        <tbody className="v2-num divide-y divide-grove-border dark:divide-grove-border-dk">
          {rows.map((r) => (
            <tr key={r.name}>
              <td className="px-3 py-2">{r.name}</td><td className="px-3 py-2 text-right">{r.reviewed}</td>
              <td className="px-3 py-2 text-right">{r.useful}</td><td className="px-3 py-2 text-right">{r.notUseful}</td>
              <td className="px-3 py-2 text-right">{r.expected}</td><td className="px-3 py-2 text-right">{pct(r)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function ValidationPage() {
  const orgId = useParams().orgId as string
  const { data } = useQuery({ queryKey: ['validation', orgId], queryFn: () => apiClient.get<Report>(`/orgs/${orgId}/validation`) })
  return (
    <div className="space-y-6">
      <PageHeader icon={ClipboardCheck} title={data?.title ?? 'Validation'} eyebrow="Attention · validation"
        subtitle="Reviewers mark findings, anomalies and Priority Actions useful, not useful or expected. This counts them; it's never one score." />
      {!data ? <TableSkeleton rows={6} /> : (
        <>
          {data.isDemo && (
            <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-200">
              Demo org: its {data.demoReviews} {data.demoReviews === 1 ? 'review is' : 'reviews are'} labelled demo and don&apos;t count towards validation.
            </p>
          )}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {[['Reviewed', data.overall.reviewed], ['Useful', data.overall.useful], ['Not useful', data.overall.notUseful],
              ['Expected', data.overall.expected], ['Precision', pct(data.overall)]].map(([l, v]) => (
              <Card key={l as string} variant="bordered"><CardContent className="pt-5">
                <p className={`text-xs font-semibold uppercase tracking-wide ${MUTED}`}>{l}</p>
                <p className="v2-num text-2xl font-bold">{v}</p>
              </CardContent></Card>
            ))}
          </div>
          <p className={`text-xs ${MUTED}`}>{data.note}</p>
          <Card variant="bordered"><CardHeader><CardTitle>By module</CardTitle></CardHeader>
            <CardContent><TallyTable first="Module" rows={data.byModule.map((m) => ({ ...m, name: m.module }))} /></CardContent></Card>
          <Card variant="bordered"><CardHeader><CardTitle>By type</CardTitle></CardHeader>
            <CardContent><TallyTable first="Type" rows={data.byType.map((t) => ({ ...t, name: t.type }))} /></CardContent></Card>
          <Card variant="bordered"><CardHeader><CardTitle>Latest reviews</CardTitle></CardHeader>
            <CardContent>
              {data.recent.length === 0 ? <p className={`text-sm ${MUTED}`}>No reviews yet. Open a finding, anomaly or Priority Action and use Review under its evidence.</p> : (
                <ul className="divide-y divide-grove-border text-sm dark:divide-grove-border-dk">
                  {data.recent.map((r, i) => (
                    <li key={i} className="flex flex-wrap items-center gap-2 py-2">
                      <Badge variant={STATUS[r.status as keyof typeof STATUS][1]} size="sm">{STATUS[r.status as keyof typeof STATUS][0]}</Badge>
                      <span className="font-medium">{r.title}</span>
                      <span className={`text-xs ${MUTED}`}>{r.module} · {r.reviewer}{r.isDemo ? ' · demo' : ''}</span>
                      {r.reason && <span className={`w-full text-xs ${MUTED}`}>{r.reason}</span>}
                    </li>
                  ))}
                </ul>
              )}
              <p className={`mt-2 text-xs ${MUTED}`}>The 50 most recent.</p>
            </CardContent></Card>
        </>
      )}
    </div>
  )
}
