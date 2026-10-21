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
import { AccessCard } from '@/components/schema/AccessLists'

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
                  {field.totalUsers === null ? '—' : field.totalUsers.toLocaleString('en-US')}
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

      {/* Who can access it: counts per kind, the first 10, and View all (paged). */}
      <AccessCard orgId={orgId} target="fields" targetId={fieldId} summary={field.access} title="Who can access this field" />
    </div>
  )
}
