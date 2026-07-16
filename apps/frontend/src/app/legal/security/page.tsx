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
          Last updated: {new Date().toLocaleDateString()}
        </p>
        <p className="mt-2 text-grove-ink/70 dark:text-grove-ink/50">
          Learn how Newton protects your data and maintains enterprise-grade security.
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
                    GDPR data-subject rights
                  </p>
                  <p className="text-sm text-grove-ink/70 dark:text-grove-ink/50">
                    Right to access, erasure, portability — enforced by the /orgs/{'{'}id{'}'}/privacy endpoints
                  </p>
                </div>
              </div>
              <div className="flex items-start space-x-3">
                <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium text-grove-ink dark:text-grove-ink-dk">
                    AES-256 encryption at rest
                  </p>
                  <p className="text-sm text-grove-ink/70 dark:text-grove-ink/50">
                    OAuth tokens are AES-256 encrypted via sqlalchemy-utils
                  </p>
                </div>
              </div>
              <div className="flex items-start space-x-3">
                <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium text-grove-ink dark:text-grove-ink-dk">
                    TLS 1.2+ in transit
                  </p>
                  <p className="text-sm text-grove-ink/70 dark:text-grove-ink/50">
                    Provided by Railway (backend) + Vercel (frontend) ingress
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
                    ORG_ADMIN / ANALYST / VIEWER / AUDITOR + granular per-permission flags
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
                    Sensitive actions written to an append-only audit_logs table
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
                    Cost factor 12 for the email+password login flow
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
                    No self-signup — every account requires admin invitation + email activation
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
                    Third-party pentest engagement planned once we reach enterprise pilots
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
                  <strong>AES-256 Field-Level Encryption:</strong> OAuth tokens and sensitive
                  fields encrypted using industry-standard AES-256-GCM
                </li>
                <li>
                  <strong>Database Encryption:</strong> Managed PostgreSQL volumes on Railway are encrypted at rest by the provider
                </li>
                <li>
                  <strong>Key Management:</strong> Encryption keys stored as Railway environment variables (secrets), never checked into code
                </li>
                <li>
                  <strong>Key Rotation:</strong> Manual — operator rotates the key by updating the env var and running the token re-encrypt migration. Scheduled rotation is not yet automated.
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
                  <strong>TLS 1.2+:</strong> All API communication uses TLS as provided by Railway (backend) + Vercel (frontend) ingress
                </li>
                <li>
                  <strong>HSTS:</strong> Strict-Transport-Security headers are sent when <code className="text-xs">ENFORCE_HTTPS</code> is set on the backend (recommended production configuration)
                </li>
                <li>
                  <strong>Salesforce OAuth:</strong> Secure OAuth 2.0 flow for authentication
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
              <p>Dashboard users are assigned one of four roles:</p>
              <div className="mt-3 space-y-2">
                <div className="flex items-start space-x-3">
                  <Badge variant="danger" size="sm">
                    ORG_ADMIN
                  </Badge>
                  <p className="text-sm">
                    Full access to all features, user management, and data deletion
                  </p>
                </div>
                <div className="flex items-start space-x-3">
                  <Badge variant="warning" size="sm">
                    ANALYST
                  </Badge>
                  <p className="text-sm">
                    View and analyze data, create recommendations, export reports
                  </p>
                </div>
                <div className="flex items-start space-x-3">
                  <Badge variant="info" size="sm">
                    VIEWER
                  </Badge>
                  <p className="text-sm">Read-only access to dashboard and reports</p>
                </div>
                <div className="flex items-start space-x-3">
                  <Badge variant="success" size="sm">
                    AUDITOR
                  </Badge>
                  <p className="text-sm">
                    Access to audit logs and compliance reports only
                  </p>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-grove-ink dark:text-grove-ink-dk mb-2">
                Granular Permissions
              </h3>
              <p>Each role has fine-grained permissions:</p>
              <ul className="list-disc pl-6 mt-2 space-y-1">
                <li>can_export_data - Export data from the platform</li>
                <li>can_manage_users - Invite and remove dashboard users</li>
                <li>can_sync_data - Trigger Salesforce sync operations</li>
                <li>can_delete_data - Delete organization data</li>
                <li>can_view_audit_logs - Access security audit trail</li>
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
                Comprehensive Audit Trail
              </h3>
              <p>We log all sensitive operations with the following details:</p>
              <ul className="list-disc pl-6 mt-2 space-y-1">
                <li>
                  <strong>Who:</strong> User email, user ID, IP address, user agent
                </li>
                <li>
                  <strong>What:</strong> Action performed (17 tracked actions)
                </li>
                <li>
                  <strong>When:</strong> Timestamp (UTC) with millisecond precision
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
                  <li>• Authentication (login, logout)</li>
                  <li>• Data access (view users, permissions)</li>
                  <li>• Sync operations</li>
                  <li>• Export operations</li>
                  <li>• User management</li>
                </ul>
                <ul className="text-sm space-y-1">
                  <li>• Data deletion</li>
                  <li>• Settings changes</li>
                  <li>• Salesforce connection</li>
                  <li>• Access graph viewing</li>
                  <li>• Anomaly detection</li>
                </ul>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-grove-ink dark:text-grove-ink-dk mb-2">
                Retention
              </h3>
              <p>
                Audit logs are retained for <strong>365 days</strong> to meet SOC 2 and
                compliance requirements. Logs are automatically purged after the retention
                period.
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
                  <strong>Railway Platform:</strong> SOC 2, GDPR-compliant infrastructure
                  provider
                </li>
                <li>
                  <strong>PostgreSQL:</strong> Railway-managed PostgreSQL with provider-managed backups
                </li>
                <li>
                  <strong>Geographic redundancy:</strong> Single-region today; multi-region is on the roadmap
                </li>
                <li>
                  <strong>DDoS mitigation:</strong> Provided by Railway&apos;s ingress layer; we do not run a dedicated WAF or CloudFlare Enterprise
                </li>
              </ul>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-grove-ink dark:text-grove-ink-dk mb-2">
                Network Security
              </h3>
              <ul className="list-disc pl-6 space-y-1">
                <li>Backend + database run on Railway&apos;s private networking</li>
                <li>Frontend served via Vercel&apos;s edge network</li>
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
              <p>All HTTP responses include security headers:</p>
              <ul className="list-disc pl-6 mt-2 space-y-1">
                <li>Strict-Transport-Security (HSTS)</li>
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
                <li>All API inputs validated with Pydantic schemas</li>
                <li>SQL injection prevention via parameterized queries</li>
                <li>XSS prevention through React's built-in escaping</li>
                <li>CSRF protection on all state-changing operations</li>
              </ul>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-grove-ink dark:text-grove-ink-dk mb-2">
                Dependency Management
              </h3>
              <ul className="list-disc pl-6 space-y-1">
                <li>Automated dependency vulnerability scanning (Dependabot)</li>
                <li>Weekly security patch updates</li>
                <li>Pinned dependency versions for reproducible builds</li>
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
                      Permissions-first — but not strictly metadata-only
                    </p>
                    <p className="text-sm text-grove-ink/85 dark:text-grove-ink-dk/85 mt-1">
                      The bulk of Newton&apos;s features analyse Salesforce
                      permission metadata. A small number of analytics
                      features do read record-level data — always by
                      sampling or aggregation, never by full export.
                    </p>
                    <p className="text-[11px] font-mono uppercase tracking-wider text-grove-ink/70 dark:text-grove-ink-dk/70 mt-3">
                      Metadata we sync + store
                    </p>
                    <ul className="text-sm mt-1 space-y-1">
                      <li>• Users, roles, profiles, permission sets, permission-set groups + assignments</li>
                      <li>• Object &amp; field permissions</li>
                      <li>• Sharing rules, group memberships, org-wide defaults</li>
                      <li>• Account team, opportunity team, and share records (structural, not content)</li>
                      <li>• Flow, Apex Trigger, Connected App, Named Credential, and Report/Dashboard <em>inventories</em> (name + owner + timestamps)</li>
                      <li>• Login history (user, timestamp, application name, IP)</li>
                    </ul>
                    <p className="text-[11px] font-mono uppercase tracking-wider text-copper-700 dark:text-copper-400 mt-3">
                      Record data we DO read (sampled / aggregated)
                    </p>
                    <ul className="text-sm mt-1 space-y-1">
                      <li>
                        <strong>Data Quality scoring</strong> — samples up to 500 records per business object (Account, Contact, Lead, Opportunity, Case, etc.) to compute completeness, duplicate, and staleness metrics. Only aggregated evidence is stored (top-gap fields, duplicate key hashes, stale record IDs) — no bulk record export.
                      </li>
                      <li>
                        <strong>License Fit</strong> — reads per-user owner counts on Account / Opportunity / Case / Lead / Contact via aggregate SOQL to detect persona mismatch. No field values are stored.
                      </li>
                      <li>
                        <strong>Change Risk Radar</strong> — reads SetupAuditTrail (an admin-change log). This is metadata about changes, not record content.
                      </li>
                    </ul>
                    <p className="text-sm text-grove-ink/80 dark:text-grove-ink-dk/80 mt-3">
                      All queries run under the OAuth session of the Salesforce user who authorised Newton — we can only read what that user can see. Custom fields containing regulated data (PHI, PCI) are visible only if that user has access to them.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div>
              <h3 className="text-lg font-semibold text-grove-ink dark:text-grove-ink-dk mb-2">
                Automatic Data Retention
              </h3>
              <p>We automatically delete old data to minimize storage:</p>
              <ul className="list-disc pl-6 mt-2 space-y-1">
                <li>Snapshots: 90 days</li>
                <li>Audit logs: 365 days (compliance requirement)</li>
                <li>Sync jobs: 30 days</li>
                <li>Analysis data: 180 days</li>
              </ul>
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
                  <strong>Detection:</strong> Automated monitoring and alerting systems
                </li>
                <li>
                  <strong>Triage:</strong> Severity assessment within 1 hour
                </li>
                <li>
                  <strong>Containment:</strong> Isolate affected systems immediately
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
                  We have a responsible disclosure policy and will acknowledge reports within
                  24 hours.
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
                <strong>Dependency updates:</strong> Dependencies are updated regularly; GitHub&apos;s built-in security alerts flag known-vulnerable versions
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
                <strong>Access logging:</strong> Railway + Vercel + database provider logs all admin actions
              </li>
              <li>
                <strong>MFA on infrastructure accounts:</strong> Railway, Vercel, GitHub, and email accounts all require MFA. (In-app user accounts are password-only today; MFA is on the roadmap.)
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
                <strong>Response Time:</strong> We respond within 24 hours for security
                inquiries
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
