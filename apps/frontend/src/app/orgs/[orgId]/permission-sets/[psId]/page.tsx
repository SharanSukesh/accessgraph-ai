'use client'

/**
 * Permission Set Detail Page
 *
 * Landing page for the "Show Impact in AccessGraph AI" deep link from the
 * AccessGraph Explorer tab in the Salesforce package. Surfaces:
 *  - Basic PS info (name, label, type, profile binding)
 *  - Users assigned (direct + via Permission Set Group)
 *  - Object permissions granted
 */

import { useParams, useRouter } from 'next/navigation'
import { useState } from 'react'
import { ChevronLeft, Shield, Users, Database, AlertTriangle, FileText, Settings, ChevronDown, ChevronRight } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/shared/Card'
import { Button } from '@/components/shared/Button'
import { Badge } from '@/components/shared/Badge'
import { ErrorState } from '@/components/shared/ErrorState'
import { PageSkeleton } from '@/components/shared/LoadingSkeleton'
import { EmptyState } from '@/components/shared/EmptyState'
import { usePermissionSetDetail } from '@/lib/api/hooks/usePermissionSets'

export default function PermissionSetDetailPage() {
  const params = useParams()
  const router = useRouter()
  const orgId = params.orgId as string
  const psId = params.psId as string

  const { data: ps, isLoading, error } = usePermissionSetDetail(orgId, psId)
  // Field permissions can run hundreds-deep on big PSes; collapse by default
  // so the page doesn't paint a wall of rows. User opens the objects they
  // care about.
  const [expandedFieldGroups, setExpandedFieldGroups] = useState<Record<string, boolean>>({})
  const toggleFieldGroup = (objectName: string) =>
    setExpandedFieldGroups(s => ({ ...s, [objectName]: !s[objectName] }))

  if (error) {
    return (
      <ErrorState
        message="Failed to load permission set details. Please try again."
        onRetry={() => window.location.reload()}
      />
    )
  }

  if (isLoading) return <PageSkeleton />

  if (!ps) {
    return (
      <EmptyState
        title="Permission Set Not Found"
        description="The requested permission set could not be found in this org's last sync."
        icon="default"
        action={{
          label: 'Back to Graph',
          onClick: () => router.push(`/orgs/${orgId}/graph`),
        }}
      />
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ChevronLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`p-3 rounded-lg ${ps.isMuting ? 'bg-red-100 dark:bg-red-900' : 'bg-purple-100 dark:bg-purple-900'}`}>
            <Shield className={`h-6 w-6 ${ps.isMuting ? 'text-red-600 dark:text-red-400' : 'text-purple-600 dark:text-purple-400'}`} />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
              {ps.label}
            </h1>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400 font-mono">
              {ps.name}
            </p>
          </div>
          <div className="flex gap-2 ml-4">
            <Badge variant={ps.isMuting ? 'danger' : 'info'} size="sm">
              {ps.type}
            </Badge>
            {ps.isOwnedByProfile && (
              <Badge variant="default" size="sm">
                Profile-owned
              </Badge>
            )}
          </div>
        </div>
      </div>

      {ps.isMuting && (
        <Card variant="bordered" className="border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950">
          <CardContent className="py-3 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-red-900 dark:text-red-100">
              <strong>Muting Permission Set.</strong> This PS removes permissions
              from users in any Permission Set Group it belongs to. Effective
              access shown in the graph reflects the muting subtraction.
            </div>
          </CardContent>
        </Card>
      )}

      {ps.isOwnedByProfile && ps.profile && (
        <Card variant="bordered">
          <CardContent className="py-3">
            <p className="text-sm text-gray-700 dark:text-gray-300">
              This permission set is the auto-generated container for the
              <strong className="mx-1">{ps.profile.name}</strong>
              profile. Customers cannot edit it directly.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card variant="bordered">
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Users</div>
                <div className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                  {ps.totalUsers}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {ps.totalDirectAssignments} direct
                  {ps.totalViaPsgAssignments > 0 && ` + ${ps.totalViaPsgAssignments} via PSG`}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-blue-100 dark:bg-blue-900">
                <Users className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card variant="bordered">
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Objects</div>
                <div className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                  {ps.totalObjectsGranted}
                </div>
                <div className="text-xs text-gray-500 mt-1">CRUD-level grants</div>
              </div>
              <div className="p-3 rounded-lg bg-green-100 dark:bg-green-900">
                <Database className="h-6 w-6 text-green-600 dark:text-green-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card variant="bordered">
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Fields</div>
                <div className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                  {ps.totalFieldsGranted}
                </div>
                <div className="text-xs text-gray-500 mt-1">Read or Edit FLS</div>
              </div>
              <div className="p-3 rounded-lg bg-amber-100 dark:bg-amber-900">
                <FileText className="h-6 w-6 text-amber-600 dark:text-amber-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card variant="bordered">
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-gray-600 dark:text-gray-400">System Perms</div>
                <div className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                  {ps.totalSystemPermissionsGranted}
                </div>
                <div className="text-xs text-gray-500 mt-1">Org-wide privileges</div>
              </div>
              <div className="p-3 rounded-lg bg-purple-100 dark:bg-purple-900">
                <Settings className="h-6 w-6 text-purple-600 dark:text-purple-400" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {ps.permissionSetGroups.length > 0 && (
        <Card variant="bordered">
          <CardContent className="py-3">
            <p className="text-sm text-gray-700 dark:text-gray-300">
              <strong>Included in {ps.permissionSetGroups.length} Permission Set Group{ps.permissionSetGroups.length === 1 ? '' : 's'}:</strong>
              <span className="ml-2 text-gray-600 dark:text-gray-400">
                {ps.permissionSetGroups.map(g => g.label).join(' · ')}
              </span>
            </p>
          </CardContent>
        </Card>
      )}

      <Card variant="bordered">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            System Permissions
            <Badge variant="default" size="sm">{ps.totalSystemPermissionsGranted}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {ps.totalSystemPermissionsGranted === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 py-4 text-center">
              No high-impact system permissions granted by this PS.
              {' '}
              <span className="text-xs italic">
                (If you expected some, run a sync — earlier syncs didn't pull these fields.)
              </span>
            </p>
          ) : (
            <div className="space-y-4">
              {Object.entries(ps.systemPermissions).map(([category, perms]) => (
                <div key={category}>
                  <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                    {category}
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {perms.map(p => {
                      const isHighRisk =
                        p.apiName === 'PermissionsModifyAllData' ||
                        p.apiName === 'PermissionsViewAllData' ||
                        p.apiName === 'PermissionsManageEncryptionKeys' ||
                        p.apiName === 'PermissionsBulkApiHardDelete' ||
                        p.apiName === 'PermissionsAuthorApex' ||
                        p.apiName === 'PermissionsManageProfilesPermissionsets'
                      return (
                        <Badge
                          key={p.apiName}
                          variant={isHighRisk ? 'danger' : 'info'}
                          size="sm"
                          title={p.apiName}
                        >
                          {p.label}
                        </Badge>
                      )
                    })}
                  </div>
                </div>
              ))}
              <p className="text-xs text-gray-500 mt-3">
                Showing the curated set of {' '}
                <a href="https://developer.salesforce.com/docs/atlas.en-us.object_reference.meta/object_reference/sforce_api_objects_permissionset.htm" target="_blank" rel="noopener noreferrer" className="underline">
                  ~30 most-audited PermissionSet flags
                </a>
                . Salesforce exposes ~250 in total.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card variant="bordered">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Users with this Permission Set
            <Badge variant="default" size="sm">{ps.totalUsers}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {ps.users.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 py-4 text-center">
              No users currently have this permission set assigned.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead>
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Assignment</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {ps.users.map(u => (
                    <tr
                      key={u.id}
                      className="hover:bg-gray-50 dark:hover:bg-gray-900 cursor-pointer"
                      onClick={() => router.push(`/orgs/${orgId}/users/${u.id}`)}
                    >
                      <td className="px-3 py-2 text-sm text-gray-900 dark:text-white">{u.name}</td>
                      <td className="px-3 py-2 text-sm text-gray-600 dark:text-gray-400">{u.email}</td>
                      <td className="px-3 py-2 text-sm">
                        <Badge variant={u.assignmentType === 'direct' ? 'info' : 'default'} size="sm">
                          {u.assignmentType === 'direct' ? 'Direct' : 'via PSG'}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card variant="bordered">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Object Permissions Granted
            <Badge variant="default" size="sm">{ps.totalObjectsGranted}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {ps.objectPermissions.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 py-4 text-center">
              This permission set does not grant any object-level permissions.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead>
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Object</th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">R</th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">C</th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">E</th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">D</th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">View All</th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">Modify All</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {ps.objectPermissions.map(op => (
                    <tr key={op.objectName} className="hover:bg-gray-50 dark:hover:bg-gray-900">
                      <td className="px-3 py-2 text-sm font-mono text-gray-900 dark:text-white">{op.objectName}</td>
                      <td className="px-3 py-2 text-center text-sm">{op.read ? '✓' : ''}</td>
                      <td className="px-3 py-2 text-center text-sm">{op.create ? '✓' : ''}</td>
                      <td className="px-3 py-2 text-center text-sm">{op.edit ? '✓' : ''}</td>
                      <td className="px-3 py-2 text-center text-sm">{op.delete ? '✓' : ''}</td>
                      <td className="px-3 py-2 text-center text-sm">{op.viewAll ? '✓' : ''}</td>
                      <td className="px-3 py-2 text-center text-sm">{op.modifyAll ? '✓' : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card variant="bordered">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Field Permissions
            <Badge variant="default" size="sm">{ps.totalFieldsGranted}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {ps.fieldPermissions.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 py-4 text-center">
              This permission set grants no explicit field-level permissions. Users with this PS access fields through the parent objects' CRUD permissions.
            </p>
          ) : (
            <div className="space-y-2">
              {ps.fieldPermissions.map(group => {
                const isExpanded = !!expandedFieldGroups[group.objectName]
                return (
                  <div key={group.objectName} className="border border-gray-200 dark:border-gray-700 rounded-md">
                    <button
                      type="button"
                      onClick={() => toggleFieldGroup(group.objectName)}
                      className="w-full px-3 py-2 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-900 text-left"
                    >
                      <div className="flex items-center gap-2">
                        {isExpanded ? <ChevronDown className="h-4 w-4 text-gray-500" /> : <ChevronRight className="h-4 w-4 text-gray-500" />}
                        <span className="font-mono text-sm text-gray-900 dark:text-white">{group.objectName}</span>
                      </div>
                      <Badge variant="default" size="sm">{group.fieldCount} fields</Badge>
                    </button>
                    {isExpanded && (
                      <div className="border-t border-gray-200 dark:border-gray-700 overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                          <thead className="bg-gray-50 dark:bg-gray-900">
                            <tr>
                              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Field</th>
                              <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">Read</th>
                              <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase">Edit</th>
                              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase"></th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                            {group.fields.map(f => (
                              <tr key={f.qualifiedId} className="hover:bg-gray-50 dark:hover:bg-gray-900">
                                <td className="px-3 py-2 text-sm font-mono text-gray-900 dark:text-white">{f.fieldName}</td>
                                <td className="px-3 py-2 text-center text-sm">{f.read ? '✓' : ''}</td>
                                <td className="px-3 py-2 text-center text-sm">{f.edit ? '✓' : ''}</td>
                                <td className="px-3 py-2 text-right">
                                  <button
                                    type="button"
                                    onClick={() => router.push(`/orgs/${orgId}/fields/${encodeURIComponent(f.qualifiedId)}`)}
                                    className="text-xs text-primary-600 hover:underline"
                                  >
                                    Open
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
