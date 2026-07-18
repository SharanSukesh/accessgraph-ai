'use client'

/**
 * v2 Org Chart — manager / delegated-approver hierarchy mock.
 *
 * Static SVG tree (CEO → 3 VPs → 6 reports) on the dotgrid card, with
 * draw-in connector animation and staggered node fade (both disabled
 * under prefers-reduced-motion via the same <style> block). Side rail:
 * selected-user details + pending-edits queue.
 */

import { GitBranch, RotateCcw, UserCog } from 'lucide-react'
import { Reveal } from '@/components/v2/motion'
import { PageTitle, V2Card, Pill, SectionHeading } from '@/components/v2/primitives'

type OrgNode = {
  id: string
  name: string
  title: string
  cx: number
  y: number
  w: number
  h: number
  kind: 'ceo' | 'vp' | 'report'
  selected?: boolean
}

const NODES: OrgNode[] = [
  { id: 'ceo', name: 'Alexandra Chen', title: 'Chief Executive Officer', cx: 480, y: 20, w: 168, h: 54, kind: 'ceo' },
  { id: 'vp1', name: 'Priya Sharma', title: 'VP of Finance', cx: 180, y: 160, w: 150, h: 52, kind: 'vp', selected: true },
  { id: 'vp2', name: 'Marcus Webb', title: 'VP of Sales', cx: 480, y: 160, w: 150, h: 52, kind: 'vp' },
  { id: 'vp3', name: 'Grace Liu', title: 'VP of Customer Success', cx: 780, y: 160, w: 150, h: 52, kind: 'vp' },
  { id: 'r1', name: 'Robert Fields', title: 'Contract Admin', cx: 102, y: 300, w: 134, h: 48, kind: 'report' },
  { id: 'r2', name: 'Aisha Okafor', title: 'RevOps Analyst', cx: 258, y: 300, w: 134, h: 48, kind: 'report' },
  { id: 'r3', name: 'Dan Kowalski', title: 'Marketing Manager', cx: 402, y: 300, w: 134, h: 48, kind: 'report' },
  { id: 'r4', name: 'Tomás Ribeiro', title: 'Support Lead', cx: 558, y: 300, w: 134, h: 48, kind: 'report' },
  { id: 'r5', name: 'Elena Vasquez', title: 'Systems Admin', cx: 702, y: 300, w: 134, h: 48, kind: 'report' },
  { id: 'r6', name: 'Sofia Martins', title: 'CS Analyst', cx: 858, y: 300, w: 134, h: 48, kind: 'report' },
]

const EDGES: [string, string][] = [
  ['ceo', 'vp1'], ['ceo', 'vp2'], ['ceo', 'vp3'],
  ['vp1', 'r1'], ['vp1', 'r2'],
  ['vp2', 'r3'], ['vp2', 'r4'],
  ['vp3', 'r5'], ['vp3', 'r6'],
]

const PENDING_EDITS = [
  { id: 'e1', text: 'Aisha Okafor · manager → Marcus Webb (was Priya Sharma)' },
  { id: 'e2', text: 'Priya Sharma · delegated approver → Grace Liu (was none)' },
]

function byId(id: string): OrgNode {
  return NODES.find((n) => n.id === id) as OrgNode
}

export default function OrgChartPage() {
  return (
    <div className="space-y-10">
      <Reveal>
        <PageTitle
          eyebrow="Admin · hierarchy"
          title="Org Chart"
          subtitle="Manager and delegated-approver relationships, editable by drag"
        />
      </Reveal>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr,300px]">
        {/* Tree */}
        <Reveal delay={0.05}>
          <V2Card className="v2-dotgrid min-h-[440px] p-6">
            <SectionHeading
              title="Reporting tree"
              hint="Drag a node onto a new manager to queue an edit"
              actions={
                <span className="flex items-center gap-1.5 text-xs text-grove-ink/55 dark:text-grove-ink-dk/55">
                  <GitBranch className="h-4 w-4 text-primary-600 dark:text-primary-400" />
                  10 of 1,247 users shown
                </span>
              }
            />
            <style>{`
              @keyframes v2-org-draw {
                from { stroke-dashoffset: 420; }
                to { stroke-dashoffset: 0; }
              }
              @keyframes v2-org-fade {
                from { opacity: 0; transform: translateY(6px); }
                to { opacity: 1; transform: translateY(0); }
              }
              .v2-org-path {
                stroke-dasharray: 420;
                stroke-dashoffset: 420;
                animation: v2-org-draw 0.9s cubic-bezier(0.22, 1, 0.36, 1) forwards;
              }
              .v2-org-node {
                opacity: 0;
                animation: v2-org-fade 0.5s cubic-bezier(0.22, 1, 0.36, 1) forwards;
              }
              @media (prefers-reduced-motion: reduce) {
                .v2-org-path { stroke-dasharray: none; stroke-dashoffset: 0; animation: none; }
                .v2-org-node { opacity: 1; animation: none; }
              }
            `}</style>
            <svg viewBox="0 0 960 380" className="mt-2 w-full" role="img" aria-label="Org chart: CEO, three VPs, six reports">
              {/* connectors */}
              {EDGES.map(([from, to], i) => {
                const p = byId(from)
                const c = byId(to)
                const y1 = p.y + p.h
                return (
                  <path
                    key={`${from}-${to}`}
                    d={`M ${p.cx} ${y1} C ${p.cx} ${y1 + 48}, ${c.cx} ${c.y - 48}, ${c.cx} ${c.y}`}
                    fill="none"
                    strokeWidth="1.5"
                    className="v2-org-path stroke-grove-ink/25 dark:stroke-grove-ink-dk/25"
                    style={{ animationDelay: `${0.15 + i * 0.06}s` }}
                  />
                )
              })}
              {/* nodes */}
              {NODES.map((n, i) => {
                const x = n.cx - n.w / 2
                const isVp = n.kind === 'vp'
                return (
                  <g key={n.id} className="v2-org-node" style={{ animationDelay: `${0.05 + i * 0.07}s` }}>
                    <rect
                      x={x}
                      y={n.y}
                      width={n.w}
                      height={n.h}
                      rx={10}
                      strokeWidth={n.selected ? 2.5 : 1}
                      className={
                        isVp
                          ? `fill-primary-700 dark:fill-primary-400 ${
                              n.selected
                                ? 'stroke-copper-500 dark:stroke-copper-400'
                                : 'stroke-primary-800 dark:stroke-primary-300'
                            }`
                          : 'fill-white stroke-grove-border dark:fill-grove-surface-dk dark:stroke-grove-border-dk'
                      }
                    />
                    <text
                      x={n.cx}
                      y={n.y + (n.h > 50 ? 23 : 21)}
                      textAnchor="middle"
                      fontSize="12"
                      fontWeight="600"
                      className={isVp ? 'fill-white dark:fill-grove-canvas-dk' : 'fill-grove-ink dark:fill-grove-ink-dk'}
                    >
                      {n.name}
                    </text>
                    <text
                      x={n.cx}
                      y={n.y + (n.h > 50 ? 39 : 36)}
                      textAnchor="middle"
                      fontSize="10"
                      className={isVp ? 'fill-white/70 dark:fill-grove-canvas-dk/70' : 'fill-grove-ink/55 dark:fill-grove-ink-dk/55'}
                    >
                      {n.title}
                    </text>
                  </g>
                )
              })}
            </svg>
          </V2Card>
        </Reveal>

        {/* Side rail */}
        <div className="space-y-6">
          <Reveal delay={0.1}>
            <V2Card className="p-5">
              <SectionHeading title="Selected user" hint="Priya Sharma" />
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-700 text-sm font-bold text-white dark:bg-primary-400 dark:text-grove-canvas-dk">
                  PS
                </span>
                <div>
                  <p className="text-sm font-semibold text-grove-ink dark:text-grove-ink-dk">Priya Sharma</p>
                  <p className="text-xs text-grove-ink/55 dark:text-grove-ink-dk/55">VP of Finance · Finance</p>
                </div>
              </div>
              <div className="mt-4 space-y-3">
                {[
                  { label: 'Manager', value: 'Alexandra Chen' },
                  { label: 'Delegated approver', value: 'Marcus Webb' },
                ].map((row) => (
                  <div key={row.label} className="flex items-center justify-between gap-2">
                    <div>
                      <p className="v2-micro text-grove-ink/45 dark:text-grove-ink-dk/45">{row.label}</p>
                      <p className="text-sm font-medium text-grove-ink dark:text-grove-ink-dk">{row.value}</p>
                    </div>
                    <button className="rounded-lg px-2.5 py-1 text-xs font-semibold text-primary-700 ring-1 ring-grove-border transition-colors hover:bg-primary-50 dark:text-primary-400 dark:ring-grove-border-dk dark:hover:bg-primary-900/25">
                      Change
                    </button>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap gap-1.5">
                <Pill tone="mint">2 direct reports</Pill>
                <Pill tone="neutral">Finance Manager profile</Pill>
              </div>
            </V2Card>
          </Reveal>

          <Reveal delay={0.15}>
            <V2Card className="p-5">
              <SectionHeading title="Pending edits" hint="Applied to Salesforce on save" />
              <div className="space-y-2">
                {PENDING_EDITS.map((e) => (
                  <div
                    key={e.id}
                    className="flex items-start justify-between gap-2 rounded-xl bg-grove-canvas p-3 ring-1 ring-grove-border dark:bg-grove-canvas-dk dark:ring-grove-border-dk"
                  >
                    <p className="text-xs leading-relaxed text-grove-ink/75 dark:text-grove-ink-dk/75">
                      {e.text}
                    </p>
                    <button
                      className="shrink-0 rounded-lg p-1.5 text-grove-ink/45 transition-colors hover:bg-white hover:text-red-600 dark:text-grove-ink-dk/45 dark:hover:bg-grove-surface-dk dark:hover:text-red-400"
                      title="Revert edit"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
              <button className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-600 dark:bg-primary-400 dark:text-grove-canvas-dk dark:hover:bg-primary-300">
                <UserCog className="h-4 w-4" />
                Save changes (2)
              </button>
            </V2Card>
          </Reveal>
        </div>
      </div>
    </div>
  )
}
