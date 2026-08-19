'use client'

/**
 * Sprawl — merged inventory across 4 Salesforce surfaces.
 *
 * Same "tiered inventory" pattern applied to:
 *   - Packages     — installed AppExchange packages, tiered active /
 *                    underused / unused.
 *   - Reports      — Reports + Dashboards, tiered live / zombie /
 *                    orphaned / duplicate.
 *   - Automations  — Flows + Apex triggers, tiered active / dormant /
 *                    orphaned / broken.
 *   - Integrations — Connected Apps + Named Credentials + External
 *                    Data Sources + Auth Providers + Remote Sites,
 *                    tiered healthy / stale / broken / unknown.
 *
 * A single "Sprawl" landing with a segmented type picker so the
 * consultant doesn't jump between four sidebar entries. Deep-link via
 * `?type=packages|reports|automations|integrations`.
 *
 * License Fit is deliberately NOT merged in here — the CFO / dollar-
 * savings framing there is qualitatively different from the cleanup-
 * tier framing of these four; keeping it separate preserves both
 * stories.
 */

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  Boxes,
  Package,
  FileBarChart,
  Workflow,
  Plug,
} from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { Reveal } from '@/components/v2/motion'
import { cn } from '@/lib/utils/cn'
import { PackageSprawlView } from '../package-sprawl/view'
import { ReportSprawlView } from '../report-sprawl/view'
import { AutomationSprawlView } from '../automation-sprawl/view'
import { IntegrationSprawlView } from '../integration-sprawl/view'

type SprawlType = 'packages' | 'reports' | 'automations' | 'integrations'

export default function SprawlPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const paramType = searchParams.get('type')
  const initialType: SprawlType =
    paramType === 'reports'
      ? 'reports'
      : paramType === 'automations'
      ? 'automations'
      : paramType === 'integrations'
      ? 'integrations'
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
      <Reveal>
        <PageHeader
          icon={Boxes}
          title="Sprawl"
          eyebrow="Optimize · cleanup"
          subtitle="Inventory + tier scoring for installed packages, reports & dashboards, automations, and integrations."
        />
      </Reveal>

      <div className="inline-flex items-center gap-1 rounded-xl bg-grove-canvas p-1 ring-1 ring-grove-border dark:bg-grove-canvas-dk dark:ring-grove-border-dk overflow-x-auto max-w-full">
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
        <TypeButton
          active={type === 'integrations'}
          onClick={() => setType('integrations')}
          icon={Plug}
        >
          Integrations
        </TypeButton>
      </div>

      {type === 'packages' ? (
        <PackageSprawlView embedded />
      ) : type === 'reports' ? (
        <ReportSprawlView embedded />
      ) : type === 'automations' ? (
        <AutomationSprawlView embedded />
      ) : (
        <IntegrationSprawlView embedded />
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
        'inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg whitespace-nowrap transition-colors',
        active
          ? 'bg-primary-700 text-white dark:bg-primary-400 dark:text-grove-canvas-dk'
          : 'text-grove-ink/70 dark:text-grove-ink-dk/70 hover:text-primary-700 dark:hover:text-primary-300',
      )}
    >
      <Icon className="h-4 w-4" />
      {children}
    </button>
  )
}
