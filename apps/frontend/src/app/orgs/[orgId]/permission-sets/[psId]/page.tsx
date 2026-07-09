'use client'

/**
 * Permission Set Detail Page
 *
 * Landing page for the "Show Impact in Newton" deep link from the
 * Salesforce Explorer tab in the Salesforce package. Surfaces:
 *  - Basic PS info (name, label, type, profile binding)
 *  - Users assigned (direct + via Permission Set Group)
 *  - Object permissions granted
 */

import { useParams, useRouter } from 'next/navigation'
import { useState } from 'react'
import { ChevronLeft, Shield, Users, Database, AlertTriangle, FileText, Settings, ChevronDown, ChevronRight } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/shared/Card'
import { PageHeader } from '@/components/shared/PageHeader'
import { Breadcrumbs } from '@/components/shared/Breadcrumbs'
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
      <Breadcrumbs
        crumbs={[
          { label: 'Users', href: `/orgs/${orgId}/users` },
          { label: ps.label },
        ]}
      />
      <PageHeader
        icon={Shield}
        title={ps.label}
        subtitle={
          <span className="font-mono text-xs">{ps.name}</span>
        }
        actions={
          <>
            <Badge variant={ps.isMuting ? 'danger' : 'info'} size="sm">
              {ps.type}
            </Badge>
            {ps.isOwnedByProfile && (
              <Badge variant="default" size="sm">
                Profile-owned
              </Badge>
            )}
          </>
        }
      />

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
            <p className="text-sm text-grove-ink/85 dark:text-grove-ink-dk/85">
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
                <div className="text-sm text-grove-ink/65 dark:text-grove-ink-dk/65">Users</div>
                <div className="text-2xl font-bold text-grove-ink dark:text-grove-ink-dk mt-1">
                  {ps.totalUsers}
                </div>
                <div className="text-xs text-grove-ink/55 mt-1">
                  {ps.totalDirectAssignments} direct
                  {ps.totalViaPsgAssignments > 0 && ` + ${ps.totalViaPsgAssignments} via PSG`}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-primary-50 dark:bg-primary-900/25">
                <Users className="h-6 w-6 text-primary-700 dark:text-primary-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card variant="bordered">
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-grove-ink/65 dark:text-grove-ink-dk/65">Objects</div>
                <div className="text-2xl font-bold text-grove-ink dark:text-grove-ink-dk mt-1">
                  {ps.totalObjectsGranted}
                </div>
                <div className="text-xs text-grove-ink/55 mt-1">CRUD-level grants</div>
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
                <div className="text-sm text-grove-ink/65 dark:text-grove-ink-dk/65">Fields</div>
                <div className="text-2xl font-bold text-grove-ink dark:text-grove-ink-dk mt-1">
                  {ps.totalFieldsGranted}
                </div>
                <div className="text-xs text-grove-ink/55 mt-1">Read or Edit FLS</div>
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
                <div className="text-sm text-grove-ink/65 dark:text-grove-ink-dk/65">System Perms</div>
                <div className="text-2xl font-bold text-grove-ink dark:text-grove-ink-dk mt-1">
                  {ps.totalSystemPermissionsGranted}
                </div>
                <div className="text-xs text-grove-ink/55 mt-1">Org-wide privileges</div>
              </div>
              <div className="p-3 rounded-lg bg-copper-100 dark:bg-copper-900/25">
                <Settings className="h-6 w-6 text-copper-600 dark:text-copper-400" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {ps.permissionSetGroups.length > 0 && (
        <Card variant="bordered">
          <CardContent className="py-3">
            <p className="text-sm text-grove-ink/85 dark:text-grove-ink-dk/85">
              <strong>Included in {ps.permissionSetGroups.length} Permission Set Group{ps.permissionSetGroups.length === 1 ? '' : 's'}:</strong>
              <span className="ml-2 text-grove-ink/65 dark:text-grove-ink-dk/65">
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
            <p className="text-sm text-grove-ink/55 dark:text-grove-ink-dk/55 py-4 text-center">
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
                  <h4 className="text-sm font-semibold text-grove-ink/85 dark:text-grove-ink-dk/85 mb-2">
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
              <p className="text-xs text-grove-ink/55 mt-3">
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
            <p className="text-sm text-grove-ink/55 dark:text-grove-ink-dk/55 py-4 text-center">
              No users currently have this permission set assigned.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-grove-border dark:divide-grove-border-dk">
                <thead>
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-grove-ink/55 uppercase">Name</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-grove-ink/55 uppercase">Email</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-grove-ink/55 uppercase">Assignment</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-grove-border dark:divide-grove-border-dk">
                  {ps.users.map(u => (
                    <tr
                      key={u.id}
                      className="hover:bg-primary-50/40 dark:hover:bg-primary-900/15 cursor-pointer"
                      onClick={() => router.push(`/orgs/${orgId}/users/${u.id}`)}
                    >
                      <td className="px-3 py-2 text-sm text-grove-ink dark:text-grove-ink-dk">{u.name}</td>
                      <td className="px-3 py-2 text-sm text-grove-ink/65 dark:text-grove-ink-dk/65">{u.email}</td>
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
            <p className="text-sm text-grove-ink/55 dark:text-grove-ink-dk/55 py-4 text-center">
              This permission set does not grant any object-level permissions.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-grove-border dark:divide-grove-border-dk">
                <thead>
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-grove-ink/55 uppercase">Object</th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-grove-ink/55 uppercase">R</th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-grove-ink/55 uppercase">C</th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-grove-ink/55 uppercase">E</th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-grove-ink/55 uppercase">D</th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-grove-ink/55 uppercase">View All</th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-grove-ink/55 uppercase">Modify All</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-grove-border dark:divide-grove-border-dk">
                  {ps.objectPermissions.map(op => (
                    <tr key={op.objectName} className="hover:bg-primary-50/40 dark:hover:bg-primary-900/15">
                      <td className="px-3 py-2 text-sm font-mono text-grove-ink dark:text-grove-ink-dk">{op.objectName}</td>
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
            Field Access
            <Badge variant="default" size="sm">
              {ps.fieldPermissions.length} explicit · {ps.objectPermissions.length - ps.fieldPermissions.length} inherited
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {ps.objectPermissions.length === 0 ? (
            <p className="text-sm text-grove-ink/55 dark:text-grove-ink-dk/55 py-4 text-center">
              This permission set grants no object-level access, so it provides no field access.
            </p>
          ) : (
            <>
              <div className="space-y-2">
                {/* Build a unified row per object: merge object-level perms
                    with any explicit FLS overrides for that object. */}
                {(() => {
                  const flsByObject = new Map(
                    ps.fieldPermissions.map(g => [g.objectName, g])
                  )
                  // One row per object that has any access (object-level OR FLS).
                  // Sort: explicit FLS objects first (so they're visually
                  // grouped at the top), then inherited.
                  const rows = ps.objectPermissions
                    .map(op => ({
                      objectName: op.objectName,
                      objectPerm: op,
                      fls: flsByObject.get(op.objectName) || null,
                    }))
                    .sort((a, b) => {
                      const aHasFLS = a.fls != null ? 0 : 1
                      const bHasFLS = b.fls != null ? 0 : 1
                      if (aHasFLS !== bHasFLS) return aHasFLS - bHasFLS
                      return a.objectName.localeCompare(b.objectName)
                    })

                  return rows.map(({ objectName, objectPerm, fls }) => {
                    const isExpanded = !!expandedFieldGroups[objectName]
                    const isInherited = fls === null
                    // Compute object-level access summary for the inherited case.
                    const inheritedFlags: string[] = []
                    if (objectPerm.read) inheritedFlags.push('Read')
                    if (objectPerm.create) inheritedFlags.push('Create')
                    if (objectPerm.edit) inheritedFlags.push('Edit')
                    if (objectPerm.delete) inheritedFlags.push('Delete')
                    return (
                      <div key={objectName} className="border border-grove-border dark:border-grove-border-dk rounded-md">
                        <button
                          type="button"
                          onClick={() => toggleFieldGroup(objectName)}
                          className="w-full px-3 py-2 flex items-center justify-between hover:bg-primary-50/40 dark:hover:bg-primary-900/15 text-left"
                        >
                          <div className="flex items-center gap-2">
                            {isExpanded ? <ChevronDown className="h-4 w-4 text-grove-ink/55" /> : <ChevronRight className="h-4 w-4 text-grove-ink/55" />}
                            <span className="font-mono text-sm text-grove-ink dark:text-grove-ink-dk">{objectName}</span>
                          </div>
                          {isInherited ? (
                            <Badge variant="default" size="sm">
                              All fields inherited ({inheritedFlags.join(' / ') || 'no access'})
                            </Badge>
                          ) : (
                            <Badge variant="info" size="sm">{fls!.fieldCount} explicit FLS</Badge>
                          )}
                        </button>
                        {isExpanded && (
                          <div className="border-t border-grove-border dark:border-grove-border-dk">
                            {isInherited ? (
                              <div className="px-3 py-3 text-sm text-grove-ink/85 dark:text-grove-ink-dk/85 space-y-2">
                                <p>
                                  <strong>No field-level security overrides on this object.</strong>
                                  {' '}Every field on <span className="font-mono">{objectName}</span> is accessible to users with this PS via inherited object-level{' '}
                                  <strong>{inheritedFlags.join(' / ') || 'access'}</strong>.
                                </p>
                                <p className="text-xs text-grove-ink/55">
                                  Salesforce only stores FieldPermission rows when an admin
                                  explicitly grants or revokes access on a specific field.
                                  Standard fields (Id, Name, etc.) cannot have FLS at all
                                  and always inherit object-level access.
                                </p>
                                <button
                                  type="button"
                                  onClick={() => router.push(`/orgs/${orgId}/objects/${encodeURIComponent(objectName)}`)}
                                  className="text-xs text-primary-600 hover:underline"
                                >
                                  Open {objectName} in Newton →
                                </button>
                              </div>
                            ) : (
                              <div className="overflow-x-auto">
                                <table className="min-w-full divide-y divide-grove-border dark:divide-grove-border-dk">
                                  <thead className="bg-grove-canvas dark:bg-grove-canvas-dk">
                                    <tr>
                                      <th className="px-3 py-2 text-left text-xs font-medium text-grove-ink/55 uppercase">Field</th>
                                      <th className="px-3 py-2 text-center text-xs font-medium text-grove-ink/55 uppercase">Read</th>
                                      <th className="px-3 py-2 text-center text-xs font-medium text-grove-ink/55 uppercase">Edit</th>
                                      <th className="px-3 py-2 text-left text-xs font-medium text-grove-ink/55 uppercase"></th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-grove-border dark:divide-grove-border-dk">
                                    {fls!.fields.map(f => (
                                      <tr key={f.qualifiedId} className="hover:bg-primary-50/40 dark:hover:bg-primary-900/15">
                                        <td className="px-3 py-2 text-sm font-mono text-grove-ink dark:text-grove-ink-dk">{f.fieldName}</td>
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
                                <p className="px-3 py-2 text-xs text-grove-ink/55 border-t border-grove-border dark:border-grove-border-dk">
                                  These are explicit FLS rows. Other fields on{' '}
                                  <span className="font-mono">{objectName}</span> still inherit{' '}
                                  {inheritedFlags.join(' / ') || 'no access'} from the object-level grant above.
                                </p>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })
                })()}
              </div>
              <p className="text-xs text-grove-ink/55 mt-3">
                <strong>Explicit FLS</strong> = an admin set field-level security on that field.
                {' '}<strong>Inherited</strong> = field has no FLS row, so access follows the object's
                CRUD grant above.
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
