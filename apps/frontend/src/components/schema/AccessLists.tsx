'use client'

/**
 * Who can access an object or a field (the standing pagination rule):
 * AccessCard shows a count per kind (profiles, permission sets, groups,
 * users), the first 10 rows of the selected tab and "View all";
 * AccessListPage is the full paged, searchable list.
 */

import Link from 'next/link'
import { Check, Minus, Users } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/shared/Card'
import { CardListPreview, PREVIEW_ROWS, PreviewTab, usePreviewTab } from '@/components/shared/CardListPreview'
import { ListSearch } from '@/components/shared/ListSearch'
import { Pagination } from '@/components/shared/Pagination'
import { SortHeader } from '@/components/shared/SortHeader'
import { TableSkeleton } from '@/components/shared/LoadingSkeleton'
import { useListState } from '@/lib/list/useListState'
import { usePaged } from '@/lib/list/usePaged'

export type AccessKind = 'profiles' | 'permission_sets' | 'groups' | 'users'
export const ACCESS_KINDS: { key: AccessKind; label: string }[] = [
  { key: 'profiles', label: 'Profiles' },
  { key: 'permission_sets', label: 'Permission sets' },
  { key: 'groups', label: 'Groups' },
  { key: 'users', label: 'Users' },
]

export interface AccessSummary {
  followsObject: boolean
  kinds: Record<AccessKind, { count: number | null; preview: any[]; unavailable?: string }>
}

type Target = 'objects' | 'fields'
const OBJECT_FLAGS = [
  ['read', 'Read'],
  ['create', 'Create'],
  ['edit', 'Edit'],
  ['delete', 'Delete'],
  ['viewAll', 'View All'],
  ['modifyAll', 'Modify All'],
] as const
const FIELD_FLAGS = [
  ['read', 'Read'],
  ['edit', 'Edit'],
] as const

function flagsFor(target: Target, kind: AccessKind) {
  if (target === 'fields') return FIELD_FLAGS
  return kind === 'users' ? OBJECT_FLAGS.slice(0, 4) : OBJECT_FLAGS
}

const th = 'px-4 py-2 text-left text-xs font-medium uppercase text-grove-ink/55 dark:text-grove-ink-dk/55'
const td = 'px-4 py-2 text-sm text-grove-ink dark:text-grove-ink-dk'

function Flag({ on }: { on: boolean }) {
  return on ? (
    <Check className="h-4 w-4 mx-auto text-emerald-600 dark:text-emerald-400" aria-label="Yes" />
  ) : (
    <Minus className="h-4 w-4 mx-auto text-grove-ink/30 dark:text-grove-ink-dk/30" aria-label="No" />
  )
}

function rowHref(orgId: string, kind: AccessKind, row: any): string {
  if (kind === 'users') return `/orgs/${orgId}/users/${row.salesforceUserId}`
  if (kind === 'profiles') return `/orgs/${orgId}/profiles/${row.id}`
  if (kind === 'groups') return `/orgs/${orgId}/permission-set-groups/${row.id}`
  return `/orgs/${orgId}/permission-sets/${row.id}`
}

export function AccessTable({
  orgId,
  target,
  kind,
  rows,
  sort,
}: {
  orgId: string
  target: Target
  kind: AccessKind
  rows: any[]
  sort?: { sort: string | null; dir: 'asc' | 'desc'; onSort: (c: string, d: 'asc' | 'desc') => void }
}) {
  const flags = flagsFor(target, kind)
  const head = (label: string, column: string, align: 'left' | 'center' | 'right' = 'left') =>
    sort ? (
      <SortHeader key={column} label={label} column={column} align={align} {...sort} />
    ) : (
      <th key={column} className={`${th} text-${align}`}>
        {label}
      </th>
    )
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead className="bg-primary-50/40 dark:bg-primary-900/10 border-b border-grove-border dark:border-grove-border-dk">
          <tr>
            {head(kind === 'users' ? 'User' : 'Name', 'name')}
            {flags.map(([k, label]) =>
              k === 'read' || k === 'edit' ? head(label, k, 'center') : (
                <th key={k} className={`${th} text-center`}>
                  {label}
                </th>
              ),
            )}
            {kind === 'users' ? head('Access via', 'via') : head('Active users', 'users', 'right')}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
          {rows.map((r) => (
            <tr key={r.salesforceUserId || r.id} className="hover:bg-primary-50/40 dark:hover:bg-primary-900/15">
              <td className={td}>
                <Link href={rowHref(orgId, kind, r)} className="font-medium text-primary-700 dark:text-primary-300 hover:underline">
                  {r.name}
                </Link>
                {kind === 'users' && r.username && (
                  <div className="text-xs text-grove-ink/55 dark:text-grove-ink-dk/55">{r.username}</div>
                )}
              </td>
              {flags.map(([k]) => (
                <td key={k} className={`${td} text-center`}>
                  <Flag on={!!r[k]} />
                </td>
              ))}
              {kind === 'users' ? (
                <td className={`${td} text-xs`}>{(r.accessVia || []).join(', ')}</td>
              ) : (
                <td className={`${td} text-right tabular-nums`}>{(r.users ?? 0).toLocaleString('en-US')}</td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** The detail page card: counts per kind, 10 rows of the selected tab, and View all. */
export function AccessCard({
  orgId,
  target,
  targetId,
  summary,
  title,
}: {
  orgId: string
  target: Target
  targetId: string
  summary: AccessSummary
  title: string
}) {
  const tabs: PreviewTab[] = ACCESS_KINDS.map((k) => ({ key: k.key, label: k.label, count: summary.kinds[k.key]?.count ?? null }))
  const [selected, select] = usePreviewTab('access', tabs)
  const kind = selected as AccessKind
  const data = summary.kinds[kind]
  const base = `/orgs/${orgId}/${target}/${encodeURIComponent(targetId)}/access`
  return (
    <Card variant="bordered">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {summary.followsObject && (
          <p className="mb-3 text-sm text-grove-ink/65 dark:text-grove-ink-dk/65">
            No field-level security rows name this field, so its access follows the object.
          </p>
        )}
        <CardListPreview
          tabs={tabs}
          selected={kind}
          onSelect={select}
          shown={PREVIEW_ROWS}
          viewAllHref={`${base}?kind=${kind}`}
          empty={
            data?.unavailable
              ? 'Users aren’t available at this org’s privacy level (metadata only).'
              : `No ${ACCESS_KINDS.find((k) => k.key === kind)?.label.toLowerCase()} have access.`
          }
        >
          <AccessTable orgId={orgId} target={target} kind={kind} rows={data?.preview || []} />
        </CardListPreview>
      </CardContent>
    </Card>
  )
}

/** The full list: paged by the server, searchable and sortable, kept in the URL. */
export function AccessListPage({
  orgId,
  target,
  targetId,
  heading,
}: {
  orgId: string
  target: Target
  targetId: string
  heading: string
}) {
  const { state, update } = useListState('', { sort: 'name', filters: ['kind'] })
  const kind = (ACCESS_KINDS.some((k) => k.key === state.filters.kind) ? state.filters.kind : 'users') as AccessKind
  const { data, isLoading, error } = usePaged<any>(
    ['access', orgId, target, targetId],
    `/orgs/${orgId}/${target}/${encodeURIComponent(targetId)}/access`,
    { ...state, filters: { kind } },
  )
  const sort = { sort: state.sort, dir: state.dir, onSort: (c: string, d: 'asc' | 'desc') => update({ sort: c, dir: d }) }
  return (
    <Card variant="bordered">
      <CardHeader>
        <CardTitle>{heading}</CardTitle>
      </CardHeader>
      <CardContent>
        <div role="tablist" className="flex flex-wrap gap-2 mb-3">
          {ACCESS_KINDS.map((k) => (
            <button
              key={k.key}
              role="tab"
              type="button"
              aria-selected={k.key === kind}
              onClick={() => update({ filters: { kind: k.key } })}
              className={
                'rounded-full px-3 py-1 text-sm font-medium ring-1 ' +
                (k.key === kind
                  ? 'bg-primary-700 text-white ring-primary-700 dark:bg-primary-500 dark:text-grove-canvas-dk dark:ring-primary-500'
                  : 'text-grove-ink dark:text-grove-ink-dk ring-grove-border dark:ring-grove-border-dk hover:bg-primary-50/50 dark:hover:bg-primary-900/20')
              }
            >
              {k.label}
            </button>
          ))}
        </div>
        <div className="mb-3 flex">
          <ListSearch value={state.q} onChange={(q) => update({ q })} placeholder={`Search ${ACCESS_KINDS.find((k) => k.key === kind)?.label.toLowerCase()}...`} />
        </div>
        {error ? (
          <p className="py-4 text-sm text-grove-ink/70 dark:text-grove-ink-dk/70">{(error as Error).message}</p>
        ) : isLoading || !data ? (
          <TableSkeleton rows={10} />
        ) : data.total === 0 ? (
          <p className="py-4 text-sm text-grove-ink/65 dark:text-grove-ink-dk/65">
            {state.q ? `Nothing matches “${state.q}”.` : 'None have access.'}
          </p>
        ) : (
          <>
            <AccessTable orgId={orgId} target={target} kind={kind} rows={data.items} sort={sort} />
            <Pagination
              page={data.page}
              pageSize={data.page_size}
              total={data.total}
              label={kind}
              onPage={(page) => update({ page })}
              onPageSize={(pageSize) => update({ pageSize })}
            />
          </>
        )}
      </CardContent>
    </Card>
  )
}
