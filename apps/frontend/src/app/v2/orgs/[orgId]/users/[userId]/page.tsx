'use client'

/**
 * v2 User detail — one person's effective access story.
 *
 * Structure: back link → hero card (avatar + identity + risk ring) →
 * Segmented tabs (Overview / Object access / Anomalies). Looks the
 * user up from the shared PEOPLE mock via the route param.
 */

import { useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ArrowLeft, Check, Minus, Clock, ShieldCheck } from 'lucide-react'
import { Reveal, Stagger, StaggerItem } from '@/components/v2/motion'
import {
  PageTitle, V2Card, StatCard, ScoreRing, SeverityChip, Pill,
  SectionHeading, Segmented, HBarRow, V2Table, V2Row, Td, type Severity,
} from '@/components/v2/primitives'
import { PEOPLE } from '@/lib/v2/mock-data'

type Tab = 'overview' | 'objects' | 'anomalies'

const RISK_FACTORS = [
  { label: 'Access breadth', value: 72 },
  { label: 'Sensitive objects', value: 65 },
  { label: 'Dormancy', value: 40 },
  { label: 'Peer deviation', value: 88 },
]

const OBJECT_ACCESS: { object: string; read: boolean; create: boolean; edit: boolean; del: boolean }[] = [
  { object: 'Account', read: true, create: true, edit: true, del: false },
  { object: 'Opportunity', read: true, create: true, edit: true, del: true },
  { object: 'Case', read: true, create: false, edit: false, del: false },
  { object: 'Contact', read: true, create: true, edit: true, del: false },
  { object: 'Invoice__c', read: true, create: true, edit: true, del: true },
  { object: 'Project__c', read: true, create: false, edit: true, del: false },
]

const USER_ANOMALIES: Record<string, { severity: Severity; type: string; reason: string }[]> = {
  u01: [
    { severity: 'high', type: 'IMPOSSIBLE_TRAVEL', reason: 'Frankfurt → Singapore in 2.1h (Jul 14). Both sessions authenticated successfully.' },
  ],
  u03: [
    { severity: 'critical', type: 'OVER_PRIVILEGED', reason: 'Holds 3.4× the object-edit breadth of peer admins; includes 14 finance objects outside IT scope.' },
  ],
  u08: [
    { severity: 'critical', type: 'DORMANT_POWERFUL', reason: 'No login for 94 days while retaining Modify All Data + API Enabled.' },
    { severity: 'medium', type: 'DORMANT_REACTIVATION', reason: 'First login in 94 days, from a previously unseen device.' },
  ],
}

function AccessMark({ granted }: { granted: boolean }) {
  return granted ? (
    <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-primary-50 text-primary-700 ring-1 ring-primary-200 dark:bg-primary-900/30 dark:text-primary-400 dark:ring-primary-800">
      <Check className="h-3.5 w-3.5" />
    </span>
  ) : (
    <span className="inline-flex h-6 w-6 items-center justify-center text-grove-ink/25 dark:text-grove-ink-dk/25">
      <Minus className="h-3.5 w-3.5" />
    </span>
  )
}

export default function UserDetailPage() {
  const params = useParams<{ userId: string }>()
  const person = PEOPLE.find((p) => p.id === params.userId) ?? PEOPLE[0]
  const [tab, setTab] = useState<Tab>('overview')
  const anomalies = person.anomaly ? USER_ANOMALIES[person.id] ?? [] : []

  return (
    <div className="space-y-8">
      <Reveal>
        <Link
          href="/v2/orgs/demo/users"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary-700 transition-colors hover:text-copper-600 dark:text-primary-400 dark:hover:text-copper-400"
        >
          <ArrowLeft className="h-4 w-4" /> Users
        </Link>
      </Reveal>

      {/* Hero */}
      <Reveal delay={0.05}>
        <V2Card hero className="p-8">
          <div className="flex flex-col items-start gap-8 lg:flex-row lg:items-center">
            <div className="flex items-center gap-6">
              <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-primary-700 text-2xl font-bold text-white dark:bg-primary-400 dark:text-grove-canvas-dk">
                {person.name.split(' ').map((w) => w[0]).join('')}
              </span>
              <div>
                <h1 className="v2-display text-3xl font-semibold text-grove-ink dark:text-grove-ink-dk">
                  {person.name}
                </h1>
                <p className="mt-1 text-sm text-grove-ink/65 dark:text-grove-ink-dk/65">
                  {person.title} · {person.dept} · {person.profile}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Pill tone="mint">Active</Pill>
                  <Pill tone="neutral">{person.licenses}</Pill>
                  <span className="flex items-center gap-1.5 text-xs text-grove-ink/55 dark:text-grove-ink-dk/55">
                    <Clock className="h-3.5 w-3.5" /> Last login {person.lastLogin}
                  </span>
                </div>
              </div>
            </div>
            <div className="lg:ml-auto">
              <ScoreRing score={person.risk} size={124} label="risk" />
            </div>
          </div>
        </V2Card>
      </Reveal>

      <Reveal>
        <Segmented
          options={[
            { key: 'overview', label: 'Overview' },
            { key: 'objects', label: 'Object access' },
            { key: 'anomalies', label: 'Anomalies', count: anomalies.length },
          ]}
          value={tab}
          onChange={(k) => setTab(k as Tab)}
        />
      </Reveal>

      {tab === 'overview' && (
        <div className="space-y-6">
          <Reveal>
            <V2Card className="p-6">
              <SectionHeading
                title="Risk factors"
                hint="What drives this user's composite risk score"
              />
              <div className="space-y-1">
                {RISK_FACTORS.map((f) => (
                  <HBarRow
                    key={f.label}
                    label={f.label}
                    value={f.value}
                    max={100}
                    highlight={f.value >= 80}
                  />
                ))}
              </div>
            </V2Card>
          </Reveal>

          <Stagger className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            <StaggerItem>
              <StatCard label="Objects accessible" value={214} delta="of 438 in org" />
            </StaggerItem>
            <StaggerItem>
              <StatCard label="Fields accessible" value={3120} delta="of 9,840 in org" />
            </StaggerItem>
            <StaggerItem>
              <StatCard label="Permission sets" value={7} delta="2 via permission set groups" />
            </StaggerItem>
          </Stagger>
        </div>
      )}

      {tab === 'objects' && (
        <Reveal>
          <V2Card className="p-6">
            <SectionHeading
              title="Object access"
              hint="Effective CRUD after profiles, permission sets, and muting"
            />
            <V2Table head={['Object', 'Read', 'Create', 'Edit', 'Delete']}>
              {OBJECT_ACCESS.map((row) => (
                <V2Row key={row.object}>
                  <Td className="font-semibold text-grove-ink dark:text-grove-ink-dk">{row.object}</Td>
                  <Td><AccessMark granted={row.read} /></Td>
                  <Td><AccessMark granted={row.create} /></Td>
                  <Td><AccessMark granted={row.edit} /></Td>
                  <Td><AccessMark granted={row.del} /></Td>
                </V2Row>
              ))}
            </V2Table>
          </V2Card>
        </Reveal>
      )}

      {tab === 'anomalies' && (
        <Reveal>
          {anomalies.length > 0 ? (
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              {anomalies.map((a) => (
                <V2Card key={a.type} className="p-6 transition-all duration-200 hover:border-grove-border dark:hover:border-grove-border-dk">
                  <div className="flex items-center gap-2">
                    <SeverityChip severity={a.severity} />
                    <Pill tone="neutral">{a.type.replace(/_/g, ' ').toLowerCase()}</Pill>
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-grove-ink/80 dark:text-grove-ink-dk/80">
                    {a.reason}
                  </p>
                </V2Card>
              ))}
            </div>
          ) : (
            <V2Card className="p-12">
              <div className="flex flex-col items-center text-center">
                <span className="rounded-full bg-primary-50 p-4 text-primary-600 ring-1 ring-primary-100 dark:bg-primary-900/25 dark:text-primary-400 dark:ring-primary-900">
                  <ShieldCheck className="h-7 w-7" />
                </span>
                <p className="mt-4 text-sm font-semibold text-grove-ink dark:text-grove-ink-dk">
                  No anomalies for this user
                </p>
                <p className="mt-1 max-w-sm text-xs leading-relaxed text-grove-ink/55 dark:text-grove-ink-dk/55">
                  The ensemble found nothing unusual across access breadth, sessions, or peer deviation in the last 30 days.
                </p>
              </div>
            </V2Card>
          )}
        </Reveal>
      )}
    </div>
  )
}
