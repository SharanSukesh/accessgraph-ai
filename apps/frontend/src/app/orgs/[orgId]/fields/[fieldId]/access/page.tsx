'use client'

/** Everyone who can access a field: profiles, permission sets, groups and users, paged. */

import { useParams } from 'next/navigation'
import { FileText } from 'lucide-react'
import { Breadcrumbs } from '@/components/shared/Breadcrumbs'
import { PageHeader } from '@/components/shared/PageHeader'
import { AccessListPage } from '@/components/schema/AccessLists'

export default function FieldAccessPage() {
  const params = useParams()
  const orgId = params.orgId as string
  const fieldId = decodeURIComponent(params.fieldId as string)
  return (
    <div className="space-y-6">
      <Breadcrumbs
        crumbs={[
          { label: 'Fields', href: `/orgs/${orgId}/fields` },
          { label: fieldId, href: `/orgs/${orgId}/fields/${encodeURIComponent(fieldId)}` },
          { label: 'Who can access it' },
        ]}
      />
      <PageHeader icon={FileText} title={`Who can access ${fieldId}`} subtitle="Active users by the same rules as the user pages" />
      <AccessListPage orgId={orgId} target="fields" targetId={fieldId} heading="Access" />
    </div>
  )
}
