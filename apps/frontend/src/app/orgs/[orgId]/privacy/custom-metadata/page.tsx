'use client'

/** Every custom metadata type of the org, paged, with which have their records read (item 11 part c2). */

import { useParams } from 'next/navigation'
import { Database } from 'lucide-react'
import { Breadcrumbs } from '@/components/shared/Breadcrumbs'
import { Card, CardContent } from '@/components/shared/Card'
import { CustomMetadataTable, type CmdtSummary, type CmdtType } from '@/components/privacy/CustomMetadata'
import { ListSearch } from '@/components/shared/ListSearch'
import { TableSkeleton } from '@/components/shared/LoadingSkeleton'
import { PageHeader } from '@/components/shared/PageHeader'
import { Pagination } from '@/components/shared/Pagination'
import { useListState } from '@/lib/list/useListState'
import { usePaged } from '@/lib/list/usePaged'

const SELECT = 'rounded-md px-3 py-2 text-sm bg-grove-surface dark:bg-grove-canvas-dk ring-1 ring-grove-border dark:ring-grove-border-dk text-grove-ink dark:text-grove-ink-dk'

export default function CustomMetadataPage() {
  const orgId = useParams().orgId as string
  const { state, update } = useListState('', { filters: ['enabled'] })
  const { data, isLoading, error } = usePaged<CmdtType, { summary: CmdtSummary }>(
    ['custom-metadata', orgId, 'list'], `/orgs/${orgId}/custom-metadata`, state)
  return (
    <div className="space-y-6">
      <Breadcrumbs crumbs={[{ label: 'Privacy & Data', href: `/orgs/${orgId}/privacy` }, { label: 'Custom metadata' }]} />
      <PageHeader icon={Database} title="Custom metadata records"
        subtitle="Records are read only for the types turned on, from the next sync. Turning a type off removes its records from Newton." />
      <Card variant="bordered">
        <CardContent className="pt-6">
          <div className="mb-3 flex flex-wrap gap-3">
            <ListSearch value={state.q} onChange={(q) => update({ q })} placeholder="Search types..." />
            <select aria-label="Turned on" className={SELECT} value={state.filters.enabled || ''}
              onChange={(e) => update({ filters: { enabled: e.target.value } })}>
              <option value="">On and off</option>
              <option value="true">On</option>
              <option value="false">Off</option>
            </select>
          </div>
          {error ? (
            <p className="py-4 text-sm">{(error as Error).message}</p>
          ) : isLoading || !data ? (
            <TableSkeleton rows={10} />
          ) : data.total === 0 ? (
            <p className="py-4 text-sm text-grove-ink/65 dark:text-grove-ink-dk/65">
              {state.q || state.filters.enabled ? 'No type matches.' : 'No custom metadata types in the last sync.'}
            </p>
          ) : (
            <>
              <CustomMetadataTable orgId={orgId} rows={data.items} summary={data.summary} />
              <Pagination page={data.page} pageSize={data.page_size} total={data.total} label="types"
                onPage={(page) => update({ page })} onPageSize={(pageSize) => update({ pageSize })} />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
