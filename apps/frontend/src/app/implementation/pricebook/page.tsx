'use client'

/**
 * Pricebook — the negotiation what-if. Seats and unit prices are
 * editable per line, plus a global discount slider; list vs negotiated
 * totals recompute live. Overrides persist in localStorage so the
 * numbers survive a refresh mid-meeting.
 */

import { useMemo, useState } from 'react'
import { RotateCcw, Printer } from 'lucide-react'
import { Reveal, CountUp } from '@/components/v2/motion'
import { useAdvisorAnswers } from '@/components/advisor/useAdvisorAnswers'
import { CenterSpinner, RequirementsPrompt } from '@/components/advisor/Gate'
import { recommend, fmtUsd } from '@/lib/advisor/rules'
import {
  type PricebookOverrides, DEFAULT_PRICEBOOK, loadPricebook, savePricebook,
} from '@/lib/advisor/storage'

export default function PricebookPage() {
  const { ready, answers } = useAdvisorAnswers()
  const rec = useMemo(() => (answers ? recommend(answers) : null), [answers])
  const [pb, setPb] = useState<PricebookOverrides | null>(null)

  // Load overrides once the client is up (avoids hydration mismatch).
  const overrides = pb ?? (ready ? loadPricebook() : DEFAULT_PRICEBOOK)

  const update = (patch: Partial<PricebookOverrides>) => {
    const next = { ...overrides, ...patch }
    setPb(next)
    savePricebook(next)
  }

  if (!ready) return <CenterSpinner />
  if (!answers || !rec) return <RequirementsPrompt />

  // Effective lines with overrides applied.
  const lines = rec.licenses.map((l) => {
    const seats = overrides.seatOverrides[l.persona] ?? l.seats
    const unit = overrides.unitOverrides[l.persona] ?? l.unitMonthly
    const annual = unit > 0 ? seats * unit * 12 : l.annual
    return { ...l, seats, unitMonthly: unit, annual, editable: l.unitMonthly > 0 }
  })
  const listTotal = rec.annualTotal
  const grossTotal = lines.reduce((s, l) => s + l.annual, 0)
  const netTotal = grossTotal * (1 - overrides.discountPct / 100)
  const saved = listTotal - netTotal

  return (
    <div className="space-y-6">
      <Reveal>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="v2-micro text-copper-600 dark:text-copper-400">New implementation · pricebook</p>
            <h1 className="v2-display mt-2 text-4xl font-semibold text-grove-ink dark:text-grove-ink-dk">
              Pricebook
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-grove-ink/65 dark:text-grove-ink-dk/65">
              Edit seats and unit prices to model your negotiation. Changes persist
              on this device; the questionnaire stays untouched.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1.5 rounded-xl border border-grove-border bg-grove-surface px-4 py-2 text-sm font-medium text-grove-ink/75 transition-colors hover:border-primary-400 dark:border-grove-border-dk dark:bg-grove-surface-dk dark:text-grove-ink-dk/75"
            >
              <Printer className="h-4 w-4" /> Print
            </button>
            <button
              onClick={() => { setPb(DEFAULT_PRICEBOOK); savePricebook(DEFAULT_PRICEBOOK) }}
              className="flex items-center gap-1.5 rounded-xl border border-grove-border bg-grove-surface px-4 py-2 text-sm font-medium text-grove-ink/75 transition-colors hover:border-primary-400 dark:border-grove-border-dk dark:bg-grove-surface-dk dark:text-grove-ink-dk/75"
            >
              <RotateCcw className="h-4 w-4" /> Reset to list
            </button>
          </div>
        </div>
      </Reveal>

      {/* Totals hero */}
      <Reveal delay={0.04}>
        <div className="v2-card v2-card-hero p-8">
          <div className="flex flex-col gap-8 sm:flex-row sm:items-center">
            <div>
              <p className="v2-micro text-grove-ink/55 dark:text-grove-ink-dk/55">Negotiated annual total</p>
              <p className="v2-num v2-shimmer-text mt-2 text-5xl font-semibold text-grove-ink dark:text-grove-ink-dk">
                <CountUp value={netTotal} format={(n) => fmtUsd(n)} />
              </p>
            </div>
            <div className="hidden h-20 w-px bg-grove-ink/15 dark:bg-grove-ink-dk/25 sm:block" />
            <div className="space-y-1 text-sm">
              <p className="text-grove-ink/65 dark:text-grove-ink-dk/65">
                List total: <span className="v2-num font-semibold text-grove-ink dark:text-grove-ink-dk">{fmtUsd(listTotal)}</span>
              </p>
              <p className="text-grove-ink/65 dark:text-grove-ink-dk/65">
                vs list:{' '}
                <span className={`v2-num font-semibold ${saved >= 0 ? 'text-primary-700 dark:text-primary-400' : 'text-red-600 dark:text-red-400'}`}>
                  {saved >= 0 ? '−' : '+'}{fmtUsd(Math.abs(saved))} / yr
                </span>
              </p>
            </div>
            <div className="sm:ml-auto sm:w-64">
              <div className="flex items-baseline justify-between">
                <p className="v2-micro text-grove-ink/55 dark:text-grove-ink-dk/55">Negotiated discount</p>
                <p className="v2-num text-lg font-semibold text-copper-600 dark:text-copper-400">{overrides.discountPct}%</p>
              </div>
              <input
                type="range"
                min={0}
                max={60}
                step={1}
                value={overrides.discountPct}
                onChange={(e) => update({ discountPct: Number(e.target.value) })}
                className="mt-2 w-full accent-copper-500"
                aria-label="Negotiated discount percentage"
              />
              <p className="mt-1 text-[11px] text-grove-ink/50 dark:text-grove-ink-dk/50">
                Enterprise agreements typically land 15–30% below list.
              </p>
            </div>
          </div>
        </div>
      </Reveal>

      {/* Editable table */}
      <Reveal>
        <div className="v2-card p-6">
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
                {lines.map((l) => (
                  <tr key={l.persona}>
                    <td className="px-3 py-3">
                      <p className="font-medium text-grove-ink dark:text-grove-ink-dk">{l.persona}</p>
                      {l.note && <p className="mt-0.5 max-w-[240px] text-xs text-grove-ink/50 dark:text-grove-ink-dk/50">{l.note}</p>}
                    </td>
                    <td className="px-3 py-3 text-grove-ink/80 dark:text-grove-ink-dk/80">{l.product}</td>
                    <td className="px-3 py-3">
                      {l.editable ? (
                        <input
                          type="number"
                          min={0}
                          max={100000}
                          value={l.seats}
                          onChange={(e) =>
                            update({
                              seatOverrides: {
                                ...overrides.seatOverrides,
                                [l.persona]: Math.max(0, Math.min(100000, Number(e.target.value) || 0)),
                              },
                            })
                          }
                          className="v2-num w-20 rounded-lg border border-grove-border bg-grove-canvas px-2 py-1 text-right text-sm font-semibold text-grove-ink outline-none transition-all focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 dark:border-grove-border-dk dark:bg-grove-canvas-dk dark:text-grove-ink-dk"
                        />
                      ) : (
                        <span className="v2-num text-grove-ink dark:text-grove-ink-dk">{l.seats.toLocaleString()}</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {l.editable ? (
                        <input
                          type="number"
                          min={0}
                          max={10000}
                          value={l.unitMonthly}
                          onChange={(e) =>
                            update({
                              unitOverrides: {
                                ...overrides.unitOverrides,
                                [l.persona]: Math.max(0, Math.min(10000, Number(e.target.value) || 0)),
                              },
                            })
                          }
                          className="v2-num w-24 rounded-lg border border-grove-border bg-grove-canvas px-2 py-1 text-right text-sm font-semibold text-grove-ink outline-none transition-all focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 dark:border-grove-border-dk dark:bg-grove-canvas-dk dark:text-grove-ink-dk"
                        />
                      ) : (
                        <span className="text-grove-ink/60 dark:text-grove-ink-dk/60">org-level</span>
                      )}
                    </td>
                    <td className="v2-num px-3 py-3 font-semibold text-grove-ink dark:text-grove-ink-dk">{fmtUsd(l.annual)}</td>
                  </tr>
                ))}
                <tr>
                  <td colSpan={4} className="px-3 py-3 text-right text-sm text-grove-ink/60 dark:text-grove-ink-dk/60">
                    Subtotal (before discount)
                  </td>
                  <td className="v2-num px-3 py-3 font-semibold text-grove-ink dark:text-grove-ink-dk">{fmtUsd(grossTotal)}</td>
                </tr>
                <tr>
                  <td colSpan={4} className="px-3 py-3 text-right font-semibold text-grove-ink dark:text-grove-ink-dk">
                    Negotiated total ({overrides.discountPct}% off)
                  </td>
                  <td className="v2-num px-3 py-3 text-base font-bold text-primary-700 dark:text-primary-400">{fmtUsd(netTotal)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-4 border-t border-grove-border/60 pt-3 text-xs text-grove-ink/50 dark:border-grove-border-dk/60 dark:text-grove-ink-dk/50">
            Org-level lines (marketing platforms) are flat subscriptions — the
            discount slider applies to them too, matching how EAs are negotiated.
            Add-ons (Shield, CPQ, sandboxes) are priced against net spend and
            budgeted separately on the Clouds & Add-ons tab.
          </p>
        </div>
      </Reveal>
    </div>
  )
}
