'use client'

/**
 * Overview — the New Implementation dashboard. Hero cost + tier,
 * timeline band, and quick links into every planning tab.
 */

import Link from 'next/link'
import { useMemo } from 'react'
import {
  Layers, Calculator, Cloud, Map, Sparkles, ArrowRight, Check, Clock,
} from 'lucide-react'
import { Reveal, Stagger, StaggerItem, CountUp } from '@/components/v2/motion'
import { useAdvisorAnswers } from '@/components/advisor/useAdvisorAnswers'
import { CenterSpinner, RequirementsPrompt } from '@/components/advisor/Gate'
import { recommend, estimateTimeline, fmtUsd } from '@/lib/advisor/rules'

export default function ImplementationOverview() {
  const { ready, answers } = useAdvisorAnswers()
  const rec = useMemo(() => (answers ? recommend(answers) : null), [answers])

  if (!ready) return <CenterSpinner />
  if (!answers || !rec) return <RequirementsPrompt />

  const timeline = estimateTimeline(answers, rec)
  const recommendedClouds = rec.clouds.filter((c) => c.verdict === 'recommended')

  const quickLinks = [
    { href: '/implementation/licensing', icon: Layers, title: 'Licensing & Tiers', stat: rec.tier, hint: `${rec.totalSeats} seats across ${rec.licenses.length} license lines` },
    { href: '/implementation/pricebook', icon: Calculator, title: 'Pricebook', stat: fmtUsd(rec.annualTotal), hint: 'Edit seats, prices, and discount — totals recompute live' },
    { href: '/implementation/clouds', icon: Cloud, title: 'Clouds & Add-ons', stat: `${recommendedClouds.length} clouds`, hint: `${rec.addOns.length} add-ons · ${rec.packages.length} packages` },
    { href: '/implementation/roadmap', icon: Map, title: 'Roadmap', stat: timeline, hint: 'Phased go-live plan from your answers' },
  ]

  return (
    <div className="space-y-8">
      <Reveal>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="v2-micro text-copper-600 dark:text-copper-400">New implementation · overview</p>
            <h1 className="v2-display mt-2 text-4xl font-semibold text-grove-ink dark:text-grove-ink-dk">
              Your Salesforce plan
            </h1>
          </div>
          <Link
            href="/implementation/advisor"
            className="text-sm font-semibold text-primary-700 transition-colors hover:text-copper-600 dark:text-primary-400 dark:hover:text-copper-400"
          >
            Adjust requirements →
          </Link>
        </div>
      </Reveal>

      {/* Hero */}
      <Reveal delay={0.05}>
        <div className="v2-card v2-card-hero p-8">
          <div className="flex flex-col items-start gap-8 lg:flex-row lg:items-center">
            <div>
              <p className="v2-micro text-grove-ink/55 dark:text-grove-ink-dk/55">
                Estimated annual licensing (list)
              </p>
              <p className="v2-num v2-shimmer-text mt-2 text-5xl font-semibold text-grove-ink dark:text-grove-ink-dk">
                <CountUp value={rec.annualTotal} format={(n) => fmtUsd(n)} />
              </p>
              <p className="mt-2 text-sm text-grove-ink/65 dark:text-grove-ink-dk/65">
                Salesforce {rec.tier} · {rec.totalSeats} internal seats · negotiate 15–30% off
              </p>
            </div>
            <div className="hidden h-24 w-px bg-grove-ink/15 dark:bg-grove-ink-dk/25 lg:block" />
            <div>
              <p className="v2-micro mb-2 text-grove-ink/55 dark:text-grove-ink-dk/55">Why {rec.tier}</p>
              <ul className="max-w-md space-y-1.5">
                {rec.tierRationale.slice(0, 3).map((r) => (
                  <li key={r} className="flex gap-2 text-xs leading-relaxed text-grove-ink/75 dark:text-grove-ink-dk/75">
                    <Check className="mt-0.5 h-3 w-3 shrink-0 text-primary-600 dark:text-primary-400" />
                    {r}
                  </li>
                ))}
              </ul>
            </div>
            <div className="lg:ml-auto">
              <p className="v2-micro mb-1 flex items-center gap-1.5 text-grove-ink/55 dark:text-grove-ink-dk/55">
                <Clock className="h-3 w-3" /> Est. implementation
              </p>
              <p className="v2-num text-3xl font-semibold text-grove-ink dark:text-grove-ink-dk">{timeline}</p>
            </div>
          </div>
        </div>
      </Reveal>

      {/* Quick links */}
      <Stagger className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        {quickLinks.map((q) => (
          <StaggerItem key={q.href}>
            <Link
              href={q.href}
              className="group flex h-full items-start gap-4 rounded-2xl border border-grove-border bg-grove-surface p-5 shadow-grove-lift transition-all duration-200 hover:-translate-y-1 hover:border-primary-400/60 hover:shadow-grove-hero dark:border-grove-border-dk dark:bg-grove-surface-dk"
            >
              <span className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-700 ring-1 ring-primary-200 transition-transform duration-200 group-hover:scale-110 dark:bg-primary-900/25 dark:text-primary-400 dark:ring-primary-800">
                <q.icon className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-3">
                  <span className="text-sm font-semibold text-grove-ink dark:text-grove-ink-dk">{q.title}</span>
                  <span className="v2-num shrink-0 text-lg font-semibold text-copper-600 dark:text-copper-400">{q.stat}</span>
                </span>
                <span className="mt-1 block text-xs leading-relaxed text-grove-ink/60 dark:text-grove-ink-dk/60">{q.hint}</span>
              </span>
              <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-grove-ink/30 transition-transform duration-200 group-hover:translate-x-1 group-hover:text-copper-500 dark:text-grove-ink-dk/30" />
            </Link>
          </StaggerItem>
        ))}
      </Stagger>

      {/* Why Salesforce teaser */}
      <Reveal>
        <Link
          href="/implementation/why-salesforce"
          className="group flex items-center justify-between rounded-2xl border border-copper-300/50 bg-copper-50/40 p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-grove-lift dark:border-copper-800/50 dark:bg-copper-900/15"
        >
          <span className="flex items-center gap-3">
            <Sparkles className="h-5 w-5 text-copper-600 dark:text-copper-400" />
            <span className="text-sm font-medium text-grove-ink dark:text-grove-ink-dk">
              The case for Salesforce — how this investment pays back, tailored to your answers
            </span>
          </span>
          <ArrowRight className="h-4 w-4 shrink-0 text-copper-600 transition-transform duration-200 group-hover:translate-x-1 dark:text-copper-400" />
        </Link>
      </Reveal>
    </div>
  )
}
