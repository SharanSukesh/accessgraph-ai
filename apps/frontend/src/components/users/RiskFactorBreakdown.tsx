'use client'

/**
 * Per-user risk driver breakdown: one row per factor (bar, description,
 * evidence naming the granting profile / permission set / PSG).
 */

import { ShieldCheck } from 'lucide-react'
import { Pill, SeverityChip, type Severity } from '@/components/v2/primitives'
import type { RiskEvidence, RiskFactor, RiskGrant } from '@/lib/api/hooks/useUsers'

const GRANT_LABELS: Record<string, string> = {
  profile: 'Profile',
  permission_set: 'Permission set',
  permission_set_group: 'Permission set group',
}

const SEVERITIES: Severity[] = ['critical', 'high', 'medium', 'low', 'info']

function factorImpact(f: RiskFactor): number {
  return f.impact ?? f.score * f.weight * 100
}

function factorLabel(f: RiskFactor): string {
  if (f.label) return f.label
  const text = f.factor.replace(/_/g, ' ')
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function GrantList({ grants }: { grants: RiskGrant[] }) {
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <span className="text-grove-ink/50 dark:text-grove-ink-dk/50">via</span>
      {grants.map((g, i) => (
        <Pill key={`${g.type}-${g.name}-${i}`} tone="neutral">
          <span className="text-grove-ink/55 dark:text-grove-ink-dk/55">{GRANT_LABELS[g.type] ?? 'Grant'}</span>
          <span className="font-semibold text-grove-ink dark:text-grove-ink-dk">{g.name}</span>
        </Pill>
      ))}
    </span>
  )
}

function EvidenceRow({ item, showRoleHint }: { item: RiskEvidence; showRoleHint: boolean }) {
  const severity = SEVERITIES.includes(item.severity as Severity) ? (item.severity as Severity) : null
  return (
    <li className="flex flex-col gap-1.5 py-2 text-xs sm:flex-row sm:items-start sm:gap-3">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
        {severity && <SeverityChip severity={severity} />}
        <span className="font-medium text-grove-ink dark:text-grove-ink-dk">{item.label}</span>
        {item.category && (
          <span className="text-grove-ink/55 dark:text-grove-ink-dk/55">{item.category}</span>
        )}
        {item.detail && (
          <span className="v2-num text-grove-ink/55 dark:text-grove-ink-dk/55">{item.detail}</span>
        )}
        {showRoleHint && item.expected_for_role && <Pill tone="mint">Expected for admin role</Pill>}
      </div>
      {item.granted_by && item.granted_by.length > 0 && <GrantList grants={item.granted_by} />}
    </li>
  )
}

function FactorRow({ factor }: { factor: RiskFactor }) {
  const impact = factorImpact(factor)
  const evidence = factor.evidence ?? []
  const hidden = (factor.evidence_total ?? evidence.length) - evidence.length
  const strong = impact >= 30
  return (
    <div className="rounded-xl border border-grove-border bg-primary-50/30 p-4 dark:border-grove-border-dk dark:bg-primary-900/10">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-grove-ink dark:text-grove-ink-dk">
            {factorLabel(factor)}
          </span>
          {factor.expected_for_role && <Pill tone="mint">Expected for admin role</Pill>}
        </div>
        <span
          className="v2-num text-xs font-semibold text-grove-ink/65 dark:text-grove-ink-dk/65"
          title="Score this factor would produce on its own"
        >
          {impact.toFixed(1)} pts alone
        </span>
      </div>
      <div className="mt-2 flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-grove-canvas dark:bg-grove-canvas-dk">
          <div
            className={`v2-bar-fill h-full rounded-full ${
              strong ? 'bg-copper-500 dark:bg-copper-400' : 'bg-primary-600 dark:bg-primary-400'
            }`}
            style={{ width: `${Math.max(2, factor.score * 100)}%` }}
          />
        </div>
        <span className="v2-num w-10 text-right text-xs font-semibold text-grove-ink dark:text-grove-ink-dk">
          {(factor.score * 100).toFixed(0)}%
        </span>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-grove-ink/70 dark:text-grove-ink-dk/70">
        {factor.description}
      </p>
      {evidence.length > 0 && (
        <ul className="mt-2 divide-y divide-grove-border border-t border-grove-border dark:divide-grove-border-dk dark:border-grove-border-dk">
          {evidence.map((item, i) => (
            <EvidenceRow key={`${item.label}-${i}`} item={item} showRoleHint={!factor.expected_for_role} />
          ))}
        </ul>
      )}
      {hidden > 0 && (
        <p className="mt-1 text-xs text-grove-ink/50 dark:text-grove-ink-dk/50">+{hidden} more</p>
      )}
    </div>
  )
}

export function RiskFactorBreakdown({ factors }: { factors: RiskFactor[] }) {
  const sorted = [...factors].sort((a, b) => factorImpact(b) - factorImpact(a))
  const active = sorted.filter((f) => f.score > 0)
  const inactive = sorted.filter((f) => f.score <= 0)

  return (
    <div className="space-y-3">
      {active.length === 0 && (
        <div className="flex items-center gap-2 text-sm text-grove-ink/65 dark:text-grove-ink-dk/65">
          <ShieldCheck className="h-4 w-4 text-primary-600 dark:text-primary-400" />
          No factor is contributing to this user&apos;s risk.
        </div>
      )}
      {active.map((f) => (
        <FactorRow key={f.factor} factor={f} />
      ))}
      {inactive.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-grove-ink/55 dark:text-grove-ink-dk/55">
          <span>Not contributing:</span>
          {inactive.map((f) => (
            <span key={f.factor} title={f.description}>
              <Pill tone="neutral">{factorLabel(f)}</Pill>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
