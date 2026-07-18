'use client'

/**
 * v2 Login — split-panel mock.
 *
 * Left: deep-forest brand panel with the product story, animated
 * stat ticker, and the metadata-only trust line. Right: the sign-in
 * card on warm canvas with the User/Admin tab switch.
 * Visual mock only — the form does not submit.
 */

import { useState } from 'react'
import Link from 'next/link'
import { ShieldCheck, Lock, ArrowRight, Sparkles } from 'lucide-react'
import { Logo } from '@/components/shared/Logo'
import { Reveal, Stagger, StaggerItem, CountUp } from '@/components/v2/motion'
import { Eyebrow } from '@/components/v2/primitives'

const PROOF_POINTS = [
  { value: 214800, label: 'avg. annual savings identified', format: (n: number) => `$${Math.round(n).toLocaleString()}` },
  { value: 9203, label: 'zombie reports found in one org', format: (n: number) => Math.round(n).toLocaleString() },
  { value: 21, label: 'compliance controls scored per click', format: (n: number) => `${Math.round(n)}` },
]

export default function V2LoginPage() {
  const [tab, setTab] = useState<'user' | 'admin'>('user')

  return (
    <div className="flex min-h-screen">
      {/* Brand panel */}
      <div className="v2-sidebar relative hidden w-[46%] flex-col justify-between overflow-hidden p-12 lg:flex">
        <div className="v2-dotgrid absolute inset-0 opacity-40" />
        <div className="relative">
          <Logo variant="full" size="md" className="text-primary-400" />
        </div>

        <div className="relative max-w-md">
          <Reveal>
            <p className="v2-micro text-copper-400">Access Intelligence for Salesforce</p>
            <h1 className="v2-display mt-4 text-4xl font-semibold leading-tight text-[#eee8d3]">
              Walk into the discovery meeting with numbers they can&apos;t unsee.
            </h1>
            <p className="mt-4 text-sm leading-relaxed text-[#eee8d3]/65">
              Newton turns a raw Salesforce org into severity-ranked findings,
              defensible savings math, and auditor-ready evidence — from one
              metadata-only scan.
            </p>
          </Reveal>

          <Stagger className="mt-10 space-y-5">
            {PROOF_POINTS.map((p) => (
              <StaggerItem key={p.label} className="flex items-baseline gap-3">
                <span className="v2-num text-3xl font-semibold text-primary-400">
                  <CountUp value={p.value} format={p.format} />
                </span>
                <span className="text-sm text-[#eee8d3]/60">{p.label}</span>
              </StaggerItem>
            ))}
          </Stagger>
        </div>

        <div className="relative flex items-start gap-3 rounded-xl bg-[#eee8d3]/[0.06] p-4 ring-1 ring-[#eee8d3]/10">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary-400" />
          <p className="text-xs leading-relaxed text-[#eee8d3]/70">
            <span className="font-semibold text-[#eee8d3]">Metadata + aggregate counts only.</span>{' '}
            We do not read the values inside your records. Field-level data
            never leaves Salesforce.
          </p>
        </div>
      </div>

      {/* Sign-in panel */}
      <div className="flex flex-1 items-center justify-center bg-grove-canvas/80 px-6 dark:bg-grove-canvas-dk/80">
        <Reveal className="w-full max-w-md">
          <div className="mb-8 lg:hidden">
            <Logo variant="full" size="md" className="text-primary-700 dark:text-primary-400" />
          </div>

          <Eyebrow>Welcome back</Eyebrow>
          <h2 className="v2-display mt-2 text-3xl font-semibold text-grove-ink dark:text-grove-ink-dk">
            Sign in to Newton
          </h2>
          <p className="mt-2 text-sm text-grove-ink/60 dark:text-grove-ink-dk/60">
            Accounts are created by your workspace admin.
          </p>

          {/* Tab switch */}
          <div className="mt-8 inline-flex gap-1 rounded-xl bg-grove-surface p-1 ring-1 ring-grove-border dark:bg-grove-surface-dk dark:ring-grove-border-dk">
            {(['user', 'admin'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`rounded-lg px-5 py-1.5 text-sm font-medium capitalize transition-all duration-200 ${
                  tab === t
                    ? 'bg-primary-700 text-white shadow-sm dark:bg-primary-400 dark:text-grove-canvas-dk'
                    : 'text-grove-ink/60 hover:text-grove-ink dark:text-grove-ink-dk/60 dark:hover:text-grove-ink-dk'
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {tab === 'admin' && (
            <div className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-800 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900">
              <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Admin sign-in unlocks user management and org configuration.
            </div>
          )}

          {/* Form (visual mock) */}
          <div className="mt-6 space-y-4">
            <div>
              <label className="v2-micro mb-1.5 block text-grove-ink/55 dark:text-grove-ink-dk/55">
                Email
              </label>
              <input
                type="email"
                placeholder="you@firm.com"
                className="w-full rounded-xl border border-grove-border bg-grove-surface px-4 py-2.5 text-sm text-grove-ink outline-none transition-all duration-200 placeholder:text-grove-ink/35 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 dark:border-grove-border-dk dark:bg-grove-surface-dk dark:text-grove-ink-dk dark:placeholder:text-grove-ink-dk/35"
              />
            </div>
            <div>
              <label className="v2-micro mb-1.5 block text-grove-ink/55 dark:text-grove-ink-dk/55">
                Password
              </label>
              <input
                type="password"
                placeholder="••••••••••"
                className="w-full rounded-xl border border-grove-border bg-grove-surface px-4 py-2.5 text-sm text-grove-ink outline-none transition-all duration-200 placeholder:text-grove-ink/35 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 dark:border-grove-border-dk dark:bg-grove-surface-dk dark:text-grove-ink-dk dark:placeholder:text-grove-ink-dk/35"
              />
            </div>
            <Link
              href="/v2/orgs/demo/dashboard"
              className="group flex w-full items-center justify-center gap-2 rounded-xl bg-primary-700 py-2.5 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:bg-primary-600 hover:shadow-grove-hero active:scale-[0.99] dark:bg-primary-400 dark:text-grove-canvas-dk dark:hover:bg-primary-300"
            >
              <Lock className="h-4 w-4" />
              Sign in
              <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
            </Link>
          </div>

          <p className="v2-micro mt-10 text-center text-grove-ink/40 dark:text-grove-ink-dk/40">
            Newton · Access Intelligence · Enterprise-grade
          </p>
        </Reveal>
      </div>
    </div>
  )
}
