'use client'

/**
 * Object Detail Page
 * Shows detailed information about a Salesforce object including permissions and user access
 */

import { use} from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Database, Shield, Users, ChevronLeft, Check, X, Sparkles, AlertTriangle, Copy } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/shared/Card'
import { PageHeader } from '@/components/shared/PageHeader'
import { Breadcrumbs } from '@/components/shared/Breadcrumbs'
import { Button } from '@/components/shared/Button'
import { Badge } from '@/components/shared/Badge'
import { ErrorState } from '@/components/shared/ErrorState'
import { TableSkeleton } from '@/components/shared/LoadingSkeleton'
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api/client'
import {
  useDataQualityObject,
  type ObjectScore,
} from '@/lib/api/hooks/useDataQuality'

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

  // Data quality — keyed on apiName because the engine identifies
  // objects by SF API name (Account, Contact, __c). objectName from
  // the URL may be an internal id, so we wait for objectDetail before
  // firing the query.
  const { data: dqScore, error: dqError } = useDataQualityObject(
    orgId,
    objectDetail?.apiName ?? '',
    { enabled: !!objectDetail?.apiName },
  )

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
      <Breadcrumbs
        crumbs={[
          { label: 'Objects', href: `/orgs/${orgId}/objects` },
          { label: objectDetail.label },
        ]}
      />
      <PageHeader
        icon={Database}
        title={objectDetail.label}
        subtitle={
          <span className="font-mono text-xs">{objectDetail.apiName}</span>
        }
        actions={
          objectDetail.isCustom && (
            <Badge variant="info" size="sm">
              Custom
            </Badge>
          )
        }
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card variant="bordered" className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-grove-ink/65 dark:text-grove-ink-dk/65">
                Total Users with Access
              </p>
              <p className="mt-2 text-3xl font-bold text-grove-ink dark:text-grove-ink-dk">
                {objectDetail.totalUsers}
              </p>
            </div>
            <div className="p-3 rounded-lg bg-primary-50 dark:bg-primary-900/25">
              <Users className="h-6 w-6 text-primary-700 dark:text-primary-400" />
            </div>
          </div>
        </Card>

        <Card variant="bordered" className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-grove-ink/65 dark:text-grove-ink-dk/65">
                Profiles
              </p>
              <p className="mt-2 text-3xl font-bold text-grove-ink dark:text-grove-ink-dk">
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
              <p className="text-sm font-medium text-grove-ink/65 dark:text-grove-ink-dk/65">
                Permission Sets
              </p>
              <p className="mt-2 text-3xl font-bold text-grove-ink dark:text-grove-ink-dk">
                {objectDetail.totalPermissionSets}
              </p>
            </div>
            <div className="p-3 rounded-lg bg-copper-100 dark:bg-copper-900/25">
              <Shield className="h-6 w-6 text-copper-600 dark:text-copper-400" />
            </div>
          </div>
        </Card>
      </div>

      {/* Data Quality — score + component breakdown + evidence. Only
          renders when a run has covered this object. 404 is expected
          on first visit; the card silently hides in that case. */}
      {dqScore && !dqError && (
        <DataQualityCard score={dqScore} />
      )}

      {/* Profiles with Access */}
      {objectDetail.profilesWithAccess.length > 0 && (
        <Card variant="bordered">
          <CardHeader>
            <CardTitle>Profiles with Access ({objectDetail.profilesWithAccess.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-primary-50/40 dark:bg-primary-900/10 border-b border-grove-border dark:border-grove-border-dk">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-grove-ink/55 dark:text-grove-ink-dk/55 uppercase">
                      Profile Name
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-grove-ink/55 dark:text-grove-ink-dk/55 uppercase">
                      Read
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-grove-ink/55 dark:text-grove-ink-dk/55 uppercase">
                      Create
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-grove-ink/55 dark:text-grove-ink-dk/55 uppercase">
                      Edit
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-grove-ink/55 dark:text-grove-ink-dk/55 uppercase">
                      Delete
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-grove-ink/55 dark:text-grove-ink-dk/55 uppercase">
                      View All
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-grove-ink/55 dark:text-grove-ink-dk/55 uppercase">
                      Modify All
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-grove-surface dark:bg-grove-canvas-dk divide-y divide-gray-200 dark:divide-gray-800">
                  {objectDetail.profilesWithAccess.map((profile) => (
                    <tr key={profile.id} className="hover:bg-primary-50/40 dark:hover:bg-primary-900/15">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-grove-ink dark:text-grove-ink-dk">
                        {profile.name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        {profile.read ? (
                          <Check className="h-5 w-5 text-green-600 mx-auto" />
                        ) : (
                          <X className="h-5 w-5 text-grove-ink/50 mx-auto" />
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        {profile.create ? (
                          <Check className="h-5 w-5 text-green-600 mx-auto" />
                        ) : (
                          <X className="h-5 w-5 text-grove-ink/50 mx-auto" />
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        {profile.edit ? (
                          <Check className="h-5 w-5 text-green-600 mx-auto" />
                        ) : (
                          <X className="h-5 w-5 text-grove-ink/50 mx-auto" />
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        {profile.delete ? (
                          <Check className="h-5 w-5 text-green-600 mx-auto" />
                        ) : (
                          <X className="h-5 w-5 text-grove-ink/50 mx-auto" />
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        {profile.viewAll ? (
                          <Check className="h-5 w-5 text-green-600 mx-auto" />
                        ) : (
                          <X className="h-5 w-5 text-grove-ink/50 mx-auto" />
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        {profile.modifyAll ? (
                          <Check className="h-5 w-5 text-green-600 mx-auto" />
                        ) : (
                          <X className="h-5 w-5 text-grove-ink/50 mx-auto" />
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
                <thead className="bg-primary-50/40 dark:bg-primary-900/10 border-b border-grove-border dark:border-grove-border-dk">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-grove-ink/55 dark:text-grove-ink-dk/55 uppercase">
                      Permission Set Name
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-grove-ink/55 dark:text-grove-ink-dk/55 uppercase">
                      Read
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-grove-ink/55 dark:text-grove-ink-dk/55 uppercase">
                      Create
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-grove-ink/55 dark:text-grove-ink-dk/55 uppercase">
                      Edit
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-grove-ink/55 dark:text-grove-ink-dk/55 uppercase">
                      Delete
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-grove-ink/55 dark:text-grove-ink-dk/55 uppercase">
                      View All
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-grove-ink/55 dark:text-grove-ink-dk/55 uppercase">
                      Modify All
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-grove-surface dark:bg-grove-canvas-dk divide-y divide-gray-200 dark:divide-gray-800">
                  {objectDetail.permissionSetsWithAccess.map((ps) => (
                    <tr key={ps.id} className="hover:bg-primary-50/40 dark:hover:bg-primary-900/15">
                      <td className="px-6 py-4">
                        <div className="text-sm font-medium text-grove-ink dark:text-grove-ink-dk">
                          {ps.label || ps.name}
                        </div>
                        {ps.label && ps.name && ps.label !== ps.name && (
                          <div className="text-xs text-grove-ink/55 dark:text-grove-ink-dk/55 mt-1">
                            API Name: {ps.name}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        {ps.read ? (
                          <Check className="h-5 w-5 text-green-600 mx-auto" />
                        ) : (
                          <X className="h-5 w-5 text-grove-ink/50 mx-auto" />
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        {ps.create ? (
                          <Check className="h-5 w-5 text-green-600 mx-auto" />
                        ) : (
                          <X className="h-5 w-5 text-grove-ink/50 mx-auto" />
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        {ps.edit ? (
                          <Check className="h-5 w-5 text-green-600 mx-auto" />
                        ) : (
                          <X className="h-5 w-5 text-grove-ink/50 mx-auto" />
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        {ps.delete ? (
                          <Check className="h-5 w-5 text-green-600 mx-auto" />
                        ) : (
                          <X className="h-5 w-5 text-grove-ink/50 mx-auto" />
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        {ps.viewAll ? (
                          <Check className="h-5 w-5 text-green-600 mx-auto" />
                        ) : (
                          <X className="h-5 w-5 text-grove-ink/50 mx-auto" />
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        {ps.modifyAll ? (
                          <Check className="h-5 w-5 text-green-600 mx-auto" />
                        ) : (
                          <X className="h-5 w-5 text-grove-ink/50 mx-auto" />
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
                <thead className="bg-primary-50/40 dark:bg-primary-900/10 border-b border-grove-border dark:border-grove-border-dk">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-grove-ink/55 dark:text-grove-ink-dk/55 uppercase">
                      User
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
                  {objectDetail.usersWithAccess.map((user) => (
                    <tr
                      key={user.salesforceUserId}
                      className="hover:bg-primary-50/40 dark:hover:bg-primary-900/15"
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="flex-shrink-0 h-10 w-10 rounded-full bg-primary-100 dark:bg-primary-900 flex items-center justify-center">
                            <span className="text-sm font-medium text-primary-600 dark:text-primary-400">
                              {user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                            </span>
                          </div>
                          <div className="ml-4">
                            <div className="text-sm font-medium text-grove-ink dark:text-grove-ink-dk">
                              {user.name}
                            </div>
                            <div className="text-sm text-grove-ink/55 dark:text-grove-ink-dk/55">
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
              <Users className="mx-auto h-12 w-12 text-grove-ink/50" />
              <h3 className="mt-2 text-sm font-medium text-grove-ink dark:text-grove-ink-dk">
                No users with access
              </h3>
              <p className="mt-1 text-sm text-grove-ink/55 dark:text-grove-ink-dk/55">
                No users have access to this object through profiles or permission sets.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ---------- Data Quality card ----------

/**
 * Renders the per-object Data Quality breakdown: composite score, the
 * three component bars (completeness / dupes / staleness), and up to
 * three evidence lists (worst-populated fields, top duplicate clusters,
 * oldest records) from the run's evidence blob.
 *
 * Presentational only. All computation is server-side; this component
 * just formats what the API returns.
 */
function DataQualityCard({ score }: { score: ObjectScore }) {
  const composite = Math.round(score.score)
  const tone = qualityToneClass(score.score)
  const isEmpty = score.record_count === 0

  // Empty objects still make it into the analysis (so they appear in
  // the Objects list), but the score components are all zero. Render
  // a neutral "no records" panel here instead of showing zeros.
  if (isEmpty) {
    return (
      <Card variant="bordered">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-copper-600 dark:text-copper-400" />
            Data Quality
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-grove-ink/65 dark:text-grove-ink-dk/65">
            This object has no records. There's nothing to score yet — a
            data quality snapshot will surface here once records exist.
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card variant="bordered">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-copper-600 dark:text-copper-400" />
          Data Quality
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Composite score */}
          <div className="flex flex-col items-start justify-center border-r-0 lg:border-r border-grove-border dark:border-grove-border-dk pr-0 lg:pr-6">
            <p className="text-[10px] font-mono uppercase tracking-[0.14em] text-grove-ink/55 dark:text-grove-ink-dk/55">
              Composite
            </p>
            <div className="mt-1 flex items-baseline gap-2">
              <span className={`text-5xl font-bold tabular-nums ${tone}`}>{composite}</span>
              <span className="text-sm text-grove-ink/55 dark:text-grove-ink-dk/55">/ 100</span>
            </div>
            <p className="mt-2 text-xs text-grove-ink/65 dark:text-grove-ink-dk/65">
              {score.record_count.toLocaleString()} records scanned (aggregate SOQL, no record content read)
            </p>
          </div>

          {/* Components */}
          <div className="lg:col-span-2 flex flex-col gap-4">
            <ScoreBar
              label="Completeness"
              caption={
                // "fields_with_gaps" counts fields where MORE than
                // half of the records org-wide are missing that value —
                // "field is empty more often than populated". The
                // Worst-Populated Fields list below shows the top
                // offenders regardless of that threshold, so the two
                // numbers can differ. Making the threshold explicit
                // here removes the ambiguity.
                `${score.fields_with_gaps} of ${score.fields_inspected} fields majority-empty (>50%)`
              }
              value={score.completeness_pct}
              higherIsBetter={true}
            />
            <ScoreBar
              label="Duplicates"
              caption={
                score.duplicate_clusters > 0
                  ? `${score.duplicate_clusters} cluster${
                      score.duplicate_clusters === 1 ? '' : 's'
                    } on ${score.evidence?.duplicate_key ?? 'natural key'}`
                  : 'No duplicate clusters'
              }
              value={score.duplicate_pct}
              higherIsBetter={false}
            />
            <ScoreBar
              label="Staleness"
              caption={`${score.stale_record_count.toLocaleString()} untouched > threshold`}
              value={score.staleness_pct}
              higherIsBetter={false}
            />
          </div>
        </div>

        {/* Evidence — 3 columns showing top offenders per component. */}
        {(score.evidence?.gap_fields?.length ||
          score.evidence?.duplicate_examples?.length ||
          score.evidence?.sf_duplicate_rules?.length) ? (
          <div className="mt-6 pt-6 border-t border-grove-border dark:border-grove-border-dk grid grid-cols-1 md:grid-cols-3 gap-6">
            <EvidenceList
              icon={AlertTriangle}
              // "Top 5 by missing rate" — this list is unfiltered by
              // the 50% majority-empty threshold used in the
              // completeness caption. Any field with even 1% missing
              // can show up here if it's among the top 5.
              title="Top 5 fields by missing rate"
              items={
                score.evidence.gap_fields?.map((g) => ({
                  primary: g.field,
                  secondary: `${Math.round(g.missing_pct)}% missing`,
                  // Tag each row with Custom / Required so the reader
                  // can immediately see which gaps are custom-field
                  // hygiene issues vs. standard-field gaps.
                  badge: g.is_custom
                    ? { label: 'Custom', tone: 'copper' as const }
                    : g.is_required
                    ? { label: 'Required', tone: 'primary' as const }
                    : undefined,
                })) ?? []
              }
              emptyLabel="No gap fields — every scored field is populated."
            />
            <EvidenceList
              icon={Copy}
              // Top clusters come from a GROUP BY aggregate — the key
              // is the shared field VALUE (e.g., a name). If the SF
              // ceiling of 2000 clusters is hit the truncation flag
              // is set and we surface it in the caption.
              title={
                score.evidence.duplicates_truncated
                  ? 'Top duplicate clusters (2000+ found — capped)'
                  : 'Top duplicate clusters'
              }
              items={
                score.evidence.duplicate_examples?.map((d) => ({
                  primary: d.key,
                  secondary: `${d.count} records`,
                })) ?? []
              }
              emptyLabel="No duplicate clusters detected."
            />
            {/* SF's own Duplicate Rules — if configured, treat as the
                authoritative resolver. Points admins at Setup instead
                of us building a merge UI. */}
            <EvidenceList
              icon={Copy}
              title="Salesforce Duplicate Rules"
              items={
                score.evidence.sf_duplicate_rules?.map((r) => ({
                  primary: r.label || r.developer_name,
                  secondary: `${r.record_set_count.toLocaleString()} cluster${
                    r.record_set_count === 1 ? '' : 's'
                  } detected`,
                })) ?? []
              }
              emptyLabel="No active Duplicate Rules configured in Setup for this object."
            />
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

function ScoreBar({
  label,
  caption,
  value,
  higherIsBetter,
}: {
  label: string
  caption: string
  value: number
  higherIsBetter: boolean
}) {
  // For higher-is-better metrics (completeness), bar fill = value.
  // For lower-is-better (dupes, staleness), fill = value and tone flips.
  const clamped = Math.max(0, Math.min(100, value))
  const goodTone =
    (higherIsBetter && clamped >= 85) || (!higherIsBetter && clamped <= 15)
  const midTone =
    (higherIsBetter && clamped >= 65 && clamped < 85) ||
    (!higherIsBetter && clamped > 15 && clamped <= 35)
  const barClass = goodTone
    ? 'bg-primary-500 dark:bg-primary-400'
    : midTone
    ? 'bg-copper-500 dark:bg-copper-400'
    : 'bg-red-500 dark:bg-red-400'

  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-sm font-medium text-grove-ink dark:text-grove-ink-dk">
          {label}
        </span>
        <span className="text-sm tabular-nums text-grove-ink/70 dark:text-grove-ink-dk/70">
          {Math.round(clamped)}%
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-grove-border/60 dark:bg-grove-border-dk/60 overflow-hidden">
        <div
          className={`h-full ${barClass} transition-[width] duration-500 ease-out`}
          style={{ width: `${clamped}%` }}
          aria-hidden
        />
      </div>
      <p className="text-xs text-grove-ink/55 dark:text-grove-ink-dk/55 mt-1">
        {caption}
      </p>
    </div>
  )
}

type EvidenceItem = {
  primary: string
  secondary: string
  badge?: { label: string; tone: 'copper' | 'primary' }
}

function EvidenceList({
  icon: Icon,
  title,
  items,
  emptyLabel,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  items: EvidenceItem[]
  emptyLabel: string
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-[0.08em] text-grove-ink/65 dark:text-grove-ink-dk/65 mb-2">
        <Icon className="h-3.5 w-3.5" />
        {title}
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-grove-ink/45 dark:text-grove-ink-dk/45 italic">
          {emptyLabel}
        </p>
      ) : (
        <ul className="space-y-1.5">
          {items.slice(0, 5).map((item, i) => (
            <li
              key={`${item.primary}-${i}`}
              className="text-xs flex items-baseline justify-between gap-2"
            >
              <span className="min-w-0 flex items-baseline gap-1.5">
                <span className="font-mono truncate text-grove-ink dark:text-grove-ink-dk">
                  {item.primary}
                </span>
                {item.badge && (
                  <span
                    className={
                      item.badge.tone === 'copper'
                        ? 'inline-flex items-center px-1.5 py-0 rounded text-[9px] font-semibold uppercase tracking-wider bg-copper-100 text-copper-700 dark:bg-copper-900/25 dark:text-copper-400 whitespace-nowrap flex-shrink-0'
                        : 'inline-flex items-center px-1.5 py-0 rounded text-[9px] font-semibold uppercase tracking-wider bg-primary-50 text-primary-700 dark:bg-primary-900/25 dark:text-primary-300 whitespace-nowrap flex-shrink-0'
                    }
                  >
                    {item.badge.label}
                  </span>
                )}
              </span>
              <span className="text-grove-ink/55 dark:text-grove-ink-dk/55 whitespace-nowrap">
                {item.secondary}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function qualityToneClass(score: number): string {
  if (score >= 85) return 'text-primary-700 dark:text-primary-400'
  if (score >= 65) return 'text-copper-600 dark:text-copper-400'
  return 'text-red-600 dark:text-red-400'
}

