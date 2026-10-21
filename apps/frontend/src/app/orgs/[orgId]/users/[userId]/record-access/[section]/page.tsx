'use client'

/** One of a user's record access lists (shares, teams, sharing rules, subordinate roles), paged. */

import { useParams } from 'next/navigation'
import { Share2 } from 'lucide-react'
import { Badge } from '@/components/shared/Badge'
import { Breadcrumbs } from '@/components/shared/Breadcrumbs'
import { Card, CardContent } from '@/components/shared/Card'
import { ListSearch } from '@/components/shared/ListSearch'
import { TableSkeleton } from '@/components/shared/LoadingSkeleton'
import { PageHeader } from '@/components/shared/PageHeader'
import { Pagination } from '@/components/shared/Pagination'
import { SortHeader } from '@/components/shared/SortHeader'
import { RECORD_SECTIONS, type RecordSection } from '@/components/users/RecordAccessInfo'
import { useUser } from '@/lib/api/hooks/useUsers'
import { useListState } from '@/lib/list/useListState'
import { usePaged } from '@/lib/list/usePaged'

const TD = 'px-4 py-2 text-sm text-grove-ink dark:text-grove-ink-dk'
const MONO = 'px-4 py-2 font-mono text-xs text-grove-ink/65 dark:text-grove-ink-dk/65'
const TH = 'px-4 py-2 text-left text-xs font-medium uppercase text-grove-ink/55 dark:text-grove-ink-dk/55'

const DEFAULT_SORT: Record<RecordSection, string> = {
  manualShares: 'record_type', apexShares: 'record_type', teamAccess: 'team', sharingRules: 'record_type', subordinateRoles: 'name',
}

export default function RecordAccessListPage() {
  const params = useParams()
  const orgId = params.orgId as string
  const userId = params.userId as string
  const section = params.section as RecordSection
  const { data: user } = useUser(orgId, userId)
  const { state, update } = useListState('', { sort: DEFAULT_SORT[section] ?? null })
  const { data, isLoading, error } = usePaged<any>(
    ['record-access-list', orgId, userId, section], `/orgs/${orgId}/users/${userId}/record-access`, state, !!RECORD_SECTIONS[section], { section },
  )
  const sort = { sort: state.sort, dir: state.dir, onSort: (c: string, d: 'asc' | 'desc') => update({ sort: c, dir: d }) }
  const title = RECORD_SECTIONS[section] ?? 'Record access'
  const shares = section === 'manualShares' || section === 'apexShares' || section === 'sharingRules'

  return (
    <div className="space-y-6">
      <Breadcrumbs
        crumbs={[
          { label: 'Users', href: `/orgs/${orgId}/users` },
          { label: (user as any)?.name || userId, href: `/orgs/${orgId}/users/${userId}?tab=records` },
          { label: title },
        ]}
      />
      <PageHeader icon={Share2} title={title} subtitle={(user as any)?.name ? `For ${(user as any).name}` : undefined} />
      <Card variant="bordered">
        <CardContent className="pt-6">
          <div className="mb-3 flex"><ListSearch value={state.q} onChange={(q) => update({ q })} placeholder={`Search ${title.toLowerCase()}...`} /></div>
          {error ? (
            <p className="py-4 text-sm text-grove-ink/70 dark:text-grove-ink-dk/70">{(error as Error).message}</p>
          ) : isLoading || !data ? (
            <TableSkeleton rows={10} />
          ) : data.total === 0 ? (
            <p className="py-4 text-sm text-grove-ink/65 dark:text-grove-ink-dk/65">{state.q ? `Nothing matches “${state.q}”.` : 'None.'}</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-primary-50/40 dark:bg-primary-900/10">
                    {shares && (
                      <tr>
                        <SortHeader label="Record type" column="record_type" {...sort} />
                        <SortHeader label="Record ID" column="record" {...sort} />
                        <SortHeader label="Access level" column="access" {...sort} />
                        <th className={TH}>{section === 'apexShares' ? 'Sharing reason' : section === 'sharingRules' ? 'Row cause' : 'Shared to'}</th>
                      </tr>
                    )}
                    {section === 'teamAccess' && (
                      <tr>
                        <SortHeader label="Team" column="team" {...sort} />
                        <th className={TH}>Record</th>
                        <SortHeader label="Role" column="role" {...sort} />
                        <th className={TH}>Access</th>
                      </tr>
                    )}
                    {section === 'subordinateRoles' && (
                      <tr><SortHeader label="Role" column="name" {...sort} /></tr>
                    )}
                  </thead>
                  <tbody className="divide-y divide-grove-border dark:divide-grove-border-dk">
                    {data.items.map((r: any, i: number) =>
                      shares ? (
                        <tr key={i}>
                          <td className={TD}>{r.record_type}</td>
                          <td className={MONO}>{r.record_id}</td>
                          <td className={TD}><Badge variant={r.access_level === 'Edit' ? 'success' : 'info'}>{r.access_level}</Badge></td>
                          <td className={MONO}>{section === 'apexShares' ? (r.sharing_reason ?? r.row_cause) : section === 'sharingRules' ? r.row_cause : r.shared_to}</td>
                        </tr>
                      ) : section === 'teamAccess' ? (
                        <tr key={i}>
                          <td className={TD}><Badge variant="warning">{r.team_type}</Badge></td>
                          <td className={MONO}>{r.record_id}</td>
                          <td className={TD}>{r.role ?? '—'}</td>
                          <td className={TD}>Account: {r.account_access} · Opportunity: {r.opportunity_access} · Case: {r.case_access}</td>
                        </tr>
                      ) : (
                        <tr key={r.role_id ?? i}><td className={TD}>{r.role_name}</td></tr>
                      ),
                    )}
                  </tbody>
                </table>
              </div>
              <Pagination page={data.page} pageSize={data.page_size} total={data.total} label={title.toLowerCase()}
                onPage={(page) => update({ page })} onPageSize={(pageSize) => update({ pageSize })} />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
