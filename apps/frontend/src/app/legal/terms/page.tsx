'use client'

/**
 * Terms of Service Page
 * Legal terms and conditions for AccessGraph AI
 */

import { FileText } from 'lucide-react'

export default function TermsOfServicePage() {
  return (
    <div className="max-w-4xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-gray-900 dark:text-white">
          Terms of Service
        </h1>
        <p className="mt-4 text-lg text-gray-600 dark:text-gray-400">
          Last updated: {new Date().toLocaleDateString()}
        </p>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          Please read these terms carefully before using AccessGraph AI.
        </p>
      </div>

      {/* Main Content */}
      <div className="prose prose-gray dark:prose-invert max-w-none space-y-8">
        <section>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
            1. Acceptance of Terms
          </h2>
          <div className="text-gray-700 dark:text-gray-300 space-y-4">
            <p>
              By accessing or using AccessGraph AI ("the Service"), you agree to be bound by
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
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
            2. Description of Service
          </h2>
          <div className="text-gray-700 dark:text-gray-300 space-y-4">
            <p>
              AccessGraph AI is a Salesforce access analysis and security intelligence
              platform that:
            </p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Analyzes your Salesforce organization's permission structure</li>
              <li>Identifies security anomalies and excessive access rights</li>
              <li>Provides AI-powered recommendations for access optimization</li>
              <li>Visualizes access relationships and sharing rules</li>
              <li>Generates compliance reports and audit trails</li>
            </ul>
            <p className="mt-4 font-medium">
              The Service operates as a read-only analysis tool and does not modify your
              Salesforce configuration.
            </p>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
            3. Account Registration
          </h2>
          <div className="text-gray-700 dark:text-gray-300 space-y-4">
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
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
            4. Acceptable Use Policy
          </h2>
          <div className="text-gray-700 dark:text-gray-300 space-y-4">
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
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
            5. Data Collection and Privacy
          </h2>
          <div className="text-gray-700 dark:text-gray-300 space-y-4">
            <p>
              The Service collects and processes Salesforce metadata as described in our{' '}
              <a
                href="/legal/privacy"
                className="text-blue-600 dark:text-blue-400 hover:underline"
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
            <p className="mt-4 font-medium text-blue-600 dark:text-blue-400">
              Important: We never access your actual customer records (Accounts, Opportunities,
              etc.). We only analyze permission structures.
            </p>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
            6. Intellectual Property
          </h2>
          <div className="text-gray-700 dark:text-gray-300 space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                6.1 Our IP
              </h3>
              <p>
                The Service, including all software, algorithms, documentation, and branding,
                is owned by AccessGraph AI and protected by copyright, trademark, and other
                intellectual property laws. You may not copy, modify, or create derivative
                works without our written permission.
              </p>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
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
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
            7. Service Availability
          </h2>
          <div className="text-gray-700 dark:text-gray-300 space-y-4">
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
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
            8. Warranties and Disclaimers
          </h2>
          <div className="text-gray-700 dark:text-gray-300 space-y-4">
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
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
            9. Limitation of Liability
          </h2>
          <div className="text-gray-700 dark:text-gray-300 space-y-4">
            <p className="uppercase font-semibold">
              TO THE MAXIMUM EXTENT PERMITTED BY LAW:
            </p>
            <p>
              AccessGraph AI shall not be liable for any indirect, incidental, special,
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
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
            10. Indemnification
          </h2>
          <div className="text-gray-700 dark:text-gray-300 space-y-4">
            <p>
              You agree to indemnify and hold harmless AccessGraph AI from any claims,
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
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
            11. Termination
          </h2>
          <div className="text-gray-700 dark:text-gray-300 space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                11.1 By You
              </h3>
              <p>
                You may terminate your account at any time by disconnecting your Salesforce
                organization or using the "Delete All Data" feature in your Privacy Dashboard.
              </p>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                11.2 By Us
              </h3>
              <p>
                We may suspend or terminate your access immediately if you violate these
                Terms or engage in fraudulent, abusive, or illegal activity.
              </p>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
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
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
            12. Salesforce AppExchange Terms
          </h2>
          <div className="text-gray-700 dark:text-gray-300 space-y-4">
            <p>
              If you installed AccessGraph AI from the Salesforce AppExchange, you also agree
              to Salesforce's{' '}
              <a
                href="https://appexchange.salesforce.com/appxStore"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 dark:text-blue-400 hover:underline"
              >
                AppExchange Terms of Use
              </a>
              .
            </p>
            <p>
              The Service operates as a connected app and is subject to Salesforce's OAuth
              policies and API usage limits.
            </p>
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
            13. Governing Law
          </h2>
          <div className="text-gray-700 dark:text-gray-300 space-y-4">
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
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
            14. Changes to Terms
          </h2>
          <div className="text-gray-700 dark:text-gray-300 space-y-4">
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
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
            15. Contact Information
          </h2>
          <div className="text-gray-700 dark:text-gray-300 space-y-4">
            <p>For questions about these Terms:</p>
            <div className="mt-4 p-4 bg-gray-100 dark:bg-gray-800 rounded-lg">
              <p>
                <strong>Email:</strong>{' '}
                <a
                  href="mailto:legal@accessgraph.ai"
                  className="text-blue-600 dark:text-blue-400 hover:underline"
                >
                  legal@accessgraph.ai
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
