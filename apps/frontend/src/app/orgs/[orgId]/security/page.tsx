'use client'

/**
 * Security summary (parity #26): one screen over what Newton already holds,
 * each tile linking to its module. Users holding the most powerful system
 * permissions (profile, sets and groups, muting applied), flagged access
 * anomalies, high-blast setup changes, org-wide defaults that open records,
 * org limits, compliance indicators and the health score. A tile whose data
 * wasn't read says so instead of showing zero.
 */

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { ShieldAlert } from 'lucide-react'
import { Card, CardContent } from '@/components/shared/Card'
import { ErrorState } from '@/components/shared/ErrorState'
import { TableSkeleton } from '@/components/shared/LoadingSkeleton'
import { PageHeader } from '@/components/shared/PageHeader'
import { apiClient } from '@/lib/api/client'

interface Summary {
  usersAllowed: boolean
  health: { score: number | null; findings: number; critical: number; at: string } | null
  limits: { total: number; warning: number; critical: number } | null
  admins: { permission: string; label: string; users: number; preview: string[] }[] | null
  anomalies: { total: number; highOrCritical: number; session: number } | null
  changes: { events: number; highBlast: number; since: string; at: string } | null
  sharing: { objects: number; public: string[] } | null
  compliance: { framework: string; failed: number; total: number; scorePct: number }[] | null
}

const MUTED = 'text-grove-ink/65 dark:text-grove-ink-dk/65'

function Tile({ title, href, link, children }: { title: string; href: string; link: string; children: React.ReactNode }) {
  return (
    <Card variant="bordered" className="flex flex-col">
      <CardContent className="flex flex-1 flex-col gap-2 pt-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-grove-ink/55 dark:text-grove-ink-dk/55">{title}</p>
        <div className="flex-1 text-sm">{children}</div>
        <Link href={href} className="text-xs font-medium text-primary-700 hover:underline dark:text-primary-300">{link}</Link>
      </CardContent>
    </Card>
  )
}

const Big = ({ children }: { children: React.ReactNode }) => <p className="v2-num text-3xl font-bold">{children}</p>
const NotRead = ({ children }: { children: React.ReactNode }) => <p className={`text-sm italic ${MUTED}`}>{children}</p>

export default function SecuritySummaryPage() {
  const orgId = useParams().orgId as string
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['security-summary', orgId],
    queryFn: () => apiClient.get<Summary>(`/orgs/${orgId}/security-summary`),
  })
  const base = `/orgs/${orgId}`
  return (
    <div className="space-y-6">
      <PageHeader icon={ShieldAlert} title="Security summary" eyebrow="Attention · overview"
        subtitle="The org's security posture on one screen, from what Newton has read. Each tile opens the module behind it." />
      {error ? <ErrorState message={(error as Error).message} onRetry={() => refetch()} /> : isLoading || !data ? <TableSkeleton rows={8} /> : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Tile title="Health score" href={`${base}/org-analyzer`} link="Health Report">
              {data.health ? <><Big>{data.health.score ?? '—'}</Big><p className={MUTED}>{data.health.findings} findings, {data.health.critical} critical</p></>
                : <NotRead>Run the Health Report.</NotRead>}
            </Tile>
            <Tile title="Flagged access anomalies" href={`${base}/anomalies`} link="Anomalies">
              {data.anomalies ? <><Big>{data.anomalies.total}</Big><p className={MUTED}>{data.anomalies.highOrCritical} high or critical{data.anomalies.session ? `, ${data.anomalies.session} session` : ''}</p></>
                : <NotRead>Not available at this org&apos;s privacy level.</NotRead>}
            </Tile>
            <Tile title="High-blast setup changes" href={`${base}/change-risk`} link="Change-Risk Radar">
              {data.changes ? <><Big>{data.changes.highBlast}</Big><p className={MUTED}>of {data.changes.events} changes since {new Date(data.changes.since).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</p></>
                : <NotRead>Run Change-Risk Radar to pull the Setup Audit Trail.</NotRead>}
            </Tile>
            <Tile title="Org limits" href={`${base}/org-limits`} link="Org limits">
              {data.limits ? <><Big>{data.limits.critical + data.limits.warning}</Big><p className={MUTED}>{data.limits.critical} critical, {data.limits.warning} warning, of {data.limits.total}</p></>
                : <NotRead>Run the Health Report to read the limits.</NotRead>}
            </Tile>
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <Card variant="bordered" className="lg:col-span-2">
              <CardContent className="space-y-3 pt-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-grove-ink/55 dark:text-grove-ink-dk/55">Users with the most powerful permissions</p>
                {data.admins == null ? <NotRead>Not available at this org&apos;s privacy level (metadata only).</NotRead> : (
                  <table className="w-full text-sm">
                    <tbody className="divide-y divide-grove-border dark:divide-grove-border-dk">
                      {data.admins.map((a) => (
                        <tr key={a.permission}>
                          <td className="py-2">{a.label}</td>
                          <td className={`py-2 text-xs ${MUTED}`}>{a.preview.join(', ')}{a.users > a.preview.length ? ', …' : ''}</td>
                          <td className="v2-num py-2 text-right">
                            <Link className="font-semibold text-primary-700 hover:underline dark:text-primary-300" href={`${base}/security/admins?permission=${a.permission}`}>{a.users}</Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                <p className={`text-xs ${MUTED}`}>Active users holding each permission through their profile, permission sets or groups (muting applied).</p>
              </CardContent>
            </Card>
            <div className="space-y-4">
              <Tile title="Org-wide defaults that open records" href={`${base}/schema`} link="Schema">
                {data.sharing ? (data.sharing.public.length ? <p>{data.sharing.public.join(', ')}</p> : <p>None of {data.sharing.objects} objects</p>)
                  : <NotRead>Org-wide defaults weren&apos;t read for this org.</NotRead>}
              </Tile>
              <Tile title="Compliance indicators" href={`${base}/compliance`} link="Compliance">
                {data.compliance ? (
                  <ul className="space-y-1">
                    {data.compliance.map((c) => <li key={c.framework}>{c.framework.toUpperCase()}: <span className="v2-num">{c.failed}</span> of {c.total} controls failing</li>)}
                  </ul>
                ) : <NotRead>Run the compliance indicators.</NotRead>}
              </Tile>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
