'use client'

/** Active users holding one powerful system permission, paged (from the security summary). */

import Link from 'next/link'
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation'
import { ShieldAlert } from 'lucide-react'
import { Breadcrumbs } from '@/components/shared/Breadcrumbs'
import { Card, CardContent } from '@/components/shared/Card'
import { ListSearch } from '@/components/shared/ListSearch'
import { TableSkeleton } from '@/components/shared/LoadingSkeleton'
import { PageHeader } from '@/components/shared/PageHeader'
import { Pagination } from '@/components/shared/Pagination'
import { SortHeader } from '@/components/shared/SortHeader'
import { useListState } from '@/lib/list/useListState'
import { usePaged } from '@/lib/list/usePaged'

const PERMISSIONS = [['ModifyAllData', 'Modify All Data'], ['ViewAllData', 'View All Data'], ['ManageUsers', 'Manage Users'],
  ['CustomizeApplication', 'Customize Application'], ['AuthorApex', 'Author Apex']] as const
interface Holder { salesforceUserId: string; name: string; profile: string | null; via: string[] }

export default function AdminHoldersPage() {
  const orgId = useParams().orgId as string
  const router = useRouter()
  const pathname = usePathname()
  const search = useSearchParams()
  const permission = search?.get('permission') || 'ModifyAllData'
  const { state, update } = useListState('', {})
  const { data, isLoading, error } = usePaged<Holder>(['admins', orgId, permission], `/orgs/${orgId}/security-summary/admins`, state, true, { permission })
  const sort = { sort: data?.sort ?? state.sort, dir: state.dir, onSort: (c: string, d: 'asc' | 'desc') => update({ sort: c, dir: d }) }
  const label = PERMISSIONS.find(([k]) => k === permission)?.[1] ?? permission
  return (
    <div className="space-y-6">
      <Breadcrumbs crumbs={[{ label: 'Security summary', href: `/orgs/${orgId}/security` }, { label }]} />
      <PageHeader icon={ShieldAlert} title={`Users with ${label}`} subtitle="Active users, through their profile, permission sets or groups (muting applied)." />
      <Card variant="bordered">
        <CardContent className="space-y-3 pt-6">
          <div className="flex flex-wrap gap-3">
            <ListSearch value={state.q} onChange={(q) => update({ q })} placeholder="Search users, profiles, sets..." />
            <select aria-label="Permission" value={permission}
              onChange={(e) => router.replace(`${pathname}?permission=${e.target.value}`, { scroll: false })}
              className="rounded-md bg-grove-surface px-3 py-2 text-sm ring-1 ring-grove-border dark:bg-grove-canvas-dk dark:ring-grove-border-dk">
              {PERMISSIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </div>
          {error ? <p className="text-sm">{(error as Error).message}</p> : isLoading || !data ? <TableSkeleton rows={8} /> : data.total === 0 ? (
            <p className="text-sm text-grove-ink/65 dark:text-grove-ink-dk/65">{state.q ? 'Nobody matches.' : 'No active user holds it.'}</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-grove-border dark:divide-grove-border-dk">
                  <thead><tr>
                    <SortHeader label="User" column="name" {...sort} />
                    <SortHeader label="Profile" column="profile" {...sort} />
                    <th className="px-4 py-2 text-left text-xs font-medium uppercase text-grove-ink/55 dark:text-grove-ink-dk/55">Through</th>
                  </tr></thead>
                  <tbody className="divide-y divide-grove-border dark:divide-grove-border-dk">
                    {data.items.map((u) => (
                      <tr key={u.salesforceUserId}>
                        <td className="px-4 py-2 text-sm"><Link className="text-primary-700 hover:underline dark:text-primary-300" href={`/orgs/${orgId}/users/${u.salesforceUserId}`}>{u.name}</Link></td>
                        <td className="px-4 py-2 text-sm text-grove-ink/65 dark:text-grove-ink-dk/65">{u.profile ?? '—'}</td>
                        <td className="px-4 py-2 text-xs text-grove-ink/65 dark:text-grove-ink-dk/65">{u.via.join(', ')}</td>
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
