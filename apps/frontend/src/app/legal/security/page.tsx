'use client'

/**
 * Security Practices Page
 * Security architecture and compliance information
 */

import {
  Shield,
  Lock,
  Eye,
  Server,
  FileText,
  CheckCircle,
  AlertTriangle,
  Database,
  Clock,
} from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/shared/Card'
import { Badge } from '@/components/shared/Badge'

export default function SecurityPracticesPage() {
  return (
    <div className="max-w-4xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-grove-ink dark:text-grove-ink-dk">
          Security Practices
        </h1>
        <p className="mt-4 text-lg text-grove-ink/70 dark:text-grove-ink/50">
          Last updated: October 8, 2026
        </p>
        <p className="mt-2 text-grove-ink/70 dark:text-grove-ink/50">
          How Newton protects the data it holds: the controls in place today, and what is not
          yet in place.
        </p>
      </div>

      {/* Security Certifications */}
      <Card variant="bordered" className="mb-8 bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800">
        <CardHeader>
          <CardTitle>Security Controls & Compliance Posture</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Two-column split — Implemented on the left is what's
              actually in the code today; Roadmap on the right is
              honest about what we're working toward. Enterprise
              reviewers trust this framing more than a wall of green
              ticks. */}
          <div>
            <p className="text-[10px] font-mono uppercase tracking-wider text-grove-ink/60 dark:text-grove-ink-dk/60 mb-3">
              Implemented today
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-start space-x-3">
                <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium text-grove-ink dark:text-grove-ink-dk">
                    Data inventory and erasure
                  </p>
                  <p className="text-sm text-grove-ink/70 dark:text-grove-ink/50">
                    Per-org inventory of stored records; an administrator can delete a client
                    org, which revokes Newton&apos;s Salesforce access and deletes all its data
                  </p>
                </div>
              </div>
              <div className="flex items-start space-x-3">
                <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium text-grove-ink dark:text-grove-ink-dk">
                    OAuth tokens encrypted at rest
                  </p>
                  <p className="text-sm text-grove-ink/70 dark:text-grove-ink/50">
                    Salesforce access and refresh tokens are AES-256 encrypted at the
                    application level (sqlalchemy-utils). Other stored data is not
                    field-encrypted by Newton.
                  </p>
                </div>
              </div>
              <div className="flex items-start space-x-3">
                <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium text-grove-ink dark:text-grove-ink-dk">
                    TLS (HTTPS) in transit
                  </p>
                  <p className="text-sm text-grove-ink/70 dark:text-grove-ink/50">
                    Provided by the hosting provider&apos;s ingress
                  </p>
                </div>
              </div>
              <div className="flex items-start space-x-3">
                <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium text-grove-ink dark:text-grove-ink-dk">
                    Role-based access (RBAC)
                  </p>
                  <p className="text-sm text-grove-ink/70 dark:text-grove-ink/50">
                    Administrator / analyst / viewer / auditor, with per-org access grants
                    re-checked server-side on every request
                  </p>
                </div>
              </div>
              <div className="flex items-start space-x-3">
                <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium text-grove-ink dark:text-grove-ink-dk">
                    Audit logging
                  </p>
                  <p className="text-sm text-grove-ink/70 dark:text-grove-ink/50">
                    Sign-ins, sensitive data access, syncs, Salesforce connections, write-backs
                    and deletions; retained 365 days
                  </p>
                </div>
              </div>
              <div className="flex items-start space-x-3">
                <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium text-grove-ink dark:text-grove-ink-dk">
                    Bcrypt password hashing
                  </p>
                  <p className="text-sm text-grove-ink/70 dark:text-grove-ink/50">
                    Cost factor 12 for the email+password login flow; sign-in attempts are
                    rate limited
                  </p>
                </div>
              </div>
              <div className="flex items-start space-x-3">
                <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium text-grove-ink dark:text-grove-ink-dk">
                    OAuth with PKCE
                  </p>
                  <p className="text-sm text-grove-ink/70 dark:text-grove-ink/50">
                    Salesforce authorization-code flow with PKCE and a signed, short-lived
                    state value (CSRF protection)
                  </p>
                </div>
              </div>
              <div className="flex items-start space-x-3">
                <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium text-grove-ink dark:text-grove-ink-dk">
                    Security headers
                  </p>
                  <p className="text-sm text-grove-ink/70 dark:text-grove-ink/50">
                    HSTS (when HTTPS enforced), X-Frame-Options, X-Content-Type-Options, CSP, Referrer-Policy
                  </p>
                </div>
              </div>
              <div className="flex items-start space-x-3">
                <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium text-grove-ink dark:text-grove-ink-dk">
                    Admin-invited account model
                  </p>
                  <p className="text-sm text-grove-ink/70 dark:text-grove-ink/50">
                    No self-signup — every account requires an administrator invitation and
                    activation
                  </p>
                </div>
              </div>
              <div className="flex items-start space-x-3">
                <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium text-grove-ink dark:text-grove-ink-dk">
                    Automatic retention
                  </p>
                  <p className="text-sm text-grove-ink/70 dark:text-grove-ink/50">
                    A daily job deletes data past its retention period (section 6)
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div>
            <p className="text-[10px] font-mono uppercase tracking-wider text-copper-600 dark:text-copper-400 mb-3">
              Roadmap — not yet implemented
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-start space-x-3">
                <Clock className="h-5 w-5 text-copper-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium text-grove-ink dark:text-grove-ink-dk">
                    SOC 2 Type II
                  </p>
                  <p className="text-sm text-grove-ink/70 dark:text-grove-ink/50">
                    Program has not started; we do not currently hold this attestation
                  </p>
                </div>
              </div>
              <div className="flex items-start space-x-3">
                <Clock className="h-5 w-5 text-copper-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium text-grove-ink dark:text-grove-ink-dk">
                    Salesforce Security Review
                  </p>
                  <p className="text-sm text-grove-ink/70 dark:text-grove-ink/50">
                    Not yet submitted; app is not on AppExchange
                  </p>
                </div>
              </div>
              <div className="flex items-start space-x-3">
                <Clock className="h-5 w-5 text-copper-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium text-grove-ink dark:text-grove-ink-dk">
                    Multi-factor authentication
                  </p>
                  <p className="text-sm text-grove-ink/70 dark:text-grove-ink/50">
                    App accounts today are password-only; MFA is a planned addition
                  </p>
                </div>
              </div>
              <div className="flex items-start space-x-3">
                <Clock className="h-5 w-5 text-copper-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium text-grove-ink dark:text-grove-ink-dk">
                    Independent penetration testing
                  </p>
                  <p className="text-sm text-grove-ink/70 dark:text-grove-ink/50">
                    Not performed to date; a third-party test is planned
                  </p>
                </div>
              </div>
            </div>
            <p className="text-xs text-grove-ink/60 dark:text-grove-ink-dk/60 mt-4 italic">
              CCPA requests are honored via a request to <a href="mailto:privacy@accessgraphai.com" className="underline">privacy@accessgraphai.com</a>; no California-specific automation is built into the product today.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Security Architecture */}
      <div className="prose prose-gray dark:prose-invert max-w-none space-y-8">
        <section>
          <h2 className="text-2xl font-bold text-grove-ink dark:text-grove-ink-dk mb-4">
            1. Data Encryption
          </h2>
          <div className="text-grove-ink/85 dark:text-grove-ink-dk/85 space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-grove-ink dark:text-grove-ink-dk mb-2 flex items-center">
                <Lock className="h-5 w-5 mr-2 text-primary-700" />
                Encryption at Rest
              </h3>
              <ul className="list-disc pl-6 space-y-2">
                <li>
                  <strong>AES-256 Field-Level Encryption:</strong> Salesforce OAuth access and
                  refresh tokens are encrypted with AES-256 at the application level before
                  they are written to the database
                </li>
                <li>
                  <strong>Other Stored Data:</strong> Not encrypted by Newton at the
                  application level. It is stored in Railway-managed PostgreSQL and relies on
                  the hosting provider&apos;s infrastructure controls.
                </li>
                <li>
                  <strong>Key Management:</strong> Encryption keys stored as Railway environment variables (secrets), never checked into code
                </li>
                <li>
                  <strong>Key Rotation:</strong> Manual and not automated. Rotating the key
                  requires re-encrypting the stored tokens or reconnecting each Salesforce org.
                </li>
              </ul>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-grove-ink dark:text-grove-ink-dk mb-2 flex items-center">
                <Shield className="h-5 w-5 mr-2 text-primary-700" />
                Encryption in Transit
              </h3>
              <ul className="list-disc pl-6 space-y-2">
                <li>
                  <strong>TLS:</strong> Traffic between the browser, Newton, and Salesforce
                  is transmitted over HTTPS (TLS), terminated by the hosting provider&apos;s ingress
                </li>
                <li>
                  <strong>HSTS:</strong> Strict-Transport-Security headers are sent when <code className="text-xs">ENFORCE_HTTPS</code> is set on the backend (recommended production configuration)
                </li>
                <li>
                  <strong>Salesforce OAuth:</strong> OAuth 2.0 authorization-code flow with
                  PKCE and a signed, short-lived state value (CSRF protection). Newton stores
                  the resulting access and refresh tokens, encrypted as described above.
                </li>
                <li>
                  <strong>Managed package:</strong> The optional Newton Salesforce package
                  authenticates to Newton with a per-org key issued by a Newton administrator
                </li>
              </ul>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-grove-ink dark:text-grove-ink-dk mb-4">
            2. Access Controls
          </h2>
          <div className="text-grove-ink/85 dark:text-grove-ink-dk/85 space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-grove-ink dark:text-grove-ink-dk mb-2">
                Role-Based Access Control (RBAC)
              </h3>
              <p>Each Newton account is assigned one of four roles:</p>
              <div className="mt-3 space-y-2">
                <div className="flex items-start space-x-3">
                  <Badge variant="danger" size="sm">
                    ADMINISTRATOR
                  </Badge>
                  <p className="text-sm">
                    Access to all client orgs. The only role that can delete data, write back
                    to Salesforce, or manage Newton users.
                  </p>
                </div>
                <div className="flex items-start space-x-3">
                  <Badge variant="warning" size="sm">
                    ANALYST
                  </Badge>
                  <p className="text-sm">
                    Access only to client orgs explicitly granted to them
                  </p>
                </div>
                <div className="flex items-start space-x-3">
                  <Badge variant="info" size="sm">
                    VIEWER
                  </Badge>
                  <p className="text-sm">Read-only access to client orgs granted to them</p>
                </div>
                <div className="flex items-start space-x-3">
                  <Badge variant="success" size="sm">
                    AUDITOR
                  </Badge>
                  <p className="text-sm">
                    Read-only access to client orgs granted to them
                  </p>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-grove-ink dark:text-grove-ink-dk mb-2">
                Accounts and Sessions
              </h3>
              <ul className="list-disc pl-6 mt-2 space-y-1">
                <li>
                  Access requires an individual Newton account (email and password). Accounts
                  are created only by administrator invitation followed by activation.
                </li>
                <li>Passwords are stored as bcrypt hashes</li>
                <li>Sign-in attempts are rate limited</li>
                <li>
                  Every request re-checks, server-side, that the account is active and has
                  access to the requested client org
                </li>
                <li>
                  Sessions use a signed, HTTP-only, Secure cookie with a 7-day expiry
                </li>
              </ul>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-grove-ink dark:text-grove-ink-dk mb-4">
            3. Audit Logging
          </h2>
          <div className="text-grove-ink/85 dark:text-grove-ink-dk/85 space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-grove-ink dark:text-grove-ink-dk mb-2 flex items-center">
                <FileText className="h-5 w-5 mr-2 text-primary-700" />
                Audit Trail
              </h3>
              <p>Each audit log entry records:</p>
              <ul className="list-disc pl-6 mt-2 space-y-1">
                <li>
                  <strong>Who:</strong> User email, user ID, IP address, user agent
                </li>
                <li>
                  <strong>What:</strong> Action performed
                </li>
                <li>
                  <strong>When:</strong> Timestamp (UTC)
                </li>
                <li>
                  <strong>Where:</strong> Request path, HTTP method, resource accessed
                </li>
                <li>
                  <strong>Result:</strong> Success/failure, error messages
                </li>
                <li>
                  <strong>Context:</strong> Additional metadata in JSON format
                </li>
              </ul>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-grove-ink dark:text-grove-ink-dk mb-2">
                Tracked Actions
              </h3>
              <div className="grid grid-cols-2 gap-2 mt-2">
                <ul className="text-sm space-y-1">
                  <li>• Sign-ins</li>
                  <li>• Access to sensitive data endpoints</li>
                  <li>• Sync operations</li>
                </ul>
                <ul className="text-sm space-y-1">
                  <li>• Salesforce connections</li>
                  <li>• Write-backs to Salesforce</li>
                  <li>• Data deletion</li>
                </ul>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-grove-ink dark:text-grove-ink-dk mb-2">
                Retention
              </h3>
              <p>
                Audit logs are retained for <strong>365 days</strong> and then deleted by the
                daily retention job. Deleting a client org also deletes that org&apos;s audit
                logs.
              </p>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-grove-ink dark:text-grove-ink-dk mb-4">
            4. Infrastructure Security
          </h2>
          <div className="text-grove-ink/85 dark:text-grove-ink-dk/85 space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-grove-ink dark:text-grove-ink-dk mb-2 flex items-center">
                <Server className="h-5 w-5 mr-2 text-primary-700" />
                Hosting & Infrastructure
              </h3>
              <ul className="list-disc pl-6 space-y-2">
                <li>
                  <strong>Railway Platform:</strong> Hosts the backend API and the PostgreSQL
                  database. For Railway&apos;s own controls and attestations, see its security
                  documentation.
                </li>
                <li>
                  <strong>PostgreSQL:</strong> Railway-managed PostgreSQL
                </li>
                <li>
                  <strong>Geographic redundancy:</strong> Single-region today; multi-region is on the roadmap
                </li>
                <li>
                  <strong>DDoS mitigation:</strong> Provided by the hosting provider&apos;s ingress layer; we do not run a dedicated WAF or CloudFlare Enterprise
                </li>
              </ul>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-grove-ink dark:text-grove-ink-dk mb-2">
                Network Security
              </h3>
              <ul className="list-disc pl-6 space-y-1">
                <li>Backend + database run on Railway&apos;s private networking</li>
                <li>The web front end is served by our hosting provider</li>
                <li>Admin access uses the same authenticated + role-gated login flow as any other user — no IP allowlist today</li>
              </ul>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-grove-ink dark:text-grove-ink-dk mb-4">
            5. Application Security
          </h2>
          <div className="text-grove-ink/85 dark:text-grove-ink-dk/85 space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-grove-ink dark:text-grove-ink-dk mb-2">
                Security Headers
              </h3>
              <p>Backend API responses include security headers:</p>
              <ul className="list-disc pl-6 mt-2 space-y-1">
                <li>Strict-Transport-Security (HSTS), when HTTPS is enforced</li>
                <li>X-Content-Type-Options: nosniff</li>
                <li>X-Frame-Options: SAMEORIGIN</li>
                <li>Content-Security-Policy</li>
                <li>Permissions-Policy</li>
                <li>Referrer-Policy: strict-origin-when-cross-origin</li>
              </ul>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-grove-ink dark:text-grove-ink-dk mb-2">
                Input Validation & Sanitization
              </h3>
              <ul className="list-disc pl-6 space-y-1">
                <li>API inputs validated with Pydantic schemas</li>
                <li>SQL injection prevention via parameterized queries</li>
                <li>XSS prevention through React's built-in escaping</li>
                <li>
                  Session cookie is HTTP-only and SameSite=Lax; the Salesforce OAuth flow is
                  protected by a signed, short-lived state value
                </li>
              </ul>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-grove-ink dark:text-grove-ink-dk mb-2">
                Dependency Management
              </h3>
              <ul className="list-disc pl-6 space-y-1">
                <li>Dependency versions are pinned or constrained to tested ranges</li>
                <li>Dependencies are updated periodically; there is no fixed patch schedule</li>
                <li>No automated dependency scanning is configured in CI today</li>
              </ul>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-grove-ink dark:text-grove-ink-dk mb-4">
            6. What Data We Actually Read
          </h2>
          <div className="text-grove-ink/85 dark:text-grove-ink-dk/85 space-y-4">
            <Card
              variant="bordered"
              className="border-primary-200 dark:border-primary-800 bg-primary-50 dark:bg-primary-900/10"
            >
              <CardContent className="py-4">
                <div className="flex items-start space-x-3">
                  <Database className="h-5 w-5 text-primary-700 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-medium text-grove-ink dark:text-grove-ink-dk">
                      Configuration, user data, and aggregate counts — not record contents
                    </p>
                    <p className="text-sm text-grove-ink/85 dark:text-grove-ink-dk/85 mt-1">
                      Newton reads Salesforce configuration metadata, personal data about the
                      org&apos;s Salesforce users, login history, the Setup Audit Trail, and
                      aggregate counts over business records. It does not read or store the
                      contents of business records (for example account names, contact
                      details, opportunity amounts, or case text).
                    </p>
                    <p className="text-[11px] font-mono uppercase tracking-wider text-grove-ink/70 dark:text-grove-ink-dk/70 mt-3">
                      Configuration metadata we sync + store
                    </p>
                    <ul className="text-sm mt-1 space-y-1">
                      <li>• Profiles, permission sets, permission set groups + assignments</li>
                      <li>• Object permissions and field-level security</li>
                      <li>• Roles, public groups + members, sharing rules, org-wide defaults</li>
                      <li>• Installed packages, flows, Apex class/trigger names and test coverage</li>
                      <li>• Validation and workflow rules</li>
                      <li>• Reports and dashboards (name, description, owner, last run)</li>
                      <li>• Connected apps, named credentials, remote sites (including endpoint URLs)</li>
                      <li>• Org limits and license counts</li>
                    </ul>
                    <p className="text-[11px] font-mono uppercase tracking-wider text-grove-ink/70 dark:text-grove-ink-dk/70 mt-3">
                      Personal data about Salesforce users
                    </p>
                    <ul className="text-sm mt-1 space-y-1">
                      <li>• Name, username, email, title, department, manager, delegated approver, active status, created date, last login time, profile/role</li>
                      <li>
                        • Login history, last 90 days (login time, status, application, login
                        type, source IP, browser, platform, geolocation including city, country
                        and coordinates) — used to detect login anomalies. IP addresses and
                        coordinates are used only in memory; city, country, browser and
                        platform can appear in stored anomaly explanations.
                      </li>
                      <li>
                        • Setup Audit Trail, last 30 days (who made each change, when, the
                        section, and Salesforce&apos;s description text of the change)
                      </li>
                    </ul>
                    <p className="text-[11px] font-mono uppercase tracking-wider text-grove-ink/70 dark:text-grove-ink-dk/70 mt-3">
                      Record-level access structure
                    </p>
                    <ul className="text-sm mt-1 space-y-1">
                      <li>
                        • Account/opportunity share rows and account/opportunity team
                        membership. Business record IDs are replaced with a keyed one-way hash
                        before storage — enough to count and compare records, not to identify
                        them in Salesforce.
                      </li>
                    </ul>
                    <p className="text-[11px] font-mono uppercase tracking-wider text-copper-700 dark:text-copper-400 mt-3">
                      Aggregate counts we compute (no record content)
                    </p>
                    <ul className="text-sm mt-1 space-y-1">
                      <li>• Number of records per object</li>
                      <li>• Per-field fill counts (<code>COUNT</code> of populated values)</li>
                      <li>
                        • Number and sizes of duplicate clusters — grouped inside Salesforce;
                        the duplicated values themselves are never returned to Newton
                      </li>
                      <li>• Counts of stale records</li>
                      <li>• Records owned per user</li>
                      <li>• Open opportunities not modified in 60 days</li>
                    </ul>
                    <p className="text-sm text-grove-ink/80 dark:text-grove-ink-dk/80 mt-3">
                      All queries run under the OAuth session of the Salesforce user who authorised Newton — we can only read what that user can see.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div>
              <h3 className="text-lg font-semibold text-grove-ink dark:text-grove-ink-dk mb-2 flex items-center">
                <AlertTriangle className="h-5 w-5 mr-2 text-primary-700" />
                What Newton Writes to Salesforce
              </h3>
              <p>
                Exactly three optional actions, each performed only when a Newton administrator
                explicitly takes it, and each recorded in the audit log:
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
                Restructure Studio plans are exported, not applied. Nothing else is written.
              </p>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-grove-ink dark:text-grove-ink-dk mb-2">
                Automatic Data Retention
              </h3>
              <p>
                A daily job deletes data past its retention period; an administrator can also
                run it on demand:
              </p>
              <ul className="list-disc pl-6 mt-2 space-y-1">
                <li>Salesforce metadata and user data: deleted when not refreshed by a sync for 90 days</li>
                <li>Analysis results (anomalies, risk scores, findings, sprawl, compliance and data-quality results): 180 days</li>
                <li>Audit logs: 365 days</li>
                <li>Sync history: 30 days (the most recent sync record is kept)</li>
                <li>Consultant-authored configuration (price book, report branding, saved restructure plans, VIP designations) and the Salesforce connection: until the client org is deleted</li>
              </ul>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-grove-ink dark:text-grove-ink-dk mb-2">
                Deletion
              </h3>
              <p>
                An administrator can delete a client org from Newton. This revokes
                Newton&apos;s OAuth grant in Salesforce and permanently deletes every stored
                record for that org — metadata, user data, analyses, reports, audit logs, and
                settings. It cannot be undone.
              </p>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-grove-ink dark:text-grove-ink-dk mb-4">
            7. Incident Response
          </h2>
          <div className="text-grove-ink/85 dark:text-grove-ink-dk/85 space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-grove-ink dark:text-grove-ink-dk mb-2">
                Security Incident Process
              </h3>
              <ol className="list-decimal pl-6 space-y-2">
                <li>
                  <strong>Detection:</strong> From application and audit logs, hosting-provider
                  alerts, and reports from users
                </li>
                <li>
                  <strong>Triage:</strong> Severity assessment as soon as an incident is identified
                </li>
                <li>
                  <strong>Containment:</strong> Isolate affected systems and revoke affected
                  credentials
                </li>
                <li>
                  <strong>Investigation:</strong> Root cause analysis and impact assessment
                </li>
                <li>
                  <strong>Notification:</strong> Notify affected customers within 72 hours (GDPR
                  requirement)
                </li>
                <li>
                  <strong>Remediation:</strong> Fix vulnerabilities and deploy patches
                </li>
                <li>
                  <strong>Post-Mortem:</strong> Document lessons learned and update procedures
                </li>
              </ol>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-grove-ink dark:text-grove-ink-dk mb-2">
                Reporting Security Issues
              </h3>
              <p>
                If you discover a security vulnerability, please report it to:
              </p>
              <div className="mt-3 p-4 bg-primary-50 dark:bg-grove-surface-dk rounded-lg">
                <p>
                  <strong>Email:</strong>{' '}
                  <a
                    href="mailto:security@accessgraph.ai"
                    className="text-primary-700 dark:text-primary-400 hover:underline"
                  >
                    security@accessgraph.ai
                  </a>
                </p>
                <p className="mt-2 text-sm text-grove-ink/70 dark:text-grove-ink/50">
                  We will acknowledge reports within 5 business days.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-grove-ink dark:text-grove-ink-dk mb-4">
            8. Security Testing
          </h2>
          <div className="text-grove-ink/85 dark:text-grove-ink-dk/85 space-y-4">
            <p className="text-sm text-grove-ink/80 dark:text-grove-ink-dk/80">
              Newton is an early-stage product, and we&apos;re honest about where our security-testing program stands. Today:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong>Manual code review:</strong> Every change is reviewed by the maintainer before merge
              </li>
              <li>
                <strong>Dependency updates:</strong> Dependencies are updated periodically; GitHub&apos;s built-in security alerts flag known-vulnerable versions
              </li>
              <li>
                <strong>Independent penetration testing:</strong> Not yet — planned once we reach enterprise pilots
              </li>
              <li>
                <strong>Automated SAST / DAST scanning:</strong> Not yet automated in CI. On the roadmap.
              </li>
              <li>
                <strong>Public bug bounty:</strong> Not open today. If you find a vulnerability, please email <a href="mailto:security@accessgraphai.com" className="underline">security@accessgraphai.com</a> and we&apos;ll respond within 5 business days.
              </li>
            </ul>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-grove-ink dark:text-grove-ink-dk mb-4">
            9. Operator Access
          </h2>
          <div className="text-grove-ink/85 dark:text-grove-ink-dk/85 space-y-4">
            <p className="text-sm text-grove-ink/80 dark:text-grove-ink-dk/80">
              Newton is currently maintained by a small team. Production access controls:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong>Principle of least privilege:</strong> Only the maintainer has production credentials
              </li>
              <li>
                <strong>Access logging:</strong> Hosting-provider platform logs record administrative actions on the infrastructure
              </li>
              <li>
                <strong>MFA on infrastructure accounts:</strong> Hosting, source-control, and email accounts require MFA. (In-app user accounts are password-only today; MFA is on the roadmap.)
              </li>
            </ul>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-grove-ink dark:text-grove-ink-dk mb-4">
            10. Questions?
          </h2>
          <div className="text-grove-ink/85 dark:text-grove-ink-dk/85 space-y-4">
            <p>For security-related questions:</p>
            <div className="mt-4 p-4 bg-primary-50 dark:bg-grove-surface-dk rounded-lg">
              <p>
                <strong>Email:</strong>{' '}
                <a
                  href="mailto:security@accessgraph.ai"
                  className="text-primary-700 dark:text-primary-400 hover:underline"
                >
                  security@accessgraph.ai
                </a>
              </p>
              <p className="mt-2">
                <strong>Response Time:</strong> We respond to security inquiries within 5
                business days
              </p>
            </div>
          </div>
        </section>
      </div>

      {/* Footer Navigation */}
      <div className="mt-12 pt-6 border-t border-grove-border dark:border-grove-border-dk">
        <div className="flex items-center justify-center space-x-6 text-sm">
          <a
            href="/legal/privacy"
            className="text-primary-600 dark:text-primary-400 hover:underline"
          >
            Privacy Policy
          </a>
          <span className="text-grove-border dark:text-grove-ink/70">•</span>
          <a
            href="/legal/terms"
            className="text-primary-600 dark:text-primary-400 hover:underline"
          >
            Terms of Service
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
