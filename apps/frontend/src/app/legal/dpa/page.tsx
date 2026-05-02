'use client'

/**
 * Data Processing Agreement Page
 * GDPR-compliant DPA for enterprise customers
 */

import { FileText, Shield, Database, Globe } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/shared/Card'

export default function DPAPage() {
  return (
    <div className="max-w-4xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-gray-900 dark:text-white">
          Data Processing Agreement (DPA)
        </h1>
        <p className="mt-4 text-lg text-gray-600 dark:text-gray-400">
          Last updated: {new Date().toLocaleDateString()}
        </p>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          This Data Processing Agreement governs the processing of personal data under GDPR
          and other applicable data protection laws.
        </p>
      </div>

      {/* DPA Summary */}
      <Card variant="bordered" className="mb-8 bg-purple-50 dark:bg-purple-900/10 border-purple-200 dark:border-purple-800">
        <CardHeader>
          <CardTitle>DPA Quick Reference</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-start space-x-3">
              <Shield className="h-5 w-5 text-purple-600 mt-0.5" />
              <div>
                <p className="font-medium text-gray-900 dark:text-white">Data Controller</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  You (the customer organization)
                </p>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <Database className="h-5 w-5 text-purple-600 mt-0.5" />
              <div>
                <p className="font-medium text-gray-900 dark:text-white">Data Processor</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  AccessGraph AI (service provider)
                </p>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <Globe className="h-5 w-5 text-purple-600 mt-0.5" />
              <div>
                <p className="font-medium text-gray-900 dark:text-white">Data Location</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  US & EU (with Standard Contractual Clauses)
                </p>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <FileText className="h-5 w-5 text-purple-600 mt-0.5" />
              <div>
                <p className="font-medium text-gray-900 dark:text-white">Legal Basis</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  GDPR Article 28 (Processing Agreement)
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
            1. Definitions
          </h2>
          <div className="text-gray-700 dark:text-gray-300 space-y-4">
            <p>For purposes of this DPA:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong>"Personal Data"</strong> means any information relating to an
                identified or identifiable natural person, as defined in GDPR Article 4(1).
              </li>
              <li>
                <strong>"Controller"</strong> means the customer organization that determines
                the purposes and means of processing Personal Data.
              </li>
              <li>
                <strong>"Processor"</strong> means AccessGraph AI, which processes Personal
                Data on behalf of the Controller.
              </li>
              <li>
                <strong>"Sub-processor"</strong> means any third-party service provider
                engaged by the Processor to process Personal Data.
              </li>
              <li>
                <strong>"Data Subject"</strong> means an individual whose Personal Data is
                processed.
              </li>
              <li>
                <strong>"GDPR"</strong> means the General Data Protection Regulation (EU)
                2016/679.
              </li>
            </ul>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
            2. Scope and Subject Matter
          </h2>
          <div className="text-gray-700 dark:text-gray-300 space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                2.1 Subject Matter
              </h3>
              <p>
                The Processor will process Personal Data on behalf of the Controller to
                provide access analysis and security intelligence services as described in the
                Service Agreement.
              </p>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                2.2 Duration
              </h3>
              <p>
                This DPA remains in effect for the duration of the Service Agreement and will
                automatically terminate upon termination of the Service Agreement.
              </p>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                2.3 Nature and Purpose
              </h3>
              <p>The Processor processes Personal Data for the following purposes:</p>
              <ul className="list-disc pl-6 mt-2 space-y-1">
                <li>Analyzing Salesforce permission and access structures</li>
                <li>Identifying security anomalies and access risks</li>
                <li>Generating security recommendations</li>
                <li>Providing access visualization and reporting</li>
                <li>Maintaining audit logs for compliance</li>
              </ul>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                2.4 Types of Personal Data
              </h3>
              <p>The Processor may process the following categories of Personal Data:</p>
              <ul className="list-disc pl-6 mt-2 space-y-1">
                <li>User names and email addresses</li>
                <li>User roles, profiles, and permission assignments</li>
                <li>Job titles and organizational hierarchy</li>
                <li>IP addresses and user agents (for audit logging)</li>
                <li>Access patterns and usage metadata</li>
              </ul>
              <p className="mt-2 font-medium text-purple-600 dark:text-purple-400">
                Note: The Processor does not process actual customer records (Accounts,
                Opportunities, etc.) - only permission metadata.
              </p>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                2.5 Categories of Data Subjects
              </h3>
              <ul className="list-disc pl-6 space-y-1">
                <li>Salesforce users within the Controller's organization</li>
                <li>Dashboard users accessing the AccessGraph AI platform</li>
              </ul>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
            3. Processor Obligations
          </h2>
          <div className="text-gray-700 dark:text-gray-300 space-y-4">
            <p>The Processor shall:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                Process Personal Data only on documented instructions from the Controller,
                unless required by law
              </li>
              <li>
                Ensure that persons authorized to process Personal Data are bound by
                confidentiality obligations
              </li>
              <li>
                Implement appropriate technical and organizational measures to ensure a level
                of security appropriate to the risk (GDPR Article 32)
              </li>
              <li>
                Respect the conditions for engaging Sub-processors (Section 5)
              </li>
              <li>
                Assist the Controller in responding to Data Subject requests (Section 6)
              </li>
              <li>
                Assist the Controller in ensuring compliance with GDPR obligations
              </li>
              <li>
                Delete or return all Personal Data upon termination (at Controller's choice)
              </li>
              <li>
                Make available to the Controller all information necessary to demonstrate
                compliance
              </li>
            </ul>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
            4. Security Measures
          </h2>
          <div className="text-gray-700 dark:text-gray-300 space-y-4">
            <p>
              The Processor implements the following technical and organizational measures
              (GDPR Article 32):
            </p>

            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                4.1 Technical Measures
              </h3>
              <ul className="list-disc pl-6 space-y-1">
                <li>AES-256 encryption for Personal Data at rest</li>
                <li>TLS 1.3 encryption for data in transit</li>
                <li>Multi-factor authentication for administrative access</li>
                <li>Automated security patching and vulnerability scanning</li>
                <li>Role-based access control (RBAC)</li>
                <li>Comprehensive audit logging</li>
              </ul>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                4.2 Organizational Measures
              </h3>
              <ul className="list-disc pl-6 space-y-1">
                <li>Security awareness training for all personnel</li>
                <li>Incident response procedures</li>
                <li>Data breach notification process (72-hour requirement)</li>
                <li>Regular security audits and penetration testing</li>
                <li>Background checks for employees with data access</li>
              </ul>
            </div>

            <p className="mt-4">
              For detailed security information, see our{' '}
              <a
                href="/legal/security"
                className="text-blue-600 dark:text-blue-400 hover:underline"
              >
                Security Practices
              </a>{' '}
              page.
            </p>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
            5. Sub-processors
          </h2>
          <div className="text-gray-700 dark:text-gray-300 space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                5.1 General Authorization
              </h3>
              <p>
                The Controller provides general authorization for the Processor to engage
                Sub-processors, subject to the conditions in this section.
              </p>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                5.2 Current Sub-processors
              </h3>
              <div className="mt-2 overflow-hidden border border-gray-200 dark:border-gray-700 rounded-lg">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead className="bg-gray-50 dark:bg-gray-800">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                        Sub-processor
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                        Service
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                        Location
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    <tr>
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                        Railway
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                        Infrastructure hosting
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                        US, EU
                      </td>
                    </tr>
                    <tr>
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                        PostgreSQL (managed)
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                        Database storage
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                        US, EU
                      </td>
                    </tr>
                    <tr>
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                        Neo4j AuraDB
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                        Graph database
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                        US, EU
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                5.3 Notification of Changes
              </h3>
              <p>
                The Processor will notify the Controller of any intended changes concerning
                the addition or replacement of Sub-processors at least 30 days in advance.
                The Controller may object to such changes on reasonable data protection
                grounds.
              </p>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                5.4 Sub-processor Obligations
              </h3>
              <p>
                The Processor will impose the same data protection obligations on
                Sub-processors as set out in this DPA, including appropriate technical and
                organizational measures.
              </p>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
            6. Data Subject Rights
          </h2>
          <div className="text-gray-700 dark:text-gray-300 space-y-4">
            <p>
              The Processor shall assist the Controller in fulfilling Data Subject rights
              requests under GDPR Articles 15-22:
            </p>

            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong>Right of Access (Article 15):</strong> Data inventory available in
                Privacy Dashboard
              </li>
              <li>
                <strong>Right to Rectification (Article 16):</strong> Update data by
                re-syncing with Salesforce
              </li>
              <li>
                <strong>Right to Erasure (Article 17):</strong> One-click complete data
                deletion
              </li>
              <li>
                <strong>Right to Data Portability (Article 20):</strong> Export data in JSON
                format
              </li>
              <li>
                <strong>Right to Object (Article 21):</strong> Stop processing by
                disconnecting org
              </li>
              <li>
                <strong>Right to Restrict Processing (Article 18):</strong> Pause sync
                operations
              </li>
            </ul>

            <p className="mt-4">
              The Processor will respond to Data Subject requests forwarded by the Controller
              within 10 business days, or sooner if required by law.
            </p>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
            7. Data Breach Notification
          </h2>
          <div className="text-gray-700 dark:text-gray-300 space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                7.1 Notification Obligation
              </h3>
              <p>
                The Processor shall notify the Controller without undue delay (and in no event
                later than 72 hours) after becoming aware of a Personal Data breach affecting
                the Controller's data.
              </p>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                7.2 Breach Details
              </h3>
              <p>The notification shall include, at minimum:</p>
              <ul className="list-disc pl-6 mt-2 space-y-1">
                <li>Nature of the breach and categories of data affected</li>
                <li>Approximate number of Data Subjects and records affected</li>
                <li>Likely consequences of the breach</li>
                <li>Measures taken or proposed to address the breach</li>
                <li>Contact point for further information</li>
              </ul>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                7.3 Cooperation
              </h3>
              <p>
                The Processor shall cooperate with the Controller and provide reasonable
                assistance in the investigation, mitigation, and remediation of the breach.
              </p>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
            8. International Data Transfers
          </h2>
          <div className="text-gray-700 dark:text-gray-300 space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                8.1 Transfer Mechanism
              </h3>
              <p>
                For transfers of Personal Data from the EEA to countries without an adequacy
                decision, the parties agree to use the European Commission's Standard
                Contractual Clauses (SCCs) as the legal mechanism.
              </p>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                8.2 Additional Safeguards
              </h3>
              <ul className="list-disc pl-6 space-y-1">
                <li>AES-256 encryption for all data transfers</li>
                <li>TLS 1.3 for data in transit</li>
                <li>Data minimization principles applied</li>
                <li>GDPR-compliant hosting providers with appropriate certifications</li>
              </ul>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
            9. Audits and Inspections
          </h2>
          <div className="text-gray-700 dark:text-gray-300 space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                9.1 Audit Rights
              </h3>
              <p>
                The Controller may audit the Processor's compliance with this DPA up to once
                per year, upon 30 days' written notice, during normal business hours.
              </p>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                9.2 Third-Party Audits
              </h3>
              <p>
                The Processor will provide the Controller with copies of relevant third-party
                audit reports (e.g., SOC 2 Type II) upon request, subject to reasonable
                confidentiality obligations.
              </p>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
            10. Data Deletion and Return
          </h2>
          <div className="text-gray-700 dark:text-gray-300 space-y-4">
            <p>
              Upon termination of the Service Agreement, the Processor shall, at the
              Controller's choice:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong>Delete:</strong> Permanently delete all Personal Data from production
                and backup systems within 30 days
              </li>
              <li>
                <strong>Return:</strong> Return all Personal Data to the Controller in a
                structured, commonly used format (JSON)
              </li>
            </ul>
            <p className="mt-4">
              The Processor may retain Personal Data to the extent required by applicable law,
              subject to continuing confidentiality and security obligations.
            </p>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
            11. Liability and Indemnification
          </h2>
          <div className="text-gray-700 dark:text-gray-300 space-y-4">
            <p>
              Each party's liability under this DPA shall be subject to the limitations of
              liability set forth in the Service Agreement. The Processor shall indemnify the
              Controller for any fines, penalties, or damages resulting from the Processor's
              non-compliance with this DPA.
            </p>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
            12. Contact Information
          </h2>
          <div className="text-gray-700 dark:text-gray-300 space-y-4">
            <p>For DPA-related questions or to execute a signed DPA:</p>
            <div className="mt-4 p-4 bg-gray-100 dark:bg-gray-800 rounded-lg">
              <p>
                <strong>Email:</strong>{' '}
                <a
                  href="mailto:dpa@accessgraph.ai"
                  className="text-blue-600 dark:text-blue-400 hover:underline"
                >
                  dpa@accessgraph.ai
                </a>
              </p>
              <p className="mt-2">
                <strong>Data Protection Officer:</strong>{' '}
                <a
                  href="mailto:dpo@accessgraph.ai"
                  className="text-blue-600 dark:text-blue-400 hover:underline"
                >
                  dpo@accessgraph.ai
                </a>
              </p>
              <p className="mt-2">
                <strong>Legal Department:</strong> AccessGraph AI, Inc.
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
            href="/legal/security"
            className="text-primary-600 dark:text-primary-400 hover:underline"
          >
            Security Practices
          </a>
        </div>
      </div>
    </div>
  )
}
