'use client'

/**
 * A profile's page layouts, record pages, Apex classes and flows (roadmap
 * item 1). Configuration only, so it works at every privacy level; at
 * Metadata only it's where this view lives, since there's no user page.
 */

import { useParams } from 'next/navigation'
import { UserCircle } from 'lucide-react'
import { Breadcrumbs } from '@/components/shared/Breadcrumbs'
import { PageHeader } from '@/components/shared/PageHeader'
import { Reveal } from '@/components/v2/motion'
import { PagesAndAutomationPanel } from '@/components/users/PagesAndAutomationPanel'
import { useProfilePagesAndAutomation } from '@/lib/api/hooks/usePagesAndAutomation'

export default function ProfileDetailPage() {
  const params = useParams()
  const orgId = params.orgId as string
  const profileId = params.profileId as string
  const { data } = useProfilePagesAndAutomation(orgId, profileId)
  return (
    <div className="space-y-4">
      <Breadcrumbs crumbs={[{ label: 'Profiles', href: `/orgs/${orgId}/profiles` }, { label: data?.profile ?? profileId }]} />
      <Reveal>
        <PageHeader
          icon={UserCircle}
          eyebrow="Explore · profile"
          title={data?.profile ?? 'Profile'}
          subtitle={data?.profile_api_name ? `API name ${data.profile_api_name}` : undefined}
        />
      </Reveal>
      <PagesAndAutomationPanel orgId={orgId} profileId={profileId} />
    </div>
  )
}
