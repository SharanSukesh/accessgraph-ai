'use client'

/**
 * Record Access Information Component
 * Displays record-level access information for a user
 */

import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api/client'
import { AlertCircle, CheckCircle, Users, Share2, Shield, Building2, Database } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/shared/Card'
import { Badge } from '@/components/shared/Badge'
import { TableSkeleton } from '@/components/shared/LoadingSkeleton'

interface RecordAccessInfoProps {
  userId: string
  orgId: string
}

interface RoleHierarchy {
  has_role: boolean
  role_id?: string
  role_name?: string
  subordinate_roles: Array<{ role_id: string; role_name: string }>
  subordinate_count: number
}

interface ManualShare {
  record_type: string
  record_id: string
  access_level: string
  row_cause: string
  shared_to: string
}

interface TeamAccess {
  team_type: string
  record_id: string
  role?: string
  account_access: string
  opportunity_access: string
  case_access: string
}

interface SharingRule {
  record_type: string
  record_id: string
  access_level: string
  row_cause: string
  shared_to: string
}

interface OrganizationWideDefault {
  sobject_type: string
  sobject_label: string | null
  internal_sharing_model: string
  external_sharing_model: string | null
}

interface RecordAccessData {
  userId: string
  userName: string
  ownedRecords: Record<string, number>
  roleHierarchy: RoleHierarchy
  manualShares: ManualShare[]
  teamAccess: TeamAccess[]
  sharingRules: SharingRule[]
  organizationWideDefaults: OrganizationWideDefault[]
  summary: {
    total_owned_records: number
    total_manual_shares: number
    total_team_memberships: number
    total_sharing_rule_grants: number
    has_role_hierarchy_access: boolean
  }
}

export function RecordAccessInfo({ userId, orgId }: RecordAccessInfoProps) {
  const { data, isLoading, error } = useQuery<RecordAccessData>({
    queryKey: ['record-access', orgId, userId],
    queryFn: async () => {
      return await apiClient.get<RecordAccessData>(`/orgs/${orgId}/users/${userId}/record-access`)
    },
  })

  if (isLoading) {
    return <TableSkeleton rows={5} />
  }

  if (error) {
    return (
      <div className="p-6 text-center">
        <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
        <p className="text-gray-600 dark:text-gray-400">Failed to load record access information</p>
      </div>
    )
  }

  if (!data) {
    return null
  }

  const { ownedRecords, roleHierarchy, manualShares, teamAccess, sharingRules, organizationWideDefaults, summary } = data

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card variant="bordered" className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-green-700 dark:text-green-300">Owned Records</p>
                <p className="text-2xl font-bold text-green-900 dark:text-green-100">{summary.total_owned_records}</p>
              </div>
              <Database className="h-8 w-8 text-green-600 dark:text-green-400" />
            </div>
          </CardContent>
        </Card>

        <Card variant="bordered" className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-800/20">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-purple-700 dark:text-purple-300">Role Hierarchy</p>
                <p className="text-2xl font-bold text-purple-900 dark:text-purple-100">
                  {summary.has_role_hierarchy_access ? roleHierarchy.subordinate_count : 0}
                </p>
              </div>
              <Users className="h-8 w-8 text-purple-600 dark:text-purple-400" />
            </div>
          </CardContent>
        </Card>

        <Card variant="bordered" className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-blue-700 dark:text-blue-300">Manual Shares</p>
                <p className="text-2xl font-bold text-blue-900 dark:text-blue-100">{summary.total_manual_shares}</p>
              </div>
              <Share2 className="h-8 w-8 text-blue-600 dark:text-blue-400" />
            </div>
          </CardContent>
        </Card>

        <Card variant="bordered" className="bg-gradient-to-br from-amber-50 to-amber-100 dark:from-amber-900/20 dark:to-amber-800/20">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-amber-700 dark:text-amber-300">Team Access</p>
                <p className="text-2xl font-bold text-amber-900 dark:text-amber-100">{summary.total_team_memberships}</p>
              </div>
              <Building2 className="h-8 w-8 text-amber-600 dark:text-amber-400" />
            </div>
          </CardContent>
        </Card>

        <Card variant="bordered" className="bg-gradient-to-br from-cyan-50 to-cyan-100 dark:from-cyan-900/20 dark:to-cyan-800/20">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-cyan-700 dark:text-cyan-300">Sharing Rules</p>
                <p className="text-2xl font-bold text-cyan-900 dark:text-cyan-100">{summary.total_sharing_rule_grants}</p>
              </div>
              <Shield className="h-8 w-8 text-cyan-600 dark:text-cyan-400" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Owned Records */}
      <Card variant="bordered">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5 text-green-600" />
            Owned Records
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Records directly owned by this user. These are records where the OwnerId field matches the user's ID.
          </p>
          {summary.total_owned_records === 0 ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              <p className="text-sm">No owned record data available yet.</p>
              <p className="text-xs mt-2">Record ownership data requires syncing actual Salesforce object records (Account, Opportunity, etc.)</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
              {Object.entries(ownedRecords).map(([objectType, count]) => (
                <div key={objectType} className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                  <p className="text-xs text-gray-600 dark:text-gray-400">{objectType}</p>
                  <p className="text-xl font-bold text-gray-900 dark:text-gray-100">{count}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Role Hierarchy */}
      <Card variant="bordered">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-purple-600" />
            Role Hierarchy Access
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Access to records owned by users in subordinate roles. Users can see all records owned by anyone below them in the role hierarchy.
          </p>
          {roleHierarchy.has_role ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Badge variant="info">Current Role</Badge>
                <span className="font-medium text-gray-900 dark:text-gray-100">{roleHierarchy.role_name}</span>
              </div>
              {roleHierarchy.subordinate_count > 0 ? (
                <div>
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Subordinate Roles ({roleHierarchy.subordinate_count})
                  </p>
                  <div className="space-y-1 max-h-64 overflow-y-auto">
                    {roleHierarchy.subordinate_roles.map((role) => (
                      <div key={role.role_id} className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 py-1 px-2 bg-gray-50 dark:bg-gray-800 rounded">
                        <div className="h-1.5 w-1.5 rounded-full bg-purple-500" />
                        {role.role_name}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-500 dark:text-gray-400">No subordinate roles</p>
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-500 dark:text-gray-400">User does not have a role assigned</p>
          )}
        </CardContent>
      </Card>

      {/* Manual Shares */}
      <Card variant="bordered">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Share2 className="h-5 w-5 text-blue-600" />
            Manual Shares
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Records explicitly shared with this user or groups they belong to.
          </p>
          {manualShares.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">No manual shares found</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-800">
                  <tr>
                    <th className="px-4 py-2 text-left text-gray-700 dark:text-gray-300">Record Type</th>
                    <th className="px-4 py-2 text-left text-gray-700 dark:text-gray-300">Record ID</th>
                    <th className="px-4 py-2 text-left text-gray-700 dark:text-gray-300">Access Level</th>
                    <th className="px-4 py-2 text-left text-gray-700 dark:text-gray-300">Shared To</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {manualShares.map((share, idx) => (
                    <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                      <td className="px-4 py-2 text-gray-900 dark:text-gray-100">{share.record_type}</td>
                      <td className="px-4 py-2 font-mono text-xs text-gray-600 dark:text-gray-400">{share.record_id}</td>
                      <td className="px-4 py-2">
                        <Badge variant={share.access_level === 'Edit' ? 'success' : 'info'}>
                          {share.access_level}
                        </Badge>
                      </td>
                      <td className="px-4 py-2 font-mono text-xs text-gray-600 dark:text-gray-400">{share.shared_to}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Team Access */}
      <Card variant="bordered">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-amber-600" />
            Team Access
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Access granted through Account Team, Opportunity Team, or Case Team memberships.
          </p>
          {teamAccess.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">No team memberships found</p>
          ) : (
            <div className="space-y-3">
              {teamAccess.map((team, idx) => (
                <div key={idx} className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <Badge variant="warning">{team.team_type}</Badge>
                    {team.role && <span className="text-sm text-gray-600 dark:text-gray-400">{team.role}</span>}
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Record: {team.record_id}</p>
                  <div className="flex flex-wrap gap-2">
                    <Badge size="sm" variant="info">Account: {team.account_access}</Badge>
                    <Badge size="sm" variant="info">Opportunity: {team.opportunity_access}</Badge>
                    <Badge size="sm" variant="info">Case: {team.case_access}</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sharing Rules */}
      <Card variant="bordered">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-cyan-600" />
            Sharing Rules
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Access granted through criteria-based or owner-based sharing rules.
          </p>
          {sharingRules.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">No sharing rule grants found</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-800">
                  <tr>
                    <th className="px-4 py-2 text-left text-gray-700 dark:text-gray-300">Record Type</th>
                    <th className="px-4 py-2 text-left text-gray-700 dark:text-gray-300">Record ID</th>
                    <th className="px-4 py-2 text-left text-gray-700 dark:text-gray-300">Access Level</th>
                    <th className="px-4 py-2 text-left text-gray-700 dark:text-gray-300">Row Cause</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {sharingRules.map((rule, idx) => (
                    <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                      <td className="px-4 py-2 text-gray-900 dark:text-gray-100">{rule.record_type}</td>
                      <td className="px-4 py-2 font-mono text-xs text-gray-600 dark:text-gray-400">{rule.record_id}</td>
                      <td className="px-4 py-2">
                        <Badge variant="success">{rule.access_level}</Badge>
                      </td>
                      <td className="px-4 py-2 font-mono text-xs text-gray-600 dark:text-gray-400">{rule.row_cause}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Organization-Wide Defaults */}
      <Card variant="bordered">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-blue-600" />
            Organization-Wide Defaults (OWD)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Baseline sharing model that defines default access levels for each object type across the organization.
          </p>
          {organizationWideDefaults && organizationWideDefaults.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-800">
                  <tr>
                    <th className="px-4 py-2 text-left text-gray-700 dark:text-gray-300">Object</th>
                    <th className="px-4 py-2 text-left text-gray-700 dark:text-gray-300">Internal Sharing</th>
                    <th className="px-4 py-2 text-left text-gray-700 dark:text-gray-300">External Sharing</th>
                    <th className="px-4 py-2 text-left text-gray-700 dark:text-gray-300">Description</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                  {organizationWideDefaults.map((owd, idx) => {
                    const getSharingModelBadge = (model: string) => {
                      if (model === 'Private') return <Badge variant="error">Private</Badge>
                      if (model === 'Read') return <Badge variant="warning">Read Only</Badge>
                      if (model === 'ReadWrite') return <Badge variant="success">Read/Write</Badge>
                      if (model === 'ControlledByParent') return <Badge variant="info">Controlled By Parent</Badge>
                      return <Badge>{model}</Badge>
                    }

                    const getDescription = (model: string) => {
                      if (model === 'Private') return 'Only owner can access'
                      if (model === 'Read') return 'All users can view'
                      if (model === 'ReadWrite') return 'All users can edit'
                      if (model === 'ControlledByParent') return 'Inherited from parent'
                      return 'Custom access'
                    }

                    return (
                      <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                        <td className="px-4 py-2">
                          <div className="font-medium text-gray-900 dark:text-gray-100">
                            {owd.sobject_label || owd.sobject_type}
                          </div>
                          {owd.sobject_label && (
                            <div className="text-xs text-gray-500 dark:text-gray-400 font-mono">
                              {owd.sobject_type}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-2">
                          {getSharingModelBadge(owd.internal_sharing_model)}
                        </td>
                        <td className="px-4 py-2">
                          {owd.external_sharing_model ? (
                            getSharingModelBadge(owd.external_sharing_model)
                          ) : (
                            <span className="text-gray-400 text-xs">N/A</span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400">
                          {getDescription(owd.internal_sharing_model)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-gray-500 dark:text-gray-400">No OWD settings available</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
