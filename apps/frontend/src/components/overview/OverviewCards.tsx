'use client'

/**
 * Overview cards (Config Workbook parity row #28): how much configuration the
 * org has, and logins by profile from each user's last login (no
 * LoginHistory read). The logins card shows the first 10 profiles; View all
 * opens the paged list.
 */

import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/shared/Card'
import { TableSkeleton } from '@/components/shared/LoadingSkeleton'
import { apiClient } from '@/lib/api/client'

export interface LoginRow {
  profileId: string
  profile: string
  active: number
  last30: number
  last90: number
  never: number
  notIn90: number
}

interface Overview {
  components: { key: string; label: string; count: number | null; href: string | null }[]
  logins: { count: number; preview: LoginRow[]; totals: Omit<LoginRow, 'profileId' | 'profile'> } | null
}

const MUTED = 'text-grove-ink/65 dark:text-grove-ink-dk/65'
const n = (v: number) => v.toLocaleString('en-US')

export function LoginsTable({ rows, sort }: { rows: LoginRow[]; sort?: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-grove-border text-sm dark:divide-grove-border-dk">
        {sort ?? (
          <thead>
            <tr className={`text-left text-xs uppercase ${MUTED}`}>
              <th className="px-3 py-2 font-medium">Profile</th>
              <th className="px-3 py-2 text-right font-medium">Active users</th>
              <th className="px-3 py-2 text-right font-medium">Logged in, 30 days</th>
              <th className="px-3 py-2 text-right font-medium">Not in 90 days</th>
              <th className="px-3 py-2 text-right font-medium">Never</th>
            </tr>
          </thead>
        )}
        <tbody className="divide-y divide-grove-border dark:divide-grove-border-dk">
          {rows.map((r) => (
            <tr key={r.profileId || r.profile}>
              <td className="px-3 py-2">{r.profile}</td>
              <td className="v2-num px-3 py-2 text-right">{n(r.active)}</td>
              <td className="v2-num px-3 py-2 text-right">{n(r.last30)}</td>
              <td className={`v2-num px-3 py-2 text-right ${r.notIn90 ? '' : MUTED}`}>{n(r.notIn90)}</td>
              <td className={`v2-num px-3 py-2 text-right ${r.never ? '' : MUTED}`}>{n(r.never)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function OverviewCards({ orgId }: { orgId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['org-overview', orgId],
    queryFn: () => apiClient.get<Overview>(`/orgs/${orgId}/org-overview`),
  })
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card variant="bordered">
        <CardHeader><CardTitle>Org at a glance</CardTitle></CardHeader>
        <CardContent>
          {isLoading || !data ? <TableSkeleton rows={6} /> : (
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
              {data.components.map((c) => (
                <div key={c.key} className="flex items-baseline justify-between gap-2 border-b border-grove-border/60 py-1 dark:border-grove-border-dk/60">
                  <dt className={MUTED}>
                    {c.href ? <Link className="hover:underline" href={`/orgs/${orgId}/${c.href}`}>{c.label}</Link> : c.label}
                  </dt>
                  <dd className="v2-num font-semibold">{c.count == null ? <span className={`text-xs font-normal ${MUTED}`}>not read</span> : n(c.count)}</dd>
                </div>
              ))}
            </dl>
          )}
          <p className={`mt-3 text-xs ${MUTED}`}>From the last sync. &ldquo;Not read&rdquo; means the sync didn&apos;t read it, not zero.</p>
        </CardContent>
      </Card>
      <Card variant="bordered">
        <CardHeader><CardTitle>Logins by profile</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {isLoading || !data ? <TableSkeleton rows={6} /> : data.logins == null ? (
            <p className={`text-sm ${MUTED}`}>Not available at this org&apos;s privacy level (metadata only).</p>
          ) : (
            <>
              <p className="text-sm">
                <strong className="v2-num">{n(data.logins.totals.last30)}</strong> of <strong className="v2-num">{n(data.logins.totals.active)}</strong> active
                users logged in within 30 days; <strong className="v2-num">{n(data.logins.totals.notIn90 + data.logins.totals.never)}</strong> not in 90 days or never.
              </p>
              <LoginsTable rows={data.logins.preview} />
              {data.logins.count > data.logins.preview.length && (
                <Link href={`/orgs/${orgId}/logins-by-profile`} className="inline-block text-xs font-medium text-primary-700 hover:underline dark:text-primary-300">
                  View all {data.logins.count} profiles
                </Link>
              )}
              <p className={`text-xs ${MUTED}`}>From each user&apos;s last login in the last sync; Newton doesn&apos;t read LoginHistory for this.</p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
