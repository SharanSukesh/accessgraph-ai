'use client'

/** What a profile grants on its own: page layouts, record pages, Apex classes or flows, paged. */

import { useParams } from 'next/navigation'
import { LayoutGrid } from 'lucide-react'
import { Breadcrumbs } from '@/components/shared/Breadcrumbs'
import { PageHeader } from '@/components/shared/PageHeader'
import { PA_SECTIONS, PASection, PagesAndAutomationList } from '@/components/users/PagesAndAutomationPanel'

export default function ProfilePagesAndAutomationListPage() {
  const params = useParams()
  const orgId = params.orgId as string
  const profileId = params.profileId as string
  const section = (params.section as string) as PASection
  const title = PA_SECTIONS[section] ?? 'Pages & automation'
  return (
    <div className="space-y-6">
      <Breadcrumbs
        crumbs={[
          { label: 'Profiles', href: `/orgs/${orgId}/profiles` },
          { label: 'Profile', href: `/orgs/${orgId}/profiles/${profileId}` },
          { label: title },
        ]}
      />
      <PageHeader icon={LayoutGrid} title={title} subtitle="What this profile grants on its own" />
      {PA_SECTIONS[section] && <PagesAndAutomationList orgId={orgId} profileId={profileId} section={section} />}
    </div>
  )
}
