'use client'

/**
 * How anomalies are detected: a plain-language methodology a client can
 * read, linked from the Anomalies page and each user's Anomalies tab.
 */

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ArrowLeft, BookOpen } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/shared/Card'
import { PageHeader } from '@/components/shared/PageHeader'
import { Reveal } from '@/components/v2/motion'
import { BASE_RISK_TOOLTIP } from '@/components/shared/Badge'
import {
  ACCESS_SIGNALS,
  ANOMALY_TYPES,
  BENCHMARK,
  FLAGGED_SHARE,
  LIMITS,
  SESSION_RULES,
  flaggedCount,
  pct,
} from '@/lib/anomalyMethodology'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card variant="bordered">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm leading-relaxed text-grove-ink/85 dark:text-grove-ink-dk/85">
        {children}
      </CardContent>
    </Card>
  )
}

export default function AnomalyMethodologyPage() {
  const { orgId } = useParams() as { orgId: string }
  const flaggedPct = Math.round(FLAGGED_SHARE * 100)

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Reveal>
        <Link
          href={`/orgs/${orgId}/anomalies`}
          className="mb-3 inline-flex items-center gap-1 text-sm text-grove-ink/65 hover:text-grove-ink dark:text-grove-ink-dk/65 dark:hover:text-grove-ink-dk"
        >
          <ArrowLeft className="h-4 w-4" /> Anomalies
        </Link>
        <PageHeader
          icon={BookOpen}
          eyebrow="Attention · methodology"
          title="How anomalies are detected"
          subtitle="What Newton measures, who it flags and why, and what the results can and can't tell you."
        />
      </Reveal>

      <Section title="What an access anomaly is">
        <p>
          An access anomaly is a user whose combination of access differs most from everyone else in this org.
          It is a prompt to review that user&apos;s access, not a finding that something is wrong.
        </p>
      </Section>

      <Section title="What Newton measures">
        <p>For every active user, Newton reads their access from the last sync and measures 13 signals:</p>
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          {ACCESS_SIGNALS.map((s) => (
            <div key={s.name}>
              <dt className="font-semibold text-grove-ink dark:text-grove-ink-dk">{s.name}</dt>
              <dd className="text-grove-ink/70 dark:text-grove-ink-dk/70">{s.detail}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section title="How users are scored">
        <p>
          Two standard statistical models score every active user on those 13 signals together, using only this
          org&apos;s data at each analysis:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Distance from the typical user</strong> (Mahalanobis distance): how far the user&apos;s combination of
            signals sits from the org&apos;s average, allowing for signals that normally rise together.
          </li>
          <li>
            <strong>Fit to the org&apos;s usual groups</strong> (a Gaussian mixture model): how poorly the user fits any of
            the few typical access patterns the org has.
          </li>
        </ul>
        <p>
          Each model ranks every user; the two ranks are averaged into the anomaly score. Averaging ranks keeps one
          model from drowning out the other.
        </p>
      </Section>

      <Section title="Who is flagged, and what the rank means">
        <p>
          The top {flaggedPct}% of active users by anomaly score are flagged, and at least one user. In an org of 400 active
          users that is {flaggedCount(400)}. Rank #1 is the most unusual user; &ldquo;#3 of 400&rdquo; means third
          most unusual of the 400 users scored. Users with the same score are ordered by Salesforce user ID.
        </p>
      </Section>

      <Section title="Why a user was flagged: the strongest reason">
        <p>
          Each flagged user gets plain-language reasons that compare them with their peers: users with the same role;
          if nobody shares the role, the same profile; if nobody shares either, the rest of the org. Reasons are
          ordered by how far the signal behind them sits above the rest of the org, and the first one names the
          anomaly:
        </p>
        <dl className="space-y-2">
          {ANOMALY_TYPES.map((t) => (
            <div key={t.name}>
              <dt className="font-semibold text-grove-ink dark:text-grove-ink-dk">{t.name}</dt>
              <dd className="text-grove-ink/70 dark:text-grove-ink-dk/70">{t.meaning}</dd>
            </div>
          ))}
        </dl>
        <p>Peers explain the result; they don&apos;t decide it. Who is flagged depends only on the org-wide score.</p>
      </Section>

      <Section title="Base risk: how much damage the access could do">
        <p>
          Next to each rank, Newton shows the user&apos;s <strong>base risk</strong>: {BASE_RISK_TOOLTIP.toLowerCase()}{' '}
          The risk score looks at privileged permissions, sensitive data, how many objects the user can change,
          dormancy and sole access. Being flagged as an anomaly also adds to the overall risk score, so base risk leaves
          that out: otherwise the risk next to a rank would partly repeat the rank. Levels are Low (under 25), Medium
          (25 to 49), High (50 to 74) and Critical (75 and above).
        </p>
        <p>Rank says how unusual the access is; base risk says how much harm it could do. Review high base risk first.</p>
      </Section>

      <Section title="Session anomalies">
        <p>
          Session anomalies come from rules over Salesforce login history for the last 90 days, not from the model
          above. Each rule has a fixed severity:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          {SESSION_RULES.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      </Section>

      <Section title="How well it works">
        <p>
          The method was tested on {BENCHMARK.synthetic_orgs} synthetic Salesforce orgs with planted problem users.
          This table shows the share of each planted pattern the detector flagged (its recall):
        </p>
        <div className="overflow-x-auto">
          <table className="w-full max-w-md text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-grove-ink/55 dark:text-grove-ink-dk/55">
                <th className="py-1 pr-4 font-medium">Planted pattern</th>
                <th className="py-1 text-right font-medium">Found</th>
              </tr>
            </thead>
            <tbody>
              {BENCHMARK.per_pattern_recall.map((p) => (
                <tr key={p.paper_column} className="border-t border-grove-border dark:border-grove-border-dk">
                  <td className="py-1 pr-4">{p.pattern}</td>
                  <td className="v2-num py-1 text-right">{pct(p.recall)}%</td>
                </tr>
              ))}
              <tr className="border-t border-grove-border font-semibold dark:border-grove-border-dk">
                <td className="py-1 pr-4">Average across the five</td>
                <td className="v2-num py-1 text-right">{pct(BENCHMARK.mean_recall)}%</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          So on its own the detector misses most planted problems, and some patterns more than others. It is
          still useful because it narrows a review of hundreds of users to a short ranked list, and it is not the
          only check: the risk score separately catches much of what it misses, such as dormant privileged
          accounts and over-privileged users, from privileged permissions, sensitive data and inactivity.
        </p>
        <p>
          These are results on synthetic data. How often a flag proves useful in real client orgs (precision) will
          be measured in a pilot, with reviewers marking each flag useful or not.
        </p>
        <p className="text-xs text-grove-ink/60 dark:text-grove-ink-dk/60">
          Source: Newton&apos;s anomaly-detection paper, accepted at {BENCHMARK.venue} (per-pattern recall of the
          production detector).
        </p>
      </Section>

      <Section title="Limits">
        <ul className="list-disc space-y-2 pl-5">
          {LIMITS.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      </Section>
    </div>
  )
}
