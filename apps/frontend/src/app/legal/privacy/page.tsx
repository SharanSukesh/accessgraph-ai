'use client'

/**
 * Privacy Policy Page
 * GDPR-compliant privacy policy for AccessGraph AI
 */

import { Shield, Database, Lock, Eye, Trash2, FileText } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/shared/Card'

export default function PrivacyPolicyPage() {
  return (
    <div className="max-w-4xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-gray-900 dark:text-white">
          Privacy Policy
        </h1>
        <p className="mt-4 text-lg text-gray-600 dark:text-gray-400">
          Last updated: {new Date().toLocaleDateString()}
        </p>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          AccessGraph AI is committed to protecting your privacy and complying with GDPR,
          CCPA, and other data protection regulations.
        </p>
      </div>

      {/* Quick Summary */}
      <Card variant="bordered" className="mb-8 bg-blue-50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800">
        <CardHeader>
          <CardTitle>Privacy at a Glance</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-start space-x-3">
              <Database className="h-5 w-5 text-blue-600 mt-0.5" />
              <div>
                <p className="font-medium text-gray-900 dark:text-white">
                  Metadata Only
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  We never access your actual Salesforce records, only permission metadata
                </p>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <Lock className="h-5 w-5 text-blue-600 mt-0.5" />
              <div>
                <p className="font-medium text-gray-900 dark:text-white">
                  Encrypted Storage
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  All sensitive data is encrypted with AES-256 encryption
                </p>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <Eye className="h-5 w-5 text-blue-600 mt-0.5" />
              <div>
                <p className="font-medium text-gray-900 dark:text-white">
                  Full Transparency
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Complete data inventory available in your privacy dashboard
                </p>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <Trash2 className="h-5 w-5 text-blue-600 mt-0.5" />
              <div>
                <p className="font-medium text-gray-900 dark:text-white">
                  Right to Erasure
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
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
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
            1. Information We Collect
          </h2>
          <div className="text-gray-700 dark:text-gray-300 space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                1.1 Salesforce Metadata
              </h3>
              <p>
                When you connect your Salesforce organization, we collect permission and access
                metadata including:
              </p>
              <ul className="list-disc pl-6 mt-2 space-y-1">
                <li>User profiles, roles, and permission sets</li>
                <li>Object and field-level permissions</li>
                <li>Sharing rules and organization-wide defaults</li>
                <li>Public groups and team memberships</li>
              </ul>
              <p className="mt-2 font-medium text-blue-600 dark:text-blue-400">
                Important: We never access or store your actual customer data (Accounts,
                Opportunities, etc.). We only analyze who can access what.
              </p>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
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
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
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
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
            2. How We Use Your Information
          </h2>
          <div className="text-gray-700 dark:text-gray-300 space-y-4">
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
                <strong>Service Delivery:</strong> Maintain and improve the AccessGraph AI
                platform
              </li>
              <li>
                <strong>Compliance:</strong> Maintain audit logs for security and compliance
              </li>
            </ul>
            <p className="mt-4 font-medium text-gray-900 dark:text-white">
              We never sell or share your data with third parties for marketing purposes.
            </p>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
            3. Data Security
          </h2>
          <div className="text-gray-700 dark:text-gray-300 space-y-4">
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
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
            4. Data Retention
          </h2>
          <div className="text-gray-700 dark:text-gray-300 space-y-4">
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
              <a href="/privacy" className="text-blue-600 dark:text-blue-400 hover:underline">
                Privacy Dashboard
              </a>
              .
            </p>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
            5. Your Rights (GDPR)
          </h2>
          <div className="text-gray-700 dark:text-gray-300 space-y-4">
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
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
            6. Cookies and Tracking
          </h2>
          <div className="text-gray-700 dark:text-gray-300 space-y-4">
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
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
            7. Third-Party Services
          </h2>
          <div className="text-gray-700 dark:text-gray-300 space-y-4">
            <p>We use the following third-party services:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong>Salesforce OAuth:</strong> For secure authentication with your Salesforce
                org
              </li>
              <li>
                <strong>Railway (hosting):</strong> Infrastructure provider, compliant with SOC
                2, GDPR
              </li>
              <li>
                <strong>PostgreSQL/Neo4j:</strong> Encrypted database storage
              </li>
            </ul>
            <p className="mt-2">
              All third-party services are GDPR-compliant and covered by Data Processing
              Agreements.
            </p>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
            8. International Data Transfers
          </h2>
          <div className="text-gray-700 dark:text-gray-300 space-y-4">
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
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
            9. Changes to This Policy
          </h2>
          <div className="text-gray-700 dark:text-gray-300 space-y-4">
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
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
            10. Contact Us
          </h2>
          <div className="text-gray-700 dark:text-gray-300 space-y-4">
            <p>For privacy-related questions or to exercise your rights:</p>
            <div className="mt-4 p-4 bg-gray-100 dark:bg-gray-800 rounded-lg">
              <p>
                <strong>Email:</strong>{' '}
                <a
                  href="mailto:privacy@accessgraph.ai"
                  className="text-blue-600 dark:text-blue-400 hover:underline"
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
      <div className="mt-12 pt-6 border-t border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-center space-x-6 text-sm">
          <a
            href="/legal/terms"
            className="text-primary-600 dark:text-primary-400 hover:underline"
          >
            Terms of Service
          </a>
          <span className="text-gray-300 dark:text-gray-600">•</span>
          <a
            href="/legal/security"
            className="text-primary-600 dark:text-primary-400 hover:underline"
          >
            Security Practices
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
