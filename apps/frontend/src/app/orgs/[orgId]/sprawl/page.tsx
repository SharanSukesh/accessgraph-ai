'use client'

/**
 * Sprawl — merged Package + Report + Automation inventory.
 *
 * Same "tiered inventory" pattern applied to three different Salesforce
 * surfaces:
 *   - Packages    — installed AppExchange packages, tiered active /
 *                   underused / unused.
 *   - Reports     — Reports + Dashboards, tiered live / zombie /
 *                   orphaned / duplicate.
 *   - Automations — Flows + Apex triggers, tiered active / dormant /
 *                   orphaned / broken.
 *
 * A single "Sprawl" landing with a segmented type picker so the
 * consultant doesn't jump between three sidebar entries. Deep-link
 * via `?type=packages|reports|automations`.
 *
 * License Fit is deliberately NOT merged in here — the CFO / dollar-
 * savings framing there is qualitatively different from the cleanup-
 * tier framing of these three; keeping it separate preserves both
 * stories.
 */

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Boxes, Package, FileBarChart, Workflow } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { cn } from '@/lib/utils/cn'
import { PackageSprawlView } from '../package-sprawl/view'
import { ReportSprawlView } from '../report-sprawl/view'
import { AutomationSprawlView } from '../automation-sprawl/view'

type SprawlType = 'packages' | 'reports' | 'automations'

export default function SprawlPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const paramType = searchParams.get('type')
  const initialType: SprawlType =
    paramType === 'reports'
      ? 'reports'
      : paramType === 'automations'
      ? 'automations'
      : 'packages'
  const [type, setType] = useState<SprawlType>(initialType)

  useEffect(() => {
    const current = searchParams.get('type')
    if (current !== type) {
      const qs = new URLSearchParams(Array.from(searchParams.entries()))
      qs.set('type', type)
      router.replace(`?${qs.toString()}`, { scroll: false })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type])

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Boxes}
        title="Sprawl"
        subtitle="Inventory + tier scoring for installed packages, reports & dashboards, and automations."
      />

      <div className="flex items-center gap-1 border-b border-grove-border dark:border-grove-border-dk">
        <TypeButton
          active={type === 'packages'}
          onClick={() => setType('packages')}
          icon={Package}
        >
          Packages
        </TypeButton>
        <TypeButton
          active={type === 'reports'}
          onClick={() => setType('reports')}
          icon={FileBarChart}
        >
          Reports &amp; Dashboards
        </TypeButton>
        <TypeButton
          active={type === 'automations'}
          onClick={() => setType('automations')}
          icon={Workflow}
        >
          Automations
        </TypeButton>
      </div>

      {type === 'packages' ? (
        <PackageSprawlView embedded />
      ) : type === 'reports' ? (
        <ReportSprawlView embedded />
      ) : (
        <AutomationSprawlView embedded />
      )}
    </div>
  )
}

function TypeButton({
  active,
  onClick,
  icon: Icon,
  children,
}: {
  active: boolean
  onClick: () => void
  icon: React.ComponentType<{ className?: string }>
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
        active
          ? 'border-primary-700 text-primary-700 dark:border-primary-400 dark:text-primary-400'
          : 'border-transparent text-grove-ink/70 dark:text-grove-ink-dk/70 hover:text-primary-700 dark:hover:text-primary-300 hover:border-grove-border dark:hover:border-grove-border-dk',
      )}
    >
      <Icon className="h-4 w-4" />
      {children}
    </button>
  )
}
