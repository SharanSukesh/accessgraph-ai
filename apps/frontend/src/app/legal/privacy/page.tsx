'use client'

/**
 * Privacy Policy Page
 * Privacy policy for Newton
 */

import { Shield, Database, Lock, Eye, Trash2, FileText } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/shared/Card'

export default function PrivacyPolicyPage() {
  return (
    <div className="max-w-4xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-grove-ink dark:text-grove-ink-dk">
          Privacy Policy
        </h1>
        <p className="mt-4 text-lg text-grove-ink/70 dark:text-grove-ink/50">
          Last updated: October 8, 2026
        </p>
        <p className="mt-2 text-grove-ink/70 dark:text-grove-ink/50">
          This policy describes what Newton reads from a connected Salesforce org, what it
          stores, how long it keeps it, and how it can be deleted. Newton is operated by a
          Salesforce consultancy in client engagements: the client is the data controller for
          its Salesforce data, and the consultancy operating Newton is the data processor.
        </p>
      </div>

      {/* Quick Summary */}
      <Card variant="bordered" className="mb-8 bg-primary-50 dark:bg-primary-900/10 border-primary-200 dark:border-primary-800">
        <CardHeader>
          <CardTitle>Privacy at a Glance</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-start space-x-3">
              <Database className="h-5 w-5 text-primary-700 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium text-grove-ink dark:text-grove-ink-dk">
                  Configuration, not record contents
                </p>
                <p className="text-sm text-grove-ink/70 dark:text-grove-ink/50">
                  We read configuration metadata, data about the org&apos;s Salesforce users
                  (including login history), and aggregate counts. We do not read or store the
                  contents of business records — see &quot;Information We Collect&quot; below.
                </p>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <Lock className="h-5 w-5 text-primary-700 mt-0.5" />
              <div>
                <p className="font-medium text-grove-ink dark:text-grove-ink-dk">
                  Encrypted Salesforce credentials
                </p>
                <p className="text-sm text-grove-ink/70 dark:text-grove-ink/50">
                  Salesforce OAuth tokens are encrypted at rest with AES-256. Data is
                  transmitted over TLS (HTTPS).
                </p>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <Eye className="h-5 w-5 text-primary-700 mt-0.5" />
              <div>
                <p className="font-medium text-grove-ink dark:text-grove-ink-dk">
                  Data inventory
                </p>
                <p className="text-sm text-grove-ink/70 dark:text-grove-ink/50">
                  The Privacy page for each client org in the app shows per-category counts of
                  the records Newton holds
                </p>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <Trash2 className="h-5 w-5 text-primary-700 mt-0.5" />
              <div>
                <p className="font-medium text-grove-ink dark:text-grove-ink-dk">
                  Right to Erasure
                </p>
                <p className="text-sm text-grove-ink/70 dark:text-grove-ink/50">
                  A Newton administrator can delete a client org, which revokes Newton&apos;s
                  Salesforce access and permanently deletes everything stored for it (GDPR
                  Article 17)
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Content */}
      <div className="prose prose-gray dark:prose-invert max-w-none space-y-8">
        <section>
          <h2 className="text-2xl font-bold text-grove-ink dark:text-grove-ink-dk mb-4">
            1. Information We Collect
          </h2>
          <div className="text-grove-ink/85 dark:text-grove-ink-dk/85 space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-grove-ink dark:text-grove-ink-dk mb-2">
                1.1 Salesforce Configuration Metadata
              </h3>
              <p>
                When a client&apos;s Salesforce org is connected, Newton reads and stores its
                configuration metadata:
              </p>
              <ul className="list-disc pl-6 mt-2 space-y-1">
                <li>Profiles, permission sets, permission set groups, and their assignments</li>
                <li>Object permissions and field-level security (FLS)</li>
                <li>Roles, public groups, and group membership</li>
                <li>Sharing rules and organization-wide defaults</li>
                <li>Installed packages</li>
                <li>Flows, Apex class and trigger names, and Apex test coverage</li>
                <li>Validation rules and workflow rules</li>
                <li>Reports and dashboards (name, description, owner, last run date)</li>
                <li>Connected apps, named credentials, and remote site settings (including endpoint URLs)</li>
                <li>Org limits and license counts</li>
              </ul>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-grove-ink dark:text-grove-ink-dk mb-2">
                1.2 Personal Data About Salesforce Users
              </h3>
              <p>
                Newton reads and stores the following about the client&apos;s Salesforce
                <em> users</em> (the people who log in to the org, not the client&apos;s
                customers):
              </p>
              <ul className="list-disc pl-6 mt-2 space-y-1">
                <li>Name, username, email, title, and department</li>
                <li>Manager and delegated approver</li>
                <li>Active status, created date, and last login time</li>
                <li>Profile and role</li>
              </ul>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-grove-ink dark:text-grove-ink-dk mb-2">
                1.3 Login History (last 90 days)
              </h3>
              <p>
                To detect login anomalies such as impossible travel or brute-force attempts,
                Newton reads the last 90 days of Salesforce login history: login time, status,
                application, login type, source IP address, browser, platform, and geolocation
                (city, country, and coordinates).
              </p>
              <p className="mt-2">
                Source IP addresses and coordinates are used only in memory during analysis and
                are not stored. City, country, browser, and platform can appear in the stored
                explanation of a detected anomaly.
              </p>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-grove-ink dark:text-grove-ink-dk mb-2">
                1.4 Setup Audit Trail (last 30 days)
              </h3>
              <p>
                Newton reads the last 30 days of Salesforce&apos;s Setup Audit Trail: who made
                each configuration change, when, the Setup section, and Salesforce&apos;s
                description text of the change. The description text is written by Salesforce
                and can name users or other items affected by the change.
              </p>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-grove-ink dark:text-grove-ink-dk mb-2">
                1.5 Record-Level Access Structure
              </h3>
              <p>
                Newton reads account and opportunity share rows and account and opportunity
                team membership, to analyse who can access which records. Business record IDs
                from these rows are not stored in raw form: each is replaced with a keyed
                one-way hash before storage. The hash is enough to count and compare records,
                but not to identify the record in Salesforce.
              </p>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-grove-ink dark:text-grove-ink-dk mb-2">
                1.6 Aggregate Counts Over Business Records
              </h3>
              <p>
                Some analyses need to know <em>how many</em> records exist or how populated a
                field is. For these, Newton uses Salesforce aggregate queries and receives
                counts, never record contents:
              </p>
              <ul className="list-disc pl-6 mt-2 space-y-2">
                <li>Number of records per object</li>
                <li>
                  Per-field fill counts (<code>COUNT</code> of populated values), used for data
                  completeness scoring
                </li>
                <li>
                  Number and sizes of duplicate clusters. Records are grouped inside
                  Salesforce; the duplicated values themselves are never returned to Newton.
                </li>
                <li>Counts of stale records (not modified within a threshold)</li>
                <li>Number of records owned by each user (used for license right-sizing)</li>
                <li>Number of open opportunities not modified in 60 days</li>
              </ul>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-grove-ink dark:text-grove-ink-dk mb-2">
                1.7 What We Do Not Read
              </h3>
              <p>
                Newton does not read or store the contents of business records — for example
                account names, contact details, opportunity amounts, or case text. Newton has
                no feature that reads record contents; if one is ever added, this policy will
                be updated before it is enabled.
              </p>
              <p className="mt-3 text-sm text-grove-ink/80 dark:text-grove-ink-dk/80">
                All Salesforce queries run under the OAuth session of the Salesforce user who
                authorised Newton, so Newton can only read what that user can see.
              </p>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-grove-ink dark:text-grove-ink-dk mb-2">
                1.8 Newton Account Information
              </h3>
              <p>For people who sign in to Newton itself, we store:</p>
              <ul className="list-disc pl-6 mt-2 space-y-1">
                <li>Name, email address, role, and the client orgs they have been granted</li>
                <li>A bcrypt hash of their password (never the password itself)</li>
                <li>
                  Audit log entries for their sign-ins and sensitive actions, including IP
                  address and browser user agent (see section 3)
                </li>
              </ul>
              <p className="mt-2">
                Newton does not use third-party analytics or advertising tools.
              </p>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-grove-ink dark:text-grove-ink-dk mb-4">
            2. How We Use Your Information
          </h2>
          <div className="text-grove-ink/85 dark:text-grove-ink-dk/85 space-y-4">
            <p>We use this data only for the following purposes:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong>Access Analysis:</strong> Analyse permission and sharing structures to
                identify security risks
              </li>
              <li>
                <strong>Anomaly Detection:</strong> Detect login anomalies (for example
                impossible travel or brute force) and risky configuration changes
              </li>
              <li>
                <strong>Recommendations:</strong> Generate rule-based findings and
                recommendations for the engagement
              </li>
              <li>
                <strong>Visualization and Reporting:</strong> Produce access graphs, org
                charts, and reports
              </li>
              <li>
                <strong>Audit:</strong> Maintain an audit log of actions taken in Newton
              </li>
            </ul>
            <p className="mt-4 font-medium text-grove-ink dark:text-grove-ink-dk">
              We never sell or share your data with third parties for marketing purposes.
            </p>

            <div>
              <h3 className="text-lg font-semibold text-grove-ink dark:text-grove-ink-dk mb-2">
                2.1 Changes Newton Makes in Salesforce
              </h3>
              <p>
                Newton writes to Salesforce in exactly three ways. Each is optional, is
                performed only when a Newton administrator explicitly takes the action, and is
                recorded in the audit log:
              </p>
              <ul className="list-disc pl-6 mt-2 space-y-1">
                <li>Setting a user&apos;s Manager (Org Chart editor)</li>
                <li>Setting a user&apos;s Delegated Approver (Org Chart editor)</li>
                <li>
                  Deactivating users flagged as inactive or never-logged-in license holders
                  (Health Report &quot;apply fix&quot;)
                </li>
              </ul>
              <p className="mt-2">
                Restructure Studio plans are exported for an administrator to apply manually;
                Newton does not apply them. Newton writes nothing else to Salesforce.
              </p>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-grove-ink dark:text-grove-ink-dk mb-4">
            3. Data Security
          </h2>
          <div className="text-grove-ink/85 dark:text-grove-ink-dk/85 space-y-4">
            <p>
              Newton applies the following measures. See{' '}
              <a href="/legal/security" className="text-primary-700 dark:text-primary-400 hover:underline">
                Security Practices
              </a>{' '}
              for detail.
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong>Encryption:</strong> Salesforce OAuth access and refresh tokens are
                encrypted at rest with AES-256 (application-level field encryption). Other
                stored data is not encrypted by Newton at the application level and relies on
                the hosting provider&apos;s infrastructure.
              </li>
              <li>
                <strong>Transport Security:</strong> Data is transmitted over TLS (HTTPS)
              </li>
              <li>
                <strong>Access Controls:</strong> Individual, administrator-invited Newton
                accounts with roles; non-administrators can see only the client orgs they have
                been granted. Account status and org access are re-checked server-side on every
                request.
              </li>
              <li>
                <strong>Audit Logging:</strong> Sign-ins, access to sensitive data, syncs,
                Salesforce connections, write-backs to Salesforce, and deletions are recorded
              </li>
              <li>
                <strong>Security Headers:</strong> HSTS (when HTTPS is enforced), CSP, and
                other security headers on API responses
              </li>
              <li>
                <strong>Independent Testing:</strong> No independent security assessment or
                penetration test has been performed to date
              </li>
            </ul>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-grove-ink dark:text-grove-ink-dk mb-4">
            4. Data Retention
          </h2>
          <div className="text-grove-ink/85 dark:text-grove-ink-dk/85 space-y-4">
            <p>
              A daily job deletes data according to these retention periods. A Newton
              administrator can also run it on demand.
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong>Salesforce metadata and user data:</strong> deleted when not refreshed
                by a sync for 90 days, so data from a finished engagement ages out
                automatically
              </li>
              <li>
                <strong>Analysis results:</strong> 180 days (anomalies, risk scores, findings,
                and sprawl, compliance, and data-quality results)
              </li>
              <li>
                <strong>Audit Logs:</strong> 365 days
              </li>
              <li>
                <strong>Sync History:</strong> 30 days (the most recent sync record is kept)
              </li>
              <li>
                <strong>Consultant-authored configuration and the Salesforce connection:</strong>{' '}
                kept until the client org is deleted (price book, report branding, saved
                restructure plans, and VIP designations)
              </li>
            </ul>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-grove-ink dark:text-grove-ink-dk mb-4">
            5. Your Rights (GDPR)
          </h2>
          <div className="text-grove-ink/85 dark:text-grove-ink-dk/85 space-y-4">
            <p>
              The client, as data controller, can exercise the following through the
              consultancy operating Newton. Requests from individual Salesforce users should be
              made to the client, which can forward them.
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong>Right to Access:</strong> The Privacy page in the app shows per-category
                counts of what Newton holds for the org; on request, the consultancy can export
                this inventory
              </li>
              <li>
                <strong>Right to Rectification:</strong> Newton&apos;s copy is read from
                Salesforce; corrections made in Salesforce replace the stored data on the next
                sync
              </li>
              <li>
                <strong>Right to Erasure:</strong> A Newton administrator can delete the client
                org. This revokes Newton&apos;s OAuth grant in Salesforce and permanently
                deletes every stored record for that org — metadata, user data, analyses,
                reports, audit logs, and settings. It cannot be undone. (GDPR Article 17)
              </li>
              <li>
                <strong>Right to Object / Restrict Processing:</strong> Revoking Newton&apos;s
                connected-app access in Salesforce stops all further reads; data already held
                then ages out under section 4, or can be deleted immediately as above
              </li>
            </ul>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-grove-ink dark:text-grove-ink-dk mb-4">
            6. Cookies and Tracking
          </h2>
          <div className="text-grove-ink/85 dark:text-grove-ink-dk/85 space-y-4">
            <p>We use only the cookies needed to operate the service:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>A signed, HTTP-only, Secure session cookie with a 7-day expiry</li>
              <li>A short-lived cookie used during the Salesforce connection (OAuth) flow</li>
            </ul>
            <p className="mt-2">
              Display preferences are kept in your browser&apos;s local storage, not in
              cookies. We do not use third-party tracking cookies or advertising pixels.
            </p>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-grove-ink dark:text-grove-ink-dk mb-4">
            7. Third-Party Services
          </h2>
          <div className="text-grove-ink/85 dark:text-grove-ink-dk/85 space-y-4">
            <p>Newton relies on the following third parties:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong>Salesforce (data source):</strong> Newton connects to the client&apos;s
                Salesforce org over OAuth 2.0. Salesforce is the source of the data Newton
                analyses.
              </li>
              <li>
                <strong>Railway (application hosting + database):</strong> Runs the Newton
                backend API and hosts the PostgreSQL database. Data centre region: US.
                Railway&apos;s security posture: <a href="https://railway.app/legal/security" className="underline">railway.app/legal/security</a>.
              </li>
              <li>
                <strong>Web front end:</strong> The Newton web application is served by our
                hosting provider.
              </li>
              <li>
                <strong>Resend (transactional email):</strong> Sends account invitation emails
                only. The recipient&apos;s email address, name, and one-time activation link
                are transmitted to Resend. Resend&apos;s privacy notice: <a href="https://resend.com/legal/privacy-policy" className="underline">resend.com/legal/privacy-policy</a>.
              </li>
            </ul>
            <p className="mt-2 text-sm">
              We will update this list before adding any new subprocessor that materially handles customer data.
            </p>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-grove-ink dark:text-grove-ink-dk mb-4">
            8. International Data Transfers
          </h2>
          <div className="text-grove-ink/85 dark:text-grove-ink-dk/85 space-y-4">
            <p>
              Newton&apos;s database is hosted in the United States. Where personal data from
              the EEA or UK is transferred, protection relies on:
            </p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Standard Contractual Clauses (SCCs), as set out in the Data Processing Agreement</li>
              <li>TLS (HTTPS) for data in transit</li>
              <li>
                AES-256 encryption of Salesforce OAuth tokens at rest; other stored data relies
                on the hosting provider&apos;s infrastructure
              </li>
              <li>
                Data minimisation: no business record contents, hashed record IDs, and login IP
                addresses and coordinates not stored
              </li>
            </ul>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-grove-ink dark:text-grove-ink-dk mb-4">
            9. Changes to This Policy
          </h2>
          <div className="text-grove-ink/85 dark:text-grove-ink-dk/85 space-y-4">
            <p>
              We may update this privacy policy from time to time. We will notify you of
              material changes by:
            </p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Updating the "Last updated" date at the top</li>
              <li>Notifying client contacts for active engagements by email</li>
            </ul>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-grove-ink dark:text-grove-ink-dk mb-4">
            10. Contact Us
          </h2>
          <div className="text-grove-ink/85 dark:text-grove-ink-dk/85 space-y-4">
            <p>For privacy-related questions or to exercise your rights:</p>
            <div className="mt-4 p-4 bg-primary-50 dark:bg-grove-surface-dk rounded-lg">
              <p>
                <strong>Email:</strong>{' '}
                <a
                  href="mailto:privacy@accessgraph.ai"
                  className="text-primary-700 dark:text-primary-400 hover:underline"
                >
                  privacy@accessgraph.ai
                </a>
              </p>
              <p className="mt-2">
                <strong>Data Protection Officer:</strong> dpo@accessgraph.ai
              </p>
              <p className="mt-2">
                <strong>Response Time:</strong> We respond to all requests within 30 days as
                required by GDPR
              </p>
            </div>
          </div>
        </section>
      </div>

      {/* Footer Navigation */}
      <div className="mt-12 pt-6 border-t border-grove-border dark:border-grove-border-dk">
        <div className="flex items-center justify-center space-x-6 text-sm">
          <a
            href="/legal/terms"
            className="text-primary-600 dark:text-primary-400 hover:underline"
          >
            Terms of Service
          </a>
          <span className="text-grove-border dark:text-grove-ink/70">•</span>
          <a
            href="/legal/security"
            className="text-primary-600 dark:text-primary-400 hover:underline"
          >
            Security Practices
          </a>
          <span className="text-grove-border dark:text-grove-ink/70">•</span>
          <a
            href="/legal/dpa"
            className="text-primary-600 dark:text-primary-400 hover:underline"
          >
            Data Processing Agreement
          </a>
        </div>
      </div>
    </div>
  )
}
