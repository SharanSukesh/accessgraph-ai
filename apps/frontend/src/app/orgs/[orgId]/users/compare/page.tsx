'use client'

/**
 * User Comparison Page
 * Compare permissions and access between multiple users side by side
 */

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ChevronLeft, GitCompare, Plus, X, AlertCircle } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/shared/Card'
import { Button } from '@/components/shared/Button'
import { Badge } from '@/components/shared/Badge'
import { useUsers } from '@/lib/api/hooks/useUsers'
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api/client'

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
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ChevronLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
            <GitCompare className="h-8 w-8" />
            Compare Users
          </h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            Compare permissions and access between multiple users
          </p>
        </div>
      </div>

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
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              />
              {searchTerm && filteredUsers && filteredUsers.length > 0 && (
                <div className="absolute z-10 w-full mt-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                  {filteredUsers.slice(0, 10).map((user) => (
                    <button
                      key={user.id}
                      onClick={() => addUser(user.salesforceUserId)}
                      className="w-full px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 border-b border-gray-200 dark:border-gray-700 last:border-b-0 text-left"
                    >
                      <div className="text-sm font-medium text-gray-900 dark:text-white">
                        {user.name}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
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
            <AlertCircle className="h-12 w-12 mx-auto text-gray-400 dark:text-gray-600 mb-3" />
            <p className="text-gray-600 dark:text-gray-400">
              Select at least 2 users to compare their permissions
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function UserComparisonView({ orgId, userIds }: { orgId: string; userIds: string[] }) {
  // Fetch access data for all selected users in a single query
  const { data: comparisonData, isLoading } = useQuery({
    queryKey: ['user-access-comparison', orgId, userIds.sort().join(',')],
    queryFn: async () => {
      const results = await Promise.all(
        userIds.map(async (userId) => {
          const [objectAccess, fieldAccess] = await Promise.all([
            apiClient.get(`/orgs/${orgId}/users/${userId}/effective-access/objects`),
            apiClient.get(`/orgs/${orgId}/users/${userId}/effective-access/fields`),
          ])
          return { userId, objectAccess, fieldAccess }
        })
      )
      return results
    },
  })

  const data = comparisonData || []

  if (isLoading) {
    return (
      <Card variant="bordered">
        <CardContent className="py-12 text-center">
          <p className="text-gray-600 dark:text-gray-400">Loading comparison data...</p>
        </CardContent>
      </Card>
    )
  }

  // Collect all unique objects and fields
  const allObjects = new Set<string>()
  const allFields = new Set<string>()

  data.forEach((userData) => {
    userData?.objectAccess?.forEach((obj: any) => allObjects.add(obj.objectName))
    userData?.fieldAccess?.forEach((field: any) => allFields.add(field.fieldName))
  })

  return (
    <div className="space-y-6">
      {/* Object Permissions Comparison */}
      <Card variant="bordered">
        <CardHeader>
          <CardTitle>Object Permissions Comparison</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-700 dark:text-gray-300 sticky left-0 bg-gray-50 dark:bg-gray-800">
                    Object
                  </th>
                  {userIds.map((userId) => (
                    <th
                      key={userId}
                      className="px-4 py-3 text-center font-medium text-gray-700 dark:text-gray-300"
                    >
                      {data.find((d) => d?.userId === userId)?.userId.slice(0, 8)}...
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {Array.from(allObjects)
                  .slice(0, 20)
                  .map((objectName) => {
                    // Find if there are any differences
                    const permissions = userIds.map((userId) => {
                      const userData = data.find((d) => d?.userId === userId)
                      const obj = userData?.objectAccess?.find((o: any) => o.objectName === objectName)
                      return obj?.permissions || {}
                    })

                    const hasDifference =
                      permissions.some((p) => p.canRead) !== permissions.every((p) => p.canRead) ||
                      permissions.some((p) => p.canCreate) !== permissions.every((p) => p.canCreate) ||
                      permissions.some((p) => p.canEdit) !== permissions.every((p) => p.canEdit) ||
                      permissions.some((p) => p.canDelete) !== permissions.every((p) => p.canDelete)

                    return (
                      <tr
                        key={objectName}
                        className={
                          hasDifference ? 'bg-yellow-50 dark:bg-yellow-900/10' : ''
                        }
                      >
                        <td className="px-4 py-3 font-medium text-gray-900 dark:text-white sticky left-0 bg-white dark:bg-gray-900">
                          {objectName}
                          {hasDifference && (
                            <Badge variant="warning" size="sm" className="ml-2">
                              Differs
                            </Badge>
                          )}
                        </td>
                        {userIds.map((userId) => {
                          const userData = data.find((d) => d?.userId === userId)
                          const obj = userData?.objectAccess?.find(
                            (o: any) => o.objectName === objectName
                          )
                          return (
                            <td key={userId} className="px-4 py-3 text-center">
                              <div className="flex flex-wrap justify-center gap-1">
                                {obj?.permissions?.canRead && (
                                  <Badge variant="success" size="sm">
                                    R
                                  </Badge>
                                )}
                                {obj?.permissions?.canCreate && (
                                  <Badge variant="success" size="sm">
                                    C
                                  </Badge>
                                )}
                                {obj?.permissions?.canEdit && (
                                  <Badge variant="success" size="sm">
                                    E
                                  </Badge>
                                )}
                                {obj?.permissions?.canDelete && (
                                  <Badge variant="success" size="sm">
                                    D
                                  </Badge>
                                )}
                                {!obj && <span className="text-gray-400">-</span>}
                              </div>
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          </div>
          {allObjects.size > 20 && (
            <p className="mt-4 text-sm text-gray-500 dark:text-gray-400 text-center">
              Showing first 20 of {allObjects.size} objects
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
