'use client'

/**
 * Profiles (roadmap item 1): every profile, with its API name and active
 * users when the privacy level keeps users. Each opens the profile's page
 * layouts, record pages, Apex and flows. Configuration only, so it works at
 * every privacy level, Metadata only included.
 */

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { UserCircle } from 'lucide-react'
import { Card, CardContent } from '@/components/shared/Card'
import { ErrorState } from '@/components/shared/ErrorState'
import { TableSkeleton } from '@/components/shared/LoadingSkeleton'
import { PageHeader } from '@/components/shared/PageHeader'
import { Reveal } from '@/components/v2/motion'
import { useProfiles } from '@/lib/api/hooks/usePagesAndAutomation'

const MUTED = 'text-grove-ink/60 dark:text-grove-ink-dk/60'

export default function ProfilesPage() {
  const orgId = useParams().orgId as string
  const { data, isLoading, error, refetch } = useProfiles(orgId)
  return (
    <div className="space-y-4">
      <Reveal>
        <PageHeader
          icon={UserCircle}
          eyebrow="Explore · access"
          title="Profiles"
          subtitle="Each profile's page layouts, record pages, Apex classes and flows."
        />
      </Reveal>
      {isLoading ? (
        <TableSkeleton rows={8} />
      ) : error || !data ? (
        <ErrorState message="Failed to load profiles." onRetry={() => refetch()} />
      ) : (
        <Card variant="bordered">
          <CardContent className="overflow-x-auto pt-4">
            <table className="w-full text-sm">
              <thead>
                <tr className={`text-left text-xs ${MUTED}`}>
                  <th className="py-1.5 pr-3 font-medium">Profile</th>
                  <th className="py-1.5 pr-3 font-medium">API name</th>
                  {data.users_allowed && <th className="py-1.5 text-right font-medium">Active users</th>}
                </tr>
              </thead>
              <tbody>
                {data.profiles.map((p) => (
                  <tr key={p.id} className="border-t border-grove-border dark:border-grove-border-dk">
                    <td className="py-1.5 pr-3">
                      <Link className="font-medium underline-offset-2 hover:underline" href={`/orgs/${orgId}/profiles/${p.id}`}>{p.name}</Link>
                    </td>
                    <td className={`py-1.5 pr-3 font-mono text-xs ${MUTED}`}>{p.api_name ?? 'not read'}</td>
                    {data.users_allowed && <td className="v2-num py-1.5 text-right">{p.active_users}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
            {!data.users_allowed && (
              <p className={`mt-3 text-xs ${MUTED}`}>User counts aren&apos;t shown: this client&apos;s privacy level excludes user records.</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
