'use client'

/** A permission set's users, object permissions or field permissions: the full list, paged. */

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Key } from 'lucide-react'
import { Badge } from '@/components/shared/Badge'
import { Breadcrumbs } from '@/components/shared/Breadcrumbs'
import { Card, CardContent } from '@/components/shared/Card'
import { ListSearch } from '@/components/shared/ListSearch'
import { TableSkeleton } from '@/components/shared/LoadingSkeleton'
import { PageHeader } from '@/components/shared/PageHeader'
import { Pagination } from '@/components/shared/Pagination'
import { SortHeader } from '@/components/shared/SortHeader'
import { useListState } from '@/lib/list/useListState'
import { usePaged } from '@/lib/list/usePaged'

const KINDS = { users: 'Users with this permission set', objects: 'Object permissions granted', fields: 'Field permissions' } as const
type Kind = keyof typeof KINDS
const TD = 'px-3 py-2 text-sm text-grove-ink dark:text-grove-ink-dk'
const SELECT = 'rounded-md px-3 py-2 text-sm bg-grove-surface dark:bg-grove-canvas-dk ring-1 ring-grove-border dark:ring-grove-border-dk text-grove-ink dark:text-grove-ink-dk'

export default function PermissionSetListPage() {
  const params = useParams()
  const orgId = params.orgId as string
  const psId = params.psId as string
  const kind = params.kind as Kind
  const { state, update } = useListState('', { sort: kind === 'users' ? 'name' : 'object', filters: ['assignment', 'object'] })
  const filters: Record<string, string> = {}
  if (kind === 'users' && state.filters.assignment) filters.assignment = state.filters.assignment
  if (kind === 'fields' && state.filters.object) filters.object = state.filters.object
  const { data, isLoading, error } = usePaged<any>(
    ['ps-list', orgId, psId, kind], `/orgs/${orgId}/permission-sets/${psId}/list/${kind}`, { ...state, filters }, !!KINDS[kind])
  const sort = { sort: state.sort, dir: state.dir, onSort: (c: string, d: 'asc' | 'desc') => update({ sort: c, dir: d }) }
  const title = KINDS[kind] ?? 'Permission set'
  const tick = (v: boolean) => (v ? '✓' : '')

  return (
    <div className="space-y-6">
      <Breadcrumbs crumbs={[
        { label: data?.label || 'Permission set', href: `/orgs/${orgId}/permission-sets/${psId}` },
        { label: title },
      ]} />
      <PageHeader icon={Key} title={title} subtitle={data?.label} />
      <Card variant="bordered">
        <CardContent className="pt-6">
          <div className="mb-3 flex flex-wrap gap-3">
            <ListSearch value={state.q} onChange={(q) => update({ q })} placeholder={kind === 'users' ? 'Search users...' : kind === 'objects' ? 'Search objects...' : 'Search fields...'} />
            {kind === 'users' && (
              <select aria-label="Assignment" className={SELECT} value={state.filters.assignment || ''}
                onChange={(e) => update({ filters: { assignment: e.target.value } })}>
                <option value="">Direct and through groups</option>
                <option value="direct">Direct</option>
                <option value="via_psg">Through a group</option>
              </select>
            )}
            {kind === 'fields' && (
              <div className="md:w-64">
                <ListSearch value={state.filters.object || ''} onChange={(v) => update({ filters: { object: v } })} placeholder="Object (exact API name)" />
              </div>
            )}
          </div>
          {error ? (
            <p className="py-4 text-sm text-grove-ink/70 dark:text-grove-ink-dk/70">{(error as Error).message}</p>
          ) : isLoading || !data ? (
            <TableSkeleton rows={10} />
          ) : data.total === 0 ? (
            <p className="py-4 text-sm text-grove-ink/65 dark:text-grove-ink-dk/65">{state.q || Object.keys(filters).length ? 'Nothing matches the search or filter.' : 'None.'}</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-grove-border dark:divide-grove-border-dk">
                  <thead>
                    {kind === 'users' && (
                      <tr>
                        <SortHeader label="Name" column="name" {...sort} />
                        <th className="px-3 py-2 text-left text-xs uppercase text-grove-ink/55 dark:text-grove-ink-dk/55">Email</th>
                        <SortHeader label="Assignment" column="assignment" {...sort} />
                        <SortHeader label="Status" column="status" {...sort} />
                      </tr>
                    )}
                    {kind === 'objects' && (
                      <tr>
                        <SortHeader label="Object" column="object" {...sort} />
                        {(['read', 'create', 'edit', 'delete', 'viewAll', 'modifyAll'] as const).map((f) => (
                          <SortHeader key={f} label={{ read: 'R', create: 'C', edit: 'E', delete: 'D', viewAll: 'View All', modifyAll: 'Modify All' }[f]} column={f} align="center" {...sort} />
                        ))}
                      </tr>
                    )}
                    {kind === 'fields' && (
                      <tr>
                        <SortHeader label="Object" column="object" {...sort} />
                        <SortHeader label="Field" column="field" {...sort} />
                        <SortHeader label="Read" column="read" align="center" {...sort} />
                        <SortHeader label="Edit" column="edit" align="center" {...sort} />
                      </tr>
                    )}
                  </thead>
                  <tbody className="divide-y divide-grove-border dark:divide-grove-border-dk">
                    {data.items.map((r: any) => kind === 'users' ? (
                      <tr key={r.id}>
                        <td className={TD}><Link className="text-primary-700 hover:underline dark:text-primary-300" href={`/orgs/${orgId}/users/${r.id}`}>{r.name}</Link></td>
                        <td className={`${TD} text-grove-ink/65 dark:text-grove-ink-dk/65`}>{r.email}</td>
                        <td className={TD}><Badge variant={r.assignmentType === 'direct' ? 'info' : 'default'} size="sm">{r.assignmentType === 'direct' ? 'Direct' : 'via PSG'}</Badge></td>
                        <td className={TD}>{r.isActive ? 'Active' : 'Inactive'}</td>
                      </tr>
                    ) : kind === 'objects' ? (
                      <tr key={r.objectName}>
                        <td className={`${TD} font-mono`}><Link className="text-primary-700 hover:underline dark:text-primary-300" href={`/orgs/${orgId}/objects/${encodeURIComponent(r.objectName)}`}>{r.objectName}</Link></td>
                        {(['read', 'create', 'edit', 'delete', 'viewAll', 'modifyAll'] as const).map((f) => <td key={f} className={`${TD} text-center`}>{tick(r[f])}</td>)}
                      </tr>
                    ) : (
                      <tr key={r.qualifiedId}>
                        <td className={`${TD} font-mono`}>{r.objectName}</td>
                        <td className={`${TD} font-mono`}><Link className="text-primary-700 hover:underline dark:text-primary-300" href={`/orgs/${orgId}/fields/${encodeURIComponent(r.qualifiedId)}`}>{r.fieldName}</Link></td>
                        <td className={`${TD} text-center`}>{tick(r.read)}</td>
                        <td className={`${TD} text-center`}>{tick(r.edit)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination page={data.page} pageSize={data.page_size} total={data.total} label={kind}
                onPage={(page) => update({ page })} onPageSize={(pageSize) => update({ pageSize })} />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
