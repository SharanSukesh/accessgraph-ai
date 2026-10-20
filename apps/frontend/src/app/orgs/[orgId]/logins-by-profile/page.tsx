'use client'

/** Logins by profile (parity #28), paged and sortable (View all from the Overview card). */

import { useParams } from 'next/navigation'
import { LogIn } from 'lucide-react'
import { LoginsTable, type LoginRow } from '@/components/overview/OverviewCards'
import { Breadcrumbs } from '@/components/shared/Breadcrumbs'
import { Card, CardContent } from '@/components/shared/Card'
import { ListSearch } from '@/components/shared/ListSearch'
import { TableSkeleton } from '@/components/shared/LoadingSkeleton'
import { PageHeader } from '@/components/shared/PageHeader'
import { Pagination } from '@/components/shared/Pagination'
import { SortHeader } from '@/components/shared/SortHeader'
import { useListState } from '@/lib/list/useListState'
import { usePaged } from '@/lib/list/usePaged'

export default function LoginsByProfilePage() {
  const orgId = useParams().orgId as string
  const { state, update } = useListState('', {})
  const { data, isLoading, error } = usePaged<LoginRow>(['logins-by-profile', orgId], `/orgs/${orgId}/logins-by-profile`, state)
  const sort = { sort: data?.sort ?? state.sort, dir: data?.dir ?? state.dir, onSort: (c: string, d: 'asc' | 'desc') => update({ sort: c, dir: d }) }
  return (
    <div className="space-y-6">
      <Breadcrumbs crumbs={[{ label: 'Overview', href: `/orgs/${orgId}/dashboard` }, { label: 'Logins by profile' }]} />
      <PageHeader icon={LogIn} title="Logins by profile" subtitle="From each active user's last login in the last sync." />
      <Card variant="bordered">
        <CardContent className="space-y-3 pt-6">
          <ListSearch value={state.q} onChange={(q) => update({ q })} placeholder="Search profiles..." />
          {error ? <p className="text-sm">{(error as Error).message}</p> : isLoading || !data ? <TableSkeleton rows={8} /> : (
            <>
              <LoginsTable rows={data.items} sort={
                <thead>
                  <tr>
                    <SortHeader label="Profile" column="profile" {...sort} />
                    <SortHeader label="Active users" column="active" align="right" {...sort} />
                    <SortHeader label="Logged in, 30 days" column="last30" align="right" {...sort} />
                    <SortHeader label="Not in 90 days" column="notIn90" align="right" {...sort} />
                    <SortHeader label="Never" column="never" align="right" {...sort} />
                  </tr>
                </thead>
              } />
              <Pagination page={data.page} pageSize={data.page_size} total={data.total} label="profiles"
                onPage={(page) => update({ page })} onPageSize={(pageSize) => update({ pageSize })} />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
