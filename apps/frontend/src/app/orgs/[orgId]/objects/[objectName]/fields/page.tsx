'use client'

/** An object's fields and relationships, paged and searchable. */

import { useParams } from 'next/navigation'
import { Database } from 'lucide-react'
import { Breadcrumbs } from '@/components/shared/Breadcrumbs'
import { PageHeader } from '@/components/shared/PageHeader'
import { ObjectSchemaList } from '@/components/schema/FieldMetadata'

export default function ObjectFieldsPage() {
  const params = useParams()
  const orgId = params.orgId as string
  const objectName = decodeURIComponent(params.objectName as string)
  return (
    <div className="space-y-6">
      <Breadcrumbs
        crumbs={[
          { label: 'Objects', href: `/orgs/${orgId}/objects` },
          { label: objectName, href: `/orgs/${orgId}/objects/${encodeURIComponent(objectName)}` },
          { label: 'Fields and relationships' },
        ]}
      />
      <PageHeader icon={Database} title={`${objectName}: fields and relationships`} subtitle="From the synced describe" />
      <ObjectSchemaList orgId={orgId} objectName={objectName} />
    </div>
  )
}
