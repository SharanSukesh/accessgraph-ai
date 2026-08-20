'use client'

/**
 * AdvisorWizard — the 8-step questionnaire, extracted so it serves two
 * surfaces: the public one-shot /advisor page and the authenticated
 * New Implementation workspace (/implementation/advisor), which
 * pre-fills saved answers and persists on completion.
 */

import { useState } from 'react'
import {
  Building2, Users, TrendingUp, Headphones, Megaphone, Cpu,
  ShieldCheck, Wallet, ArrowLeft, ArrowRight, Sparkles, Check,
} from 'lucide-react'
import {
  type AdvisorAnswers, DEFAULT_ANSWERS,
  SALES_NEEDS, SERVICE_NEEDS, MARKETING_NEEDS, COMMERCE_NEEDS,
  PLATFORM_NEEDS, INTEGRATIONS, COMPLIANCE_OPTIONS,
} from '@/lib/advisor/rules'

const STEPS = [
  { key: 'company', label: 'Company', icon: Building2 },
  { key: 'teams', label: 'Teams', icon: Users },
  { key: 'sales', label: 'Sales', icon: TrendingUp },
  { key: 'service', label: 'Service', icon: Headphones },
  { key: 'marketing', label: 'Marketing', icon: Megaphone },
  { key: 'platform', label: 'Platform & AI', icon: Cpu },
  { key: 'governance', label: 'Governance', icon: ShieldCheck },
  { key: 'budget', label: 'Budget', icon: Wallet },
] as const

// ---------------------------------------------------------------- inputs

function ChoiceChip({
  active, onClick, children,
}: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border px-4 py-2.5 text-sm font-medium text-left transition-all duration-200 ${
        active
          ? 'border-primary-600 bg-primary-50 text-primary-700 ring-1 ring-primary-600/30 dark:border-primary-400 dark:bg-primary-900/25 dark:text-primary-300 dark:ring-primary-400/30'
          : 'border-grove-border bg-grove-surface text-grove-ink/75 hover:border-primary-400 hover:-translate-y-0.5 dark:border-grove-border-dk dark:bg-grove-surface-dk dark:text-grove-ink-dk/75 dark:hover:border-primary-400'
      }`}
    >
      <span className="flex items-center gap-2">
        {active && <Check className="h-3.5 w-3.5 shrink-0" />}
        {children}
      </span>
    </button>
  )
}

function SeatInput({
  label, hint, value, onChange,
}: { label: string; hint?: string; value: number; onChange: (n: number) => void }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-grove-border bg-grove-surface px-4 py-3 dark:border-grove-border-dk dark:bg-grove-surface-dk">
      <div className="min-w-0">
        <p className="text-sm font-medium text-grove-ink dark:text-grove-ink-dk">{label}</p>
        {hint && <p className="text-xs text-grove-ink/55 dark:text-grove-ink-dk/55">{hint}</p>}
      </div>
      <input
        type="number"
        min={0}
        max={100000}
        value={value}
        onChange={(e) => onChange(Math.max(0, Math.min(100000, Number(e.target.value) || 0)))}
        className="v2-num w-24 rounded-lg border border-grove-border bg-grove-canvas px-3 py-1.5 text-right text-sm font-semibold text-grove-ink outline-none transition-all focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 dark:border-grove-border-dk dark:bg-grove-canvas-dk dark:text-grove-ink-dk"
      />
    </div>
  )
}

function StepHeading({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="mb-5">
      <h2 className="v2-display text-2xl font-semibold text-grove-ink dark:text-grove-ink-dk">{title}</h2>
      <p className="mt-1 text-sm text-grove-ink/60 dark:text-grove-ink-dk/60">{hint}</p>
    </div>
  )
}

function MicroLabel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <p className={`v2-micro mb-2 text-grove-ink/55 dark:text-grove-ink-dk/55 ${className}`}>{children}</p>
}

function toggle(list: string[], key: string): string[] {
  return list.includes(key) ? list.filter((k) => k !== key) : [...list, key]
}

// ---------------------------------------------------------------- wizard

export function AdvisorWizard({
  initialAnswers,
  onComplete,
  completeLabel = 'Build my recommendation',
}: {
  initialAnswers?: AdvisorAnswers | null
  onComplete: (answers: AdvisorAnswers) => void
  completeLabel?: string
}) {
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState<AdvisorAnswers>(initialAnswers ?? DEFAULT_ANSWERS)
  const set = <K extends keyof AdvisorAnswers>(k: K, v: AdvisorAnswers[K]) =>
    setAnswers((a) => ({ ...a, [k]: v }))

  return (
    <div>
      {/* Step indicator */}
      <div className="flex items-center gap-1">
        {STEPS.map((s, i) => {
          const Icon = s.icon
          const done = i < step
          const active = i === step
          return (
            <button
              key={s.key}
              onClick={() => i < step && setStep(i)}
              disabled={i > step}
              title={s.label}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-1 py-2 text-xs font-medium transition-all duration-200 ${
                active
                  ? 'bg-primary-700 text-white dark:bg-primary-400 dark:text-grove-canvas-dk'
                  : done
                  ? 'bg-primary-50 text-primary-700 hover:bg-primary-100 dark:bg-primary-900/25 dark:text-primary-400'
                  : 'bg-grove-surface text-grove-ink/40 dark:bg-grove-surface-dk dark:text-grove-ink-dk/40'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span className="hidden lg:inline">{s.label}</span>
            </button>
          )
        })}
      </div>

      {/* Step body */}
      <div className="v2-card mt-6 p-6 sm:p-8">
        {step === 0 && (
          <div>
            <StepHeading title="About the company" hint="Scale, industry, and who you sell to — these route everything else." />
            <MicroLabel>Company size</MicroLabel>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {([['lt25', '< 25'], ['25-100', '25–100'], ['100-500', '100–500'], ['500-2000', '500–2K'], ['gt2000', '2,000+']] as const).map(([k, l]) => (
                <ChoiceChip key={k} active={answers.companySize === k} onClick={() => set('companySize', k)}>{l}</ChoiceChip>
              ))}
            </div>
            <MicroLabel className="mt-6">Industry</MicroLabel>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {([['tech', 'Technology'], ['finserv', 'Financial services'], ['healthcare', 'Healthcare'], ['manufacturing', 'Manufacturing'], ['retail', 'Retail'], ['services', 'Professional services'], ['nonprofit', 'Nonprofit'], ['other', 'Other']] as const).map(([k, l]) => (
                <ChoiceChip key={k} active={answers.industry === k} onClick={() => set('industry', k)}>{l}</ChoiceChip>
              ))}
            </div>
            <MicroLabel className="mt-6">Who do you sell to?</MicroLabel>
            <div className="grid grid-cols-3 gap-2">
              {([['b2b', 'Businesses (B2B)'], ['b2c', 'Consumers (B2C)'], ['both', 'Both']] as const).map(([k, l]) => (
                <ChoiceChip key={k} active={answers.audience === k} onClick={() => set('audience', k)}>{l}</ChoiceChip>
              ))}
            </div>
          </div>
        )}

        {step === 1 && (
          <div>
            <StepHeading title="Who will use it?" hint="Seats by persona — this drives the license mix and cloud sizing directly." />
            <div className="space-y-2.5">
              <SeatInput label="Sales" hint="Own pipeline, close deals" value={answers.salesSeats} onChange={(n) => set('salesSeats', n)} />
              <SeatInput label="Service / support" hint="Work cases, help customers" value={answers.serviceSeats} onChange={(n) => set('serviceSeats', n)} />
              <SeatInput label="Field technicians" hint="On-site visits, installs, repairs" value={answers.fieldTechs} onChange={(n) => set('fieldTechs', n)} />
              <SeatInput label="Marketing" hint="Campaigns, lead gen" value={answers.marketingSeats} onChange={(n) => set('marketingSeats', n)} />
              <SeatInput label="Ops / internal apps" hint="Live in custom objects, not core CRM" value={answers.opsSeats} onChange={(n) => set('opsSeats', n)} />
              <SeatInput label="Execs / read-mostly" hint="Dashboards and visibility" value={answers.readOnlySeats} onChange={(n) => set('readOnlySeats', n)} />
            </div>
            <MicroLabel className="mt-6">External partners needing access</MicroLabel>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {([['none', 'None'], ['lt100', '< 100'], ['100-1000', '100–1,000'], ['gt1000', '1,000+']] as const).map(([k, l]) => (
                <ChoiceChip key={k} active={answers.partnerUsers === k} onClick={() => set('partnerUsers', k)}>{l}</ChoiceChip>
              ))}
            </div>
            <div className="mt-4">
              <ChoiceChip active={answers.customerPortal} onClick={() => set('customerPortal', !answers.customerPortal)}>
                Customers need a self-service portal (cases, knowledge, account info)
              </ChoiceChip>
            </div>
          </div>
        )}

        {step === 2 && (
          <div>
            <StepHeading title="Sales motion" hint="Each of these gates a specific feature tier or cloud — pick what you'll run in year one." />
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {SALES_NEEDS.map((u) => (
                <ChoiceChip key={u.key} active={answers.salesNeeds.includes(u.key)} onClick={() => set('salesNeeds', toggle(answers.salesNeeds, u.key))}>{u.label}</ChoiceChip>
              ))}
            </div>
            <p className="mt-4 text-xs text-grove-ink/50 dark:text-grove-ink-dk/50">
              Territory management and revenue intelligence are tier discriminators — they pull the recommendation up the ladder.
            </p>
          </div>
        )}

        {step === 3 && (
          <div>
            <StepHeading title="Service & support" hint="Channels and SLAs decide the Service Cloud tier; on-site work triggers Field Service." />
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {SERVICE_NEEDS.map((u) => (
                <ChoiceChip key={u.key} active={answers.serviceNeeds.includes(u.key)} onClick={() => set('serviceNeeds', toggle(answers.serviceNeeds, u.key))}>{u.label}</ChoiceChip>
              ))}
            </div>
          </div>
        )}

        {step === 4 && (
          <div>
            <StepHeading title="Marketing & commerce" hint="B2B nurture and B2C journeys are different products with very different price tags." />
            <MicroLabel>Marketing</MicroLabel>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {MARKETING_NEEDS.map((u) => (
                <ChoiceChip key={u.key} active={answers.marketingNeeds.includes(u.key)} onClick={() => set('marketingNeeds', toggle(answers.marketingNeeds, u.key))}>{u.label}</ChoiceChip>
              ))}
            </div>
            <MicroLabel className="mt-6">Selling online</MicroLabel>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {COMMERCE_NEEDS.map((u) => (
                <ChoiceChip key={u.key} active={answers.commerceNeeds.includes(u.key)} onClick={() => set('commerceNeeds', toggle(answers.commerceNeeds, u.key))}>{u.label}</ChoiceChip>
              ))}
            </div>
          </div>
        )}

        {step === 5 && (
          <div>
            <StepHeading title="Platform, AI & data" hint="The tier ladder lives here: AI agents, Data Cloud, and Slack point at Agentforce 1; custom code points at Enterprise." />
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {PLATFORM_NEEDS.map((u) => (
                <ChoiceChip key={u.key} active={answers.platformNeeds.includes(u.key)} onClick={() => set('platformNeeds', toggle(answers.platformNeeds, u.key))}>{u.label}</ChoiceChip>
              ))}
            </div>
            <MicroLabel className="mt-6">Systems to connect</MicroLabel>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {INTEGRATIONS.map((i) => (
                <ChoiceChip key={i.key} active={answers.integrations.includes(i.key)} onClick={() => set('integrations', toggle(answers.integrations, i.key))}>{i.label}</ChoiceChip>
              ))}
            </div>
            <MicroLabel className="mt-6">Expected record volume (year one)</MicroLabel>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {([['lt100k', '< 100K'], ['100k-1m', '100K–1M'], ['1m-10m', '1M–10M'], ['gt10m', '10M+']] as const).map(([k, l]) => (
                <ChoiceChip key={k} active={answers.dataVolume === k} onClick={() => set('dataVolume', k)}>{l}</ChoiceChip>
              ))}
            </div>
          </div>
        )}

        {step === 6 && (
          <div>
            <StepHeading title="Compliance & governance" hint="Regulated data, sandboxes, and support level all move the tier math." />
            <MicroLabel>Compliance frameworks</MicroLabel>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {COMPLIANCE_OPTIONS.map((c) => (
                <ChoiceChip key={c.key} active={answers.compliance.includes(c.key)} onClick={() => set('compliance', toggle(answers.compliance, c.key))}>{c.label}</ChoiceChip>
              ))}
            </div>
            <MicroLabel className="mt-6">Environment & support</MicroLabel>
            <div className="space-y-2">
              <ChoiceChip active={answers.backupRequirement} onClick={() => set('backupRequirement', !answers.backupRequirement)}>
                We have a formal backup / disaster-recovery requirement
              </ChoiceChip>
              <ChoiceChip active={answers.fullSandbox} onClick={() => set('fullSandbox', !answers.fullSandbox)}>
                We need a full-copy sandbox for testing (UAT with production data)
              </ChoiceChip>
            </div>
            <MicroLabel className="mt-6">Support level</MicroLabel>
            <div className="grid grid-cols-2 gap-2">
              {([['standard', 'Standard support is fine'], ['premier', '24/7 Premier support required']] as const).map(([k, l]) => (
                <ChoiceChip key={k} active={answers.supportLevel === k} onClick={() => set('supportLevel', k)}>{l}</ChoiceChip>
              ))}
            </div>
          </div>
        )}

        {step === 7 && (
          <div>
            <StepHeading title="Budget & growth" hint="Sets how aggressively we size the tier." />
            <MicroLabel>Budget posture</MicroLabel>
            <div className="grid grid-cols-3 gap-2">
              {([['lean', 'Lean — minimum viable'], ['balanced', 'Balanced'], ['premium', 'Premium — room to grow']] as const).map(([k, l]) => (
                <ChoiceChip key={k} active={answers.budget === k} onClick={() => set('budget', k)}>{l}</ChoiceChip>
              ))}
            </div>
            <MicroLabel className="mt-6">Headcount growth next 2 years</MicroLabel>
            <div className="grid grid-cols-3 gap-2">
              {([['flat', 'Flat'], ['moderate', 'Moderate'], ['aggressive', 'Aggressive']] as const).map(([k, l]) => (
                <ChoiceChip key={k} active={answers.growth === k} onClick={() => set('growth', k)}>{l}</ChoiceChip>
              ))}
            </div>
          </div>
        )}

        {/* Nav */}
        <div className="mt-8 flex items-center justify-between border-t border-grove-border pt-5 dark:border-grove-border-dk">
          <button
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
            className="flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-medium text-grove-ink/60 transition-colors hover:text-grove-ink disabled:opacity-30 dark:text-grove-ink-dk/60 dark:hover:text-grove-ink-dk"
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
          {step < STEPS.length - 1 ? (
            <button
              onClick={() => setStep((s) => s + 1)}
              className="flex items-center gap-1.5 rounded-xl bg-primary-700 px-5 py-2 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:bg-primary-600 hover:shadow-grove-hero active:scale-[0.98] dark:bg-primary-400 dark:text-grove-canvas-dk dark:hover:bg-primary-300"
            >
              Next <ArrowRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              onClick={() => onComplete(answers)}
              className="flex items-center gap-1.5 rounded-xl bg-primary-700 px-5 py-2 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:bg-primary-600 hover:shadow-grove-hero active:scale-[0.98] dark:bg-primary-400 dark:text-grove-canvas-dk dark:hover:bg-primary-300"
            >
              <Sparkles className="h-4 w-4" /> {completeLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
