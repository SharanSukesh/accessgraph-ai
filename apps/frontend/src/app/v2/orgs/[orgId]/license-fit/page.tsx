'use client'

/**
 * v2 License Fit — the CFO page.
 *
 * Savings hero → persona fit-mix bar → per-SKU savings table →
 * three worked example candidates. All figures from LICENSE_FIT so
 * they agree with the dashboard's "$186,300/yr recoverable" hook.
 */

import { DollarSign, Users, BadgeDollarSign, ArrowRight } from 'lucide-react'
import { Reveal, Stagger, StaggerItem, CountUp } from '@/components/v2/motion'
import {
  PageTitle, V2Card, StatCard, Pill, SectionHeading, V2Table, V2Row, Td,
} from '@/components/v2/primitives'
import { LICENSE_FIT, fmtMoney } from '@/lib/v2/mock-data'

/** Fit-mix segment fills — status colors, always paired with a labeled legend. */
const PERSONA_FILLS: Record<string, string> = {
  'Right-sized': 'bg-primary-600 dark:bg-primary-400',
  'Overbuilt': 'bg-orange-600 dark:bg-orange-400',
  'Wrong cloud': 'bg-amber-600 dark:bg-amber-400',
  'Underused': 'bg-copper-500 dark:bg-copper-400',
  'Inactive but billed': 'bg-red-700 dark:bg-red-400',
  'Unknown': 'bg-grove-border dark:bg-grove-border-dk',
}

const CANDIDATES = [
  {
    name: 'Robert Fields',
    persona: 'Inactive but billed',
    current: 'Sales Cloud EE',
    recommended: 'Reclaim seat at renewal',
    saving: 1980,
    note: 'No login in 94 days — the license bills either way.',
  },
  {
    name: 'Dan Kowalski',
    persona: 'Overbuilt',
    current: 'Sales Cloud EE',
    recommended: 'Platform Plus',
    saving: 780,
    note: 'Touches only custom objects and report folders — never Opportunity.',
  },
  {
    name: 'Grace Liu',
    persona: 'Underused',
    current: 'Service Cloud EE',
    recommended: 'Platform Plus',
    saving: 780,
    note: 'Uses 4 of 61 licensed features; Case access covered by Platform.',
  },
]

export default function LicenseFitPage() {
  const totalUsers = LICENSE_FIT.personas.reduce((s, p) => s + p.count, 0)

  return (
    <div className="space-y-10">
      <Reveal>
        <PageTitle
          eyebrow="Optimize · spend"
          title="License Fit"
          subtitle="Persona-to-SKU right-sizing with defensible savings math"
        />
      </Reveal>

      {/* Savings hero */}
      <Reveal delay={0.05}>
        <V2Card hero className="p-8">
          <div className="flex flex-col items-start gap-6 lg:flex-row lg:items-center">
            <span className="rounded-xl bg-copper-50 p-3 text-copper-600 ring-1 ring-copper-100 dark:bg-copper-900/25 dark:text-copper-400 dark:ring-copper-900">
              <BadgeDollarSign className="h-6 w-6" />
            </span>
            <div>
              <p className="v2-micro text-grove-ink/55 dark:text-grove-ink-dk/55">
                Projected annual savings
              </p>
              <p className="v2-num v2-shimmer-text mt-2 text-6xl font-semibold text-grove-ink dark:text-grove-ink-dk">
                <CountUp value={LICENSE_FIT.annualSavings} format={(n) => fmtMoney(n)} />
              </p>
              <p className="mt-2 text-sm text-grove-ink/65 dark:text-grove-ink-dk/65">
                8.4% of current license spend · {LICENSE_FIT.candidates} right-size candidates
              </p>
            </div>
          </div>
        </V2Card>
      </Reveal>

      {/* KPI strip */}
      <Stagger className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        <StaggerItem>
          <StatCard label="Right-size candidates" value={LICENSE_FIT.candidates} icon={Users} delta="of 1,247 licensed users" />
        </StaggerItem>
        <StaggerItem>
          <StatCard label="Inactive but billed" value={67} icon={DollarSign} delta="zero logins this quarter" deltaTone="bad" />
        </StaggerItem>
        <StaggerItem>
          <StatCard label="Right-sized users" value={1005} icon={Users} delta="81% of the org — leave alone" deltaTone="good" />
        </StaggerItem>
      </Stagger>

      {/* Fit mix */}
      <Reveal>
        <V2Card className="p-6">
          <SectionHeading
            title="Fit mix"
            hint={`${totalUsers.toLocaleString()} users classified by persona-to-SKU fit`}
          />
          <div className="flex h-3 gap-0.5 overflow-hidden rounded-full">
            {LICENSE_FIT.personas.map((p) => (
              <div
                key={p.persona}
                className={`${PERSONA_FILLS[p.persona] ?? 'bg-grove-border dark:bg-grove-border-dk'} h-full rounded-sm transition-all duration-300`}
                style={{ width: `${Math.max(1.5, (p.count / totalUsers) * 100)}%` }}
                title={`${p.persona}: ${p.count}`}
              />
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
            {LICENSE_FIT.personas.map((p) => (
              <span
                key={p.persona}
                className="flex items-center gap-1.5 text-xs text-grove-ink/70 dark:text-grove-ink-dk/70"
              >
                <span className={`h-2 w-2 rounded-full ${PERSONA_FILLS[p.persona] ?? 'bg-grove-border dark:bg-grove-border-dk'}`} />
                {p.persona}
                <span className="v2-num font-semibold text-grove-ink dark:text-grove-ink-dk">
                  {p.count.toLocaleString()}
                </span>
                <span className="text-grove-ink/45 dark:text-grove-ink-dk/45">{p.pct}%</span>
              </span>
            ))}
          </div>
        </V2Card>
      </Reveal>

      {/* By SKU */}
      <Reveal>
        <V2Card className="p-6">
          <SectionHeading
            title="By SKU"
            hint="Where the recoverable spend sits, per license SKU"
          />
          <V2Table head={['SKU', 'Seats', '$/mo', 'Overbuilt', 'Inactive', 'Savings / yr']}>
            {LICENSE_FIT.skus.map((s) => (
              <V2Row key={s.sku}>
                <Td className="font-semibold text-grove-ink dark:text-grove-ink-dk">{s.sku}</Td>
                <Td className="v2-num">{s.seats.toLocaleString()}</Td>
                <Td className="v2-num">${s.monthly}</Td>
                <Td className="v2-num">{s.overbuilt}</Td>
                <Td className="v2-num">{s.inactive}</Td>
                <Td className="v2-num font-semibold text-copper-600 dark:text-copper-400">
                  {fmtMoney(s.savings)}
                </Td>
              </V2Row>
            ))}
          </V2Table>
        </V2Card>
      </Reveal>

      {/* Example candidates */}
      <div className="space-y-4">
        <Reveal>
          <SectionHeading
            title="Example candidates"
            hint="Three of the 87 — each move is defensible from usage logs"
          />
        </Reveal>
        <Stagger className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {CANDIDATES.map((c) => (
            <StaggerItem key={c.name}>
              <V2Card lift className="h-full p-5">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-700 text-xs font-bold text-white dark:bg-primary-400 dark:text-grove-canvas-dk">
                    {c.name.split(' ').map((w) => w[0]).join('')}
                  </span>
                  <p className="text-sm font-semibold text-grove-ink dark:text-grove-ink-dk">{c.name}</p>
                </div>
                <div className="mt-3">
                  <Pill tone="neutral">{c.persona}</Pill>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-grove-ink/80 dark:text-grove-ink-dk/80">
                  <span className="font-medium">{c.current}</span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-copper-500 dark:text-copper-400" />
                  <span className="font-medium">{c.recommended}</span>
                </div>
                <p className="v2-num mt-2 text-sm font-semibold text-copper-600 dark:text-copper-400">
                  save {fmtMoney(c.saving)}/yr
                </p>
                <p className="mt-2 text-xs leading-relaxed text-grove-ink/55 dark:text-grove-ink-dk/55">
                  {c.note}
                </p>
              </V2Card>
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </div>
  )
}
