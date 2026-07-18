'use client'

/**
 * v2 Privacy & Data — retention, inventory, and GDPR controls.
 *
 * Inventory KPI strip → retention policy rows → the metadata-only
 * trust claim (hero) → GDPR erasure danger zone (visual mock only).
 */

import { Camera, ScrollText, FlaskConical, RefreshCw, Shield, Trash2 } from 'lucide-react'
import { Reveal, Stagger, StaggerItem } from '@/components/v2/motion'
import { PageTitle, V2Card, StatCard, Pill, SectionHeading } from '@/components/v2/primitives'

const RETENTION = [
  { name: 'Snapshots', days: 90, desc: 'Full org metadata snapshots from each sync run' },
  { name: 'Audit logs', days: 365, desc: 'Every dashboard action, keyed to the acting account' },
  { name: 'Sync jobs', days: 30, desc: 'Job telemetry — timings, row counts, API usage' },
  { name: 'Analysis artifacts', days: 180, desc: 'Health Reports, anomaly runs, scorecards, simulations' },
]

export default function PrivacyPage() {
  return (
    <div className="space-y-10">
      <Reveal>
        <PageTitle
          eyebrow="Admin · data governance"
          title="Privacy & Data"
          subtitle="Retention, inventory, and GDPR controls"
        />
      </Reveal>

      {/* Inventory */}
      <Stagger className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <StaggerItem>
          <StatCard label="Snapshots" value={18240} icon={Camera} delta="oldest: 90 days" />
        </StaggerItem>
        <StaggerItem>
          <StatCard label="Audit log entries" value={4812} icon={ScrollText} delta="365-day window" />
        </StaggerItem>
        <StaggerItem>
          <StatCard label="Analysis artifacts" value={1205} icon={FlaskConical} delta="reports · runs · scorecards" />
        </StaggerItem>
        <StaggerItem>
          <StatCard label="Sync jobs" value={342} icon={RefreshCw} delta="30-day window" />
        </StaggerItem>
      </Stagger>

      {/* Trust claim */}
      <Reveal>
        <V2Card hero className="p-8">
          <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center">
            <span className="rounded-xl bg-primary-50 p-3 text-primary-700 ring-1 ring-primary-100 dark:bg-primary-900/25 dark:text-primary-400 dark:ring-primary-900">
              <Shield className="h-7 w-7" />
            </span>
            <div>
              <p className="v2-micro text-grove-ink/55 dark:text-grove-ink-dk/55">
                What we store
              </p>
              <p className="v2-display mt-2 max-w-2xl text-2xl font-semibold leading-snug text-grove-ink dark:text-grove-ink-dk">
                Metadata + aggregate counts only.
              </p>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-grove-ink/65 dark:text-grove-ink-dk/65">
                We do not read the values inside your records. Field-level data never
                leaves Salesforce.
              </p>
            </div>
          </div>
        </V2Card>
      </Reveal>

      {/* Retention policies */}
      <Reveal>
        <V2Card className="p-6">
          <SectionHeading
            title="Retention policies"
            hint="Everything past its window is purged automatically"
          />
          <div className="divide-y divide-grove-border/60 dark:divide-grove-border-dk/60">
            {RETENTION.map((r) => (
              <div key={r.name} className="flex flex-wrap items-center justify-between gap-3 py-3.5">
                <div>
                  <p className="text-sm font-semibold text-grove-ink dark:text-grove-ink-dk">{r.name}</p>
                  <p className="mt-0.5 text-xs text-grove-ink/55 dark:text-grove-ink-dk/55">{r.desc}</p>
                </div>
                <Pill tone="mint">
                  <span className="v2-num font-semibold">{r.days}</span> days
                </Pill>
              </div>
            ))}
          </div>
        </V2Card>
      </Reveal>

      {/* Danger zone */}
      <Reveal>
        <V2Card className="p-6 ring-1 ring-red-300 dark:ring-red-900">
          <SectionHeading
            title="Right to Erasure (GDPR Art. 17)"
            hint="Permanently deletes every snapshot, artifact, and audit entry for this org"
          />
          <p className="max-w-2xl text-xs leading-relaxed text-grove-ink/60 dark:text-grove-ink-dk/60">
            This removes all stored data for Meridian Industries from Newton. Salesforce
            itself is untouched. This action cannot be undone.
          </p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <input
              type="text"
              placeholder='Type "meridian-industries" to confirm'
              className="w-full max-w-sm rounded-lg border border-grove-border bg-white px-3.5 py-2 text-sm text-grove-ink placeholder:text-grove-ink/40 focus:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-200 dark:border-grove-border-dk dark:bg-grove-canvas-dk dark:text-grove-ink-dk dark:placeholder:text-grove-ink-dk/40 dark:focus:border-red-700 dark:focus:ring-red-950"
            />
            <button className="inline-flex items-center justify-center gap-2 rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-red-600 dark:bg-red-500 dark:hover:bg-red-400 dark:hover:text-red-950">
              <Trash2 className="h-4 w-4" />
              Delete all org data
            </button>
          </div>
        </V2Card>
      </Reveal>
    </div>
  )
}
