'use client'

/** Apex classes or flows a permission set (or group) grants: the full list, paged. */

import { useParams } from 'next/navigation'
import { Settings } from 'lucide-react'
import { Breadcrumbs } from '@/components/shared/Breadcrumbs'
import { Card, CardContent } from '@/components/shared/Card'
import { ListSearch } from '@/components/shared/ListSearch'
import { TableSkeleton } from '@/components/shared/LoadingSkeleton'
import { PageHeader } from '@/components/shared/PageHeader'
import { Pagination } from '@/components/shared/Pagination'
import { ApexTable, FlowsTable } from '@/components/users/PagesAndAutomationPanel'
import { useListState } from '@/lib/list/useListState'
import { usePaged } from '@/lib/list/usePaged'

export default function SetAutomationListPage() {
  const params = useParams()
  const orgId = params.orgId as string
  const psId = params.psId as string
  const section = params.section as 'apex' | 'flows'
  const isGroup = psId.startsWith('0PG')
  const { state, update } = useListState('', { sort: section === 'apex' ? 'name' : 'label' })
  const { data, isLoading, error } = usePaged<any>(
    ['set-automation-list', orgId, psId, section], `/orgs/${orgId}/permission-sets/${psId}/automation`, state, true, { section })
  const sort = { sort: state.sort, dir: state.dir, onSort: (c: string, d: 'asc' | 'desc') => update({ sort: c, dir: d }) }
  const title = section === 'apex' ? 'Apex classes granted' : 'Flows granted'
  const back = isGroup ? `/orgs/${orgId}/permission-set-groups/${psId}` : `/orgs/${orgId}/permission-sets/${psId}`
  return (
    <div className="space-y-6">
      <Breadcrumbs crumbs={[{ label: isGroup ? 'Permission set group' : 'Permission set', href: back }, { label: title }]} />
      <PageHeader icon={Settings} title={title} />
      <Card variant="bordered">
        <CardContent className="pt-6">
          <div className="mb-3 flex"><ListSearch value={state.q} onChange={(q) => update({ q })} placeholder={section === 'apex' ? 'Search classes...' : 'Search flows...'} /></div>
          {error ? (
            <p className="py-4 text-sm text-grove-ink/70 dark:text-grove-ink-dk/70">{(error as Error).message}</p>
          ) : isLoading || !data ? (
            <TableSkeleton rows={10} />
          ) : data.total === 0 ? (
            <p className="py-4 text-sm text-grove-ink/65 dark:text-grove-ink-dk/65">{state.q ? `Nothing matches “${state.q}”.` : 'None.'}</p>
          ) : (
            <>
              <div className="overflow-auto">
                {section === 'apex' ? <ApexTable rows={data.items} sort={sort} /> : <FlowsTable rows={data.items} sort={sort} />}
              </div>
              <Pagination page={data.page} pageSize={data.page_size} total={data.total} label={section}
                onPage={(page) => update({ page })} onPageSize={(pageSize) => update({ pageSize })} />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
