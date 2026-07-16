'use client'

/**
 * Terms of Service Page
 * Legal terms and conditions for Newton
 */

import { FileText } from 'lucide-react'

export default function TermsOfServicePage() {
  return (
    <div className="max-w-4xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-grove-ink dark:text-grove-ink-dk">
          Terms of Service
        </h1>
        <p className="mt-4 text-lg text-grove-ink/70 dark:text-grove-ink/50">
          Last updated: {new Date().toLocaleDateString()}
        </p>
        <p className="mt-2 text-grove-ink/70 dark:text-grove-ink/50">
          Please read these terms carefully before using Newton.
        </p>
      </div>

      {/* Main Content */}
      <div className="prose prose-gray dark:prose-invert max-w-none space-y-8">
        <section>
          <h2 className="text-2xl font-bold text-grove-ink dark:text-grove-ink-dk mb-4">
            1. Acceptance of Terms
          </h2>
          <div className="text-grove-ink/85 dark:text-grove-ink-dk/85 space-y-4">
            <p>
              By accessing or using Newton ("the Service"), you agree to be bound by
              these Terms of Service ("Terms"). If you disagree with any part of these terms,
              you may not access the Service.
            </p>
            <p>
              These Terms apply to all users of the Service, including organizations,
              administrators, and individual users accessing the dashboard.
            </p>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-grove-ink dark:text-grove-ink-dk mb-4">
            2. Description of Service
          </h2>
          <div className="text-grove-ink/85 dark:text-grove-ink-dk/85 space-y-4">
            <p>
              Newton is a Salesforce access analysis and security intelligence
              platform that:
            </p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Analyzes your Salesforce organization's permission structure</li>
              <li>Identifies security anomalies and excessive access rights</li>
              <li>Provides AI-powered recommendations for access optimization</li>
              <li>Visualizes access relationships and sharing rules</li>
              <li>Generates compliance reports and audit trails</li>
            </ul>
            <p className="mt-4 text-sm text-grove-ink/85 dark:text-grove-ink-dk/85">
              The Service is primarily a read-only analysis tool. Two opt-in features write back to Salesforce when you explicitly use them:
            </p>
            <ul className="list-disc pl-6 mt-2 space-y-1 text-sm">
              <li>
                <strong>Org Chart editor</strong> — updates User.ManagerId and User.DelegatedApproverId when you drag-and-save an org-chart change
              </li>
              <li>
                <strong>Restructure Studio plan export</strong> — generates a plan that you (the admin) apply manually in Salesforce Setup; the app itself does not push those changes
              </li>
            </ul>
            <p className="mt-2 text-sm text-grove-ink/85 dark:text-grove-ink-dk/85">
              Every write is initiated by a user action inside the product and audit-logged. The Service never modifies your Salesforce configuration silently or on a schedule.
            </p>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-grove-ink dark:text-grove-ink-dk mb-4">
            3. Account Registration
          </h2>
          <div className="text-grove-ink/85 dark:text-grove-ink-dk/85 space-y-4">
            <p>
              To use the Service, you must connect a valid Salesforce organization through
              OAuth authentication. You agree to:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                Provide accurate and complete information during registration
              </li>
              <li>
                Maintain the security of your Salesforce credentials
              </li>
              <li>
                Notify us immediately of any unauthorized access to your account
              </li>
              <li>
                Accept responsibility for all activities under your account
              </li>
            </ul>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-grove-ink dark:text-grove-ink-dk mb-4">
            4. Acceptable Use Policy
          </h2>
          <div className="text-grove-ink/85 dark:text-grove-ink-dk/85 space-y-4">
            <p>You agree NOT to:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                Use the Service for any unlawful purpose or in violation of any regulations
              </li>
              <li>
                Attempt to gain unauthorized access to the Service or other users' data
              </li>
              <li>
                Interfere with or disrupt the Service or servers/networks connected to it
              </li>
              <li>
                Use automated systems (bots, scrapers) to access the Service without
                permission
              </li>
              <li>
                Reverse engineer, decompile, or disassemble any part of the Service
              </li>
              <li>
                Remove or obscure any proprietary notices or labels
              </li>
            </ul>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-grove-ink dark:text-grove-ink-dk mb-4">
            5. Data Collection and Privacy
          </h2>
          <div className="text-grove-ink/85 dark:text-grove-ink-dk/85 space-y-4">
            <p>
              The Service collects and processes Salesforce metadata as described in our{' '}
              <a
                href="/legal/privacy"
                className="text-primary-700 dark:text-primary-400 hover:underline"
              >
                Privacy Policy
              </a>
              . By using the Service, you:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                Authorize us to access your Salesforce organization's permission metadata
              </li>
              <li>
                Confirm you have the necessary rights to share this data with us
              </li>
              <li>
                Agree to our data retention and security practices
              </li>
            </ul>
            <p className="mt-4 text-sm text-grove-ink/85 dark:text-grove-ink-dk/85">
              Newton is a permissions-first product. Some analytics features (Data Quality scoring, License Fit right-sizing, Change Risk Radar) do read a limited amount of record-level data — always sampled or aggregated, never bulk-exported. See our{' '}
              <a href="/legal/privacy" className="text-primary-700 dark:text-primary-400 underline">
                Privacy Policy
              </a>{' '}
              for the exact list.
            </p>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-grove-ink dark:text-grove-ink-dk mb-4">
            6. Intellectual Property
          </h2>
          <div className="text-grove-ink/85 dark:text-grove-ink-dk/85 space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-grove-ink dark:text-grove-ink-dk mb-2">
                6.1 Our IP
              </h3>
              <p>
                The Service, including all software, algorithms, documentation, and branding,
                is owned by Newton and protected by copyright, trademark, and other
                intellectual property laws. You may not copy, modify, or create derivative
                works without our written permission.
              </p>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-grove-ink dark:text-grove-ink-dk mb-2">
                6.2 Your Data
              </h3>
              <p>
                You retain all rights to your Salesforce data. We claim no ownership over your
                data and will only use it as described in these Terms and our Privacy Policy.
              </p>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-grove-ink dark:text-grove-ink-dk mb-4">
            7. Service Availability
          </h2>
          <div className="text-grove-ink/85 dark:text-grove-ink-dk/85 space-y-4">
            <p>
              We strive to maintain high availability but do not guarantee uninterrupted
              access. The Service may be unavailable due to:
            </p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Scheduled maintenance (with advance notice)</li>
              <li>Emergency maintenance or security patches</li>
              <li>Force majeure events beyond our control</li>
              <li>Third-party service outages (Salesforce, hosting providers)</li>
            </ul>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-grove-ink dark:text-grove-ink-dk mb-4">
            8. Warranties and Disclaimers
          </h2>
          <div className="text-grove-ink/85 dark:text-grove-ink-dk/85 space-y-4">
            <p className="uppercase font-semibold">
              THE SERVICE IS PROVIDED "AS IS" WITHOUT WARRANTIES OF ANY KIND.
            </p>
            <p>
              We disclaim all warranties, express or implied, including but not limited to:
            </p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Merchantability and fitness for a particular purpose</li>
              <li>Accuracy, completeness, or reliability of analysis results</li>
              <li>Compatibility with all Salesforce configurations</li>
              <li>Freedom from errors, bugs, or security vulnerabilities</li>
            </ul>
            <p className="mt-4 font-medium">
              The Service provides analysis and recommendations but does not guarantee
              security. You are responsible for implementing security controls in your
              Salesforce organization.
            </p>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-grove-ink dark:text-grove-ink-dk mb-4">
            9. Limitation of Liability
          </h2>
          <div className="text-grove-ink/85 dark:text-grove-ink-dk/85 space-y-4">
            <p className="uppercase font-semibold">
              TO THE MAXIMUM EXTENT PERMITTED BY LAW:
            </p>
            <p>
              Newton shall not be liable for any indirect, incidental, special,
              consequential, or punitive damages, including:
            </p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Loss of profits, data, or business opportunities</li>
              <li>Security breaches in your Salesforce organization</li>
              <li>Damages resulting from reliance on analysis or recommendations</li>
              <li>Damages from unauthorized access or data breaches</li>
            </ul>
            <p className="mt-4">
              Our total liability for any claim shall not exceed the amount you paid for the
              Service in the 12 months preceding the claim.
            </p>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-grove-ink dark:text-grove-ink-dk mb-4">
            10. Indemnification
          </h2>
          <div className="text-grove-ink/85 dark:text-grove-ink-dk/85 space-y-4">
            <p>
              You agree to indemnify and hold harmless Newton from any claims,
              damages, or expenses arising from:
            </p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Your violation of these Terms</li>
              <li>Your violation of any law or regulation</li>
              <li>Your violation of third-party rights</li>
              <li>Unauthorized access to the Service from your account</li>
            </ul>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-grove-ink dark:text-grove-ink-dk mb-4">
            11. Termination
          </h2>
          <div className="text-grove-ink/85 dark:text-grove-ink-dk/85 space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-grove-ink dark:text-grove-ink-dk mb-2">
                11.1 By You
              </h3>
              <p>
                You may terminate your account at any time by disconnecting your Salesforce
                organization or using the "Delete All Data" feature in your Privacy Dashboard.
              </p>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-grove-ink dark:text-grove-ink-dk mb-2">
                11.2 By Us
              </h3>
              <p>
                We may suspend or terminate your access immediately if you violate these
                Terms or engage in fraudulent, abusive, or illegal activity.
              </p>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-grove-ink dark:text-grove-ink-dk mb-2">
                11.3 Effect of Termination
              </h3>
              <p>
                Upon termination, we will delete your data according to our retention
                policies. You may request immediate deletion under GDPR Article 17 (Right to
                Erasure).
              </p>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-grove-ink dark:text-grove-ink-dk mb-4">
            12. Salesforce Terms
          </h2>
          <div className="text-grove-ink/85 dark:text-grove-ink-dk/85 space-y-4">
            <p>
              Newton is not currently listed on the Salesforce AppExchange. When Newton is submitted for and passes the Salesforce Security Review, this section will be updated to reference the AppExchange Terms of Use.
            </p>
            <p>
              In the meantime, the Service operates as a Salesforce Connected App and is subject to Salesforce&apos;s OAuth policies, API usage limits, and the terms of the Salesforce customer agreement you have with Salesforce for your org.
            </p>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-grove-ink dark:text-grove-ink-dk mb-4">
            13. Governing Law
          </h2>
          <div className="text-grove-ink/85 dark:text-grove-ink-dk/85 space-y-4">
            <p>
              These Terms shall be governed by and construed in accordance with the laws of
              the State of California, United States, without regard to conflict of law
              principles.
            </p>
            <p>
              Any disputes shall be resolved through binding arbitration in accordance with
              the rules of the American Arbitration Association.
            </p>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-grove-ink dark:text-grove-ink-dk mb-4">
            14. Changes to Terms
          </h2>
          <div className="text-grove-ink/85 dark:text-grove-ink-dk/85 space-y-4">
            <p>
              We may modify these Terms at any time. We will notify you of material changes
              by:
            </p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Updating the "Last updated" date</li>
              <li>Sending email notification</li>
              <li>Displaying a notice in the dashboard</li>
            </ul>
            <p className="mt-2">
              Continued use of the Service after changes constitutes acceptance of the new
              Terms.
            </p>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-grove-ink dark:text-grove-ink-dk mb-4">
            15. Contact Information
          </h2>
          <div className="text-grove-ink/85 dark:text-grove-ink-dk/85 space-y-4">
            <p>For questions about these Terms:</p>
            <div className="mt-4 p-4 bg-primary-50 dark:bg-grove-surface-dk rounded-lg">
              <p>
                <strong>Email:</strong>{' '}
                <a
                  href="mailto:legal@accessgraph.ai"
                  className="text-primary-700 dark:text-primary-400 hover:underline"
                >
                  legal@accessgraph.ai
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
