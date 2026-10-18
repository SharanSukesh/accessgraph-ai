'use client'

/**
 * A permission set group: its permission sets, its muting set, how many
 * users hold it, and the Apex classes and flows it grants through its sets.
 * Configuration only, so it works at every privacy level.
 */

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Ban, KeyRound, Layers } from 'lucide-react'
import { SetAutomationCard } from '@/components/access/SetAutomationCard'
import { Breadcrumbs } from '@/components/shared/Breadcrumbs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/shared/Card'
import { ErrorState } from '@/components/shared/ErrorState'
import { PageSkeleton } from '@/components/shared/LoadingSkeleton'
import { PageHeader } from '@/components/shared/PageHeader'
import { Reveal } from '@/components/v2/motion'
import { usePermissionSetGroup } from '@/lib/api/hooks/usePagesAndAutomation'

const MUTED = 'text-grove-ink/60 dark:text-grove-ink-dk/60'

export default function PermissionSetGroupPage() {
  const params = useParams()
  const orgId = params.orgId as string
  const groupId = params.groupId as string
  const { data: g, isLoading, error, refetch } = usePermissionSetGroup(orgId, groupId)
  if (isLoading) return <PageSkeleton />
  if (error || !g) return <ErrorState message={(error as Error)?.message || 'Permission set group not found.'} onRetry={() => refetch()} />

  const setRow = (s: { id: string; label: string | null }) =>
    s.label ? (
      <Link className="underline-offset-2 hover:underline" href={`/orgs/${orgId}/permission-sets/${s.id}`}>{s.label}</Link>
    ) : (
      <span className="font-mono text-xs">{s.id}</span>
    )

  return (
    <div className="space-y-4">
      <Breadcrumbs crumbs={[{ label: 'Permission set groups' }, { label: g.label }]} />
      <Reveal>
        <PageHeader
          icon={Layers}
          eyebrow="Explore · permission set group"
          title={g.label}
          subtitle={[g.developer_name && `API name ${g.developer_name}`,
            g.users != null && `${g.users.toLocaleString('en-GB')} ${g.users === 1 ? 'user' : 'users'}`].filter(Boolean).join(' · ') || undefined}
        />
      </Reveal>
      <div className="grid gap-4 md:grid-cols-2">
        <Card variant="bordered">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><KeyRound className="h-5 w-5 text-primary-700" /> Permission sets ({g.permission_sets.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {g.permission_sets.length ? (
              <ul className="space-y-1 text-sm">{g.permission_sets.map((s) => <li key={s.id}>{setRow(s)}</li>)}</ul>
            ) : <p className={`text-sm ${MUTED}`}>None.</p>}
          </CardContent>
        </Card>
        <Card variant="bordered">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Ban className="h-5 w-5 text-rose-600" /> Muting set</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {g.muting_sets.length ? (
              <ul className="space-y-1">{g.muting_sets.map((s) => <li key={s.id}>{setRow(s)}</li>)}</ul>
            ) : <p className={MUTED}>No muting set.</p>}
            <p className={`text-xs ${MUTED}`}>A muting set removes permissions the group&apos;s sets would otherwise grant.</p>
          </CardContent>
        </Card>
      </div>
      <SetAutomationCard orgId={orgId} psId={groupId} data={g.automation} />
      {g.users == null && <p className={`text-xs ${MUTED}`}>User counts aren&apos;t shown: this client&apos;s privacy level excludes user records.</p>}
    </div>
  )
}
