'use client'

/**
 * Profiles (roadmap item 1): every profile, with its API name and active
 * users when the privacy level keeps users. Each opens the profile's page
 * layouts, record pages, Apex and flows. Configuration only, so it works at
 * every privacy level, Metadata only included. Paged, searched and sorted by
 * the server (the standing pagination rule).
 */

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { UserCircle } from 'lucide-react'
import { Card, CardContent } from '@/components/shared/Card'
import { ErrorState } from '@/components/shared/ErrorState'
import { ListSearch } from '@/components/shared/ListSearch'
import { TableSkeleton } from '@/components/shared/LoadingSkeleton'
import { PageHeader } from '@/components/shared/PageHeader'
import { Pagination } from '@/components/shared/Pagination'
import { SortHeader } from '@/components/shared/SortHeader'
import { Reveal } from '@/components/v2/motion'
import { useListState } from '@/lib/list/useListState'
import { usePaged } from '@/lib/list/usePaged'

const MUTED = 'text-grove-ink/60 dark:text-grove-ink-dk/60'

export default function ProfilesPage() {
  const orgId = useParams().orgId as string
  const { state, update } = useListState('', { sort: 'name' })
  const { data, isLoading, error, refetch } = usePaged<any, { users_allowed: boolean }>(['profiles', orgId], `/orgs/${orgId}/profiles`, state)
  const sort = { sort: state.sort, dir: state.dir, onSort: (c: string, d: 'asc' | 'desc') => update({ sort: c, dir: d }) }

  return (
    <div className="space-y-4">
      <Reveal>
        <PageHeader
          icon={UserCircle}
          eyebrow="Explore · access"
          title="Profiles"
          subtitle="Each profile's page layouts, record pages, Apex classes and flows."
        />
      </Reveal>
      <Card variant="bordered">
        <CardContent className="pt-4">
          <div className="mb-3 flex"><ListSearch value={state.q} onChange={(q) => update({ q })} placeholder="Search profiles..." /></div>
          {isLoading || !data ? (
            error ? <ErrorState message="Failed to load profiles." onRetry={() => refetch()} /> : <TableSkeleton rows={8} />
          ) : data.total === 0 ? (
            <p className={`py-4 text-sm ${MUTED}`}>{state.q ? `Nothing matches “${state.q}”.` : 'No profiles synced.'}</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      <SortHeader label="Profile" column="name" {...sort} />
                      <SortHeader label="API name" column="api_name" {...sort} />
                      {data.users_allowed && <SortHeader label="Active users" column="users" align="right" {...sort} />}
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((p: any) => (
                      <tr key={p.id} className="border-t border-grove-border dark:border-grove-border-dk">
                        <td className="px-4 py-1.5">
                          <Link className="font-medium underline-offset-2 hover:underline" href={`/orgs/${orgId}/profiles/${p.id}`}>{p.name}</Link>
                        </td>
                        <td className={`px-4 py-1.5 font-mono text-xs ${MUTED}`}>{p.api_name ?? 'not read'}</td>
                        {data.users_allowed && <td className="v2-num px-4 py-1.5 text-right">{p.active_users}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination page={data.page} pageSize={data.page_size} total={data.total} label="profiles"
                onPage={(page) => update({ page })} onPageSize={(pageSize) => update({ pageSize })} />
            </>
          )}
          {data && !data.users_allowed && (
            <p className={`mt-3 text-xs ${MUTED}`}>User counts aren&apos;t shown: this client&apos;s privacy level excludes user records.</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
