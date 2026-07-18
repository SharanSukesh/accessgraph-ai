'use client'

/**
 * v2 Graph Explorer — ER-diagram mock.
 *
 * Restores the v1 concept (objects rendered as ER entities with their
 * fields and the user's access level per field) with the v2 polish:
 * entity cards on a dot-grid canvas, curved edges drawn in SVG behind
 * them, the user's access path to one object highlighted in copper.
 *
 * Static mock — positions are percentage-based so the layout scales;
 * the real build swaps this for the Cytoscape ERGraphVisualization
 * with these visual styles applied.
 */

import { useState } from 'react'
import {
  Database, KeyRound, UserCircle2, Briefcase, Eye, Pencil, Lock,
} from 'lucide-react'
import { Reveal } from '@/components/v2/motion'
import { PageTitle, V2Card, Pill, SectionHeading } from '@/components/v2/primitives'
import { PEOPLE } from '@/lib/v2/mock-data'

// ---------------------------------------------------------------- data

const TRACE_USERS = PEOPLE.slice(0, 4)

type FieldAccess = { name: string; access: 'read' | 'edit' | 'none'; sensitive?: boolean }

const ENTITIES: {
  key: string
  label: string
  api: string
  custom: boolean
  via: string
  highlight: boolean
  fields: FieldAccess[]
}[] = [
  {
    key: 'account',
    label: 'Account',
    api: 'Account',
    custom: false,
    via: 'Finance Manager profile',
    highlight: false,
    fields: [
      { name: 'Name', access: 'edit' },
      { name: 'Industry', access: 'read' },
      { name: 'AnnualRevenue', access: 'read', sensitive: true },
      { name: 'OwnerId', access: 'read' },
    ],
  },
  {
    key: 'invoice',
    label: 'Invoice',
    api: 'Invoice__c',
    custom: true,
    via: 'Sales Ops permission set',
    highlight: true,
    fields: [
      { name: 'Amount__c', access: 'edit', sensitive: true },
      { name: 'Status__c', access: 'edit' },
      { name: 'Due_Date__c', access: 'read' },
      { name: 'Approval_Notes__c', access: 'none' },
    ],
  },
  {
    key: 'opportunity',
    label: 'Opportunity',
    api: 'Opportunity',
    custom: false,
    via: 'VP Finance role hierarchy',
    highlight: false,
    fields: [
      { name: 'Amount', access: 'read', sensitive: true },
      { name: 'StageName', access: 'read' },
      { name: 'CloseDate', access: 'read' },
    ],
  },
]

const MID_NODES = [
  { key: 'profile', label: 'Finance Manager', type: 'Profile', icon: UserCircle2, y: 16, highlight: false },
  { key: 'ps', label: 'Sales Ops', type: 'Permission set', icon: KeyRound, y: 46, highlight: true },
  { key: 'role', label: 'VP Finance', type: 'Role', icon: Briefcase, y: 76, highlight: false },
]

// Edge paths in the 0–100 coordinate space (preserveAspectRatio none).
const EDGES = [
  { d: 'M 15,45 C 20,45 21,16 27,16', highlight: false },
  { d: 'M 15,46 C 20,46 21,46 27,46', highlight: true },
  { d: 'M 15,47 C 20,47 21,76 27,76', highlight: false },
  { d: 'M 44,16 C 50,16 51,12 56,12', highlight: false },
  { d: 'M 44,46 C 50,46 51,44 56,44', highlight: true },
  { d: 'M 44,76 C 50,76 51,78 56,78', highlight: false },
]

// ---------------------------------------------------------------- bits

function AccessChip({ access }: { access: FieldAccess['access'] }) {
  if (access === 'edit')
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-primary-50 px-1.5 py-0.5 text-[10px] font-semibold text-primary-700 ring-1 ring-primary-200 dark:bg-primary-900/30 dark:text-primary-400 dark:ring-primary-800">
        <Pencil className="h-2.5 w-2.5" /> R/E
      </span>
    )
  if (access === 'read')
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-grove-canvas px-1.5 py-0.5 text-[10px] font-semibold text-grove-ink/60 ring-1 ring-grove-border dark:bg-grove-canvas-dk dark:text-grove-ink-dk/60 dark:ring-grove-border-dk">
        <Eye className="h-2.5 w-2.5" /> R
      </span>
    )
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-grove-canvas px-1.5 py-0.5 text-[10px] font-semibold text-grove-ink/35 ring-1 ring-grove-border dark:bg-grove-canvas-dk dark:text-grove-ink-dk/35 dark:ring-grove-border-dk">
      <Lock className="h-2.5 w-2.5" /> —
    </span>
  )
}

function EntityCard({ e }: { e: (typeof ENTITIES)[number] }) {
  return (
    <div
      className={`w-[240px] overflow-hidden rounded-xl border bg-grove-surface shadow-grove-lift transition-shadow duration-200 hover:shadow-grove-hero dark:bg-grove-surface-dk ${
        e.highlight
          ? 'border-copper-400/70 ring-1 ring-copper-400/30 dark:border-copper-500/60'
          : 'border-grove-border dark:border-grove-border-dk'
      }`}
    >
      <div
        className={`flex items-center gap-2 border-b px-3 py-2 ${
          e.highlight
            ? 'border-copper-200/60 bg-copper-50/60 dark:border-copper-900/60 dark:bg-copper-900/20'
            : 'border-grove-border bg-grove-canvas/60 dark:border-grove-border-dk dark:bg-grove-canvas-dk/60'
        }`}
      >
        <Database
          className={`h-3.5 w-3.5 ${
            e.highlight ? 'text-copper-600 dark:text-copper-400' : 'text-primary-700 dark:text-primary-400'
          }`}
        />
        <span className="text-sm font-semibold text-grove-ink dark:text-grove-ink-dk">{e.label}</span>
        <span className="ml-auto">
          <Pill tone={e.custom ? 'copper' : 'neutral'}>{e.custom ? 'Custom' : 'Standard'}</Pill>
        </span>
      </div>
      <div className="divide-y divide-grove-border/50 dark:divide-grove-border-dk/50">
        {e.fields.map((f) => (
          <div key={f.name} className="flex items-center justify-between px-3 py-1.5">
            <span className="truncate font-mono text-[11px] text-grove-ink/75 dark:text-grove-ink-dk/75">
              {f.name}
              {f.sensitive && (
                <span className="ml-1.5 text-[9px] font-semibold uppercase tracking-wide text-red-600 dark:text-red-400">
                  PII
                </span>
              )}
            </span>
            <AccessChip access={f.access} />
          </div>
        ))}
      </div>
      <p className="v2-micro border-t border-grove-border/50 px-3 py-1.5 text-grove-ink/40 dark:border-grove-border-dk/50 dark:text-grove-ink-dk/40">
        via {e.via}
      </p>
    </div>
  )
}

// ---------------------------------------------------------------- page

export default function GraphExplorerPage() {
  const [selected, setSelected] = useState(TRACE_USERS[0])
  const initials = selected.name.split(' ').map((w) => w[0]).join('')

  return (
    <div className="space-y-8">
      <Reveal>
        <PageTitle
          eyebrow="Explore · access paths"
          title="Graph Explorer"
          subtitle="Objects as ER entities — every field, and exactly how this user reaches it."
        />
      </Reveal>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px,1fr]">
        {/* Left rail — user picker + legend */}
        <div className="space-y-6">
          <Reveal>
            <V2Card className="p-5">
              <SectionHeading title="User" hint="Pick a user to trace" />
              <div className="space-y-1">
                {TRACE_USERS.map((p) => {
                  const active = p.id === selected.id
                  return (
                    <button
                      key={p.id}
                      onClick={() => setSelected(p)}
                      className={`flex w-full items-center gap-3 rounded-xl border p-2.5 text-left transition-all duration-200 ${
                        active
                          ? 'border-copper-400/60 bg-copper-50/50 dark:border-copper-500/50 dark:bg-copper-900/20'
                          : 'border-transparent hover:border-grove-border hover:bg-grove-canvas dark:hover:border-grove-border-dk dark:hover:bg-grove-canvas-dk'
                      }`}
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-700 text-xs font-bold text-white dark:bg-primary-400 dark:text-grove-canvas-dk">
                        {p.name.split(' ').map((w) => w[0]).join('')}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-grove-ink dark:text-grove-ink-dk">
                          {p.name}
                        </span>
                        <span className="block truncate text-xs text-grove-ink/55 dark:text-grove-ink-dk/55">
                          {p.profile}
                        </span>
                      </span>
                    </button>
                  )
                })}
              </div>
            </V2Card>
          </Reveal>

          <Reveal delay={0.06}>
            <V2Card className="p-5">
              <SectionHeading title="Legend" hint="Node types" />
              <div className="space-y-2.5 text-xs text-grove-ink/70 dark:text-grove-ink-dk/70">
                <div className="flex items-center gap-2.5">
                  <span className="h-3 w-3 shrink-0 rounded-full bg-copper-500 dark:bg-copper-400" />
                  User — the access subject
                </div>
                <div className="flex items-center gap-2.5">
                  <span className="h-3 w-3 shrink-0 rounded-full bg-primary-600 dark:bg-primary-400" />
                  Grant — profile / permission set / role
                </div>
                <div className="flex items-center gap-2.5">
                  <span className="h-3 w-3 shrink-0 rounded-sm border border-grove-border bg-grove-surface dark:border-grove-border-dk dark:bg-grove-surface-dk" />
                  Object entity — fields + access level
                </div>
                <div className="flex items-center gap-2.5">
                  <span className="h-0.5 w-4 shrink-0 rounded bg-copper-500 dark:bg-copper-400" />
                  Highlighted access path
                </div>
                <div className="mt-3 border-t border-grove-border/60 pt-2.5 dark:border-grove-border-dk/60">
                  <span className="font-semibold">R</span> read ·{' '}
                  <span className="font-semibold">R/E</span> read + edit ·{' '}
                  <span className="font-semibold">—</span> no access ·{' '}
                  <span className="font-semibold text-red-600 dark:text-red-400">PII</span> sensitive
                </div>
              </div>
            </V2Card>
          </Reveal>
        </div>

        {/* Canvas */}
        <Reveal delay={0.04}>
          <V2Card className="relative min-h-[680px] overflow-hidden">
            <div className="v2-dotgrid absolute inset-0" />

            {/* Context chips */}
            <div className="absolute left-4 top-4 z-10 flex gap-2">
              <Pill tone="copper">{selected.name}</Pill>
              <Pill tone="neutral">3 objects · 11 fields traced</Pill>
            </div>

            {/* Edge layer */}
            <svg
              className="absolute inset-0 h-full w-full"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              {EDGES.map((e, i) => (
                <path
                  key={i}
                  d={e.d}
                  fill="none"
                  pathLength={1}
                  vectorEffect="non-scaling-stroke"
                  strokeWidth={e.highlight ? 2.5 : 1.5}
                  strokeLinecap="round"
                  className={`gx-edge ${
                    e.highlight
                      ? 'stroke-copper-500 dark:stroke-copper-400'
                      : 'stroke-primary-700/30 dark:stroke-primary-400/30'
                  }`}
                  style={{ animationDelay: `${200 + i * 120}ms` }}
                />
              ))}
            </svg>

            {/* User node */}
            <div
              className="gx-node absolute left-[4%] top-[45%] -translate-y-1/2"
              style={{ animationDelay: '0ms' }}
            >
              <div className="flex w-[150px] flex-col items-center gap-2 rounded-2xl border border-copper-400/60 bg-grove-surface p-4 shadow-grove-hero dark:border-copper-500/50 dark:bg-grove-surface-dk">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-copper-500 text-base font-bold text-white dark:bg-copper-400 dark:text-grove-canvas-dk">
                  {initials}
                </span>
                <span className="text-center text-sm font-semibold leading-tight text-grove-ink dark:text-grove-ink-dk">
                  {selected.name}
                </span>
                <span className="v2-micro text-grove-ink/45 dark:text-grove-ink-dk/45">User</span>
              </div>
            </div>

            {/* Grant nodes */}
            {MID_NODES.map((n, i) => {
              const Icon = n.icon
              return (
                <div
                  key={n.key}
                  className="gx-node absolute left-[27%] -translate-y-1/2"
                  style={{ top: `${n.y}%`, animationDelay: `${150 + i * 100}ms` }}
                >
                  <div
                    className={`flex w-[168px] items-center gap-2.5 rounded-xl border bg-grove-surface px-3 py-2.5 shadow-grove-lift dark:bg-grove-surface-dk ${
                      n.highlight
                        ? 'border-copper-400/60 ring-1 ring-copper-400/25 dark:border-copper-500/50'
                        : 'border-grove-border dark:border-grove-border-dk'
                    }`}
                  >
                    <span
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                        n.highlight
                          ? 'bg-copper-50 text-copper-600 dark:bg-copper-900/30 dark:text-copper-400'
                          : 'bg-primary-50 text-primary-700 dark:bg-primary-900/25 dark:text-primary-400'
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-semibold text-grove-ink dark:text-grove-ink-dk">
                        {n.label}
                      </span>
                      <span className="v2-micro text-grove-ink/45 dark:text-grove-ink-dk/45">{n.type}</span>
                    </span>
                  </div>
                </div>
              )
            })}

            {/* Object entities (ER cards) */}
            <div className="gx-node absolute left-[56%] top-[16%] -translate-y-1/2" style={{ animationDelay: '520ms' }}>
              <EntityCard e={ENTITIES[0]} />
            </div>
            <div className="gx-node absolute left-[56%] top-[48%] -translate-y-1/2" style={{ animationDelay: '640ms' }}>
              <EntityCard e={ENTITIES[1]} />
            </div>
            <div className="gx-node absolute left-[56%] top-[80%] -translate-y-1/2" style={{ animationDelay: '760ms' }}>
              <EntityCard e={ENTITIES[2]} />
            </div>

            {/* Draw-in + fade animations, reduced-motion safe */}
            <style>{`
              .gx-edge {
                stroke-dasharray: 1;
                stroke-dashoffset: 1;
                animation: gx-draw 700ms cubic-bezier(0.22, 1, 0.36, 1) forwards;
              }
              .gx-node {
                opacity: 0;
                animation: gx-fade 500ms cubic-bezier(0.22, 1, 0.36, 1) forwards;
              }
              @keyframes gx-draw { to { stroke-dashoffset: 0; } }
              @keyframes gx-fade { to { opacity: 1; } }
              @media (prefers-reduced-motion: reduce) {
                .gx-edge { animation: none; stroke-dashoffset: 0; }
                .gx-node { animation: none; opacity: 1; }
              }
            `}</style>
          </V2Card>
        </Reveal>
      </div>
    </div>
  )
}
