'use client'

/**
 * Object Detail Page
 * Shows detailed information about a Salesforce object including permissions and user access
 */

import { use} from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Database, Shield, Users, ChevronLeft, Check, X } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/shared/Card'
import { Button } from '@/components/shared/Button'
import { Badge } from '@/components/shared/Badge'
import { ErrorState } from '@/components/shared/ErrorState'
import { TableSkeleton } from '@/components/shared/LoadingSkeleton'
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api/client'

interface PermissionDetail {
  id: string
  name: string
  label?: string
  read: boolean
  create: boolean
  edit: boolean
  delete: boolean
  viewAll: boolean
  modifyAll: boolean
}

interface UserAccess {
  salesforceUserId: string
  name: string
  email: string
  accessVia: string
}

interface ObjectDetail {
  name: string
  apiName: string
  label: string
  isCustom: boolean
  profilesWithAccess: PermissionDetail[]
  permissionSetsWithAccess: PermissionDetail[]
  usersWithAccess: UserAccess[]
  totalUsers: number
  totalProfiles: number
  totalPermissionSets: number
}

export default function ObjectDetailPage() {
  const params = useParams()
  const router = useRouter()
  const orgId = params.orgId as string
  const objectName = params.objectName as string

  const { data: objectDetail, isLoading, error } = useQuery({
    queryKey: ['object-detail', orgId, objectName],
    queryFn: async () => {
      return await apiClient.get<ObjectDetail>(
        `/orgs/${orgId}/objects/${objectName}`
      )
    },
    enabled: !!orgId && !!objectName,
  })

  if (error) {
    return (
      <ErrorState
        message="Failed to load object details. Please try again."
        onRetry={() => window.location.reload()}
      />
    )
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.back()}>
            <ChevronLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
        </div>
        <TableSkeleton rows={10} />
      </div>
    )
  }

  if (!objectDetail) {
    return (
      <ErrorState
        message="Object not found"
        onRetry={() => router.back()}
      />
    )
  }

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
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-lg bg-primary-100 dark:bg-primary-900">
              <Database className="h-6 w-6 text-primary-600 dark:text-primary-400" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                {objectDetail.label}
              </h1>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400 font-mono">
                {objectDetail.apiName}
              </p>
            </div>
            {objectDetail.isCustom && (
              <Badge variant="info" size="sm">
                Custom
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card variant="bordered" className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                Total Users with Access
              </p>
              <p className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">
                {objectDetail.totalUsers}
              </p>
            </div>
            <div className="p-3 rounded-lg bg-blue-100 dark:bg-blue-900">
              <Users className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
          </div>
        </Card>

        <Card variant="bordered" className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                Profiles
              </p>
              <p className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">
                {objectDetail.totalProfiles}
              </p>
            </div>
            <div className="p-3 rounded-lg bg-green-100 dark:bg-green-900">
              <Shield className="h-6 w-6 text-green-600 dark:text-green-400" />
            </div>
          </div>
        </Card>

        <Card variant="bordered" className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                Permission Sets
              </p>
              <p className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">
                {objectDetail.totalPermissionSets}
              </p>
            </div>
            <div className="p-3 rounded-lg bg-purple-100 dark:bg-purple-900">
              <Shield className="h-6 w-6 text-purple-600 dark:text-purple-400" />
            </div>
          </div>
        </Card>
      </div>

      {/* Profiles with Access */}
      {objectDetail.profilesWithAccess.length > 0 && (
        <Card variant="bordered">
          <CardHeader>
            <CardTitle>Profiles with Access ({objectDetail.profilesWithAccess.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                      Profile Name
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                      Read
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                      Create
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                      Edit
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                      Delete
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                      View All
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                      Modify All
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-800">
                  {objectDetail.profilesWithAccess.map((profile) => (
                    <tr key={profile.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                        {profile.name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        {profile.read ? (
                          <Check className="h-5 w-5 text-green-600 mx-auto" />
                        ) : (
                          <X className="h-5 w-5 text-gray-400 mx-auto" />
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        {profile.create ? (
                          <Check className="h-5 w-5 text-green-600 mx-auto" />
                        ) : (
                          <X className="h-5 w-5 text-gray-400 mx-auto" />
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        {profile.edit ? (
                          <Check className="h-5 w-5 text-green-600 mx-auto" />
                        ) : (
                          <X className="h-5 w-5 text-gray-400 mx-auto" />
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        {profile.delete ? (
                          <Check className="h-5 w-5 text-green-600 mx-auto" />
                        ) : (
                          <X className="h-5 w-5 text-gray-400 mx-auto" />
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        {profile.viewAll ? (
                          <Check className="h-5 w-5 text-green-600 mx-auto" />
                        ) : (
                          <X className="h-5 w-5 text-gray-400 mx-auto" />
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        {profile.modifyAll ? (
                          <Check className="h-5 w-5 text-green-600 mx-auto" />
                        ) : (
                          <X className="h-5 w-5 text-gray-400 mx-auto" />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Permission Sets with Access */}
      {objectDetail.permissionSetsWithAccess.length > 0 && (
        <Card variant="bordered">
          <CardHeader>
            <CardTitle>Permission Sets with Access ({objectDetail.permissionSetsWithAccess.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                      Permission Set Name
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                      Read
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                      Create
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                      Edit
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                      Delete
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                      View All
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                      Modify All
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-800">
                  {objectDetail.permissionSetsWithAccess.map((ps) => (
                    <tr key={ps.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900 dark:text-white">
                          {ps.label || ps.name}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {ps.name}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        {ps.read ? (
                          <Check className="h-5 w-5 text-green-600 mx-auto" />
                        ) : (
                          <X className="h-5 w-5 text-gray-400 mx-auto" />
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        {ps.create ? (
                          <Check className="h-5 w-5 text-green-600 mx-auto" />
                        ) : (
                          <X className="h-5 w-5 text-gray-400 mx-auto" />
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        {ps.edit ? (
                          <Check className="h-5 w-5 text-green-600 mx-auto" />
                        ) : (
                          <X className="h-5 w-5 text-gray-400 mx-auto" />
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        {ps.delete ? (
                          <Check className="h-5 w-5 text-green-600 mx-auto" />
                        ) : (
                          <X className="h-5 w-5 text-gray-400 mx-auto" />
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        {ps.viewAll ? (
                          <Check className="h-5 w-5 text-green-600 mx-auto" />
                        ) : (
                          <X className="h-5 w-5 text-gray-400 mx-auto" />
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        {ps.modifyAll ? (
                          <Check className="h-5 w-5 text-green-600 mx-auto" />
                        ) : (
                          <X className="h-5 w-5 text-gray-400 mx-auto" />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Users with Access */}
      <Card variant="bordered">
        <CardHeader>
          <CardTitle>Users with Access ({objectDetail.usersWithAccess.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {objectDetail.usersWithAccess.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                      User
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                      Access Via
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-800">
                  {objectDetail.usersWithAccess.map((user) => (
                    <tr
                      key={user.salesforceUserId}
                      className="hover:bg-gray-50 dark:hover:bg-gray-800"
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="flex-shrink-0 h-10 w-10 rounded-full bg-primary-100 dark:bg-primary-900 flex items-center justify-center">
                            <span className="text-sm font-medium text-primary-600 dark:text-primary-400">
                              {user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                            </span>
                          </div>
                          <div className="ml-4">
                            <div className="text-sm font-medium text-gray-900 dark:text-white">
                              {user.name}
                            </div>
                            <div className="text-sm text-gray-500 dark:text-gray-400">
                              {user.email}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <Badge variant="default" size="sm">
                          {user.accessVia}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => router.push(`/orgs/${orgId}/users/${user.salesforceUserId}`)}
                        >
                          View User
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-12">
              <Users className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">
                No users with access
              </h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                No users have access to this object through profiles or permission sets.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
