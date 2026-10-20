'use client'

/** Everything that references a field, paged (View all from the cleanup impact card). */

import { useParams } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { Breadcrumbs } from '@/components/shared/Breadcrumbs'
import { Card, CardContent } from '@/components/shared/Card'
import { ImpactVerdict, ReferencesTable, type FieldImpact, type ImpactReference } from '@/components/schema/CleanupImpact'
import { ListSearch } from '@/components/shared/ListSearch'
import { TableSkeleton } from '@/components/shared/LoadingSkeleton'
import { PageHeader } from '@/components/shared/PageHeader'
import { Pagination } from '@/components/shared/Pagination'
import { useListState } from '@/lib/list/useListState'
import { usePaged } from '@/lib/list/usePaged'

export default function FieldImpactPage() {
  const params = useParams()
  const orgId = params.orgId as string
  const fieldId = decodeURIComponent(params.fieldId as string)
  const { state, update } = useListState('', {})
  const { data, isLoading, error } = usePaged<ImpactReference, { impact: FieldImpact }>(
    ['field-impact', orgId, fieldId], `/orgs/${orgId}/fields/${encodeURIComponent(fieldId)}/impact`, state)
  return (
    <div className="space-y-6">
      <Breadcrumbs crumbs={[
        { label: 'Fields', href: `/orgs/${orgId}/fields` },
        { label: fieldId, href: `/orgs/${orgId}/fields/${encodeURIComponent(fieldId)}` },
        { label: 'Cleanup impact' },
      ]} />
      <PageHeader icon={Trash2} title="Can this field be deleted?" subtitle={<span className="font-mono text-xs">{fieldId}</span>} />
      <Card variant="bordered">
        <CardContent className="space-y-4 pt-6">
          {error ? (
            <p className="text-sm">{(error as Error).message}</p>
          ) : isLoading || !data ? (
            <TableSkeleton rows={8} />
          ) : (
            <>
              <ImpactVerdict impact={data.impact} />
              <ListSearch value={state.q} onChange={(q) => update({ q })} placeholder="Search references..." />
              {data.total === 0 ? (
                <p className="text-sm text-grove-ink/65 dark:text-grove-ink-dk/65">{state.q ? 'Nothing matches.' : 'No references found.'}</p>
              ) : (
                <>
                  <ReferencesTable refs={data.items} />
                  <Pagination page={data.page} pageSize={data.page_size} total={data.total} label="references"
                    onPage={(page) => update({ page })} onPageSize={(pageSize) => update({ pageSize })} />
                </>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
