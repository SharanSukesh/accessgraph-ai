'use client'

/**
 * v2 Permission Sets — the grants inventory.
 *
 * Structure: PageTitle → KPI strip → copper retirement callout →
 * V2Table of permission sets with the risky one flagged. Data from
 * the shared PERMISSION_SETS mock.
 */

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { KeySquare, Archive, ShieldAlert, ArrowRight, Search } from 'lucide-react'
import { Reveal, Stagger, StaggerItem } from '@/components/v2/motion'
import {
  PageTitle, V2Card, StatCard, SectionHeading, SeverityChip, Pill,
  V2Table, V2Row, Td,
} from '@/components/v2/primitives'
import { PERMISSION_SETS } from '@/lib/v2/mock-data'

export default function PermissionSetsPage() {
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return PERMISSION_SETS
    return PERMISSION_SETS.filter(
      (ps) => ps.label.toLowerCase().includes(q) || ps.api.toLowerCase().includes(q),
    )
  }, [query])

  return (
    <div className="space-y-10">
      <Reveal>
        <PageTitle
          eyebrow="Explore · grants"
          title="Permission Sets"
          subtitle="Every grant container in the org — who holds it, what it unlocks, and which ones are dead weight."
        />
      </Reveal>

      {/* KPI strip */}
      <Stagger className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        <StaggerItem>
          <StatCard label="Total" value={412} icon={KeySquare} delta="36 permission set groups" />
        </StaggerItem>
        <StaggerItem>
          <StatCard label="Zero-assignment" value={214} icon={Archive} delta="52% of all permission sets" deltaTone="bad" />
        </StaggerItem>
        <StaggerItem>
          <StatCard label="High-risk system perms" value={8} icon={ShieldAlert} delta="Modify All Data · View All Data" deltaTone="bad" />
        </StaggerItem>
      </Stagger>

      {/* Retirement callout */}
      <Reveal>
        <V2Card className="border-l-4 border-l-copper-500 p-6 dark:border-l-copper-400">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-grove-ink dark:text-grove-ink-dk">
                214 permission sets have zero assignees — prime retirement candidates
              </p>
              <p className="mt-1 text-xs leading-relaxed text-grove-ink/60 dark:text-grove-ink-dk/60">
                Orphaned grants from the 2024 org merge. Retiring them shrinks the audit surface with no user impact.
              </p>
            </div>
            <Link
              href="/v2/orgs/demo/restructure"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-copper-600 transition-colors hover:text-copper-700 dark:text-copper-400 dark:hover:text-copper-300"
            >
              Plan the retirement <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </V2Card>
      </Reveal>

      {/* Inventory */}
      <Reveal>
        <V2Card className="p-6">
          <SectionHeading
            title="Inventory"
            hint={`${filtered.length} of ${PERMISSION_SETS.length} shown`}
            actions={
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-grove-ink/40 dark:text-grove-ink-dk/40" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search label or API name…"
                  className="w-60 rounded-xl border border-grove-border bg-grove-canvas py-2 pl-9 pr-3 text-sm text-grove-ink placeholder:text-grove-ink/40 transition-colors focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 dark:border-grove-border-dk dark:bg-grove-canvas-dk dark:text-grove-ink-dk dark:placeholder:text-grove-ink-dk/40 dark:focus:border-primary-400"
                />
              </div>
            }
          />

          <V2Table head={['Permission set', 'Type', 'Assignees', 'Risk flags', 'Profile-owned']}>
            {filtered.map((ps) => (
              <V2Row key={ps.id} onClick={() => {}}>
                <Td>
                  <p className="font-semibold text-grove-ink dark:text-grove-ink-dk">{ps.label}</p>
                  <p className="font-mono text-xs text-grove-ink/50 dark:text-grove-ink-dk/50">{ps.api}</p>
                </Td>
                <Td>
                  <Pill tone={ps.type === 'Group' ? 'mint' : 'neutral'}>{ps.type}</Pill>
                </Td>
                <Td>
                  <span className={`v2-num font-semibold ${
                    ps.assignees === 0
                      ? 'text-grove-ink/35 dark:text-grove-ink-dk/35'
                      : 'text-grove-ink dark:text-grove-ink-dk'
                  }`}>
                    {ps.assignees}
                  </span>
                </Td>
                <Td>
                  {'risky' in ps && ps.risky ? (
                    <SeverityChip severity="critical" label="Modify All Data" />
                  ) : (
                    <span className="text-grove-ink/30 dark:text-grove-ink-dk/30">—</span>
                  )}
                </Td>
                <Td>
                  <span className="text-grove-ink/30 dark:text-grove-ink-dk/30">—</span>
                </Td>
              </V2Row>
            ))}
          </V2Table>

          {filtered.length === 0 && (
            <p className="py-10 text-center text-sm text-grove-ink/55 dark:text-grove-ink-dk/55">
              No permission sets match that search.
            </p>
          )}
        </V2Card>
      </Reveal>
    </div>
  )
}
