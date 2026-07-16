'use client'

/**
 * Privacy Policy Page
 * GDPR-compliant privacy policy for Newton
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
          Last updated: {new Date().toLocaleDateString()}
        </p>
        <p className="mt-2 text-grove-ink/70 dark:text-grove-ink/50">
          Newton is committed to protecting your privacy and complying with GDPR,
          CCPA, and other data protection regulations.
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
                  Permissions-first
                </p>
                <p className="text-sm text-grove-ink/70 dark:text-grove-ink/50">
                  We read permission metadata and aggregate record counts. We do not read record field values — see &quot;What we read&quot; below.
                </p>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <Lock className="h-5 w-5 text-primary-700 mt-0.5" />
              <div>
                <p className="font-medium text-grove-ink dark:text-grove-ink-dk">
                  Encrypted Storage
                </p>
                <p className="text-sm text-grove-ink/70 dark:text-grove-ink/50">
                  All sensitive data is encrypted with AES-256 encryption
                </p>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <Eye className="h-5 w-5 text-primary-700 mt-0.5" />
              <div>
                <p className="font-medium text-grove-ink dark:text-grove-ink-dk">
                  Full Transparency
                </p>
                <p className="text-sm text-grove-ink/70 dark:text-grove-ink/50">
                  Complete data inventory available in your privacy dashboard
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
                  Delete all your data anytime with one click (GDPR Article 17)
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
                1.1 Salesforce Metadata
              </h3>
              <p>
                When you connect your Salesforce organization, we collect permission and access
                metadata including:
              </p>
              <ul className="list-disc pl-6 mt-2 space-y-1">
                <li>User profiles, roles, permission sets, and permission-set groups</li>
                <li>Object and field-level permissions</li>
                <li>Sharing rules and organization-wide defaults</li>
                <li>Public groups, team memberships, and account/opportunity share records (structural)</li>
                <li>Login history — user, timestamp, application name, IP address</li>
                <li>Inventories (name + owner + timestamps only) of Flows, Apex Triggers, Connected Apps, Named Credentials, Reports, and Dashboards</li>
              </ul>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-grove-ink dark:text-grove-ink-dk mb-2">
                1.2 Aggregate signals we compute (no record content read)
              </h3>
              <p>
                Some analytics features need to know <em>how many</em> records exist or how populated a field is — but they never need the field <em>values</em>. In every case below we use Salesforce&apos;s SOQL aggregate functions (COUNT, GROUP BY) and only the numeric answer comes back to Newton.
              </p>
              <ul className="list-disc pl-6 mt-2 space-y-2">
                <li>
                  <strong>Data Quality scoring:</strong> for each business object we run three metadata-only queries: (a) per-field <code>COUNT(field)</code> to compute completeness, (b) <code>GROUP BY natural-key HAVING COUNT(Id) &gt; 1</code> to find duplicate clusters (Salesforce returns only the key value and its count — no record IDs, no other field content), and (c) <code>COUNT() WHERE LastModifiedDate &lt; threshold</code> to count stale rows. We also read Salesforce&apos;s native <code>DuplicateRule</code> configuration and <code>DuplicateRecordSet</code> cluster counts. No record data leaves Salesforce.
                </li>
                <li>
                  <strong>License Fit right-sizing:</strong> per-user owner counts for Account / Opportunity / Case / Lead / Contact via aggregate SOQL. No field values are stored.
                </li>
                <li>
                  <strong>Change Risk Radar:</strong> reads Salesforce&apos;s SetupAuditTrail — a metadata log of admin changes, not record content.
                </li>
              </ul>
              <p className="mt-3 text-sm text-grove-ink/80 dark:text-grove-ink-dk/80">
                A future opt-in &quot;Deep Scan&quot; mode may read record content via Bulk API for organisations that specifically request full-scan accuracy on multi-million-row objects. That mode is off by default and requires explicit per-org admin activation with a consent modal — see our Data Processing Addendum for the safeguards.
              </p>
              <p className="mt-3 text-sm text-grove-ink/80 dark:text-grove-ink-dk/80">
                All queries run under the OAuth session of the Salesforce user who authorised Newton — we can only read what that user can see. If your Salesforce user cannot access a custom field (for example, PHI or PCI columns), Newton cannot either.
              </p>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-grove-ink dark:text-grove-ink-dk mb-2">
                1.2 Account Information
              </h3>
              <p>We collect basic account information when you sign up:</p>
              <ul className="list-disc pl-6 mt-2 space-y-1">
                <li>Email address (for authentication)</li>
                <li>Organization name and Salesforce Org ID</li>
                <li>User names and emails from your Salesforce org</li>
              </ul>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-grove-ink dark:text-grove-ink-dk mb-2">
                1.3 Usage Data
              </h3>
              <p>We automatically collect usage information to improve our service:</p>
              <ul className="list-disc pl-6 mt-2 space-y-1">
                <li>IP addresses and user agents</li>
                <li>API access logs</li>
                <li>Feature usage analytics</li>
              </ul>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-grove-ink dark:text-grove-ink-dk mb-4">
            2. How We Use Your Information
          </h2>
          <div className="text-grove-ink/85 dark:text-grove-ink-dk/85 space-y-4">
            <p>We use your data exclusively for the following purposes:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong>Access Analysis:</strong> Analyze permission structures to identify
                security risks and anomalies
              </li>
              <li>
                <strong>Recommendations:</strong> Generate AI-powered security recommendations
              </li>
              <li>
                <strong>Visualization:</strong> Create access graphs and reports
              </li>
              <li>
                <strong>Service Delivery:</strong> Maintain and improve the Newton
                platform
              </li>
              <li>
                <strong>Compliance:</strong> Maintain audit logs for security and compliance
              </li>
            </ul>
            <p className="mt-4 font-medium text-grove-ink dark:text-grove-ink-dk">
              We never sell or share your data with third parties for marketing purposes.
            </p>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-grove-ink dark:text-grove-ink-dk mb-4">
            3. Data Security
          </h2>
          <div className="text-grove-ink/85 dark:text-grove-ink-dk/85 space-y-4">
            <p>
              We implement industry-standard security measures to protect your data:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong>Encryption:</strong> AES-256 encryption for OAuth tokens and sensitive
                fields
              </li>
              <li>
                <strong>Transport Security:</strong> TLS 1.3 for all data in transit
              </li>
              <li>
                <strong>Access Controls:</strong> Role-based access control (RBAC) for
                dashboard users
              </li>
              <li>
                <strong>Audit Logging:</strong> Comprehensive logging of all data access and
                modifications
              </li>
              <li>
                <strong>Security Headers:</strong> HSTS, CSP, and other security headers on all
                responses
              </li>
              <li>
                <strong>Regular Audits:</strong> Periodic security assessments and penetration
                testing
              </li>
            </ul>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-grove-ink dark:text-grove-ink-dk mb-4">
            4. Data Retention
          </h2>
          <div className="text-grove-ink/85 dark:text-grove-ink-dk/85 space-y-4">
            <p>We automatically delete old data according to these retention policies:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong>Permission Snapshots:</strong> 90 days
              </li>
              <li>
                <strong>Audit Logs:</strong> 365 days (required for compliance)
              </li>
              <li>
                <strong>Sync Jobs:</strong> 30 days
              </li>
              <li>
                <strong>Analysis Data:</strong> 180 days (anomalies and recommendations)
              </li>
            </ul>
            <p className="mt-4">
              You can manually delete old data or adjust retention periods in your{' '}
              <a href="/privacy" className="text-primary-700 dark:text-primary-400 hover:underline">
                Privacy Dashboard
              </a>
              .
            </p>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-grove-ink dark:text-grove-ink-dk mb-4">
            5. Your Rights (GDPR)
          </h2>
          <div className="text-grove-ink/85 dark:text-grove-ink-dk/85 space-y-4">
            <p>
              Under GDPR and similar regulations, you have the following rights:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong>Right to Access:</strong> View all data we store about your organization
                in the Privacy Dashboard
              </li>
              <li>
                <strong>Right to Rectification:</strong> Update incorrect information by
                re-syncing with Salesforce
              </li>
              <li>
                <strong>Right to Erasure:</strong> Delete all data with one click (GDPR Article
                17)
              </li>
              <li>
                <strong>Right to Data Portability:</strong> Export your data in JSON format
              </li>
              <li>
                <strong>Right to Object:</strong> Stop processing by disconnecting your Salesforce
                org
              </li>
              <li>
                <strong>Right to Restrict Processing:</strong> Pause sync operations while
                maintaining data
              </li>
            </ul>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-grove-ink dark:text-grove-ink-dk mb-4">
            6. Cookies and Tracking
          </h2>
          <div className="text-grove-ink/85 dark:text-grove-ink-dk/85 space-y-4">
            <p>We use minimal cookies for:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Authentication (session tokens)</li>
              <li>User preferences (theme, language)</li>
            </ul>
            <p className="mt-2">
              We do not use third-party tracking cookies or advertising pixels.
            </p>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-grove-ink dark:text-grove-ink-dk mb-4">
            7. Third-Party Services
          </h2>
          <div className="text-grove-ink/85 dark:text-grove-ink-dk/85 space-y-4">
            <p>Newton relies on the following third-party subprocessors:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong>Salesforce (OAuth + data source):</strong> Newton connects to your Salesforce org over OAuth 2.0. Salesforce is both the source of the data we analyse and a subprocessor for the OAuth token exchange.
              </li>
              <li>
                <strong>Railway (backend hosting + database):</strong> Runs the Newton backend and hosts the managed PostgreSQL database. Data centre region: US. Railway&apos;s security posture: <a href="https://railway.app/legal/security" className="underline">railway.app/legal/security</a>.
              </li>
              <li>
                <strong>Vercel (frontend hosting):</strong> Serves the Newton web application at app.accessgraphai.com. Vercel&apos;s security posture: <a href="https://vercel.com/legal/privacy-policy" className="underline">vercel.com/legal/privacy-policy</a>.
              </li>
              <li>
                <strong>Resend (transactional email):</strong> Sends account activation and password-reset emails on our behalf. Recipient email addresses + user names + one-time activation URLs are transmitted to Resend&apos;s US API. Resend&apos;s privacy notice: <a href="https://resend.com/legal/privacy-policy" className="underline">resend.com/legal/privacy-policy</a>.
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
              Your data may be processed in data centers located in the United States and
              Europe. We ensure adequate protection through:
            </p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Standard Contractual Clauses (SCCs)</li>
              <li>GDPR-compliant hosting providers</li>
              <li>Encryption of all data in transit and at rest</li>
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
              <li>Sending an email notification to your registered address</li>
              <li>Displaying a notice in the dashboard</li>
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
