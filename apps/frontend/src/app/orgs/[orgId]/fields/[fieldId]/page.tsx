'use client'

/**
 * Field Detail Page
 * Shows detailed information about a Salesforce field including permissions
 */

import { useParams, useRouter } from 'next/navigation'
import { FileText, ChevronLeft, Database, Shield, Key, User } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/shared/Card'
import { Button } from '@/components/shared/Button'
import { Badge } from '@/components/shared/Badge'
import { ErrorState } from '@/components/shared/ErrorState'
import { PageSkeleton, TableSkeleton } from '@/components/shared/LoadingSkeleton'
import { EmptyState } from '@/components/shared/EmptyState'
import { useFieldDetails } from '@/lib/api/hooks/useFields'

export default function FieldDetailPage() {
  const params = useParams()
  const router = useRouter()
  const orgId = params.orgId as string
  const fieldId = decodeURIComponent(params.fieldId as string)

  const { data: field, isLoading, error } = useFieldDetails(orgId, fieldId)

  // Parse fieldId which is in format "ObjectName.FieldName"
  const [objectName, fieldName] = fieldId.split('.')

  if (error) {
    return (
      <ErrorState
        message="Failed to load field details. Please try again."
        onRetry={() => window.location.reload()}
      />
    )
  }

  if (isLoading) {
    return <PageSkeleton />
  }

  if (!field) {
    return (
      <EmptyState
        title="Field Not Found"
        description="The requested field could not be found"
        icon="file-text"
        action={{ label: 'Back to Fields', onClick: () => router.push(`/orgs/${orgId}/fields`) }}
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
              <FileText className="h-6 w-6 text-primary-600 dark:text-primary-400" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                {field.label || fieldName}
              </h1>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400 flex items-center gap-2">
                <Database className="h-4 w-4" />
                {objectName}
              </p>
            </div>
            {field.isCustom && (
              <Badge variant="info" size="sm">
                Custom
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card variant="bordered">
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Total Users</div>
                <div className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                  {field.totalUsers}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-blue-100 dark:bg-blue-900">
                <User className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card variant="bordered">
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Profiles</div>
                <div className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                  {field.totalProfiles}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-purple-100 dark:bg-purple-900">
                <Shield className="h-6 w-6 text-purple-600 dark:text-purple-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card variant="bordered">
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Permission Sets</div>
                <div className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                  {field.totalPermissionSets}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-green-100 dark:bg-green-900">
                <Key className="h-6 w-6 text-green-600 dark:text-green-400" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Profiles with Access */}
      {field.profilesWithAccess && field.profilesWithAccess.length > 0 && (
        <Card variant="bordered">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Profiles with Access
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                      Profile
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                      Read
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                      Edit
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-800">
                  {field.profilesWithAccess.map((profile: any) => (
                    <tr key={profile.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                        {profile.name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        {profile.read ? (
                          <Badge variant="success" size="sm">Yes</Badge>
                        ) : (
                          <Badge variant="default" size="sm">No</Badge>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        {profile.edit ? (
                          <Badge variant="success" size="sm">Yes</Badge>
                        ) : (
                          <Badge variant="default" size="sm">No</Badge>
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
      {field.permissionSetsWithAccess && field.permissionSetsWithAccess.length > 0 && (
        <Card variant="bordered">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              Permission Sets with Access
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                      Permission Set
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                      Read
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                      Edit
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-800">
                  {field.permissionSetsWithAccess.map((ps: any) => (
                    <tr key={ps.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                        {ps.label || ps.name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        {ps.read ? (
                          <Badge variant="success" size="sm">Yes</Badge>
                        ) : (
                          <Badge variant="default" size="sm">No</Badge>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        {ps.edit ? (
                          <Badge variant="success" size="sm">Yes</Badge>
                        ) : (
                          <Badge variant="default" size="sm">No</Badge>
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
      {field.usersWithAccess && field.usersWithAccess.length > 0 && (
        <Card variant="bordered">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Users with Access
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                      User
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                      Email
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
                  {field.usersWithAccess.map((user: any) => (
                    <tr key={user.salesforceUserId} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                        {user.name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                        {user.email}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                        {user.accessVia}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => router.push(`/orgs/${orgId}/users/${user.salesforceUserId}`)}
                        >
                          View Details
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
