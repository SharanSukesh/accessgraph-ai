'use client'

/**
 * v2 Dashboard Users — admin-invited accounts for Newton itself.
 *
 * KPI strip → invite form (email + role Segmented, mock) → accounts
 * table with role/status pills and ghost row actions. No self-signup;
 * every account here was invited by an org admin.
 */

import { useState } from 'react'
import { Users, Clock, ShieldCheck, Send } from 'lucide-react'
import { Reveal, Stagger, StaggerItem } from '@/components/v2/motion'
import {
  PageTitle, V2Card, StatCard, Pill, SectionHeading, Segmented,
  V2Table, V2Row, Td,
} from '@/components/v2/primitives'

type AccountStatus = 'Active' | 'Pending'

const ACCOUNTS: {
  email: string
  name: string
  role: string
  status: AccountStatus
  lastLogin: string
}[] = [
  { email: 'priya.sharma@meridian-consulting.com', name: 'Priya Sharma', role: 'org_admin', status: 'Active', lastLogin: '2h ago' },
  { email: 'elena.vasquez@meridian-consulting.com', name: 'Elena Vasquez', role: 'org_admin', status: 'Active', lastLogin: '12m ago' },
  { email: 'marcus.webb@meridian-consulting.com', name: 'Marcus Webb', role: 'analyst', status: 'Active', lastLogin: '31m ago' },
  { email: 'aisha.okafor@meridian-consulting.com', name: 'Aisha Okafor', role: 'analyst', status: 'Active', lastLogin: '3h ago' },
  { email: 'grace.liu@meridian-consulting.com', name: 'Grace Liu', role: 'viewer', status: 'Pending', lastLogin: '—' },
  { email: 'tomas.ribeiro@meridian-consulting.com', name: 'Tomás Ribeiro', role: 'auditor', status: 'Pending', lastLogin: '—' },
]

/** Amber status pill — Pill only ships neutral/mint/copper tones. */
function AmberPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-800 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900">
      {children}
    </span>
  )
}

export default function AdminUsersPage() {
  const [role, setRole] = useState('analyst')

  return (
    <div className="space-y-10">
      <Reveal>
        <PageTitle
          eyebrow="Admin · access"
          title="Dashboard Users"
          subtitle="Admin-invited accounts — no self-signup"
        />
      </Reveal>

      {/* KPI strip */}
      <Stagger className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        <StaggerItem>
          <StatCard label="Total accounts" value={12} icon={Users} delta="6 shown below" />
        </StaggerItem>
        <StaggerItem>
          <StatCard label="Pending activation" value={2} icon={Clock} delta="invites expire in 7 days" deltaTone="bad" />
        </StaggerItem>
        <StaggerItem>
          <StatCard label="Admins" value={3} icon={ShieldCheck} delta="can invite + manage users" />
        </StaggerItem>
      </Stagger>

      {/* Invite */}
      <Reveal>
        <V2Card className="p-6">
          <SectionHeading
            title="Invite user"
            hint="They receive a one-time activation link — no password to share"
          />
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
            <input
              type="email"
              placeholder="name@meridian-consulting.com"
              className="w-full max-w-sm rounded-lg border border-grove-border bg-white px-3.5 py-2 text-sm text-grove-ink placeholder:text-grove-ink/40 focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-100 dark:border-grove-border-dk dark:bg-grove-canvas-dk dark:text-grove-ink-dk dark:placeholder:text-grove-ink-dk/40 dark:focus:border-primary-500 dark:focus:ring-primary-900"
            />
            <Segmented
              options={[
                { key: 'org_admin', label: 'org_admin' },
                { key: 'analyst', label: 'analyst' },
                { key: 'viewer', label: 'viewer' },
                { key: 'auditor', label: 'auditor' },
              ]}
              value={role}
              onChange={setRole}
            />
            <button className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-600 dark:bg-primary-400 dark:text-grove-canvas-dk dark:hover:bg-primary-300 lg:ml-auto">
              <Send className="h-4 w-4" />
              Send invite
            </button>
          </div>
        </V2Card>
      </Reveal>

      {/* Accounts */}
      <Reveal>
        <V2Card className="p-6">
          <SectionHeading title="Accounts" hint="Roles gate what each account can see and change" />
          <V2Table head={['Email', 'Name', 'Role', 'Status', 'Last login', 'Actions']}>
            {ACCOUNTS.map((a) => (
              <V2Row key={a.email}>
                <Td className="whitespace-nowrap font-mono text-xs">{a.email}</Td>
                <Td className="whitespace-nowrap font-semibold text-grove-ink dark:text-grove-ink-dk">
                  {a.name}
                </Td>
                <Td>
                  <Pill tone={a.role === 'org_admin' ? 'copper' : 'neutral'}>{a.role}</Pill>
                </Td>
                <Td>
                  {a.status === 'Active' ? (
                    <Pill tone="mint">Active</Pill>
                  ) : (
                    <AmberPill>Pending</AmberPill>
                  )}
                </Td>
                <Td className="v2-num whitespace-nowrap text-grove-ink/65 dark:text-grove-ink-dk/65">
                  {a.lastLogin}
                </Td>
                <Td>
                  <div className="flex items-center gap-1.5">
                    {a.status === 'Pending' && (
                      <button className="rounded-lg px-2.5 py-1 text-xs font-semibold text-primary-700 ring-1 ring-grove-border transition-colors hover:bg-primary-50 dark:text-primary-400 dark:ring-grove-border-dk dark:hover:bg-primary-900/25">
                        Resend
                      </button>
                    )}
                    <button className="rounded-lg px-2.5 py-1 text-xs font-semibold text-red-700 ring-1 ring-grove-border transition-colors hover:bg-red-50 dark:text-red-400 dark:ring-grove-border-dk dark:hover:bg-red-950/40">
                      Delete
                    </button>
                  </div>
                </Td>
              </V2Row>
            ))}
          </V2Table>
        </V2Card>
      </Reveal>
    </div>
  )
}
