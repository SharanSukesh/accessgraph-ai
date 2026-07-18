'use client'

/**
 * v2 Compliance — one-click auditor scorecards.
 *
 * Framework picker (SOX / SOC 2 / HIPAA / GDPR / PCI) → score hero
 * with a pass/fail/na segmented bar → the control list with PASS/FAIL
 * chips and remediation hints on failures. SOX shows the shared
 * sampleControls; the other frameworks carry local invented controls
 * consistent with their blurbs.
 */

import { useState } from 'react'
import { ShieldCheck, RefreshCw } from 'lucide-react'
import { Reveal, Stagger, StaggerItem, CountUp } from '@/components/v2/motion'
import {
  PageTitle, V2Card, SeverityChip, SectionHeading, Segmented,
} from '@/components/v2/primitives'
import { COMPLIANCE } from '@/lib/v2/mock-data'

type Control = {
  id: string
  name: string
  status: 'passed' | 'failed'
  metric: string
  rec?: string
}

/** Remediation lines for the failed SOX sample controls. */
const SOX_RECS: Record<string, string> = {
  'SOX-404-ITGC-3.1': 'Freeze the 67 inactive accounts and reclaim licenses at renewal.',
  'SOX-404-ITGC-3.2': 'Triage the 2 open critical anomalies in the Anomalies inbox.',
}

const CONTROLS: Record<string, Control[]> = {
  SOX: COMPLIANCE.sampleControls.map((c) => ({
    id: c.id,
    name: c.name,
    status: c.status as Control['status'],
    metric: c.metric,
    rec: SOX_RECS[c.id],
  })),
  SOC2: [
    { id: 'CC6.1', name: 'Logical access security measures are implemented', status: 'passed', metric: 'SSO enforced for all 1,180 active users via Okta' },
    { id: 'CC6.2', name: 'Access is provisioned with documented authorization', status: 'failed', metric: '2 accounts created without a linked approval ticket', rec: 'Backfill approval records and enable the provisioning hook.' },
    { id: 'CC6.3', name: 'Access is removed on role change or termination', status: 'passed', metric: '0 terminated users retain active sessions' },
  ],
  HIPAA: [
    { id: '§164.308(a)(3)', name: 'Workforce clearance procedure enforced', status: 'failed', metric: '14 users hold PHI-adjacent objects outside their role scope', rec: 'Restrict Patient_Case__c access to the Clinical Ops permission set.' },
    { id: '§164.312(a)(1)', name: 'Unique user identification', status: 'passed', metric: 'No shared logins detected across 1,247 accounts' },
    { id: '§164.312(b)', name: 'Audit controls record PHI access', status: 'failed', metric: 'Field Audit Trail disabled on 2 of 6 PHI objects', rec: 'Enable Field Audit Trail on Patient_Case__c and Lab_Result__c.' },
  ],
  GDPR: [
    { id: 'Art.32(1)(b)', name: 'Confidentiality and integrity of processing systems', status: 'passed', metric: 'OWD private on all 12 personal-data objects' },
    { id: 'Art.32(1)(d)', name: 'Regular testing of security measures', status: 'passed', metric: 'Health Report cadence: every 14 days (target ≤30)' },
    { id: 'Art.32(2)', name: 'Risk-appropriate access to personal data', status: 'failed', metric: '3 integration users hold full-scope API access to Contact', rec: 'Re-scope the Zapier and legacy SOAP connected apps to named objects.' },
  ],
  PCI: [
    { id: 'Req 7.2.1', name: 'Least privilege on cardholder-data objects', status: 'failed', metric: '9 users can read Payment_Method__c without business need', rec: 'Move payment access to a dedicated permission set with quarterly review.' },
    { id: 'Req 8.2.6', name: 'Inactive accounts removed within 90 days', status: 'failed', metric: '67 accounts inactive 90+ days remain enabled', rec: 'Freeze the inactive cohort — same fix clears SOX ITGC-3.1.' },
    { id: 'Req 10.2.1', name: 'Audit trails link access to individual users', status: 'passed', metric: 'Setup Audit Trail + Login History retained 365 days' },
  ],
}

export default function CompliancePage() {
  const [framework, setFramework] = useState('SOX')
  const fw = COMPLIANCE.frameworks.find((f) => f.key === framework) ?? COMPLIANCE.frameworks[0]
  const total = fw.passed + fw.failed + fw.na
  const controls = CONTROLS[fw.key] ?? []
  const scoreColor =
    fw.score >= 80
      ? 'text-primary-600 dark:text-primary-400'
      : fw.score >= 70
      ? 'text-amber-600 dark:text-amber-400'
      : 'text-red-600 dark:text-red-400'

  const segments = [
    { label: 'passing', count: fw.passed, fill: 'bg-primary-600 dark:bg-primary-400' },
    { label: 'failing', count: fw.failed, fill: 'bg-red-700 dark:bg-red-400' },
    { label: 'n/a', count: fw.na, fill: 'bg-grove-border dark:bg-grove-border-dk' },
  ].filter((s) => s.count > 0)

  return (
    <div className="space-y-10">
      <Reveal>
        <PageTitle
          eyebrow="Optimize · assurance"
          title="Compliance"
          subtitle="One-click auditor-ready scorecards mapped to control IDs"
        />
      </Reveal>

      <Reveal delay={0.05}>
        <Segmented
          options={COMPLIANCE.frameworks.map((f) => ({
            key: f.key,
            label: f.label,
            count: f.passed + f.failed + f.na,
          }))}
          value={framework}
          onChange={setFramework}
        />
      </Reveal>

      {/* Score hero — re-keyed so the CountUp replays per framework */}
      <Reveal key={`hero-${fw.key}`}>
        <V2Card hero className="p-8">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-center">
            <div className="flex items-center gap-8">
              <div>
                <p className="v2-micro text-grove-ink/55 dark:text-grove-ink-dk/55">
                  {fw.label} score
                </p>
                <p className={`v2-num mt-2 text-6xl font-semibold ${scoreColor}`}>
                  <CountUp value={fw.score} format={(n) => `${Math.round(n)}%`} />
                </p>
                <p className="mt-2 text-sm text-grove-ink/65 dark:text-grove-ink-dk/65">
                  <span className="v2-num font-semibold text-grove-ink dark:text-grove-ink-dk">{fw.passed}</span>
                  {' '}of{' '}
                  <span className="v2-num font-semibold text-grove-ink dark:text-grove-ink-dk">{total}</span>
                  {' '}controls passing
                </p>
              </div>
              <div className="hidden h-24 w-px bg-grove-border dark:bg-grove-border-dk sm:block" />
              <div className="min-w-[220px] flex-1">
                <p className="v2-micro mb-2 text-grove-ink/55 dark:text-grove-ink-dk/55">
                  Control status
                </p>
                <div className="flex h-3 gap-0.5 overflow-hidden rounded-full">
                  {segments.map((s) => (
                    <div
                      key={s.label}
                      className={`${s.fill} h-full rounded-sm transition-all duration-300`}
                      style={{ width: `${Math.max(2, (s.count / total) * 100)}%` }}
                      title={`${s.label}: ${s.count}`}
                    />
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
                  {segments.map((s) => (
                    <span key={s.label} className="flex items-center gap-1.5 text-xs text-grove-ink/70 dark:text-grove-ink-dk/70">
                      <span className={`h-2 w-2 rounded-full ${s.fill}`} />
                      {s.label}
                      <span className="v2-num font-semibold text-grove-ink dark:text-grove-ink-dk">{s.count}</span>
                    </span>
                  ))}
                </div>
                <p className="mt-3 text-xs text-grove-ink/55 dark:text-grove-ink-dk/55">{fw.blurb}</p>
              </div>
            </div>
            <div className="lg:ml-auto lg:text-right">
              <p className="v2-micro text-grove-ink/45 dark:text-grove-ink-dk/45">
                Refreshed 2 days ago
              </p>
              <button className="mt-2 inline-flex items-center gap-2 rounded-lg bg-primary-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-600 dark:bg-primary-400 dark:text-grove-canvas-dk dark:hover:bg-primary-300">
                <RefreshCw className="h-4 w-4" />
                Run scorecard
              </button>
            </div>
          </div>
        </V2Card>
      </Reveal>

      {/* Controls */}
      <div key={`controls-${fw.key}`} className="space-y-4">
        <Reveal>
          <SectionHeading
            title="Controls"
            hint={`${fw.label} · ${fw.blurb}`}
            actions={
              <span className="flex items-center gap-1.5 text-xs text-grove-ink/55 dark:text-grove-ink-dk/55">
                <ShieldCheck className="h-4 w-4 text-primary-600 dark:text-primary-400" />
                Evidence attached per control
              </span>
            }
          />
        </Reveal>
        <Stagger className="space-y-3">
          {controls.map((c) => (
            <StaggerItem key={c.id}>
              <V2Card lift className="p-5">
                <div className="flex flex-wrap items-center gap-3">
                  <SeverityChip
                    severity={c.status === 'passed' ? 'low' : 'critical'}
                    label={c.status === 'passed' ? 'PASS' : 'FAIL'}
                  />
                  <span className="v2-micro font-mono text-grove-ink/45 dark:text-grove-ink-dk/45">
                    {c.id}
                  </span>
                </div>
                <p className="mt-2 text-sm font-semibold text-grove-ink dark:text-grove-ink-dk">
                  {c.name}
                </p>
                <p className="mt-1 text-xs text-grove-ink/60 dark:text-grove-ink-dk/60">{c.metric}</p>
                {c.status === 'failed' && c.rec && (
                  <p className="mt-2 text-xs italic text-copper-600 dark:text-copper-400">
                    Recommendation: {c.rec}
                  </p>
                )}
              </V2Card>
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </div>
  )
}
