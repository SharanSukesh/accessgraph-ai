'use client'

/**
 * New Implementation Advisor — public pre-sales questionnaire (v1.1).
 *
 * Eight short steps that discriminate between Salesforce's full tier
 * ladder (Starter Suite → Pro Suite → Enterprise → Unlimited →
 * Agentforce 1) and produce explicit per-cloud verdicts (Sales,
 * Service, Field Service, Marketing B2B/B2C, Commerce, Experience,
 * Revenue/CPQ, Data Cloud, Analytics, industry clouds).
 *
 * Public route — no auth, no backend. Renders bare (AppLayout bypasses
 * /advisor), Grove Refined styling.
 */

import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  Building2, Users, TrendingUp, Headphones, Megaphone, Cpu,
  ShieldCheck, Wallet, ArrowLeft, ArrowRight, Sparkles, Printer,
  RotateCcw, Check, Minus, CircleDot,
} from 'lucide-react'
import { Logo } from '@/components/shared/Logo'
import { Reveal, Stagger, StaggerItem, CountUp } from '@/components/v2/motion'
import {
  type AdvisorAnswers, DEFAULT_ANSWERS,
  SALES_NEEDS, SERVICE_NEEDS, MARKETING_NEEDS, COMMERCE_NEEDS,
  PLATFORM_NEEDS, INTEGRATIONS, COMPLIANCE_OPTIONS,
  recommend, fmtUsd,
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

// ---------------------------------------------------------------- page

export default function AdvisorPage() {
  const [step, setStep] = useState(0)
  const [showResults, setShowResults] = useState(false)
  const [answers, setAnswers] = useState<AdvisorAnswers>(DEFAULT_ANSWERS)
  const set = <K extends keyof AdvisorAnswers>(k: K, v: AdvisorAnswers[K]) =>
    setAnswers((a) => ({ ...a, [k]: v }))

  const rec = useMemo(() => recommend(answers), [answers])
  const recommendedClouds = rec.clouds.filter((c) => c.verdict === 'recommended')
  const considerClouds = rec.clouds.filter((c) => c.verdict === 'consider')
  const skippedClouds = rec.clouds.filter((c) => c.verdict === 'not-needed')

  return (
    <div className="min-h-screen bg-grove-canvas/80 px-4 py-10 dark:bg-grove-canvas-dk/80">
      <div className="mx-auto max-w-3xl">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <Logo variant="full" size="md" className="text-primary-700 dark:text-primary-400" />
          <Link
            href="/login"
            className="text-sm font-medium text-grove-ink/60 transition-colors hover:text-primary-700 dark:text-grove-ink-dk/60 dark:hover:text-primary-400"
          >
            Already on Salesforce? Sign in →
          </Link>
        </div>

        {!showResults ? (
          <>
            <Reveal>
              <p className="v2-micro text-copper-600 dark:text-copper-400">New implementation advisor</p>
              <h1 className="v2-display mt-2 text-4xl font-semibold text-grove-ink dark:text-grove-ink-dk">
                What should you buy from Salesforce?
              </h1>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-grove-ink/65 dark:text-grove-ink-dk/65">
                Eight quick steps. You get a defensible shopping list — the right
                tier (Starter Suite through Agentforce 1), which clouds you
                actually need, license mix with list-price math, and the
                org-design guardrails we wish every client had on day one.
              </p>
            </Reveal>

            {/* Step indicator */}
            <div className="mt-8 flex items-center gap-1">
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
                    onClick={() => setShowResults(true)}
                    className="flex items-center gap-1.5 rounded-xl bg-primary-700 px-5 py-2 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:bg-primary-600 hover:shadow-grove-hero active:scale-[0.98] dark:bg-primary-400 dark:text-grove-canvas-dk dark:hover:bg-primary-300"
                  >
                    <Sparkles className="h-4 w-4" /> Build my recommendation
                  </button>
                )}
              </div>
            </div>
          </>
        ) : (
          /* ---------------------------------------------------- results */
          <div className="space-y-6 print:space-y-4">
            <Reveal>
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="v2-micro text-copper-600 dark:text-copper-400">Your recommendation</p>
                  <h1 className="v2-display mt-2 text-4xl font-semibold text-grove-ink dark:text-grove-ink-dk">
                    Salesforce {rec.tier}
                  </h1>
                </div>
                <div className="flex gap-2 print:hidden">
                  <button
                    onClick={() => window.print()}
                    className="flex items-center gap-1.5 rounded-xl border border-grove-border bg-grove-surface px-4 py-2 text-sm font-medium text-grove-ink/75 transition-colors hover:border-primary-400 dark:border-grove-border-dk dark:bg-grove-surface-dk dark:text-grove-ink-dk/75"
                  >
                    <Printer className="h-4 w-4" /> Print / PDF
                  </button>
                  <button
                    onClick={() => { setShowResults(false); setStep(0) }}
                    className="flex items-center gap-1.5 rounded-xl border border-grove-border bg-grove-surface px-4 py-2 text-sm font-medium text-grove-ink/75 transition-colors hover:border-primary-400 dark:border-grove-border-dk dark:bg-grove-surface-dk dark:text-grove-ink-dk/75"
                  >
                    <RotateCcw className="h-4 w-4" /> Adjust answers
                  </button>
                </div>
              </div>
            </Reveal>

            {/* Hero total */}
            <Reveal delay={0.05}>
              <div className="v2-card v2-card-hero p-8">
                <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center">
                  <div>
                    <p className="v2-micro text-grove-ink/55 dark:text-grove-ink-dk/55">Estimated annual licensing (list)</p>
                    <p className="v2-num v2-shimmer-text mt-2 text-5xl font-semibold text-grove-ink dark:text-grove-ink-dk">
                      <CountUp value={rec.annualTotal} format={(n) => fmtUsd(n)} />
                    </p>
                    <p className="mt-2 text-sm text-grove-ink/65 dark:text-grove-ink-dk/65">
                      {rec.totalSeats} internal seats · before negotiation (target 15–30% below list)
                    </p>
                  </div>
                  <div className="sm:ml-auto">
                    <p className="v2-micro mb-2 text-grove-ink/55 dark:text-grove-ink-dk/55">Why {rec.tier}</p>
                    <ul className="max-w-sm space-y-1.5">
                      {rec.tierRationale.map((r) => (
                        <li key={r} className="flex gap-2 text-xs leading-relaxed text-grove-ink/75 dark:text-grove-ink-dk/75">
                          <Check className="mt-0.5 h-3 w-3 shrink-0 text-primary-600 dark:text-primary-400" />
                          {r}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </Reveal>

            {/* Tier ladder */}
            <Reveal>
              <div className="v2-card p-6">
                <h2 className="v2-display mb-1 text-xl font-semibold text-grove-ink dark:text-grove-ink-dk">The tier ladder</h2>
                <p className="mb-4 text-xs text-grove-ink/55 dark:text-grove-ink-dk/55">
                  Where every tier stands against your answers — so the recommendation is an argument, not a verdict.
                </p>
                <div className="space-y-1.5">
                  {rec.tierLadder.map((t) => {
                    const isChosen = t.tier === rec.tier
                    return (
                      <div
                        key={t.tier}
                        className={`flex flex-wrap items-baseline gap-x-4 gap-y-1 rounded-xl border px-4 py-3 transition-colors ${
                          isChosen
                            ? 'border-copper-400/60 bg-copper-50/40 dark:border-copper-500/50 dark:bg-copper-900/15'
                            : 'border-grove-border/70 dark:border-grove-border-dk/70'
                        }`}
                      >
                        <span className={`flex w-40 shrink-0 items-center gap-2 text-sm font-semibold ${isChosen ? 'text-copper-700 dark:text-copper-400' : 'text-grove-ink dark:text-grove-ink-dk'}`}>
                          {isChosen ? <CircleDot className="h-3.5 w-3.5" /> : <Minus className="h-3.5 w-3.5 opacity-40" />}
                          {t.tier}
                        </span>
                        <span className={`text-xs leading-relaxed ${isChosen ? 'font-medium text-copper-700 dark:text-copper-400' : 'text-grove-ink/60 dark:text-grove-ink-dk/60'}`}>
                          {t.verdict}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            </Reveal>

            {/* Cloud verdicts */}
            <Reveal>
              <div className="v2-card p-6">
                <h2 className="v2-display mb-1 text-xl font-semibold text-grove-ink dark:text-grove-ink-dk">Which clouds you need</h2>
                <p className="mb-4 text-xs text-grove-ink/55 dark:text-grove-ink-dk/55">
                  Recommended = buy at go-live. Consider = price it, decide in discovery. Everything else: skip for now.
                </p>
                <Stagger className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {[...recommendedClouds, ...considerClouds].map((c) => (
                    <StaggerItem key={c.cloud}>
                      <div className={`h-full rounded-xl border p-4 ${
                        c.verdict === 'recommended'
                          ? 'border-primary-400/50 bg-primary-50/40 dark:border-primary-400/40 dark:bg-primary-900/15'
                          : 'border-grove-border dark:border-grove-border-dk'
                      }`}>
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-grove-ink dark:text-grove-ink-dk">{c.cloud}</p>
                          <span className={`v2-micro shrink-0 rounded-full px-2 py-0.5 ring-1 ${
                            c.verdict === 'recommended'
                              ? 'bg-primary-50 text-primary-700 ring-primary-200 dark:bg-primary-900/30 dark:text-primary-400 dark:ring-primary-800'
                              : 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900'
                          }`}>
                            {c.verdict === 'recommended' ? 'Recommended' : 'Consider'}
                          </span>
                        </div>
                        <ul className="mt-2 space-y-1">
                          {c.drivers.map((d) => (
                            <li key={d} className="flex gap-1.5 text-xs leading-relaxed text-grove-ink/65 dark:text-grove-ink-dk/65">
                              <Check className="mt-0.5 h-3 w-3 shrink-0 text-primary-600 dark:text-primary-400" />
                              {d}
                            </li>
                          ))}
                        </ul>
                        <p className="v2-num mt-2.5 text-xs font-medium text-copper-600 dark:text-copper-400">{c.pricing}</p>
                      </div>
                    </StaggerItem>
                  ))}
                </Stagger>
                {skippedClouds.length > 0 && (
                  <p className="mt-4 border-t border-grove-border/60 pt-3 text-xs text-grove-ink/45 dark:border-grove-border-dk/60 dark:text-grove-ink-dk/45">
                    Not needed for now: {skippedClouds.map((c) => c.cloud).join(' · ')}
                  </p>
                )}
              </div>
            </Reveal>

            {/* License table */}
            <Reveal>
              <div className="v2-card p-6">
                <h2 className="v2-display mb-4 text-xl font-semibold text-grove-ink dark:text-grove-ink-dk">License mix</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-grove-border dark:border-grove-border-dk">
                        {['Persona', 'Product', 'Seats', '$ / user / mo', '$ / year'].map((h) => (
                          <th key={h} className="v2-micro whitespace-nowrap px-3 py-2.5 text-left text-grove-ink/55 dark:text-grove-ink-dk/55">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-grove-border/60 dark:divide-grove-border-dk/60">
                      {rec.licenses.map((l) => (
                        <tr key={l.persona}>
                          <td className="px-3 py-3">
                            <p className="font-medium text-grove-ink dark:text-grove-ink-dk">{l.persona}</p>
                            {l.note && <p className="mt-0.5 text-xs text-grove-ink/50 dark:text-grove-ink-dk/50">{l.note}</p>}
                          </td>
                          <td className="px-3 py-3 text-grove-ink/80 dark:text-grove-ink-dk/80">{l.product}</td>
                          <td className="v2-num px-3 py-3 text-grove-ink dark:text-grove-ink-dk">{l.seats.toLocaleString()}</td>
                          <td className="v2-num px-3 py-3 text-grove-ink/80 dark:text-grove-ink-dk/80">{l.unitMonthly > 0 ? fmtUsd(l.unitMonthly) : '—'}</td>
                          <td className="v2-num px-3 py-3 font-semibold text-grove-ink dark:text-grove-ink-dk">{fmtUsd(l.annual)}</td>
                        </tr>
                      ))}
                      <tr>
                        <td colSpan={4} className="px-3 py-3 text-right font-semibold text-grove-ink dark:text-grove-ink-dk">Total</td>
                        <td className="v2-num px-3 py-3 text-base font-bold text-primary-700 dark:text-primary-400">{fmtUsd(rec.annualTotal)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </Reveal>

            {/* Add-ons + packages */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <Reveal>
                <div className="v2-card h-full p-6">
                  <h2 className="v2-display mb-4 text-xl font-semibold text-grove-ink dark:text-grove-ink-dk">Add-ons to budget for</h2>
                  {rec.addOns.length === 0 ? (
                    <p className="text-sm text-grove-ink/55 dark:text-grove-ink-dk/55">None triggered by your answers — keep it lean.</p>
                  ) : (
                    <div className="space-y-3">
                      {rec.addOns.map((a) => (
                        <div key={a.name} className="rounded-xl border border-grove-border p-3.5 dark:border-grove-border-dk">
                          <div className="flex items-baseline justify-between gap-3">
                            <p className="text-sm font-semibold text-grove-ink dark:text-grove-ink-dk">{a.name}</p>
                            <p className="v2-num shrink-0 text-xs font-medium text-copper-600 dark:text-copper-400">{a.estimate}</p>
                          </div>
                          <p className="mt-1 text-xs leading-relaxed text-grove-ink/60 dark:text-grove-ink-dk/60">{a.why}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </Reveal>
              <Reveal delay={0.06}>
                <div className="v2-card h-full p-6">
                  <h2 className="v2-display mb-4 text-xl font-semibold text-grove-ink dark:text-grove-ink-dk">AppExchange starting kit</h2>
                  <div className="space-y-3">
                    {rec.packages.map((p) => (
                      <div key={p.name} className="rounded-xl border border-grove-border p-3.5 dark:border-grove-border-dk">
                        <div className="flex items-center gap-2">
                          <span className="v2-micro rounded-full bg-primary-50 px-2 py-0.5 text-primary-700 ring-1 ring-primary-200 dark:bg-primary-900/30 dark:text-primary-400 dark:ring-primary-800">{p.category}</span>
                          <p className="text-sm font-semibold text-grove-ink dark:text-grove-ink-dk">{p.name}</p>
                        </div>
                        <p className="mt-1.5 text-xs leading-relaxed text-grove-ink/60 dark:text-grove-ink-dk/60">{p.why}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </Reveal>
            </div>

            {/* Guardrails */}
            <Reveal>
              <div className="v2-card p-6">
                <h2 className="v2-display mb-1 text-xl font-semibold text-grove-ink dark:text-grove-ink-dk">Org-design guardrails</h2>
                <p className="mb-4 text-xs text-grove-ink/55 dark:text-grove-ink-dk/55">
                  What we set up in week one on every engagement — each of these prevents a problem Newton routinely finds in mature orgs.
                </p>
                <Stagger className="space-y-2">
                  {rec.guardrails.map((g) => (
                    <StaggerItem key={g} className="flex gap-2.5 text-sm leading-relaxed text-grove-ink/80 dark:text-grove-ink-dk/80">
                      <Check className="mt-1 h-3.5 w-3.5 shrink-0 text-copper-500 dark:text-copper-400" />
                      {g}
                    </StaggerItem>
                  ))}
                </Stagger>
              </div>
            </Reveal>

            {/* Caveats + CTA */}
            <Reveal>
              <div className="v2-card p-6">
                <ul className="space-y-1.5">
                  {rec.caveats.map((c) => (
                    <li key={c} className="text-xs leading-relaxed text-grove-ink/55 dark:text-grove-ink-dk/55">• {c}</li>
                  ))}
                </ul>
                <p className="mt-4 border-t border-grove-border pt-4 text-sm text-grove-ink/75 dark:border-grove-border-dk dark:text-grove-ink-dk/75">
                  Once you're live, Newton monitors the same org for license waste, sprawl,
                  anomalies, and compliance drift —{' '}
                  <Link href="/login" className="font-semibold text-primary-700 hover:text-copper-600 dark:text-primary-400 dark:hover:text-copper-400">
                    see what it does for existing orgs →
                  </Link>
                </p>
              </div>
            </Reveal>
          </div>
        )}

        <p className="v2-micro mt-10 text-center text-grove-ink/40 dark:text-grove-ink-dk/40">
          Newton · Access Intelligence · Enterprise-grade
        </p>
      </div>
    </div>
  )
}
