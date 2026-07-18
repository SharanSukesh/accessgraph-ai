'use client'

/**
 * v2 Users — the people directory.
 *
 * Structure: PageTitle → KPI strip → directory card (search + risk
 * filter Segmented + V2Table). Rows click through to the user detail
 * page. All data from the shared mock module.
 */

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Users, UserCheck, ShieldAlert, MoonStar, Search, ChevronRight } from 'lucide-react'
import { Reveal, Stagger, StaggerItem } from '@/components/v2/motion'
import {
  PageTitle, V2Card, StatCard, SectionHeading, Segmented,
  V2Table, V2Row, Td,
} from '@/components/v2/primitives'
import { ORG, PEOPLE } from '@/lib/v2/mock-data'

type RiskFilter = 'all' | 'critical' | 'high' | 'elevated' | 'normal'

const RISK_FILTERS: { key: RiskFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'critical', label: 'Critical 85+' },
  { key: 'high', label: 'High 70–84' },
  { key: 'elevated', label: 'Elevated 50–69' },
  { key: 'normal', label: 'Normal' },
]

function riskBand(risk: number): { tone: string; label: string } {
  if (risk >= 85) return { tone: 'text-red-700 dark:text-red-400', label: 'Critical' }
  if (risk >= 70) return { tone: 'text-orange-600 dark:text-orange-400', label: 'High' }
  if (risk >= 50) return { tone: 'text-amber-600 dark:text-amber-400', label: 'Elevated' }
  return { tone: 'text-primary-600 dark:text-primary-400', label: 'Normal' }
}

function matchesFilter(risk: number, filter: RiskFilter): boolean {
  switch (filter) {
    case 'critical':
      return risk >= 85
    case 'high':
      return risk >= 70 && risk < 85
    case 'elevated':
      return risk >= 50 && risk < 70
    case 'normal':
      return risk < 50
    default:
      return true
  }
}

export default function UsersPage() {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<RiskFilter>('all')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return PEOPLE.filter((p) => {
      if (!matchesFilter(p.risk, filter)) return false
      if (!q) return true
      return (
        p.name.toLowerCase().includes(q) ||
        p.title.toLowerCase().includes(q) ||
        p.dept.toLowerCase().includes(q) ||
        p.profile.toLowerCase().includes(q)
      )
    })
  }, [query, filter])

  return (
    <div className="space-y-10">
      <Reveal>
        <PageTitle
          eyebrow="Explore · people"
          title="Users"
          subtitle="Every user's effective access, risk posture, and activity — resolved across profiles, permission sets, and sharing."
        />
      </Reveal>

      {/* KPI strip */}
      <Stagger className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <StaggerItem>
          <StatCard label="Total users" value={ORG.users} icon={Users} delta="across all license types" />
        </StaggerItem>
        <StaggerItem>
          <StatCard label="Active" value={ORG.activeUsers} icon={UserCheck} delta="logged in this quarter" deltaTone="good" />
        </StaggerItem>
        <StaggerItem>
          <StatCard label="High risk (70+)" value={23} icon={ShieldAlert} delta="4 hold Modify All Data" deltaTone="bad" />
        </StaggerItem>
        <StaggerItem>
          <StatCard label="Never logged in 90d+" value={67} icon={MoonStar} delta="license reclaim candidates" deltaTone="bad" />
        </StaggerItem>
      </Stagger>

      {/* Directory */}
      <Reveal>
        <V2Card className="p-6">
          <SectionHeading
            title="Directory"
            hint={`${filtered.length} of ${PEOPLE.length} shown · click a row for effective access`}
          />

          <div className="mb-5 flex flex-wrap items-center gap-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-grove-ink/40 dark:text-grove-ink-dk/40" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search name, title, department…"
                className="w-64 rounded-xl border border-grove-border bg-grove-canvas py-2 pl-9 pr-3 text-sm text-grove-ink placeholder:text-grove-ink/40 transition-colors focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 dark:border-grove-border-dk dark:bg-grove-canvas-dk dark:text-grove-ink-dk dark:placeholder:text-grove-ink-dk/40 dark:focus:border-primary-400"
              />
            </div>
            <Segmented
              options={RISK_FILTERS.map((f) => ({ key: f.key, label: f.label }))}
              value={filter}
              onChange={(k) => setFilter(k as RiskFilter)}
            />
          </div>

          <V2Table head={['User', 'Department', 'Profile', 'Risk', 'Last login', '']}>
            {filtered.map((p) => {
              const band = riskBand(p.risk)
              return (
                <V2Row key={p.id} onClick={() => router.push(`/v2/orgs/demo/users/${p.id}`)}>
                  <Td>
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-700 text-xs font-bold text-white dark:bg-primary-400 dark:text-grove-canvas-dk">
                        {p.name.split(' ').map((w) => w[0]).join('')}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-grove-ink dark:text-grove-ink-dk">{p.name}</p>
                        <p className="truncate text-xs text-grove-ink/55 dark:text-grove-ink-dk/55">{p.title}</p>
                      </div>
                    </div>
                  </Td>
                  <Td>{p.dept}</Td>
                  <Td className="text-grove-ink/70 dark:text-grove-ink-dk/70">{p.profile}</Td>
                  <Td>
                    <span className="flex items-baseline gap-1.5">
                      <span className={`v2-num text-base font-semibold ${band.tone}`}>{p.risk}</span>
                      <span className={`text-[11px] font-medium ${band.tone}`}>{band.label}</span>
                    </span>
                  </Td>
                  <Td className="whitespace-nowrap text-grove-ink/70 dark:text-grove-ink-dk/70">{p.lastLogin}</Td>
                  <Td className="w-8">
                    <ChevronRight className="h-4 w-4 text-grove-ink/30 dark:text-grove-ink-dk/30" />
                  </Td>
                </V2Row>
              )
            })}
          </V2Table>

          {filtered.length === 0 && (
            <p className="py-10 text-center text-sm text-grove-ink/55 dark:text-grove-ink-dk/55">
              No users match that search — try a different name or clear the risk filter.
            </p>
          )}
        </V2Card>
      </Reveal>
    </div>
  )
}
