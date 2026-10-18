'use client'

/**
 * Health Report: API usage (roadmap item 5), the compact summary. The
 * headline, four figures (total, daily average, today against the limit,
 * the peak day), the daily chart against the limit and the top 3 sources;
 * "View full breakdown" opens the API Usage page with everything else.
 * Reads metrics.api_usage from the snapshot. The image pack draws the same
 * card (backend services/report/image_pack.py).
 */

import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/shared/Card'
import {
  DailySection,
  MUTED,
  ShareBar,
  Unavailable,
  UsageFootnote,
  UsageNotes,
  UsageTiles,
} from '@/components/apiUsage/ApiUsageParts'
import { type ApiUsage, compact, headline, topSources } from '@/lib/apiUsage'

export function ApiUsageCard({
  orgId,
  usage,
  action,
}: {
  orgId: string
  usage?: ApiUsage | null
  action?: React.ReactNode
}) {
  if (!usage) return null
  const title = headline(usage)
  const top = topSources(usage, 3)
  const breakdown = (
    <Link
      href={`/orgs/${orgId}/api-usage`}
      className="inline-flex items-center gap-1 text-sm font-medium text-primary-700 hover:underline dark:text-primary-300"
    >
      View full breakdown <ArrowRight className="h-3.5 w-3.5" aria-hidden />
    </Link>
  )

  return (
    <Card variant="bordered">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle>API usage</CardTitle>
          {action}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {usage.status !== 'ok' ? (
          <Unavailable usage={usage} />
        ) : (
          <>
            {title && <p className="text-lg font-semibold text-grove-ink dark:text-grove-ink-dk">{title}</p>}
            <UsageTiles usage={usage} />
            <UsageNotes usage={usage} />
            <DailySection usage={usage} />
            {top.length > 0 && (
              <div>
                <p className="mb-1.5 text-xs font-semibold text-grove-ink/80 dark:text-grove-ink-dk/80">Top sources</p>
                <ul className="divide-y divide-grove-border rounded-md border border-grove-border dark:divide-grove-border-dk dark:border-grove-border-dk">
                  {top.map((a) => (
                    <li key={a.id ?? a.name} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 px-3 py-2 text-sm">
                      <span className="truncate text-grove-ink dark:text-grove-ink-dk" title={a.name}>{a.name}</span>
                      <ShareBar pct={a.share_pct} />
                      <span className={`v2-num w-14 text-right text-xs ${MUTED}`}>{compact(a.requests)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <UsageFootnote usage={usage} />
          {breakdown}
        </div>
      </CardContent>
    </Card>
  )
}
