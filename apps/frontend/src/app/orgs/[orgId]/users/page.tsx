'use client'

/**
 * Users List Page
 * Browse and search users with filtering
 */

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Search, Filter, GitCompare, Download, Users as UsersIcon } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/shared/Card'
import { Button } from '@/components/shared/Button'
import { exportStamp, exportUsersToCSV } from '@/lib/utils/exports'
import { RiskBadge, Badge } from '@/components/shared/Badge'
import { TableSkeleton } from '@/components/shared/LoadingSkeleton'
import { ErrorState } from '@/components/shared/ErrorState'
import { EmptyState } from '@/components/shared/EmptyState'
import { PageHeader } from '@/components/shared/PageHeader'
import { VisualDownloadButton } from '@/components/imagePack/VisualDownloadButton'
import { MaskedUsersBanner, PrivacyGate, PrivacyUnavailable } from '@/components/shared/PrivacyNotice'
import { isPrivacyModeError } from '@/lib/api/client'
import { useAuth } from '@/lib/auth/AuthContext'
import { privacyModeOf } from '@/lib/privacy'
import { Reveal } from '@/components/v2/motion'
import { normalizeUser } from '@/lib/api/hooks/useUsers'
import { apiClient } from '@/lib/api/client'
import { useListState } from '@/lib/list/useListState'
import { usePaged } from '@/lib/list/usePaged'
import { Pagination } from '@/components/shared/Pagination'
import { ListSearch } from '@/components/shared/ListSearch'
import { SortHeader } from '@/components/shared/SortHeader'

export default function UsersPage() {
  return (
    <PrivacyGate
      feature="users"
      header={<PageHeader icon={UsersIcon} title="Users" eyebrow="Explore · people" />}
    >
      <UsersContent />
    </PrivacyGate>
  )
}

function UsersContent() {
  const params = useParams()
  const router = useRouter()
  const orgId = params.orgId as string

  const masked = privacyModeOf(useAuth().currentOrg) === 'masked'
  // Paged by the server; page, size, sort, search and filters live in the URL.
  const { state, update } = useListState('', { sort: 'risk', dir: 'desc', filters: ['riskLevel', 'status'] })
  const { data, isLoading, error } = usePaged<any>(['users', orgId], `/orgs/${orgId}/users`, state)
  const users: any[] | undefined = data?.items?.map(normalizeUser)
  const [exporting, setExporting] = useState(false)
  const sortProps = { sort: state.sort, dir: state.dir, onSort: (c: string, d: 'asc' | 'desc') => update({ sort: c, dir: d }), className: 'px-6 py-3' }

  // Exports include every user matching the filters, not just this page.
  const exportAll = async () => {
    setExporting(true)
    try {
      const p = new URLSearchParams()
      if (state.q) p.set('search', state.q)
      if (state.filters.riskLevel) p.set('riskLevel', state.filters.riskLevel)
      if (state.filters.status) p.set('status', state.filters.status)
      p.set('sort', state.sort === 'name' ? 'name' : 'risk')
      const all = await apiClient.get<any[]>(`/orgs/${orgId}/users?${p.toString()}`)
      exportUsersToCSV(all.map(normalizeUser), `users-${exportStamp()}`)
    } finally {
      setExporting(false)
    }
  }

  if (error) {
    if (isPrivacyModeError(error)) return <PrivacyUnavailable message={error.message} />
    return (
      <ErrorState
        message="Failed to load users. Please try again."
        onRetry={() => window.location.reload()}
      />
    )
  }

  return (
    <div className="space-y-6">
      <Reveal>
        <PageHeader
          icon={UsersIcon}
          title="Users"
          subtitle="Browse and investigate user access"
          eyebrow="Explore · people"
          actions={
            <>
            <VisualDownloadButton orgId={orgId} visual="risk_distribution" />
            <Button
              variant="secondary"
              disabled={!data?.total || exporting}
              onClick={exportAll}
              title="Every user matching the search and filters, not just this page"
            >
              <Download className="h-4 w-4 mr-2" />
              {exporting ? 'Exporting…' : 'Export CSV'}
            </Button>
            <Button
              variant="primary"
              onClick={() => router.push(`/orgs/${orgId}/users/compare`)}
            >
              <GitCompare className="h-4 w-4 mr-2" />
              Compare Users
            </Button>
            </>
          }
        />
      </Reveal>

      <MaskedUsersBanner />

      {/* Filters */}
      <Reveal delay={0.05}>
      <Card variant="bordered">
        <CardContent className="py-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <ListSearch value={state.q} onChange={(q) => update({ q })} placeholder="Search users..." />
            <select
              aria-label="Risk level"
              value={state.filters.riskLevel || ''}
              onChange={(e) => update({ filters: { riskLevel: e.target.value } })}
              className="px-4 py-2 border border-grove-border dark:border-grove-border-dk rounded-lg bg-grove-surface dark:bg-grove-surface-dk text-grove-ink dark:text-grove-ink-dk focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            >
              <option value="">All Risk Levels</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
            <select
              aria-label="Status"
              value={state.filters.status || ''}
              onChange={(e) => update({ filters: { status: e.target.value } })}
              className="px-4 py-2 border border-grove-border dark:border-grove-border-dk rounded-lg bg-grove-surface dark:bg-grove-surface-dk text-grove-ink dark:text-grove-ink-dk focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            >
              <option value="">Active and inactive</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        </CardContent>
      </Card>
      </Reveal>

      {/* Users Table */}
      <Reveal delay={0.1}>
      <Card variant="bordered">
        <CardHeader>
          <CardTitle>
            {data ? `${data.total.toLocaleString('en-US')} Users` : 'Users'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <TableSkeleton rows={10} />
          ) : users && users.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-primary-50/40 dark:bg-primary-900/10 border-b border-grove-border dark:border-grove-border-dk">
                  <tr>
                    <SortHeader label="User" column="name" {...sortProps} />
                    <SortHeader label="Role" column="role" {...sortProps} />
                    <SortHeader label="Profile" column="profile" {...sortProps} />
                    <SortHeader label="Risk" column="risk" {...sortProps} />
                    <SortHeader label="Status" column="status" {...sortProps} />
                    <th className="px-6 py-3 text-right v2-micro text-grove-ink/55 dark:text-grove-ink-dk/55">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-grove-surface dark:bg-grove-canvas-dk divide-y divide-gray-200 dark:divide-gray-800">
                  {users.map((user: any) => (
                    <tr
                      key={user.id}
                      className="hover:bg-primary-50/60 dark:hover:bg-primary-900/15 cursor-pointer transition-colors duration-150"
                      onClick={() => router.push(`/orgs/${orgId}/users/${user.salesforceUserId}`)}
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="h-10 w-10 rounded-full bg-primary-100 dark:bg-primary-900 flex items-center justify-center">
                            <span className="text-primary-600 dark:text-primary-400 font-medium text-sm">
                              {user.name?.charAt(0) || 'U'}
                            </span>
                          </div>
                          <div className="ml-4">
                            <div className="text-sm font-medium text-grove-ink dark:text-grove-ink-dk">
                              {user.name}
                            </div>
                            {masked ? (
                              <div className="font-mono text-xs text-grove-ink/55 dark:text-grove-ink-dk/55">
                                {user.salesforceUserId}
                              </div>
                            ) : (
                              <div className="text-sm text-grove-ink/55 dark:text-grove-ink-dk/55">
                                {user.email}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-grove-ink dark:text-grove-ink-dk">
                          {user.role || '-'}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-grove-ink dark:text-grove-ink-dk">
                          {user.profile || '-'}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {user.riskLevel ? (
                          <div className="flex items-center gap-2">
                            <RiskBadge level={user.riskLevel} />
                            {user.riskScore != null && (
                              <span className="text-xs tabular-nums text-grove-ink/60 dark:text-grove-ink-dk/60">
                                {Math.round(user.riskScore)}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-sm text-grove-ink/50 dark:text-grove-ink-dk/50">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <Badge variant={user.isActive ? 'success' : 'default'}>
                          {user.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation()
                            router.push(`/orgs/${orgId}/users/${user.salesforceUserId}`)
                          }}
                        >
                          View Details
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Pagination
                page={data!.page}
                pageSize={data!.page_size}
                total={data!.total}
                label="users"
                onPage={(page) => update({ page })}
                onPageSize={(pageSize) => update({ pageSize })}
              />
            </div>
          ) : (
            <EmptyState
              title="No Users Found"
              description="No users match your current filters"
              icon="users"
            />
          )}
        </CardContent>
      </Card>
      </Reveal>
    </div>
  )
}
