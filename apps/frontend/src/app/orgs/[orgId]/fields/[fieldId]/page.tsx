'use client'

/**
 * Field Detail Page
 * Shows detailed information about a Salesforce field including permissions
 */

import { useParams, useRouter } from 'next/navigation'
import { FileText, ChevronLeft, Database, Shield, Key, User } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/shared/Card'
import { PageHeader } from '@/components/shared/PageHeader'
import { Breadcrumbs } from '@/components/shared/Breadcrumbs'
import { Button } from '@/components/shared/Button'
import { Badge } from '@/components/shared/Badge'
import { ErrorState } from '@/components/shared/ErrorState'
import { PageSkeleton, TableSkeleton } from '@/components/shared/LoadingSkeleton'
import { EmptyState } from '@/components/shared/EmptyState'
import { useFieldDetails } from '@/lib/api/hooks/useFields'
import { EncryptionBadge, FieldDetailsCard } from '@/components/schema/FieldMetadata'

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
      <Breadcrumbs
        crumbs={[
          { label: 'Fields', href: `/orgs/${orgId}/fields` },
          { label: field.label || fieldName },
        ]}
      />
      <PageHeader
        icon={FileText}
        title={field.label || fieldName}
        subtitle={
          <span className="flex items-center gap-1.5">
            <Database className="h-3.5 w-3.5" />
            {objectName}
          </span>
        }
        actions={
          <span className="flex items-center gap-2">
            {field.typeLabel && <Badge variant="default" size="sm">{field.typeLabel}</Badge>}
            <EncryptionBadge encryption={field.encryption} />
            {field.isCustom && (
              <Badge variant="info" size="sm">
                Custom
              </Badge>
            )}
          </span>
        }
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card variant="bordered">
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-grove-ink/65 dark:text-grove-ink-dk/65">Total Users</div>
                <div className="text-2xl font-bold text-grove-ink dark:text-grove-ink-dk mt-1">
                  {field.totalUsers}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-primary-50 dark:bg-primary-900/25">
                <User className="h-6 w-6 text-primary-700 dark:text-primary-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card variant="bordered">
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-grove-ink/65 dark:text-grove-ink-dk/65">Profiles</div>
                <div className="text-2xl font-bold text-grove-ink dark:text-grove-ink-dk mt-1">
                  {field.totalProfiles}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-copper-100 dark:bg-copper-900/25">
                <Shield className="h-6 w-6 text-copper-600 dark:text-copper-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card variant="bordered">
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-grove-ink/65 dark:text-grove-ink-dk/65">Permission Sets</div>
                <div className="text-2xl font-bold text-grove-ink dark:text-grove-ink-dk mt-1">
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

      {/* What the field is, from the synced describe (roadmap item 8). */}
      <FieldDetailsCard orgId={orgId} attributes={field.attributes} />

      {field.inheritedFromObject && (
        <p className="text-sm text-grove-ink/65 dark:text-grove-ink-dk/65">
          No field-level security rows name this field, so the access below is the {objectName} object&apos;s.
        </p>
      )}

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
                <thead className="bg-primary-50/40 dark:bg-primary-900/10 border-b border-grove-border dark:border-grove-border-dk">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-grove-ink/55 dark:text-grove-ink-dk/55 uppercase">
                      Profile
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-grove-ink/55 dark:text-grove-ink-dk/55 uppercase">
                      Read
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-grove-ink/55 dark:text-grove-ink-dk/55 uppercase">
                      Edit
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-grove-surface dark:bg-grove-canvas-dk divide-y divide-gray-200 dark:divide-gray-800">
                  {field.profilesWithAccess.map((profile: any) => (
                    <tr key={profile.id} className="hover:bg-primary-50/40 dark:hover:bg-primary-900/15">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-grove-ink dark:text-grove-ink-dk">
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
                <thead className="bg-primary-50/40 dark:bg-primary-900/10 border-b border-grove-border dark:border-grove-border-dk">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-grove-ink/55 dark:text-grove-ink-dk/55 uppercase">
                      Permission Set
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-grove-ink/55 dark:text-grove-ink-dk/55 uppercase">
                      Read
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-grove-ink/55 dark:text-grove-ink-dk/55 uppercase">
                      Edit
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-grove-surface dark:bg-grove-canvas-dk divide-y divide-gray-200 dark:divide-gray-800">
                  {field.permissionSetsWithAccess.map((ps: any) => (
                    <tr key={ps.id} className="hover:bg-primary-50/40 dark:hover:bg-primary-900/15">
                      <td className="px-6 py-4 text-sm font-medium text-grove-ink dark:text-grove-ink-dk">
                        <div>{ps.label || ps.name}</div>
                        {ps.label && ps.name && ps.label !== ps.name && (
                          <div className="text-xs text-grove-ink/55 dark:text-grove-ink-dk/55 mt-1">
                            API Name: {ps.name}
                          </div>
                        )}
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
                <thead className="bg-primary-50/40 dark:bg-primary-900/10 border-b border-grove-border dark:border-grove-border-dk">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-grove-ink/55 dark:text-grove-ink-dk/55 uppercase">
                      User
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-grove-ink/55 dark:text-grove-ink-dk/55 uppercase">
                      Email
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-grove-ink/55 dark:text-grove-ink-dk/55 uppercase">
                      Access Via
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-grove-ink/55 dark:text-grove-ink-dk/55 uppercase">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-grove-surface dark:bg-grove-canvas-dk divide-y divide-gray-200 dark:divide-gray-800">
                  {field.usersWithAccess.map((user: any) => (
                    <tr key={user.salesforceUserId} className="hover:bg-primary-50/40 dark:hover:bg-primary-900/15">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-grove-ink dark:text-grove-ink-dk">
                        {user.name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-grove-ink/65 dark:text-grove-ink-dk/65">
                        {user.email}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-grove-ink/65 dark:text-grove-ink-dk/65">
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
