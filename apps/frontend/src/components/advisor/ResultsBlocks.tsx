'use client'

/**
 * Shared result-rendering blocks for the advisor recommendation —
 * used by the public /advisor one-shot results and the tabs of the
 * New Implementation workspace, so both always render identically.
 */

import { Check, Minus, CircleDot } from 'lucide-react'
import { Stagger, StaggerItem } from '@/components/v2/motion'
import { type Recommendation, fmtUsd } from '@/lib/advisor/rules'

export function TierLadderCard({ rec }: { rec: Recommendation }) {
  return (
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
  )
}

export function CloudGrid({ rec }: { rec: Recommendation }) {
  const recommended = rec.clouds.filter((c) => c.verdict === 'recommended')
  const consider = rec.clouds.filter((c) => c.verdict === 'consider')
  const skipped = rec.clouds.filter((c) => c.verdict === 'not-needed')
  return (
    <div className="v2-card p-6">
      <h2 className="v2-display mb-1 text-xl font-semibold text-grove-ink dark:text-grove-ink-dk">Which clouds you need</h2>
      <p className="mb-4 text-xs text-grove-ink/55 dark:text-grove-ink-dk/55">
        Recommended = buy at go-live. Consider = price it, decide in discovery. Everything else: skip for now.
      </p>
      <Stagger className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {[...recommended, ...consider].map((c) => (
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
      {skipped.length > 0 && (
        <p className="mt-4 border-t border-grove-border/60 pt-3 text-xs text-grove-ink/45 dark:border-grove-border-dk/60 dark:text-grove-ink-dk/45">
          Not needed for now: {skipped.map((c) => c.cloud).join(' · ')}
        </p>
      )}
    </div>
  )
}

export function LicenseTable({ rec }: { rec: Recommendation }) {
  return (
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
  )
}

export function AddOnsCard({ rec }: { rec: Recommendation }) {
  return (
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
  )
}

export function PackagesCard({ rec }: { rec: Recommendation }) {
  return (
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
  )
}

export function GuardrailsCard({ rec }: { rec: Recommendation }) {
  return (
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
  )
}

export function CaveatsCard({ rec, children }: { rec: Recommendation; children?: React.ReactNode }) {
  return (
    <div className="v2-card p-6">
      <ul className="space-y-1.5">
        {rec.caveats.map((c) => (
          <li key={c} className="text-xs leading-relaxed text-grove-ink/55 dark:text-grove-ink-dk/55">• {c}</li>
        ))}
      </ul>
      {children}
    </div>
  )
}
