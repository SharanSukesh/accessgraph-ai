'use client'

/** Everyone who can access an object: profiles, permission sets, groups and users, paged. */

import { useParams } from 'next/navigation'
import { Database } from 'lucide-react'
import { Breadcrumbs } from '@/components/shared/Breadcrumbs'
import { PageHeader } from '@/components/shared/PageHeader'
import { AccessListPage } from '@/components/schema/AccessLists'

export default function ObjectAccessPage() {
  const params = useParams()
  const orgId = params.orgId as string
  const objectName = decodeURIComponent(params.objectName as string)
  return (
    <div className="space-y-6">
      <Breadcrumbs
        crumbs={[
          { label: 'Objects', href: `/orgs/${orgId}/objects` },
          { label: objectName, href: `/orgs/${orgId}/objects/${encodeURIComponent(objectName)}` },
          { label: 'Who can access it' },
        ]}
      />
      <PageHeader icon={Database} title={`Who can access ${objectName}`} subtitle="Active users by the same rules as the user pages" />
      <AccessListPage orgId={orgId} target="objects" targetId={objectName} heading="Access" />
    </div>
  )
}
