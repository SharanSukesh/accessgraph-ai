'use client'

/**
 * User Detail Page
 * Comprehensive view of user access, permissions, and risk
 */

import { Fragment, useState } from 'react'
import Link from 'next/link'
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
  ArrowLeft,
  User,
  Mail,
  Shield,
  Key,
  AlertTriangle,
  Database,
  FileText,
  Network,
  FileCheck,
  Calendar,
  HelpCircle,
  LayoutTemplate,
} from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/shared/Card'
import { Button } from '@/components/shared/Button'
import { fileSlug } from '@/lib/utils/exports'
import { ExplainAccessPanel } from '@/components/users/ExplainAccessPanel'
import { Badge, BaseRiskBadge, RiskBadge, SeverityBadge } from '@/components/shared/Badge'
import { anomalyTypeLabel, rankLabel } from '@/lib/anomalyTypes'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/shared/Tabs'
import { useListState } from '@/lib/list/useListState'
import { usePaged } from '@/lib/list/usePaged'
import { Pagination } from '@/components/shared/Pagination'
import { ListSearch } from '@/components/shared/ListSearch'
import { SortHeader } from '@/components/shared/SortHeader'
import { ErrorState } from '@/components/shared/ErrorState'
import { EmptyState } from '@/components/shared/EmptyState'
import { PageHeader } from '@/components/shared/PageHeader'
import { MaskedUsersBanner, PrivacyGate, PrivacyUnavailable } from '@/components/shared/PrivacyNotice'
import { isPrivacyModeError } from '@/lib/api/client'
import { useAuth } from '@/lib/auth/AuthContext'
import { DEMO_UNAVAILABLE_MESSAGE, unavailableForDemo } from '@/lib/demoOrg'
import { privacyModeOf } from '@/lib/privacy'
import { Breadcrumbs } from '@/components/shared/Breadcrumbs'
import { PageSkeleton, TableSkeleton } from '@/components/shared/LoadingSkeleton'
import { Reveal } from '@/components/v2/motion'
import { ERGraphVisualization } from '@/components/graph/ERGraphVisualization'
import { GraphPicker } from '@/components/graph/GraphPicker'
import { visibleGraph } from '@/components/graph/graphPick'
import { GraphLegend } from '@/components/graph/GraphLegend'
import { GraphDetailPanel } from '@/components/graph/GraphDetailPanel'
import { RecordAccessInfo } from '@/components/users/RecordAccessInfo'
import { RiskFactorBreakdown } from '@/components/users/RiskFactorBreakdown'
import {
  useUser,
  useUserRisk,
  useUserAnomalies,
  useUserRecommendations,
} from '@/lib/api/hooks/useUsers'
import { useUserGraph } from '@/lib/api/hooks/useGraph'
import { PagesAndAutomationPanel } from '@/components/users/PagesAndAutomationPanel'

export default function UserDetailPage() {
  return (
    <PrivacyGate
      feature="users"
      header={<PageHeader icon={User} title="User" eyebrow="Explore · user detail" />}
    >
      <UserDetailContent />
    </PrivacyGate>
  )
}

function UserDetailContent() {
  const params = useParams()
  const router = useRouter()
  const orgId = params.orgId as string
  const userId = params.userId as string

  // The open tab lives in the URL (?tab=), so back and shared links return to it.
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const activeTab = searchParams?.get('tab') || 'overview'
  const setActiveTab = (tab: string) => {
    const next = new URLSearchParams(searchParams?.toString() || '')
    if (tab === 'overview') next.delete('tab')
    else next.set('tab', tab)
    const qs = next.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }
  const { currentOrg } = useAuth()
  const masked = privacyModeOf(currentOrg) === 'masked'
  const recordsUnavailable = unavailableForDemo(currentOrg?.is_demo, 'records')
  const [selectedObjects, setSelectedObjects] = useState<string[]>([])
  const [selectedGraphNode, setSelectedGraphNode] = useState<any>(null)

  // Fetch user data
  const { data: user, isLoading: userLoading, error: userError } = useUser(orgId, userId)
  // Object and field access are paged by the server; each tab's state lives in the URL (uo.*, uf.*).
  const objectList = useListState('uo', { sort: 'object', filters: ['sensitive'] })
  const fieldList = useListState('uf', { sort: 'object', filters: ['sensitive'] })
  const { data: objectPage, isLoading: objectsLoading } = usePaged<any>(
    ['user-objects', orgId, userId], `/orgs/${orgId}/users/${userId}/access/objects`, objectList.state, !!userId)
  const objectAccess: any[] | undefined = objectPage?.items
  const [explainObject, setExplainObject] = useState<string | null>(null)
  const { data: fieldPage, isLoading: fieldsLoading } = usePaged<any>(
    ['user-fields', orgId, userId], `/orgs/${orgId}/users/${userId}/access/fields`, fieldList.state, !!userId)
  const fieldAccess: any[] | undefined = fieldPage?.items
  const objSort = { sort: objectList.state.sort, dir: objectList.state.dir, onSort: (c: string, d: 'asc' | 'desc') => objectList.update({ sort: c, dir: d }), className: 'px-6 py-3' }
  const fldSort = { sort: fieldList.state.sort, dir: fieldList.state.dir, onSort: (c: string, d: 'asc' | 'desc') => fieldList.update({ sort: c, dir: d }), className: 'px-6 py-3' }
  const { data: risk, isLoading: riskLoading } = useUserRisk(orgId, userId)
  const { data: anomalies, isLoading: anomaliesLoading } = useUserAnomalies(orgId, userId)
  const { data: recommendations, isLoading: recommendationsLoading } = useUserRecommendations(orgId, userId)
  // Layouts, record pages, Apex classes and flows come with the graph; the picker chooses which to draw.
  const [selectedItems, setSelectedItems] = useState<string[]>([])
  const { data: graph, isLoading: graphLoading } = useUserGraph(orgId, userId, 'pages_and_automation')

  // The risk endpoint has shipped both camelCase and snake_case shapes.
  const riskScore = risk?.score ?? risk?.risk_score
  const riskLevel = (risk?.level ?? risk?.risk_level) as
    | 'low' | 'medium' | 'high' | 'critical' | undefined
  const riskReason = risk?.explanation ?? risk?.reason_text
  const riskFactors = risk?.factors ?? []
  const hasRiskAssessment =
    riskScore !== undefined && (risk?.risk_score !== undefined || !!risk?.calculatedAt || riskScore > 0)

  if (userError) {
    if (isPrivacyModeError(userError)) return <PrivacyUnavailable message={userError.message} />
    return (
      <ErrorState
        message="Failed to load user details. Please try again."
        onRetry={() => router.push(`/orgs/${orgId}/users/${userId}`)}
      />
    )
  }

  if (userLoading) {
    return <PageSkeleton />
  }

  if (!user) {
    return (
      <EmptyState
        title="User Not Found"
        description="The requested user could not be found"
        icon="users"
        action={{ label: 'Back to Users', onClick: () => router.push(`/orgs/${orgId}/users`) }}
      />
    )
  }

  return (
    <div className="space-y-6">
      <Reveal>
        <Breadcrumbs
          crumbs={[
            { label: 'Users', href: `/orgs/${orgId}/users` },
            { label: user.name },
          ]}
        />
      </Reveal>
      <Reveal delay={0.05}>
        <PageHeader
          icon={User}
          title={user.name}
          subtitle={masked ? `Salesforce ID ${user.salesforceUserId}` : user.email}
          eyebrow="Explore · user detail"
          actions={
            <>
              {user.riskLevel && (
                <RiskBadge
                  level={user.riskLevel as 'low' | 'medium' | 'high' | 'critical'}
                />
              )}
              <Badge variant={user.isActive ? 'success' : 'default'}>
                {user.isActive ? 'Active' : 'Inactive'}
              </Badge>
            </>
          }
        />
      </Reveal>

      <MaskedUsersBanner />

      {/* User Info Card */}
      <Reveal delay={0.1}>
      <Card variant="bordered" className="v2-card-hero">
        <CardContent className="py-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="flex items-start gap-3">
              <User className="h-5 w-5 text-grove-ink/50 dark:text-grove-ink-dk/50 mt-0.5" />
              <div>
                <div className="text-xs font-medium text-grove-ink/55 dark:text-grove-ink-dk/55">
                  Salesforce User ID
                </div>
                <div className="text-sm text-grove-ink dark:text-grove-ink-dk font-mono mt-1">
                  {user.salesforceUserId}
                </div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Shield className="h-5 w-5 text-grove-ink/50 dark:text-grove-ink-dk/50 mt-0.5" />
              <div>
                <div className="text-xs font-medium text-grove-ink/55 dark:text-grove-ink-dk/55">
                  Profile
                </div>
                <div className="text-sm text-grove-ink dark:text-grove-ink-dk mt-1">
                  {(user as { profileId?: string }).profileId && user.profile ? (
                    <Link className="underline-offset-2 hover:underline" href={`/orgs/${orgId}/profiles/${(user as { profileId?: string }).profileId}`}>
                      {user.profile}
                    </Link>
                  ) : (user.profile || '-')}
                </div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Key className="h-5 w-5 text-grove-ink/50 dark:text-grove-ink-dk/50 mt-0.5" />
              <div>
                <div className="text-xs font-medium text-grove-ink/55 dark:text-grove-ink-dk/55">
                  Role
                </div>
                <div className="text-sm text-grove-ink dark:text-grove-ink-dk mt-1">
                  {user.role || '-'}
                </div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Calendar className="h-5 w-5 text-grove-ink/50 dark:text-grove-ink-dk/50 mt-0.5" />
              <div>
                <div className="text-xs font-medium text-grove-ink/55 dark:text-grove-ink-dk/55">
                  Last Login
                </div>
                <div className="text-sm text-grove-ink dark:text-grove-ink-dk mt-1">
                  {user.lastLoginDate
                    ? new Date(user.lastLoginDate).toLocaleDateString()
                    : '-'}
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
      </Reveal>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} defaultValue="overview">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="overview">
            <User className="h-4 w-4 mr-2" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="objects">
            <Database className="h-4 w-4 mr-2" />
            Object Access
          </TabsTrigger>
          <TabsTrigger value="fields">
            <FileText className="h-4 w-4 mr-2" />
            Field Access
          </TabsTrigger>
          <span title={recordsUnavailable ? DEMO_UNAVAILABLE_MESSAGE : undefined}>
            <TabsTrigger value="records" disabled={recordsUnavailable}>
              <Shield className="h-4 w-4 mr-2" />
              Record Access
            </TabsTrigger>
          </span>
          <TabsTrigger value="pages">
            <LayoutTemplate className="h-4 w-4 mr-2" />
            Pages &amp; automation
          </TabsTrigger>
          <TabsTrigger value="graph">
            <Network className="h-4 w-4 mr-2" />
            Graph
          </TabsTrigger>
          <TabsTrigger value="anomalies">
            <AlertTriangle className="h-4 w-4 mr-2" />
            Anomalies
          </TabsTrigger>
          <TabsTrigger value="recommendations">
            <FileCheck className="h-4 w-4 mr-2" />
            Recommendations
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview">
          <Reveal>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Risk Overview */}
            <Card variant="bordered">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5" />
                  Risk Assessment
                </CardTitle>
              </CardHeader>
              <CardContent>
                {riskLoading ? (
                  <div className="animate-pulse space-y-3">
                    <div className="h-4 bg-grove-border/60 dark:bg-grove-border-dk/70 rounded w-3/4" />
                    <div className="h-4 bg-grove-border/60 dark:bg-grove-border-dk/70 rounded w-1/2" />
                  </div>
                ) : hasRiskAssessment ? (
                  <div className="space-y-4">
                    <div>
                      <div className="text-sm text-grove-ink/65 dark:text-grove-ink-dk/65 mb-2">
                        Overall Risk Score
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="v2-num text-3xl font-bold text-grove-ink dark:text-grove-ink-dk">
                          {Math.round(riskScore ?? 0)}
                        </div>
                        {riskLevel && <RiskBadge level={riskLevel} />}
                      </div>
                      {risk?.calculatedAt && (
                        <div className="text-xs text-grove-ink/55 dark:text-grove-ink-dk/55 mt-1">
                          Calculated {new Date(risk.calculatedAt).toLocaleString()}
                        </div>
                      )}
                    </div>
                    {riskReason && (
                      <p className="pt-3 border-t border-grove-border dark:border-grove-border-dk text-sm leading-relaxed text-grove-ink/85 dark:text-grove-ink-dk/85 whitespace-pre-line">
                        {riskReason}
                      </p>
                    )}
                  </div>
                ) : risk ? (
                  <div className="text-center py-8">
                    <div className="text-sm text-grove-ink/65 dark:text-grove-ink-dk/65 mb-2">
                      {riskReason || "No risk assessment available yet. The next sync will generate risk scores."}
                    </div>
                  </div>
                ) : (
                  <EmptyState title="No Risk Data" description="Risk assessment not available" icon="default" />
                )}
              </CardContent>
            </Card>

            {/* Quick Stats */}
            <Card variant="bordered">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Database className="h-5 w-5" />
                  Access Summary
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-grove-ink/65 dark:text-grove-ink-dk/65">
                      Objects Accessible
                    </span>
                    <span className="text-lg font-semibold text-grove-ink dark:text-grove-ink-dk">
                      {objectsLoading ? '...' : (objectPage?.total ?? 0).toLocaleString('en-US')}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-grove-ink/65 dark:text-grove-ink-dk/65">
                      Fields Accessible
                    </span>
                    <span className="text-lg font-semibold text-grove-ink dark:text-grove-ink-dk">
                      {fieldsLoading ? '...' : (fieldPage?.total ?? 0).toLocaleString('en-US')}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-grove-ink/65 dark:text-grove-ink-dk/65">
                      Recommendations
                    </span>
                    <span className="text-lg font-semibold text-grove-ink dark:text-grove-ink-dk">
                      {recommendationsLoading ? '...' : recommendations?.length || 0}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
          </Reveal>
          {hasRiskAssessment && riskFactors.length > 0 && (
            <Reveal delay={0.05}>
              <Card variant="bordered" className="mt-6">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Shield className="h-5 w-5" />
                    Risk Drivers
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <RiskFactorBreakdown factors={riskFactors} />
                </CardContent>
              </Card>
            </Reveal>
          )}
        </TabsContent>

        {/* Object Access Tab */}
        <TabsContent value="objects">
          <Reveal>
          <Card variant="bordered">
            <CardHeader>
              <CardTitle>Object Access Permissions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="mb-3 flex flex-wrap gap-3">
                <ListSearch value={objectList.state.q} onChange={(q) => objectList.update({ q })} placeholder="Search objects..." />
                <select
                  aria-label="Sensitivity"
                  value={objectList.state.filters.sensitive || ''}
                  onChange={(e) => objectList.update({ filters: { sensitive: e.target.value } })}
                  className="rounded-md px-3 py-2 text-sm bg-grove-surface dark:bg-grove-canvas-dk ring-1 ring-grove-border dark:ring-grove-border-dk text-grove-ink dark:text-grove-ink-dk"
                >
                  <option value="">All</option>
                  <option value="true">Sensitive only</option>
                  <option value="false">Not flagged</option>
                </select>
              </div>
              {objectsLoading ? (
                <TableSkeleton rows={5} />
              ) : objectAccess && objectAccess.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-primary-50/40 dark:bg-primary-900/10 border-b border-grove-border dark:border-grove-border-dk">
                      <tr>
                        <SortHeader label="Object" column="object" {...objSort} />
                        <SortHeader label="Read" column="read" {...objSort} />
                        <SortHeader label="Create" column="create" {...objSort} />
                        <SortHeader label="Edit" column="edit" {...objSort} />
                        <SortHeader label="Delete" column="delete" {...objSort} />
                        <SortHeader label="Sensitivity" column="sensitivity" {...objSort} />
                        <th className="px-6 py-3" />
                      </tr>
                    </thead>
                    <tbody className="bg-grove-surface dark:bg-grove-canvas-dk divide-y divide-gray-200 dark:divide-gray-800">
                      {objectAccess.map((obj: any) => (
                        <Fragment key={obj.objectName}>
                        <tr className="hover:bg-primary-50/40 dark:hover:bg-primary-900/15">
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-grove-ink dark:text-grove-ink-dk">
                            {obj.objectLabel || obj.objectName}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {obj.permissions?.canRead ? (
                              <Badge variant="success" size="sm">Yes</Badge>
                            ) : (
                              <Badge variant="default" size="sm">No</Badge>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {obj.permissions?.canCreate ? (
                              <Badge variant="success" size="sm">Yes</Badge>
                            ) : (
                              <Badge variant="default" size="sm">No</Badge>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {obj.permissions?.canEdit ? (
                              <Badge variant="success" size="sm">Yes</Badge>
                            ) : (
                              <Badge variant="default" size="sm">No</Badge>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {obj.permissions?.canDelete ? (
                              <Badge variant="success" size="sm">Yes</Badge>
                            ) : (
                              <Badge variant="default" size="sm">No</Badge>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {obj.isSensitive ? (
                              <Badge variant="warning" size="sm">{obj.sensitivity ? `Sensitive: ${obj.sensitivity}` : 'Sensitive'}</Badge>
                            ) : (
                              <Badge variant="default" size="sm">Not flagged</Badge>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right">
                            <button
                              type="button"
                              onClick={() =>
                                setExplainObject(explainObject === obj.objectName ? null : obj.objectName)
                              }
                              aria-expanded={explainObject === obj.objectName}
                              className="inline-flex items-center gap-1 text-xs font-medium text-primary-700 hover:underline dark:text-primary-400"
                            >
                              <HelpCircle className="h-3.5 w-3.5" />
                              {explainObject === obj.objectName ? 'Hide' : 'Why?'}
                            </button>
                          </td>
                        </tr>
                        {explainObject === obj.objectName && (
                          <tr className="bg-primary-50/30 dark:bg-primary-900/10">
                            <td colSpan={7} className="px-6 py-4">
                              <ExplainAccessPanel orgId={orgId} userId={userId} objectName={obj.objectName} />
                            </td>
                          </tr>
                        )}
                        </Fragment>
                      ))}
                    </tbody>
                  </table>
                  <Pagination page={objectPage!.page} pageSize={objectPage!.page_size} total={objectPage!.total} label="objects"
                    onPage={(page) => objectList.update({ page })} onPageSize={(pageSize) => objectList.update({ pageSize })} />
                </div>
              ) : (
                <EmptyState title="No Object Access" description={objectList.state.q || objectList.state.filters.sensitive ? 'Nothing matches the search or filter.' : 'No object permissions found'} icon="database" />
              )}
            </CardContent>
          </Card>
          </Reveal>
        </TabsContent>

        {/* Field Access Tab */}
        <TabsContent value="fields">
          <Reveal>
          <Card variant="bordered">
            <CardHeader>
              <CardTitle>Field Access Permissions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="mb-3 flex flex-wrap gap-3">
                <ListSearch value={fieldList.state.q} onChange={(q) => fieldList.update({ q })} placeholder="Search fields..." />
                <select
                  aria-label="Sensitivity"
                  value={fieldList.state.filters.sensitive || ''}
                  onChange={(e) => fieldList.update({ filters: { sensitive: e.target.value } })}
                  className="rounded-md px-3 py-2 text-sm bg-grove-surface dark:bg-grove-canvas-dk ring-1 ring-grove-border dark:ring-grove-border-dk text-grove-ink dark:text-grove-ink-dk"
                >
                  <option value="">All</option>
                  <option value="true">Sensitive only</option>
                  <option value="false">Not flagged</option>
                </select>
              </div>
              {fieldsLoading ? (
                <TableSkeleton rows={10} />
              ) : fieldAccess && fieldAccess.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-primary-50/40 dark:bg-primary-900/10 border-b border-grove-border dark:border-grove-border-dk">
                      <tr>
                        <SortHeader label="Object" column="object" {...fldSort} />
                        <SortHeader label="Field" column="field" {...fldSort} />
                        <SortHeader label="Read" column="read" {...fldSort} />
                        <SortHeader label="Edit" column="edit" {...fldSort} />
                        <SortHeader label="Sensitivity" column="sensitivity" {...fldSort} />
                      </tr>
                    </thead>
                    <tbody className="bg-grove-surface dark:bg-grove-canvas-dk divide-y divide-gray-200 dark:divide-gray-800">
                      {fieldAccess.map((field: any, idx: number) => (
                        <tr key={idx} className="hover:bg-primary-50/40 dark:hover:bg-primary-900/15">
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-grove-ink dark:text-grove-ink-dk">
                            {field.objectName}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-grove-ink dark:text-grove-ink-dk">
                            {field.fieldLabel || field.fieldName}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {field.canRead ? (
                              <Badge variant="success" size="sm">Yes</Badge>
                            ) : (
                              <Badge variant="default" size="sm">No</Badge>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {field.canEdit ? (
                              <Badge variant="success" size="sm">Yes</Badge>
                            ) : (
                              <Badge variant="default" size="sm">No</Badge>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {field.isSensitive ? (
                              <Badge variant="warning" size="sm">{field.sensitivity ? `Sensitive: ${field.sensitivity}` : 'Sensitive'}</Badge>
                            ) : (
                              <Badge variant="default" size="sm">Not flagged</Badge>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <Pagination page={fieldPage!.page} pageSize={fieldPage!.page_size} total={fieldPage!.total} label="fields"
                    onPage={(page) => fieldList.update({ page })} onPageSize={(pageSize) => fieldList.update({ pageSize })} />
                </div>
              ) : (
                <EmptyState title="No Field Access" description={fieldList.state.q || fieldList.state.filters.sensitive ? 'Nothing matches the search or filter.' : 'No field permissions found'} icon="file-text" />
              )}
            </CardContent>
          </Card>
          </Reveal>
        </TabsContent>

        {/* Record Access Tab */}
        <TabsContent value="records">
          <Reveal>
          <Card variant="bordered">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Record-Level Access
              </CardTitle>
              <p className="text-sm text-grove-ink/65 dark:text-grove-ink-dk/65 mt-2">
                Understand which specific records this user can access based on ownership, role hierarchy, sharing rules, and team assignments
              </p>
            </CardHeader>
            <CardContent>
              <RecordAccessInfo userId={userId} orgId={orgId} />
            </CardContent>
          </Card>
          </Reveal>
        </TabsContent>

        {/* Pages & automation Tab (roadmap item 1) */}
        <TabsContent value="pages">
          <Reveal>
            <PagesAndAutomationPanel orgId={orgId} userId={userId} />
          </Reveal>
        </TabsContent>

        {/* Graph Tab */}
        <TabsContent value="graph">
          <Reveal>
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Main Graph Area */}
            <div className="lg:col-span-8">
              {graphLoading ? (
                <Card variant="bordered">
                  <CardContent className="py-12 text-center">
                    <div className="animate-pulse">
                      <div className="h-96 bg-grove-border/60 dark:bg-grove-border-dk/70 rounded-lg" />
                      <p className="mt-4 text-grove-ink/55 dark:text-grove-ink-dk/55">
                        Loading graph...
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ) : graph ? (
                <>
                  <ERGraphVisualization
                    graph={graph}
                    selectedObjects={selectedObjects}
                    selectedItems={selectedItems}
                    onNodeSelect={(node) => setSelectedGraphNode(node)}
                    height="800px"
                    exportName={`access-graph-${fileSlug(user?.name ?? userId)}`}
                  />
                  <div className="mt-4">
                    <GraphLegend compact graph={visibleGraph(graph, selectedObjects, selectedItems)} />
                  </div>
                </>
              ) : (
                <EmptyState title="No Graph Data" description="Unable to load graph" icon="network" />
              )}
            </div>

            {/* Right Sidebar - Object Filter or Node Details */}
            <div className="lg:col-span-4">
              {selectedGraphNode ? (
                <GraphDetailPanel
                  selectedNode={selectedGraphNode}
                  orgId={orgId}
                  onClose={() => setSelectedGraphNode(null)}
                />
              ) : (
                <GraphPicker
                  graph={graph}
                  selectedObjects={selectedObjects}
                  onObjectsChange={setSelectedObjects}
                  selectedItems={selectedItems}
                  onItemsChange={setSelectedItems}
                  itemsNote={
                    graph?.metadata?.pagesAndAutomation
                      ? graph.metadata.pagesAndAutomation.available
                        ? graph.metadata.pagesAndAutomation.note
                        : 'Pages and automation not read yet: sync the org.'
                      : null
                  }
                  className="max-h-[860px]"
                />
              )}
            </div>
          </div>
          </Reveal>
        </TabsContent>

        {/* Anomalies Tab */}
        <TabsContent value="anomalies">
          <Reveal>
          <Card variant="bordered">
            <CardHeader>
              <CardTitle>Access Anomalies</CardTitle>
            </CardHeader>
            <CardContent>
              {anomaliesLoading ? (
                <TableSkeleton rows={5} />
              ) : anomalies && anomalies.length > 0 ? (
                <div className="space-y-4">
                  {anomalies.map((anomaly: any) => (
                    <div
                      key={anomaly.id}
                      className="p-4 border border-grove-border dark:border-grove-border-dk rounded-lg hover:bg-primary-50/40 dark:hover:bg-primary-900/15 transition-colors"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <div className="flex flex-wrap items-center gap-2 mb-2">
                            {anomaly.category === 'session' ? (
                              anomaly.severity && <SeverityBadge severity={anomaly.severity} />
                            ) : (
                              <>
                                {rankLabel(anomaly.rank, anomaly.usersScored) && (
                                  <Badge variant="info" size="sm">{rankLabel(anomaly.rank, anomaly.usersScored)}</Badge>
                                )}
                                {anomaly.baseRiskLevel && <BaseRiskBadge level={anomaly.baseRiskLevel} size="sm" />}
                              </>
                            )}
                            <span className="text-xs text-grove-ink/55 dark:text-grove-ink-dk/55">
                              Anomaly Score: {typeof anomaly.anomaly_score === 'number' ? anomaly.anomaly_score.toFixed(2) : anomaly.anomaly_score}
                            </span>
                          </div>
                          <div className="text-sm font-medium text-grove-ink dark:text-grove-ink-dk mb-1">
                            {anomaly.category === 'session'
                              ? 'Unusual sign-in detected'
                              : anomalyTypeLabel(anomaly.type) ?? 'Anomalous Access Pattern Detected'}
                          </div>
                          <div className="text-xs text-grove-ink/55 dark:text-grove-ink-dk/55">
                            Detected {new Date(anomaly.detected_at).toLocaleString()}
                          </div>
                        </div>
                      </div>
                      {anomaly.reasons && anomaly.reasons.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-grove-border dark:border-grove-border-dk">
                          <div className="text-xs font-medium text-grove-ink/85 dark:text-grove-ink-dk/85 mb-3">
                            🔍 Specific Anomalies Detected
                          </div>
                          <div className="space-y-3">
                            {anomaly.reasons.map((reason: string, idx: number) => (
                              <div
                                key={idx}
                                className="p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg border border-orange-200 dark:border-orange-800"
                              >
                                <div className="flex items-start gap-2">
                                  <AlertTriangle className="h-4 w-4 text-orange-600 dark:text-orange-400 flex-shrink-0 mt-0.5" />
                                  <div className="flex-1">
                                    <div className="text-sm font-medium text-grove-ink dark:text-grove-ink-dk mb-1">
                                      {reason}
                                    </div>

                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      <div className="mt-3 pt-3 border-t border-grove-border dark:border-grove-border-dk text-xs text-grove-ink/65 dark:text-grove-ink-dk/65">
                        {anomaly.category === 'session' ? (
                          <p>Found by a sign-in rule over this user&apos;s Salesforce login history.</p>
                        ) : (
                          <p>
                            Newton scores every active user on 13 access signals with two statistical models and
                            flags the 2% whose combination stands out most from the rest of the org. The reasons
                            above compare this user with peers who share their role (or profile). Unusual access
                            isn&apos;t necessarily wrong; review whether it is intended.
                          </p>
                        )}
                        <Link
                          href={`/orgs/${orgId}/anomalies/methodology`}
                          className="mt-1 inline-block font-semibold text-grove-ink/85 underline underline-offset-2 dark:text-grove-ink-dk/85"
                        >
                          How anomalies are detected
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState title="No Anomalies" description="No access anomalies detected for this user" icon="default" />
              )}
            </CardContent>
          </Card>
          </Reveal>
        </TabsContent>

        {/* Recommendations Tab */}
        <TabsContent value="recommendations">
          <Reveal>
          <Card variant="bordered">
            <CardHeader>
              <CardTitle>Recommendations</CardTitle>
            </CardHeader>
            <CardContent>
              {recommendationsLoading ? (
                <TableSkeleton rows={5} />
              ) : recommendations && recommendations.length > 0 ? (
                <div className="space-y-4">
                  {recommendations.map((rec: any) => (
                    <div
                      key={rec.id}
                      className="p-4 border border-grove-border dark:border-grove-border-dk rounded-lg hover:bg-primary-50/40 dark:hover:bg-primary-900/15 transition-colors"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <SeverityBadge severity={rec.severity} />
                            <Badge variant="info" size="sm">
                              {rec.rec_type?.replace(/_/g, ' ')}
                            </Badge>
                          </div>
                          <div className="text-sm font-medium text-grove-ink dark:text-grove-ink-dk mb-1">
                            {rec.title}
                          </div>
                          <div className="text-sm text-grove-ink/65 dark:text-grove-ink-dk/65">
                            {rec.description}
                          </div>
                        </div>
                      </div>
                      {rec.action && (
                        <div className="mt-3 pt-3 border-t border-grove-border dark:border-grove-border-dk">
                          <div className="text-xs font-medium text-grove-ink/85 dark:text-grove-ink-dk/85 mb-1">
                            Recommended Action
                          </div>
                          <div className="text-sm text-grove-ink/65 dark:text-grove-ink-dk/65 p-3 bg-primary-50 dark:bg-primary-900/20 rounded-lg border border-primary-200 dark:border-primary-800">
                            {rec.action}
                          </div>
                        </div>
                      )}
                      <div className="mt-3 pt-3 border-t border-grove-border dark:border-grove-border-dk">
                        <div className="text-xs text-grove-ink/55 dark:text-grove-ink-dk/55">
                          <strong>How recommendations work:</strong> This recommendation was generated based on
                          detected anomalies and security best practices. Recommendations are categorized by type
                          (PSG Migration, Access Review, Permission Removal) and prioritized by severity. They help
                          you proactively address potential security issues before they become problems.
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState title="No Recommendations" description="No recommendations available for this user" icon="default" />
              )}
            </CardContent>
          </Card>
          </Reveal>
        </TabsContent>
      </Tabs>
    </div>
  )
}
