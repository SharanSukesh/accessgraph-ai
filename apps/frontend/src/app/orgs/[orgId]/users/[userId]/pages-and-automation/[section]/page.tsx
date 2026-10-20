'use client'

/** One user's page layouts, record pages, Apex classes or flows: the full list, paged. */

import { useParams } from 'next/navigation'
import { LayoutGrid } from 'lucide-react'
import { Breadcrumbs } from '@/components/shared/Breadcrumbs'
import { PageHeader } from '@/components/shared/PageHeader'
import { PA_SECTIONS, PASection, PagesAndAutomationList } from '@/components/users/PagesAndAutomationPanel'
import { useUser } from '@/lib/api/hooks/useUsers'

export default function UserPagesAndAutomationListPage() {
  const params = useParams()
  const orgId = params.orgId as string
  const userId = params.userId as string
  const section = (params.section as string) as PASection
  const { data: user } = useUser(orgId, userId)
  const title = PA_SECTIONS[section] ?? 'Pages & automation'
  return (
    <div className="space-y-6">
      <Breadcrumbs
        crumbs={[
          { label: 'Users', href: `/orgs/${orgId}/users` },
          { label: (user as any)?.name || userId, href: `/orgs/${orgId}/users/${userId}?tab=pages` },
          { label: title },
        ]}
      />
      <PageHeader icon={LayoutGrid} title={title} subtitle={(user as any)?.name ? `For ${(user as any).name}` : undefined} />
      {PA_SECTIONS[section] && <PagesAndAutomationList orgId={orgId} userId={userId} section={section} />}
    </div>
  )
}
