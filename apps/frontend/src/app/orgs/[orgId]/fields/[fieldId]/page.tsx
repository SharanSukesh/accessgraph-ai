'use client'

/**
 * Field Detail Page
 * Shows detailed information about a Salesforce field including permissions
 */

import { useParams, useRouter } from 'next/navigation'
import { FileText, ChevronLeft, Database } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/shared/Card'
import { Button } from '@/components/shared/Button'
import { Badge } from '@/components/shared/Badge'
import { ErrorState } from '@/components/shared/ErrorState'
import { TableSkeleton } from '@/components/shared/LoadingSkeleton'

export default function FieldDetailPage() {
  const params = useParams()
  const router = useRouter()
  const orgId = params.orgId as string
  const fieldId = params.fieldId as string

  // Parse fieldId which is in format "ObjectName.FieldName"
  const [objectName, fieldName] = decodeURIComponent(fieldId).split('.')

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
                {fieldName}
              </h1>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400 flex items-center gap-2">
                <Database className="h-4 w-4" />
                {objectName}
              </p>
            </div>
            {fieldName?.endsWith('__c') && (
              <Badge variant="info" size="sm">
                Custom
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <Card variant="bordered">
        <CardContent className="py-12">
          <div className="text-center">
            <FileText className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">
              Field Details Coming Soon
            </h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Detailed field permissions and user access information will be displayed here.
            </p>
            <div className="mt-6">
              <Button
                variant="primary"
                onClick={() => router.push(`/orgs/${orgId}/objects/${objectName}`)}
              >
                View {objectName} Object
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
