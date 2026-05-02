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
} from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/shared/Card'
import { Badge } from '@/components/shared/Badge'

export default function SecurityPracticesPage() {
  return (
    <div className="max-w-4xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-gray-900 dark:text-white">
          Security Practices
        </h1>
        <p className="mt-4 text-lg text-gray-600 dark:text-gray-400">
          Last updated: {new Date().toLocaleDateString()}
        </p>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          Learn how AccessGraph AI protects your data and maintains enterprise-grade security.
        </p>
      </div>

      {/* Security Certifications */}
      <Card variant="bordered" className="mb-8 bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800">
        <CardHeader>
          <CardTitle>Security Certifications & Compliance</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-center space-x-3">
              <CheckCircle className="h-5 w-5 text-green-600" />
              <div>
                <p className="font-medium text-gray-900 dark:text-white">
                  SOC 2 Type II
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  In progress (targeting Q3 2026)
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <CheckCircle className="h-5 w-5 text-green-600" />
              <div>
                <p className="font-medium text-gray-900 dark:text-white">
                  GDPR Compliant
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Full GDPR Article 17 support
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <CheckCircle className="h-5 w-5 text-green-600" />
              <div>
                <p className="font-medium text-gray-900 dark:text-white">
                  Salesforce Security Review
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  AppExchange security approved
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <CheckCircle className="h-5 w-5 text-green-600" />
              <div>
                <p className="font-medium text-gray-900 dark:text-white">
                  CCPA Compliant
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  California privacy rights supported
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Security Architecture */}
      <div className="prose prose-gray dark:prose-invert max-w-none space-y-8">
        <section>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
            1. Data Encryption
          </h2>
          <div className="text-gray-700 dark:text-gray-300 space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2 flex items-center">
                <Lock className="h-5 w-5 mr-2 text-blue-600" />
                Encryption at Rest
              </h3>
              <ul className="list-disc pl-6 space-y-2">
                <li>
                  <strong>AES-256 Field-Level Encryption:</strong> OAuth tokens and sensitive
                  fields encrypted using industry-standard AES-256-GCM
                </li>
                <li>
                  <strong>Database Encryption:</strong> PostgreSQL and Neo4j databases use
                  encrypted volumes
                </li>
                <li>
                  <strong>Key Management:</strong> Encryption keys stored in secure secrets
                  managers, never in code
                </li>
                <li>
                  <strong>Key Rotation:</strong> Automatic key rotation every 6-12 months
                </li>
              </ul>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2 flex items-center">
                <Shield className="h-5 w-5 mr-2 text-blue-600" />
                Encryption in Transit
              </h3>
              <ul className="list-disc pl-6 space-y-2">
                <li>
                  <strong>TLS 1.3:</strong> All API communication uses TLS 1.3 with perfect
                  forward secrecy
                </li>
                <li>
                  <strong>HSTS Enabled:</strong> Strict-Transport-Security headers enforce HTTPS
                </li>
                <li>
                  <strong>Certificate Pinning:</strong> Production API uses certificate pinning
                </li>
                <li>
                  <strong>Salesforce OAuth:</strong> Secure OAuth 2.0 flow for authentication
                </li>
              </ul>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
            2. Access Controls
          </h2>
          <div className="text-gray-700 dark:text-gray-300 space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
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
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
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
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
            3. Audit Logging
          </h2>
          <div className="text-gray-700 dark:text-gray-300 space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2 flex items-center">
                <FileText className="h-5 w-5 mr-2 text-blue-600" />
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
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
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
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
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
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
            4. Infrastructure Security
          </h2>
          <div className="text-gray-700 dark:text-gray-300 space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2 flex items-center">
                <Server className="h-5 w-5 mr-2 text-blue-600" />
                Hosting & Infrastructure
              </h3>
              <ul className="list-disc pl-6 space-y-2">
                <li>
                  <strong>Railway Platform:</strong> SOC 2, GDPR-compliant infrastructure
                  provider
                </li>
                <li>
                  <strong>PostgreSQL:</strong> Managed PostgreSQL with automated backups and
                  point-in-time recovery
                </li>
                <li>
                  <strong>Neo4j:</strong> AuraDB Enterprise for graph database with encryption
                </li>
                <li>
                  <strong>Geographic Redundancy:</strong> Multi-region deployment for high
                  availability
                </li>
                <li>
                  <strong>DDoS Protection:</strong> CloudFlare Enterprise DDoS mitigation
                </li>
              </ul>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                Network Security
              </h3>
              <ul className="list-disc pl-6 space-y-1">
                <li>Private VPC networking for backend services</li>
                <li>Firewall rules restricting inbound/outbound traffic</li>
                <li>IP allowlisting for admin access</li>
                <li>Regular security group audits</li>
              </ul>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
            5. Application Security
          </h2>
          <div className="text-gray-700 dark:text-gray-300 space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
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
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
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
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
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
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
            6. Data Minimization
          </h2>
          <div className="text-gray-700 dark:text-gray-300 space-y-4">
            <Card
              variant="bordered"
              className="border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/10"
            >
              <CardContent className="py-4">
                <div className="flex items-start space-x-3">
                  <Database className="h-5 w-5 text-blue-600 mt-0.5" />
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">
                      We Only Collect Metadata
                    </p>
                    <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">
                      AccessGraph AI never accesses your actual Salesforce records (Accounts,
                      Opportunities, Contacts, etc.). We only sync permission metadata:
                    </p>
                    <ul className="text-sm mt-2 space-y-1">
                      <li>• User names and emails (for permission analysis)</li>
                      <li>• Roles, profiles, and permission sets</li>
                      <li>• Object and field permissions</li>
                      <li>• Sharing rules and group memberships</li>
                    </ul>
                    <p className="text-sm text-blue-600 dark:text-blue-400 mt-2 font-medium">
                      No customer data, no record counts, no actual field values.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
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
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
            7. Incident Response
          </h2>
          <div className="text-gray-700 dark:text-gray-300 space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
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
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                Reporting Security Issues
              </h3>
              <p>
                If you discover a security vulnerability, please report it to:
              </p>
              <div className="mt-3 p-4 bg-gray-100 dark:bg-gray-800 rounded-lg">
                <p>
                  <strong>Email:</strong>{' '}
                  <a
                    href="mailto:security@accessgraph.ai"
                    className="text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    security@accessgraph.ai
                  </a>
                </p>
                <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                  We have a responsible disclosure policy and will acknowledge reports within
                  24 hours.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
            8. Security Testing
          </h2>
          <div className="text-gray-700 dark:text-gray-300 space-y-4">
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong>Quarterly Penetration Testing:</strong> Third-party security audits
              </li>
              <li>
                <strong>Automated Vulnerability Scanning:</strong> Daily scans with Snyk/OWASP
                ZAP
              </li>
              <li>
                <strong>Code Review:</strong> Security-focused code reviews for all changes
              </li>
              <li>
                <strong>Static Analysis:</strong> SAST tools integrated in CI/CD pipeline
              </li>
              <li>
                <strong>Bug Bounty:</strong> Public bug bounty program (coming Q4 2026)
              </li>
            </ul>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
            9. Employee Access
          </h2>
          <div className="text-gray-700 dark:text-gray-300 space-y-4">
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong>Principle of Least Privilege:</strong> Engineers have minimal access
                required for their role
              </li>
              <li>
                <strong>Background Checks:</strong> All employees undergo background screening
              </li>
              <li>
                <strong>Security Training:</strong> Annual security awareness training
              </li>
              <li>
                <strong>Access Logging:</strong> All production access logged and audited
              </li>
              <li>
                <strong>MFA Required:</strong> Multi-factor authentication for all accounts
              </li>
            </ul>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
            10. Questions?
          </h2>
          <div className="text-gray-700 dark:text-gray-300 space-y-4">
            <p>For security-related questions:</p>
            <div className="mt-4 p-4 bg-gray-100 dark:bg-gray-800 rounded-lg">
              <p>
                <strong>Email:</strong>{' '}
                <a
                  href="mailto:security@accessgraph.ai"
                  className="text-blue-600 dark:text-blue-400 hover:underline"
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
      <div className="mt-12 pt-6 border-t border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-center space-x-6 text-sm">
          <a
            href="/legal/privacy"
            className="text-primary-600 dark:text-primary-400 hover:underline"
          >
            Privacy Policy
          </a>
          <span className="text-gray-300 dark:text-gray-600">•</span>
          <a
            href="/legal/terms"
            className="text-primary-600 dark:text-primary-400 hover:underline"
          >
            Terms of Service
          </a>
          <span className="text-gray-300 dark:text-gray-600">•</span>
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
