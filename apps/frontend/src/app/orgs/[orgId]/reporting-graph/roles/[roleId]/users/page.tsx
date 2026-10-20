'use client'

/** Users in one role: the full list, paged (View all from the role panel). */

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Users2 } from 'lucide-react'
import { RiskBadge } from '@/components/shared/Badge'
import { Breadcrumbs } from '@/components/shared/Breadcrumbs'
import { Card, CardContent } from '@/components/shared/Card'
import { ListSearch } from '@/components/shared/ListSearch'
import { TableSkeleton } from '@/components/shared/LoadingSkeleton'
import { PageHeader } from '@/components/shared/PageHeader'
import { Pagination } from '@/components/shared/Pagination'
import { SortHeader } from '@/components/shared/SortHeader'
import { useRoleHierarchy } from '@/lib/api/hooks/useRoleHierarchy'
import { useListState } from '@/lib/list/useListState'
import { usePaged } from '@/lib/list/usePaged'
import type { RoleUser } from '@/lib/roleHierarchy'

const TD = 'px-4 py-2 text-sm text-grove-ink dark:text-grove-ink-dk'
const MUTED = 'text-grove-ink/65 dark:text-grove-ink-dk/65'
const SELECT = 'rounded-md px-3 py-2 text-sm bg-grove-surface dark:bg-grove-canvas-dk ring-1 ring-grove-border dark:ring-grove-border-dk text-grove-ink dark:text-grove-ink-dk'

export default function RoleUsersPage() {
  const params = useParams()
  const orgId = params.orgId as string
  const roleId = decodeURIComponent(params.roleId as string)
  const { state, update } = useListState('', { sort: null, filters: ['status'] })
  const filters: Record<string, string> = state.filters.status ? { status: state.filters.status } : {}
  const { data, isLoading, error } = usePaged<RoleUser>(['role-users-list', orgId, roleId], `/orgs/${orgId}/roles/${encodeURIComponent(roleId)}/users`, { ...state, filters })
  const { data: h } = useRoleHierarchy(orgId, 5, 6)
  const role = h?.roles[roleId]
  const sort = { sort: state.sort, dir: state.dir, onSort: (c: string, d: 'asc' | 'desc') => update({ sort: c, dir: d }) }

  return (
    <div className="space-y-6">
      <Breadcrumbs crumbs={[
        { label: 'Org Chart', href: `/orgs/${orgId}/reporting-graph?view=roles` },
        { label: role?.name ?? 'Role' },
        { label: 'Users' },
      ]} />
      <PageHeader icon={Users2} title={`Users in ${role?.name ?? 'this role'}`}
        subtitle="Active users first, riskiest first, until you sort by a column." />
      <Card variant="bordered">
        <CardContent className="pt-6">
          <div className="mb-3 flex flex-wrap gap-3">
            <ListSearch value={state.q} onChange={(q) => update({ q })} placeholder="Search name or profile..." />
            <select aria-label="Status" className={SELECT} value={state.filters.status || ''}
              onChange={(e) => update({ filters: { status: e.target.value } })}>
              <option value="">Active and inactive</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
          {error ? (
            <p className={`py-4 text-sm ${MUTED}`}>{(error as Error).message}</p>
          ) : isLoading || !data ? (
            <TableSkeleton rows={10} />
          ) : data.total === 0 ? (
            <p className={`py-4 text-sm ${MUTED}`}>{state.q || state.filters.status ? 'Nobody matches the search or filter.' : 'No users in this role.'}</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-grove-border dark:divide-grove-border-dk">
                  <thead>
                    <tr>
                      <SortHeader label="Name" column="name" {...sort} />
                      <SortHeader label="Profile" column="profile" {...sort} />
                      <SortHeader label="Risk" column="risk" {...sort} />
                      <SortHeader label="Last login" column="last_login" align="right" {...sort} />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-grove-border dark:divide-grove-border-dk">
                    {data.items.map((u) => (
                      <tr key={u.id} className={u.is_active ? '' : 'opacity-60'}>
                        <td className={TD}>
                          <Link className="text-primary-700 hover:underline dark:text-primary-300" href={`/orgs/${orgId}/users/${u.id}`}>{u.name}</Link>
                          {!u.is_active && <span className={`ml-1 text-xs ${MUTED}`}>(inactive)</span>}
                        </td>
                        <td className={`${TD} ${MUTED}`}>{u.profile ?? '—'}</td>
                        <td className={TD}>
                          {u.risk_level ? <RiskBadge level={u.risk_level as 'low' | 'medium' | 'high' | 'critical'} size="sm" prefix={`${u.risk_score ?? ''} `} /> : <span className={MUTED}>Not scored</span>}
                        </td>
                        <td className={`v2-num ${TD} text-right ${MUTED}`}>
                          {u.last_login_at ? new Date(u.last_login_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Never'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination page={data.page} pageSize={data.page_size} total={data.total} label="users"
                onPage={(page) => update({ page })} onPageSize={(pageSize) => update({ pageSize })} />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
