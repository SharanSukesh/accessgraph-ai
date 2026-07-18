'use client'

/**
 * v2 Graph Explorer — static SVG mock of the access-path graph.
 *
 * Structure: PageTitle → two-column layout: user picker + legend on
 * the left, dotgrid canvas with a hand-placed SVG graph on the right.
 * Paths draw in via strokeDasharray keyframes and nodes fade in
 * staggered; everything freezes under prefers-reduced-motion.
 */

import { useState } from 'react'
import { Reveal } from '@/components/v2/motion'
import {
  PageTitle, V2Card, SectionHeading, Pill,
} from '@/components/v2/primitives'
import { PEOPLE } from '@/lib/v2/mock-data'

type GraphNode = {
  id: string
  label: string
  sub?: string
  x: number
  y: number
  r: number
  kind: 'mid' | 'object'
}

const MID_NODES: GraphNode[] = [
  { id: 'profile', label: 'Finance Manager', sub: 'Profile', x: 235, y: 168, r: 17, kind: 'mid' },
  { id: 'ps', label: 'Sales Ops', sub: 'Permission set', x: 565, y: 168, r: 17, kind: 'mid' },
  { id: 'role', label: 'VP Finance', sub: 'Role', x: 400, y: 392, r: 17, kind: 'mid' },
]

const OBJECT_NODES: GraphNode[] = [
  { id: 'account', label: 'Account', x: 116, y: 68, r: 13, kind: 'object' },
  { id: 'opportunity', label: 'Opportunity', x: 322, y: 44, r: 13, kind: 'object' },
  { id: 'invoice', label: 'Invoice__c', x: 486, y: 44, r: 13, kind: 'object' },
  { id: 'case', label: 'Case', x: 684, y: 68, r: 13, kind: 'object' },
  { id: 'reports', label: 'Report folder', x: 672, y: 356, r: 13, kind: 'object' },
]

const USER = { x: 400, y: 252, r: 27 }

/** Quadratic curve from a → b, bowed toward the canvas edge. */
function curve(a: { x: number; y: number }, b: { x: number; y: number }, bow = 0.18): string {
  const mx = (a.x + b.x) / 2
  const my = (a.y + b.y) / 2
  const dx = b.x - a.x
  const dy = b.y - a.y
  const cx = mx - dy * bow
  const cy = my + dx * bow
  return `M ${a.x} ${a.y} Q ${cx} ${cy} ${b.x} ${b.y}`
}

const EDGES: { id: string; d: string; delay: number }[] = [
  { id: 'e-user-profile', d: curve(USER, MID_NODES[0]), delay: 0 },
  { id: 'e-user-ps', d: curve(USER, MID_NODES[1], -0.18), delay: 0.1 },
  { id: 'e-user-role', d: curve(USER, MID_NODES[2], 0.12), delay: 0.2 },
  { id: 'e-profile-account', d: curve(MID_NODES[0], OBJECT_NODES[0]), delay: 0.45 },
  { id: 'e-profile-opp', d: curve(MID_NODES[0], OBJECT_NODES[1], -0.12), delay: 0.55 },
  { id: 'e-ps-invoice', d: curve(MID_NODES[1], OBJECT_NODES[2], 0.12), delay: 0.55 },
  { id: 'e-ps-case', d: curve(MID_NODES[1], OBJECT_NODES[3], -0.14), delay: 0.65 },
  { id: 'e-role-reports', d: curve(MID_NODES[2], OBJECT_NODES[4], -0.16), delay: 0.75 },
]

const LEGEND: { label: string; dot: string }[] = [
  { label: 'User', dot: 'bg-copper-500 dark:bg-copper-400' },
  { label: 'Profile / Permission set / Role', dot: 'bg-primary-600 dark:bg-primary-400' },
  { label: 'Object / Folder', dot: 'bg-grove-border dark:bg-grove-border-dk' },
  { label: 'Grant path', dot: 'bg-primary-600/40 dark:bg-primary-400/40' },
]

export default function GraphExplorerPage() {
  const [selectedId, setSelectedId] = useState(PEOPLE[0].id)
  const selected = PEOPLE.find((p) => p.id === selectedId) ?? PEOPLE[0]
  const initials = selected.name.split(' ').map((w) => w[0]).join('')

  return (
    <div className="space-y-10">
      <Reveal>
        <PageTitle
          eyebrow="Explore · access paths"
          title="Graph Explorer"
          subtitle="How a user reaches every object — profiles, permission sets, roles, sharing."
        />
      </Reveal>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px,1fr]">
        {/* Left rail — picker + legend */}
        <div className="space-y-6">
          <Reveal>
            <V2Card className="p-5">
              <SectionHeading title="User" hint="Pick a user to trace" />
              <div className="space-y-1.5">
                {PEOPLE.slice(0, 4).map((p) => {
                  const active = p.id === selectedId
                  return (
                    <button
                      key={p.id}
                      onClick={() => setSelectedId(p.id)}
                      className={`flex w-full items-center gap-3 rounded-xl border p-2.5 text-left transition-all duration-200 ${
                        active
                          ? 'border-primary-300 bg-primary-50/70 dark:border-primary-800 dark:bg-primary-900/20'
                          : 'border-transparent hover:border-grove-border hover:bg-grove-canvas dark:hover:border-grove-border-dk dark:hover:bg-grove-canvas-dk'
                      }`}
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-700 text-[11px] font-bold text-white dark:bg-primary-400 dark:text-grove-canvas-dk">
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

          <Reveal delay={0.08}>
            <V2Card className="p-5">
              <SectionHeading title="Legend" hint="Node types" />
              <div className="space-y-2.5">
                {LEGEND.map((l) => (
                  <div key={l.label} className="flex items-center gap-2.5">
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${l.dot}`} />
                    <span className="text-xs font-medium text-grove-ink/75 dark:text-grove-ink-dk/75">
                      {l.label}
                    </span>
                  </div>
                ))}
              </div>
            </V2Card>
          </Reveal>
        </div>

        {/* Canvas */}
        <Reveal delay={0.05}>
          <V2Card className="v2-dotgrid relative min-h-[480px] overflow-hidden p-4">
            <div className="absolute left-6 top-5 z-10 flex items-center gap-2">
              <Pill tone="copper">{selected.name}</Pill>
              <Pill tone="neutral">5 objects reachable</Pill>
            </div>

            <style>{`
              @keyframes gx-dash {
                to { stroke-dashoffset: 0; }
              }
              @keyframes gx-fade {
                to { opacity: 1; }
              }
              .gx-edge {
                stroke-dasharray: 620;
                stroke-dashoffset: 620;
                animation: gx-dash 1.1s cubic-bezier(0.22, 1, 0.36, 1) forwards;
              }
              .gx-node {
                opacity: 0;
                animation: gx-fade 0.5s ease-out forwards;
              }
              @media (prefers-reduced-motion: reduce) {
                .gx-edge { stroke-dasharray: none; stroke-dashoffset: 0; animation: none; }
                .gx-node { opacity: 1; animation: none; }
              }
            `}</style>

            <svg
              viewBox="0 0 800 480"
              className="h-full min-h-[448px] w-full"
              role="img"
              aria-label={`Access graph for ${selected.name}: one profile, one permission set, and one role granting paths to five objects`}
            >
              {/* Edges */}
              <g
                fill="none"
                strokeWidth={1.5}
                strokeLinecap="round"
                className="stroke-primary-600 opacity-35 dark:stroke-primary-400"
              >
                {EDGES.map((e) => (
                  <path
                    key={e.id}
                    d={e.d}
                    className="gx-edge"
                    style={{ animationDelay: `${e.delay}s` }}
                  />
                ))}
              </g>

              {/* Mid ring — grant containers */}
              {MID_NODES.map((n, i) => (
                <g key={n.id} className="gx-node" style={{ animationDelay: `${0.35 + i * 0.12}s` }}>
                  <circle
                    cx={n.x}
                    cy={n.y}
                    r={n.r}
                    className="fill-primary-600 dark:fill-primary-400"
                  />
                  <circle
                    cx={n.x}
                    cy={n.y}
                    r={n.r + 4}
                    fill="none"
                    strokeWidth={1}
                    className="stroke-primary-600/30 dark:stroke-primary-400/30"
                  />
                  <text
                    x={n.x}
                    y={n.y + n.r + 18}
                    textAnchor="middle"
                    className="v2-micro fill-grove-ink/80 text-[10px] font-semibold dark:fill-grove-ink-dk/80"
                  >
                    {n.label}
                  </text>
                  <text
                    x={n.x}
                    y={n.y + n.r + 31}
                    textAnchor="middle"
                    className="v2-micro fill-grove-ink/45 text-[9px] dark:fill-grove-ink-dk/45"
                  >
                    {n.sub}
                  </text>
                </g>
              ))}

              {/* Outer ring — objects */}
              {OBJECT_NODES.map((n, i) => (
                <g key={n.id} className="gx-node" style={{ animationDelay: `${0.7 + i * 0.1}s` }}>
                  <circle
                    cx={n.x}
                    cy={n.y}
                    r={n.r}
                    strokeWidth={1.5}
                    className="fill-grove-canvas stroke-grove-border dark:fill-grove-canvas-dk dark:stroke-grove-border-dk"
                  />
                  <circle
                    cx={n.x}
                    cy={n.y}
                    r={3.5}
                    className="fill-primary-600 dark:fill-primary-400"
                  />
                  <text
                    x={n.x}
                    y={n.y + n.r + 16}
                    textAnchor="middle"
                    className="v2-micro fill-grove-ink/70 text-[10px] font-medium dark:fill-grove-ink-dk/70"
                  >
                    {n.label}
                  </text>
                </g>
              ))}

              {/* Center — the user */}
              <g className="gx-node" style={{ animationDelay: '0.1s' }}>
                <circle
                  cx={USER.x}
                  cy={USER.y}
                  r={USER.r + 7}
                  fill="none"
                  strokeWidth={1}
                  className="stroke-copper-500/35 dark:stroke-copper-400/35"
                />
                <circle
                  cx={USER.x}
                  cy={USER.y}
                  r={USER.r}
                  className="fill-copper-500 dark:fill-copper-400"
                />
                <text
                  x={USER.x}
                  y={USER.y + 5}
                  textAnchor="middle"
                  className="fill-white text-sm font-bold dark:fill-grove-canvas-dk"
                >
                  {initials}
                </text>
                <text
                  x={USER.x}
                  y={USER.y + USER.r + 22}
                  textAnchor="middle"
                  className="v2-micro fill-grove-ink/80 text-[10px] font-semibold dark:fill-grove-ink-dk/80"
                >
                  {selected.name}
                </text>
              </g>
            </svg>
          </V2Card>
        </Reveal>
      </div>
    </div>
  )
}
