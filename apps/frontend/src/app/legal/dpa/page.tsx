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
        <h1 className="text-4xl font-bold text-grove-ink dark:text-grove-ink-dk">
          Data Processing Agreement (DPA)
        </h1>
        <p className="mt-4 text-lg text-grove-ink/70 dark:text-grove-ink/50">
          Last updated: October 8, 2026
        </p>
        <p className="mt-2 text-grove-ink/70 dark:text-grove-ink/50">
          This Data Processing Agreement governs the processing of personal data under GDPR
          and other applicable data protection laws when a Salesforce consultancy operates
          Newton for a client. The client is the Controller of its Salesforce data; the
          consultancy operating Newton is the Processor.
        </p>
      </div>

      {/* DPA Summary */}
      <Card variant="bordered" className="mb-8 bg-copper-50 dark:bg-copper-900/10 border-copper-200 dark:border-copper-800">
        <CardHeader>
          <CardTitle>DPA Quick Reference</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-start space-x-3">
              <Shield className="h-5 w-5 text-copper-600 mt-0.5" />
              <div>
                <p className="font-medium text-grove-ink dark:text-grove-ink-dk">Data Controller</p>
                <p className="text-sm text-grove-ink/70 dark:text-grove-ink/50">
                  The client (the organization whose Salesforce org is connected)
                </p>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <Database className="h-5 w-5 text-copper-600 mt-0.5" />
              <div>
                <p className="font-medium text-grove-ink dark:text-grove-ink-dk">Data Processor</p>
                <p className="text-sm text-grove-ink/70 dark:text-grove-ink/50">
                  The consultancy operating Newton
                </p>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <Globe className="h-5 w-5 text-copper-600 mt-0.5" />
              <div>
                <p className="font-medium text-grove-ink dark:text-grove-ink-dk">Data Location</p>
                <p className="text-sm text-grove-ink/70 dark:text-grove-ink/50">
                  United States (Standard Contractual Clauses for EEA/UK transfers)
                </p>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <FileText className="h-5 w-5 text-copper-600 mt-0.5" />
              <div>
                <p className="font-medium text-grove-ink dark:text-grove-ink-dk">Legal Basis</p>
                <p className="text-sm text-grove-ink/70 dark:text-grove-ink/50">
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
          <h2 className="text-2xl font-bold text-grove-ink dark:text-grove-ink-dk mb-4">
            1. Definitions
          </h2>
          <div className="text-grove-ink/85 dark:text-grove-ink-dk/85 space-y-4">
            <p>For purposes of this DPA:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong>"Personal Data"</strong> means any information relating to an
                identified or identifiable natural person, as defined in GDPR Article 4(1).
              </li>
              <li>
                <strong>"Controller"</strong> means the client organization whose Salesforce
                org is connected to Newton, which determines the purposes and means of
                processing Personal Data.
              </li>
              <li>
                <strong>"Processor"</strong> means the consultancy operating Newton, which
                processes Personal Data on behalf of the Controller.
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
          <h2 className="text-2xl font-bold text-grove-ink dark:text-grove-ink-dk mb-4">
            2. Scope and Subject Matter
          </h2>
          <div className="text-grove-ink/85 dark:text-grove-ink-dk/85 space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-grove-ink dark:text-grove-ink-dk mb-2">
                2.1 Subject Matter
              </h3>
              <p>
                The Processor will process Personal Data on behalf of the Controller to
                provide access analysis and security intelligence services as described in the
                Service Agreement.
              </p>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-grove-ink dark:text-grove-ink-dk mb-2">
                2.2 Duration
              </h3>
              <p>
                This DPA remains in effect for the duration of the Service Agreement and will
                automatically terminate upon termination of the Service Agreement.
              </p>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-grove-ink dark:text-grove-ink-dk mb-2">
                2.3 Nature and Purpose
              </h3>
              <p>The Processor processes Personal Data for the following purposes:</p>
              <ul className="list-disc pl-6 mt-2 space-y-1">
                <li>Analyzing Salesforce configuration, permission, and access structures</li>
                <li>Identifying security risks, including login anomalies such as impossible travel or brute force</li>
                <li>Generating rule-based findings and recommendations</li>
                <li>Providing access visualization and reporting</li>
                <li>Maintaining audit logs of actions taken in Newton</li>
                <li>
                  On explicit instruction from a Newton administrator only: setting a
                  user&apos;s Manager or Delegated Approver, or deactivating users flagged as
                  inactive or never-logged-in license holders, in the Controller&apos;s
                  Salesforce org. These are the only writes Newton makes to Salesforce; each is
                  audit-logged.
                </li>
              </ul>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-grove-ink dark:text-grove-ink-dk mb-2">
                2.4 Types of Personal Data
              </h3>
              <p>The Processor may process the following categories of Personal Data:</p>
              <ul className="list-disc pl-6 mt-2 space-y-1">
                <li>
                  Salesforce user records: name, username, email, title, department, manager,
                  delegated approver, active status, created date, last login time, profile,
                  and role
                </li>
                <li>
                  Salesforce login history for the last 90 days: login time, status,
                  application, login type, source IP address, browser, platform, and
                  geolocation (city, country, coordinates). IP addresses and coordinates are
                  used only in memory and are not stored; city, country, browser, and platform
                  can appear in stored anomaly explanations.
                </li>
                <li>
                  Salesforce Setup Audit Trail for the last 30 days: who made each
                  configuration change, when, the section, and Salesforce&apos;s description
                  text of the change (which can name users)
                </li>
                <li>
                  Permission assignments, group and team membership, and the number of
                  records owned by each user
                </li>
                <li>
                  Newton account data: name, email, role, bcrypt password hash, and audit log
                  entries including IP address and user agent
                </li>
              </ul>
              <p className="mt-2 text-sm text-grove-ink/80 dark:text-grove-ink-dk/80">
                Note on record content: Newton does not read or store the contents of business records (for example account names, contact details, opportunity amounts, or case text). It reads aggregate counts over business records — records per object, per-field fill counts, the number and sizes of duplicate clusters (grouped inside Salesforce; the duplicated values are never returned to Newton), stale-record counts, records owned per user, and open opportunities not modified in 60 days. It also reads account/opportunity share rows and team membership; business record IDs from these are replaced with a keyed one-way hash before storage, which allows records to be counted and compared but not identified in Salesforce.
              </p>
            </div>

            <div>
              <p>
                <strong>Privacy level.</strong> The Controller selects a privacy level for each
                connected org, which limits the categories above. Under <em>Masked users</em>, names,
                email addresses and usernames are replaced with aliases before storage (Salesforce user
                IDs are retained), login history is limited to country, and Setup Audit Trail
                description text is not stored. Under <em>Metadata only</em>, no Salesforce user
                records, login history or Setup Audit Trail data are processed; aggregate record
                statistics are processed only if the Controller opts in.
              </p>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-grove-ink dark:text-grove-ink-dk mb-2">
                2.5 Categories of Data Subjects
              </h3>
              <ul className="list-disc pl-6 space-y-1">
                <li>Salesforce users within the Controller's organization</li>
                <li>Holders of Newton accounts (the Processor&apos;s staff and any Controller staff given access)</li>
              </ul>
              <p className="mt-2 text-sm text-grove-ink/80 dark:text-grove-ink-dk/80">
                The Controller&apos;s own customers and contacts are not data subjects of this
                processing, because business record contents are not read.
              </p>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-grove-ink dark:text-grove-ink-dk mb-4">
            3. Processor Obligations
          </h2>
          <div className="text-grove-ink/85 dark:text-grove-ink-dk/85 space-y-4">
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
                Delete all Personal Data held for the Controller&apos;s org on request or upon
                termination (Section 10)
              </li>
              <li>
                Make available to the Controller all information necessary to demonstrate
                compliance
              </li>
            </ul>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-grove-ink dark:text-grove-ink-dk mb-4">
            4. Security Measures
          </h2>
          <div className="text-grove-ink/85 dark:text-grove-ink-dk/85 space-y-4">
            <p>
              The Processor implements the following technical and organizational measures
              (GDPR Article 32):
            </p>

            <div>
              <h3 className="text-lg font-semibold text-grove-ink dark:text-grove-ink-dk mb-2">
                4.1 Technical Measures
              </h3>
              <ul className="list-disc pl-6 space-y-1">
                <li>
                  AES-256 application-level encryption of Salesforce OAuth access and refresh
                  tokens at rest. Other stored data is not encrypted by Newton at the
                  application level and relies on the hosting provider&apos;s infrastructure.
                </li>
                <li>TLS (HTTPS) for data in transit</li>
                <li>
                  Salesforce connection via OAuth 2.0 authorization-code flow with PKCE and a
                  signed, short-lived state value (CSRF protection)
                </li>
                <li>
                  Individual Newton accounts created only by administrator invitation and
                  activation; bcrypt password hashing (cost factor 12); rate-limited sign-in
                </li>
                <li>Signed, HTTP-only, Secure session cookies with a 7-day expiry</li>
                <li>
                  Role-based access control: administrators (all client orgs; the only role
                  that can delete data, write back to Salesforce, or manage users), analysts
                  (granted orgs only), viewers and auditors (granted orgs, read-only). Account
                  status and org access are re-checked server-side on every request.
                </li>
                <li>Per-org keys, issued by an administrator, for the Newton Salesforce package</li>
                <li>
                  Audit logging of sign-ins, access to sensitive data, syncs, Salesforce
                  connections, write-backs, and deletions, retained 365 days
                </li>
                <li>
                  Data minimisation: no business record contents; record IDs from sharing data
                  hashed before storage; login IP addresses and coordinates not stored
                </li>
                <li>Automatic deletion of data past its retention period (Section 10)</li>
                <li>Multi-factor authentication on infrastructure operator accounts (hosting, source control, email). MFA on in-app user accounts is on the roadmap but is not currently required.</li>
              </ul>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-grove-ink dark:text-grove-ink-dk mb-2">
                4.2 Organizational Measures
              </h3>
              <ul className="list-disc pl-6 space-y-1">
                <li>Confidentiality obligations for personnel authorized to process Personal Data</li>
                <li>Production access limited to the maintainer</li>
                <li>Incident response procedures</li>
                <li>Data breach notification process (72-hour requirement)</li>
                <li>
                  No independent security audit or penetration test has been performed to
                  date; one is planned
                </li>
              </ul>
            </div>

            <p className="mt-4">
              For detailed security information, see our{' '}
              <a
                href="/legal/security"
                className="text-primary-700 dark:text-primary-400 hover:underline"
              >
                Security Practices
              </a>{' '}
              page.
            </p>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-grove-ink dark:text-grove-ink-dk mb-4">
            5. Sub-processors
          </h2>
          <div className="text-grove-ink/85 dark:text-grove-ink-dk/85 space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-grove-ink dark:text-grove-ink-dk mb-2">
                5.1 General Authorization
              </h3>
              <p>
                The Controller provides general authorization for the Processor to engage
                Sub-processors, subject to the conditions in this section.
              </p>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-grove-ink dark:text-grove-ink-dk mb-2">
                5.2 Current Sub-processors
              </h3>
              <div className="mt-2 overflow-hidden border border-grove-border dark:border-grove-border-dk rounded-lg">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead className="bg-primary-50/40 dark:bg-grove-surface-dk">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-grove-ink/55 dark:text-grove-ink/50 uppercase">
                        Sub-processor
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-grove-ink/55 dark:text-grove-ink/50 uppercase">
                        Service
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-grove-ink/55 dark:text-grove-ink/50 uppercase">
                        Location
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    <tr>
                      <td className="px-4 py-3 text-sm text-grove-ink dark:text-grove-ink-dk">
                        Salesforce
                      </td>
                      <td className="px-4 py-3 text-sm text-grove-ink/85 dark:text-grove-ink-dk/85">
                        Source of data + OAuth 2.0 token exchange
                      </td>
                      <td className="px-4 py-3 text-sm text-grove-ink/85 dark:text-grove-ink-dk/85">
                        Global
                      </td>
                    </tr>
                    <tr>
                      <td className="px-4 py-3 text-sm text-grove-ink dark:text-grove-ink-dk">
                        Railway
                      </td>
                      <td className="px-4 py-3 text-sm text-grove-ink/85 dark:text-grove-ink-dk/85">
                        Backend API hosting + managed PostgreSQL database
                      </td>
                      <td className="px-4 py-3 text-sm text-grove-ink/85 dark:text-grove-ink-dk/85">
                        US
                      </td>
                    </tr>
                    <tr>
                      <td className="px-4 py-3 text-sm text-grove-ink dark:text-grove-ink-dk">
                        Hosting provider
                      </td>
                      <td className="px-4 py-3 text-sm text-grove-ink/85 dark:text-grove-ink-dk/85">
                        Web front-end hosting
                      </td>
                      <td className="px-4 py-3 text-sm text-grove-ink/85 dark:text-grove-ink-dk/85">
                        Available on request
                      </td>
                    </tr>
                    <tr>
                      <td className="px-4 py-3 text-sm text-grove-ink dark:text-grove-ink-dk">
                        Resend
                      </td>
                      <td className="px-4 py-3 text-sm text-grove-ink/85 dark:text-grove-ink-dk/85">
                        Transactional email (account invitations only)
                      </td>
                      <td className="px-4 py-3 text-sm text-grove-ink/85 dark:text-grove-ink-dk/85">
                        US
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-grove-ink dark:text-grove-ink-dk mb-2">
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
              <h3 className="text-lg font-semibold text-grove-ink dark:text-grove-ink-dk mb-2">
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
          <h2 className="text-2xl font-bold text-grove-ink dark:text-grove-ink-dk mb-4">
            6. Data Subject Rights
          </h2>
          <div className="text-grove-ink/85 dark:text-grove-ink-dk/85 space-y-4">
            <p>
              The Processor shall assist the Controller in fulfilling Data Subject rights
              requests under GDPR Articles 15-22:
            </p>

            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong>Right of Access (Article 15):</strong> The Privacy page in the app
                shows per-category counts of the records held for the Controller&apos;s org; on
                request, the Processor exports this inventory to the Controller
              </li>
              <li>
                <strong>Right to Rectification (Article 16):</strong> Newton&apos;s copy is
                read from Salesforce; corrections made in Salesforce replace the stored data on
                the next sync
              </li>
              <li>
                <strong>Right to Erasure (Article 17):</strong> A Newton administrator can
                delete the Controller&apos;s org from Newton. This revokes Newton&apos;s OAuth
                grant in Salesforce and permanently deletes every stored record for that org
                (all metadata, user data, analyses, reports, audit logs, and settings). It
                cannot be undone.
              </li>
              <li>
                <strong>Right to Data Portability (Article 20):</strong> The Personal Data
                Newton holds is a copy of data that remains in the Controller&apos;s Salesforce
                org; the Processor can provide the inventory described above
              </li>
              <li>
                <strong>Right to Object / Restrict Processing (Articles 18 and 21):</strong>{' '}
                Revoking Newton&apos;s connected-app access in Salesforce stops all further
                reads; data already held then ages out under Section 10, or can be erased
                immediately as above
              </li>
            </ul>

            <p className="mt-4">
              The Processor will respond to Data Subject requests forwarded by the Controller
              within 10 business days, or sooner if required by law.
            </p>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-grove-ink dark:text-grove-ink-dk mb-4">
            7. Data Breach Notification
          </h2>
          <div className="text-grove-ink/85 dark:text-grove-ink-dk/85 space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-grove-ink dark:text-grove-ink-dk mb-2">
                7.1 Notification Obligation
              </h3>
              <p>
                The Processor shall notify the Controller without undue delay (and in no event
                later than 72 hours) after becoming aware of a Personal Data breach affecting
                the Controller's data.
              </p>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-grove-ink dark:text-grove-ink-dk mb-2">
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
              <h3 className="text-lg font-semibold text-grove-ink dark:text-grove-ink-dk mb-2">
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
          <h2 className="text-2xl font-bold text-grove-ink dark:text-grove-ink-dk mb-4">
            8. International Data Transfers
          </h2>
          <div className="text-grove-ink/85 dark:text-grove-ink-dk/85 space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-grove-ink dark:text-grove-ink-dk mb-2">
                8.1 Transfer Mechanism
              </h3>
              <p>
                For transfers of Personal Data from the EEA to countries without an adequacy
                decision, the parties agree to use the European Commission's Standard
                Contractual Clauses (SCCs) as the legal mechanism.
              </p>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-grove-ink dark:text-grove-ink-dk mb-2">
                8.2 Additional Safeguards
              </h3>
              <ul className="list-disc pl-6 space-y-1">
                <li>TLS (HTTPS) for data in transit</li>
                <li>
                  AES-256 encryption of Salesforce OAuth tokens at rest; other stored data
                  relies on the hosting provider&apos;s infrastructure
                </li>
                <li>
                  Data minimization: no business record contents read; record IDs from sharing
                  data hashed before storage; login IP addresses and coordinates not stored
                </li>
                <li>Automatic deletion under the retention periods in Section 10</li>
              </ul>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-grove-ink dark:text-grove-ink-dk mb-4">
            9. Audits and Inspections
          </h2>
          <div className="text-grove-ink/85 dark:text-grove-ink-dk/85 space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-grove-ink dark:text-grove-ink-dk mb-2">
                9.1 Audit Rights
              </h3>
              <p>
                The Controller may audit the Processor's compliance with this DPA up to once
                per year, upon 30 days' written notice, during normal business hours.
              </p>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-grove-ink dark:text-grove-ink-dk mb-2">
                9.2 Third-Party Audits
              </h3>
              <p>
                The Processor does not currently hold a SOC 2 Type II or ISO 27001 attestation. Where the Processor obtains such attestations in the future, copies will be made available to the Controller upon request, subject to reasonable confidentiality obligations. In the interim, the Processor will make its subprocessors&apos; publicly available security posture documentation accessible to the Controller.
              </p>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-grove-ink dark:text-grove-ink-dk mb-4">
            10. Data Deletion and Return
          </h2>
          <div className="text-grove-ink/85 dark:text-grove-ink-dk/85 space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-grove-ink dark:text-grove-ink-dk mb-2">
                10.1 Automatic Retention
              </h3>
              <p>
                A daily job deletes data past the following retention periods. A Newton
                administrator can also run it on demand.
              </p>
              <ul className="list-disc pl-6 mt-2 space-y-1">
                <li>
                  Salesforce metadata and user data: deleted when not refreshed by a sync for
                  90 days, so data from a finished engagement ages out automatically
                </li>
                <li>
                  Analysis results (anomalies, risk scores, findings, sprawl, compliance, and
                  data-quality results): 180 days
                </li>
                <li>Audit logs: 365 days</li>
                <li>Sync history: 30 days (the most recent sync record is kept)</li>
                <li>
                  Consultant-authored configuration (price book, report branding, saved
                  restructure plans, VIP designations) and the Salesforce connection: kept
                  until the client org is deleted
                </li>
              </ul>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-grove-ink dark:text-grove-ink-dk mb-2">
                10.2 Deletion on Request or Termination
              </h3>
              <p>
                On the Controller&apos;s request, or upon termination of the Service Agreement,
                a Newton administrator deletes the Controller&apos;s org from Newton. This
                revokes Newton&apos;s OAuth grant in Salesforce and permanently deletes every
                stored record for that org (all metadata, user data, analyses, reports, audit
                logs, and settings). It cannot be undone.
              </p>
              <p className="mt-2">
                Before deletion, the Controller may request the inventory described in Section
                6. The source data remains in the Controller&apos;s Salesforce org.
              </p>
            </div>

            <p className="mt-4">
              The Processor may retain Personal Data to the extent required by applicable law,
              subject to continuing confidentiality and security obligations.
            </p>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-grove-ink dark:text-grove-ink-dk mb-4">
            11. Liability and Indemnification
          </h2>
          <div className="text-grove-ink/85 dark:text-grove-ink-dk/85 space-y-4">
            <p>
              Each party's liability under this DPA shall be subject to the limitations of
              liability set forth in the Service Agreement. The Processor shall indemnify the
              Controller for any fines, penalties, or damages resulting from the Processor's
              non-compliance with this DPA.
            </p>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-grove-ink dark:text-grove-ink-dk mb-4">
            12. Contact Information
          </h2>
          <div className="text-grove-ink/85 dark:text-grove-ink-dk/85 space-y-4">
            <p>For DPA-related questions or to execute a signed DPA:</p>
            <div className="mt-4 p-4 bg-primary-50 dark:bg-grove-surface-dk rounded-lg">
              <p>
                <strong>Email:</strong>{' '}
                <a
                  href="mailto:dpa@accessgraph.ai"
                  className="text-primary-700 dark:text-primary-400 hover:underline"
                >
                  dpa@accessgraph.ai
                </a>
              </p>
              <p className="mt-2">
                <strong>Data Protection Officer:</strong>{' '}
                <a
                  href="mailto:dpo@accessgraph.ai"
                  className="text-primary-700 dark:text-primary-400 hover:underline"
                >
                  dpo@accessgraph.ai
                </a>
              </p>
              <p className="mt-2">
                <strong>Legal Department:</strong> Newton, Inc.
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
