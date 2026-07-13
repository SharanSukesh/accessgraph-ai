'use client'

/**
 * Schema — merged Objects + Fields surface.
 *
 * A single "browse the org's schema" landing with a segmented control
 * switching between the Objects and Fields views. Both views are the
 * existing pages rendered in `embedded` mode (they hide their own
 * PageHeader when embedded so we can render one shared Schema
 * PageHeader above the tabs).
 *
 * URL preserves the tab: `/orgs/{id}/schema?tab=objects|fields`. Deep-
 * linkable, back-button friendly. Old `/objects` and `/fields` routes
 * remain reachable — they render exactly the same view, just with
 * their own PageHeader. Bookmarks don't break.
 */

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Layers, Database, FileText } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { cn } from '@/lib/utils/cn'
import { ObjectsView } from '../objects/view'
import { FieldsView } from '../fields/view'

type SchemaTab = 'objects' | 'fields'

export default function SchemaPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const paramTab = searchParams.get('tab')
  const initialTab: SchemaTab =
    paramTab === 'fields' ? 'fields' : 'objects'
  const [tab, setTab] = useState<SchemaTab>(initialTab)

  // Keep URL in sync when the user clicks a tab. Uses replace so the
  // back button doesn't stack tab switches as history entries.
  useEffect(() => {
    const current = searchParams.get('tab')
    if (current !== tab) {
      const qs = new URLSearchParams(Array.from(searchParams.entries()))
      qs.set('tab', tab)
      router.replace(`?${qs.toString()}`, { scroll: false })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Layers}
        title="Schema"
        subtitle="Browse Salesforce objects and fields — permissions, access patterns, and field-level security."
      />

      <div className="flex items-center gap-1 border-b border-grove-border dark:border-grove-border-dk">
        <TabButton
          active={tab === 'objects'}
          onClick={() => setTab('objects')}
          icon={Database}
        >
          Objects
        </TabButton>
        <TabButton
          active={tab === 'fields'}
          onClick={() => setTab('fields')}
          icon={FileText}
        >
          Fields
        </TabButton>
      </div>

      {tab === 'objects' ? (
        <ObjectsView embedded />
      ) : (
        <FieldsView embedded />
      )}
    </div>
  )
}

function TabButton({
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
