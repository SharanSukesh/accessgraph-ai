'use client'

/**
 * New Implementation Advisor — public pre-sales questionnaire.
 *
 * For greenfield clients who do NOT have Salesforce yet (the bookend to
 * License Fit, which right-sizes existing orgs). Six short steps, then
 * a transparent rule engine (src/lib/advisor/rules.ts) produces the
 * "Salesforce shopping list": edition, license mix with list-price
 * math, add-ons, AppExchange packages, and org-design guardrails.
 *
 * Public route — no auth, no backend. Renders bare (AppLayout bypasses
 * /advisor), Grove Refined styling throughout.
 */

import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  Building2, Users, ListChecks, Database, ShieldCheck, Wallet,
  ArrowLeft, ArrowRight, Sparkles, Printer, RotateCcw, Check,
} from 'lucide-react'
import { Logo } from '@/components/shared/Logo'
import { Reveal, Stagger, StaggerItem, CountUp } from '@/components/v2/motion'
import {
  type AdvisorAnswers, DEFAULT_ANSWERS, USE_CASES, INTEGRATIONS,
  COMPLIANCE_OPTIONS, recommend, fmtUsd,
} from '@/lib/advisor/rules'

const STEPS = [
  { key: 'company', label: 'Company', icon: Building2 },
  { key: 'teams', label: 'Teams', icon: Users },
  { key: 'usecases', label: 'Use cases', icon: ListChecks },
  { key: 'data', label: 'Data & systems', icon: Database },
  { key: 'compliance', label: 'Compliance', icon: ShieldCheck },
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
                Six quick steps. You get a defensible shopping list — edition, license
                mix, add-ons, and packages — with list-price math and the org-design
                guardrails we wish every client had on day one.
              </p>
            </Reveal>

            {/* Step indicator */}
            <div className="mt-8 flex items-center gap-1.5">
              {STEPS.map((s, i) => {
                const Icon = s.icon
                const done = i < step
                const active = i === step
                return (
                  <button
                    key={s.key}
                    onClick={() => i < step && setStep(i)}
                    disabled={i > step}
                    className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-medium transition-all duration-200 ${
                      active
                        ? 'bg-primary-700 text-white dark:bg-primary-400 dark:text-grove-canvas-dk'
                        : done
                        ? 'bg-primary-50 text-primary-700 hover:bg-primary-100 dark:bg-primary-900/25 dark:text-primary-400'
                        : 'bg-grove-surface text-grove-ink/40 dark:bg-grove-surface-dk dark:text-grove-ink-dk/40'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">{s.label}</span>
                  </button>
                )
              })}
            </div>

            {/* Step body */}
            <div className="v2-card mt-6 p-6 sm:p-8">
              {step === 0 && (
                <div>
                  <StepHeading title="About the company" hint="Sets the scale baseline for everything else." />
                  <p className="v2-micro mb-2 text-grove-ink/55 dark:text-grove-ink-dk/55">Company size</p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                    {([['lt25', '< 25'], ['25-100', '25–100'], ['100-500', '100–500'], ['500-2000', '500–2K'], ['gt2000', '2,000+']] as const).map(([k, l]) => (
                      <ChoiceChip key={k} active={answers.companySize === k} onClick={() => set('companySize', k)}>{l}</ChoiceChip>
                    ))}
                  </div>
                  <p className="v2-micro mb-2 mt-6 text-grove-ink/55 dark:text-grove-ink-dk/55">Industry</p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {([['tech', 'Technology'], ['finserv', 'Financial services'], ['healthcare', 'Healthcare'], ['manufacturing', 'Manufacturing'], ['retail', 'Retail'], ['services', 'Professional services'], ['nonprofit', 'Nonprofit'], ['other', 'Other']] as const).map(([k, l]) => (
                      <ChoiceChip key={k} active={answers.industry === k} onClick={() => set('industry', k)}>{l}</ChoiceChip>
                    ))}
                  </div>
                </div>
              )}

              {step === 1 && (
                <div>
                  <StepHeading title="Who will use it?" hint="Seats by persona — this drives the license mix directly." />
                  <div className="space-y-2.5">
                    <SeatInput label="Sales" hint="Own pipeline, close deals" value={answers.salesSeats} onChange={(n) => set('salesSeats', n)} />
                    <SeatInput label="Service / support" hint="Work cases, help customers" value={answers.serviceSeats} onChange={(n) => set('serviceSeats', n)} />
                    <SeatInput label="Marketing" hint="Campaigns, lead gen" value={answers.marketingSeats} onChange={(n) => set('marketingSeats', n)} />
                    <SeatInput label="Ops / internal apps" hint="Live in custom objects, not core CRM" value={answers.opsSeats} onChange={(n) => set('opsSeats', n)} />
                    <SeatInput label="Execs / read-mostly" hint="Dashboards and visibility" value={answers.readOnlySeats} onChange={(n) => set('readOnlySeats', n)} />
                  </div>
                  <p className="v2-micro mb-2 mt-6 text-grove-ink/55 dark:text-grove-ink-dk/55">External partners needing access</p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {([['none', 'None'], ['lt100', '< 100'], ['100-1000', '100–1,000'], ['gt1000', '1,000+']] as const).map(([k, l]) => (
                      <ChoiceChip key={k} active={answers.partnerUsers === k} onClick={() => set('partnerUsers', k)}>{l}</ChoiceChip>
                    ))}
                  </div>
                </div>
              )}

              {step === 2 && (
                <div>
                  <StepHeading title="What do you need it to do?" hint="Pick everything that applies — each one gates specific features and add-ons." />
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {USE_CASES.map((u) => (
                      <ChoiceChip key={u.key} active={answers.useCases.includes(u.key)} onClick={() => set('useCases', toggle(answers.useCases, u.key))}>{u.label}</ChoiceChip>
                    ))}
                  </div>
                </div>
              )}

              {step === 3 && (
                <div>
                  <StepHeading title="Data & connected systems" hint="Volume and integrations decide edition limits and connector packages." />
                  <p className="v2-micro mb-2 text-grove-ink/55 dark:text-grove-ink-dk/55">Expected record volume (year one)</p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {([['lt100k', '< 100K'], ['100k-1m', '100K–1M'], ['1m-10m', '1M–10M'], ['gt10m', '10M+']] as const).map(([k, l]) => (
                      <ChoiceChip key={k} active={answers.dataVolume === k} onClick={() => set('dataVolume', k)}>{l}</ChoiceChip>
                    ))}
                  </div>
                  <p className="v2-micro mb-2 mt-6 text-grove-ink/55 dark:text-grove-ink-dk/55">Systems to connect</p>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {INTEGRATIONS.map((i) => (
                      <ChoiceChip key={i.key} active={answers.integrations.includes(i.key)} onClick={() => set('integrations', toggle(answers.integrations, i.key))}>{i.label}</ChoiceChip>
                    ))}
                  </div>
                </div>
              )}

              {step === 4 && (
                <div>
                  <StepHeading title="Compliance & governance" hint="Regulated data changes the security architecture — better to know now." />
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {COMPLIANCE_OPTIONS.map((c) => (
                      <ChoiceChip key={c.key} active={answers.compliance.includes(c.key)} onClick={() => set('compliance', toggle(answers.compliance, c.key))}>{c.label}</ChoiceChip>
                    ))}
                  </div>
                  <div className="mt-6">
                    <ChoiceChip active={answers.backupRequirement} onClick={() => set('backupRequirement', !answers.backupRequirement)}>
                      We have a formal backup / disaster-recovery requirement
                    </ChoiceChip>
                  </div>
                </div>
              )}

              {step === 5 && (
                <div>
                  <StepHeading title="Budget & growth" hint="Sets how aggressively we size the edition." />
                  <p className="v2-micro mb-2 text-grove-ink/55 dark:text-grove-ink-dk/55">Budget posture</p>
                  <div className="grid grid-cols-3 gap-2">
                    {([['lean', 'Lean — minimum viable'], ['balanced', 'Balanced'], ['premium', 'Premium — room to grow']] as const).map(([k, l]) => (
                      <ChoiceChip key={k} active={answers.budget === k} onClick={() => set('budget', k)}>{l}</ChoiceChip>
                    ))}
                  </div>
                  <p className="v2-micro mb-2 mt-6 text-grove-ink/55 dark:text-grove-ink-dk/55">Headcount growth next 2 years</p>
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
                    Salesforce {rec.edition}
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
                    <p className="v2-micro mb-2 text-grove-ink/55 dark:text-grove-ink-dk/55">Why {rec.edition}</p>
                    <ul className="max-w-sm space-y-1.5">
                      {rec.editionRationale.map((r) => (
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
