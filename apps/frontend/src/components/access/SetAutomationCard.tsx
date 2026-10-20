'use client'

import Link from 'next/link'
import { Settings } from 'lucide-react'
import { Badge } from '@/components/shared/Badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/shared/Card'
import { useSetAutomation } from '@/lib/api/hooks/usePagesAndAutomation'
import type { SetAutomation } from '@/lib/pagesAndAutomation'

/** Apex classes and flows this set (or group, through its sets) grants (roadmap item 1). */
export function SetAutomationCard({ orgId, psId, data: given }: { orgId: string; psId: string; data?: SetAutomation & { muting_note?: string | null } }) {
  const fetched = useSetAutomation(orgId, psId, !given)
  const data = given ?? fetched.data
  const isLoading = !given && fetched.isLoading
  const muted = 'text-grove-ink/60 dark:text-grove-ink-dk/60'
  return (
    <Card variant="bordered">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings className="h-5 w-5 text-primary-700" /> Apex classes and flows
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {isLoading ? (
          <p className={muted}>Loading…</p>
        ) : !data?.available ? (
          <p className={muted}>{data?.reason ?? 'Not read yet.'}</p>
        ) : (
          <>
            <div>
              <p className="mb-1 text-xs font-semibold">Apex classes ({(data.counts?.apex ?? data.apex?.length ?? 0).toLocaleString('en-US')})</p>
              {data.apex?.length ? (
                <ul className="grid gap-x-6 gap-y-0.5 font-mono text-xs sm:grid-cols-2">
                  {data.apex.map((c) => (
                    <li key={c.id}>{c.namespace ? `${c.namespace}.` : ''}{c.name}
                      {c.via.length > 0 && c.via[0].length > 0 && psId.startsWith('0PG') && (
                        <span className={`ml-1 font-sans ${muted}`}>({c.via.map((p) => p.join(' → ')).join('; ')})</span>
                      )}
                    </li>
                  ))}
                </ul>
              ) : <p className={muted}>None.</p>}
              <More orgId={orgId} psId={psId} section="apex" shown={data.apex?.length ?? 0} total={data.counts?.apex} />
            </div>
            <div>
              <p className="mb-1 text-xs font-semibold">Flows ({(data.counts?.flows ?? data.flows?.length ?? 0).toLocaleString('en-US')})</p>
              {data.flows?.length ? (
                <ul className="space-y-0.5 text-xs">
                  {data.flows.map((f) => (
                    <li key={f.id}>
                      {f.label}
                      {f.restricted && <Badge variant="warning" size="sm" className="ml-1.5">Explicit access</Badge>}
                      {psId.startsWith('0PG') && <span className={`ml-1 ${muted}`}>({f.via.map((p) => p.join(' → ')).join('; ')})</span>}
                    </li>
                  ))}
                </ul>
              ) : <p className={muted}>None.</p>}
              <More orgId={orgId} psId={psId} section="flows" shown={data.flows?.length ?? 0} total={data.counts?.flows} />
            </div>
            <p className="text-xs">Run Flows permission: <strong>{data.run_flows == null ? 'not read' : data.run_flows ? 'yes' : 'no'}</strong></p>
            {data.apex_note && <p className={`text-xs ${muted}`}>{data.apex_note}</p>}
            {data.muting_note && <p className={`text-xs ${muted}`}>{data.muting_note}</p>}
          </>
        )}
      </CardContent>
    </Card>
  )
}

/** "Showing 10 of 240 · View all" under a preview list. */
function More({ orgId, psId, section, shown, total }: { orgId: string; psId: string; section: 'apex' | 'flows'; shown: number; total?: number }) {
  if (!total || total <= shown) return null
  return (
    <p className="mt-1 text-xs text-grove-ink/65 dark:text-grove-ink-dk/65">
      Showing {shown} of {total.toLocaleString('en-US')} ·{' '}
      <Link href={`/orgs/${orgId}/permission-sets/${psId}/automation/${section}`} className="font-medium text-primary-700 hover:underline dark:text-primary-300">
        View all
      </Link>
    </p>
  )
}
