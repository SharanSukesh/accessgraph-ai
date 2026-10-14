'use client'

/**
 * User Comparison Page
 * Compare permissions and access between multiple users side by side
 */

import { useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ChevronLeft, GitCompare, Plus, X, AlertCircle } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/shared/Card'
import { PageHeader } from '@/components/shared/PageHeader'
import { Breadcrumbs } from '@/components/shared/Breadcrumbs'
import { Button } from '@/components/shared/Button'
import { Badge } from '@/components/shared/Badge'
import { Reveal } from '@/components/v2/motion'
import { useUsers } from '@/lib/api/hooks/useUsers'
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api/client'
import { compareObjects, type ObjectPerms } from '@/lib/compare/objectCompare'

export default function UserComparePage() {
  const params = useParams()
  const router = useRouter()
  const orgId = params.orgId as string

  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([])
  const [searchTerm, setSearchTerm] = useState('')

  const { data: users } = useUsers(orgId)

  // Filter users for search
  const filteredUsers = users?.filter(
    (user) =>
      !selectedUserIds.includes(user.salesforceUserId) &&
      (user.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.email?.toLowerCase().includes(searchTerm.toLowerCase()))
  )

  const addUser = (userId: string) => {
    if (selectedUserIds.length < 4) {
      setSelectedUserIds([...selectedUserIds, userId])
      setSearchTerm('')
    }
  }

  const removeUser = (userId: string) => {
    setSelectedUserIds(selectedUserIds.filter((id) => id !== userId))
  }

  const selectedUsers = users?.filter((u) => selectedUserIds.includes(u.salesforceUserId)) || []

  return (
    <div className="space-y-6">
      <Reveal>
        <Breadcrumbs
          crumbs={[
            { label: 'Users', href: `/orgs/${orgId}/users` },
            { label: 'Compare' },
          ]}
        />
      </Reveal>
      <Reveal delay={0.05}>
        <PageHeader
          icon={GitCompare}
          title="Compare Users"
          subtitle="Compare permissions and access between multiple users"
          eyebrow="Explore · compare"
        />
      </Reveal>

      {/* User Selection */}
      <Card variant="bordered">
        <CardHeader>
          <CardTitle>Select Users to Compare ({selectedUserIds.length}/4)</CardTitle>
        </CardHeader>
        <CardContent>
          {/* Selected Users */}
          {selectedUsers.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              {selectedUsers.map((user) => (
                <div
                  key={user.salesforceUserId}
                  className="flex items-center gap-2 bg-primary-50 dark:bg-primary-900/20 px-3 py-2 rounded-lg"
                >
                  <span className="text-sm font-medium text-primary-900 dark:text-primary-100">
                    {user.name}
                  </span>
                  <button
                    onClick={() => removeUser(user.salesforceUserId)}
                    className="text-primary-600 dark:text-primary-400 hover:text-primary-800 dark:hover:text-primary-200"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* User Search */}
          {selectedUserIds.length < 4 && (
            <div className="relative">
              <input
                type="text"
                placeholder="Search for users to add..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-4 py-2 border border-grove-border dark:border-grove-border-dk rounded-lg bg-grove-surface dark:bg-grove-surface-dk text-grove-ink dark:text-grove-ink-dk"
              />
              {searchTerm && filteredUsers && filteredUsers.length > 0 && (
                <div className="absolute z-10 w-full mt-2 bg-grove-surface dark:bg-grove-surface-dk border border-grove-border dark:border-grove-border-dk rounded-lg shadow-lg max-h-60 overflow-y-auto">
                  {filteredUsers.slice(0, 10).map((user) => (
                    <button
                      key={user.id}
                      onClick={() => addUser(user.salesforceUserId)}
                      className="w-full px-4 py-3 hover:bg-primary-50/40 dark:hover:bg-primary-900/15 border-b border-grove-border dark:border-grove-border-dk last:border-b-0 text-left"
                    >
                      <div className="text-sm font-medium text-grove-ink dark:text-grove-ink-dk">
                        {user.name}
                      </div>
                      <div className="text-xs text-grove-ink/55 dark:text-grove-ink-dk/55">
                        {user.email}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Comparison Results */}
      {selectedUserIds.length >= 2 ? (
        <UserComparisonView orgId={orgId} userIds={selectedUserIds} />
      ) : (
        <Card variant="bordered">
          <CardContent className="py-12 text-center">
            <AlertCircle className="h-12 w-12 mx-auto text-grove-ink/45 dark:text-grove-ink-dk/45 mb-3" />
            <p className="text-grove-ink/65 dark:text-grove-ink-dk/65">
              Select at least 2 users to compare their permissions
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

interface UserAccessData {
  userId: string
  userName: string
  objectAccess: any[]
}

const PAGE_SIZE = 100

function PermBadges({ perms }: { perms: ObjectPerms | null }) {
  if (!perms) return <span className="text-grove-ink/50 dark:text-grove-ink-dk/50">-</span>
  const letters = ([['canRead', 'R'], ['canCreate', 'C'], ['canEdit', 'E'], ['canDelete', 'D']] as const)
    .filter(([k]) => perms[k])
  return (
    <div className="flex flex-wrap justify-center gap-1">
      {letters.map(([k, letter]) => (
        <Badge key={k} variant="success" size="sm">
          {letter}
        </Badge>
      ))}
    </div>
  )
}

function UserComparisonView({ orgId, userIds }: { orgId: string; userIds: string[] }) {
  const { data: users } = useUsers(orgId)
  const [objectSearch, setObjectSearch] = useState('')
  const [differencesOnly, setDifferencesOnly] = useState(false)
  const [visible, setVisible] = useState(PAGE_SIZE)

  // Fetch access data for all selected users in a single query
  const { data: comparisonData, isLoading } = useQuery<UserAccessData[]>({
    queryKey: ['user-access-comparison', orgId, [...userIds].sort().join(',')],
    queryFn: async (): Promise<UserAccessData[]> =>
      Promise.all(
        userIds.map(async (userId): Promise<UserAccessData> => {
          const access = await apiClient.get<{ objects: any[] }>(
            `/orgs/${orgId}/users/${userId}/effective-access/objects`
          )
          const user = users?.find((u) => u.salesforceUserId === userId)
          return {
            userId,
            userName: user?.name || userId.slice(0, 8) + '...',
            objectAccess: access?.objects ?? [],
          }
        })
      ),
    enabled: !!users, // Only run when users data is available
  })

  const data: UserAccessData[] = useMemo(() => comparisonData || [], [comparisonData])
  const allRows = useMemo(() => compareObjects(data, userIds), [data, userIds])
  const rows = useMemo(
    () => compareObjects(data, userIds, { search: objectSearch, differencesOnly }),
    [data, userIds, objectSearch, differencesOnly]
  )

  if (isLoading) {
    return (
      <Card variant="bordered">
        <CardContent className="py-12 text-center">
          <p className="text-grove-ink/65 dark:text-grove-ink-dk/65">Loading comparison data...</p>
        </CardContent>
      </Card>
    )
  }

  const differing = allRows.filter((r) => r.differs).length

  return (
    <div className="space-y-6">
      {/* Object Permissions Comparison */}
      <Reveal>
      <Card variant="bordered">
        <CardHeader>
          <CardTitle>Object Permissions Comparison</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <input
              type="search"
              value={objectSearch}
              onChange={(e) => {
                setObjectSearch(e.target.value)
                setVisible(PAGE_SIZE)
              }}
              placeholder="Search objects"
              className="w-56 rounded-md border border-grove-border bg-grove-canvas px-3 py-1.5 text-sm text-grove-ink dark:border-grove-border-dk dark:bg-grove-surface-dk dark:text-grove-ink-dk"
            />
            <label className="flex items-center gap-2 text-sm text-grove-ink/80 dark:text-grove-ink-dk/80">
              <input
                type="checkbox"
                checked={differencesOnly}
                onChange={(e) => {
                  setDifferencesOnly(e.target.checked)
                  setVisible(PAGE_SIZE)
                }}
                className="rounded border-grove-border dark:border-grove-border-dk"
              />
              Differences only
            </label>
            <span className="text-xs text-grove-ink/55 dark:text-grove-ink-dk/55">
              {allRows.length} objects, {differing} differ
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-primary-50/40 dark:bg-primary-900/10">
                <tr>
                  <th className="px-4 py-3 text-left v2-micro text-grove-ink/55 dark:text-grove-ink-dk/55 sticky left-0 bg-primary-50/40 dark:bg-primary-900/10">
                    Object
                  </th>
                  {userIds.map((userId) => (
                    <th
                      key={userId}
                      className="px-4 py-3 text-center v2-micro text-grove-ink/55 dark:text-grove-ink-dk/55"
                    >
                      {data.find((d) => d?.userId === userId)?.userName || 'Loading...'}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-grove-border dark:divide-grove-border-dk">
                {rows.slice(0, visible).map((row) => (
                  <tr key={row.objectName} className={row.differs ? 'bg-yellow-50 dark:bg-yellow-900/10' : ''}>
                    <td className="px-4 py-3 font-medium text-grove-ink dark:text-grove-ink-dk sticky left-0 bg-grove-surface dark:bg-grove-canvas-dk">
                      {row.objectName}
                      {row.differs && (
                        <Badge variant="warning" size="sm" className="ml-2">
                          Differs
                        </Badge>
                      )}
                    </td>
                    {row.perms.map((perms, i) => (
                      <td key={userIds[i]} className="px-4 py-3 text-center">
                        <PermBadges perms={perms} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length === 0 && (
            <p className="mt-4 text-sm text-grove-ink/55 dark:text-grove-ink-dk/55 text-center">
              {differencesOnly ? 'No differences' : 'No objects'}
              {objectSearch ? ` match "${objectSearch}"` : ''}.
            </p>
          )}
          {rows.length > visible && (
            <div className="mt-4 flex items-center justify-center gap-3 text-sm text-grove-ink/55 dark:text-grove-ink-dk/55">
              Showing {visible} of {rows.length} objects
              <Button variant="secondary" size="sm" onClick={() => setVisible((v) => v + PAGE_SIZE)}>
                Show {Math.min(PAGE_SIZE, rows.length - visible)} more
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
      </Reveal>
    </div>
  )
}
