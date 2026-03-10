import { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Privacy Policy | MEANT 360',
  description: 'Privacy Policy for the MEANT 360 community platform',
};

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-300">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <Link href="/" className="text-sm text-blue-400 hover:text-blue-300 mb-8 inline-block">&larr; Back to home</Link>

        <h1 className="text-3xl font-bold text-white mb-2">Privacy Policy</h1>
        <p className="text-sm text-slate-500 mb-10">Last updated: March 10, 2026</p>

        <div className="space-y-8 text-sm leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold text-white mb-3">1. Introduction</h2>
            <p>
              MEANT 360 is the community platform of the Malayalee Engineers&apos; Association of North Texas (&quot;MEANT&quot;, &quot;we&quot;, &quot;us&quot;, or &quot;our&quot;). This Privacy Policy explains how we collect, use, and protect your personal information when you use our platform.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">2. Information We Collect</h2>
            <p className="mb-3">We collect information that you provide directly to us:</p>
            <ul className="list-disc list-inside space-y-1 text-slate-400">
              <li>Name, email address, and phone number</li>
              <li>Google account profile information (name, email, profile photo) when you sign in with Google</li>
              <li>Membership and registration details</li>
              <li>Event attendance and participation records</li>
              <li>Payment information for event registrations and membership fees (processed by Square and PayPal; we do not store card details)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">3. How We Use Your Information</h2>
            <ul className="list-disc list-inside space-y-1 text-slate-400">
              <li>To manage your membership and provide access to the member portal</li>
              <li>To process event registrations, check-ins, and payments</li>
              <li>To communicate with you about events, membership renewals, and association updates</li>
              <li>To generate reports for association administration</li>
              <li>To improve and maintain the platform</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">4. Information Sharing</h2>
            <p>
              We do not sell, trade, or rent your personal information to third parties. We may share your information only in the following circumstances:
            </p>
            <ul className="list-disc list-inside space-y-1 text-slate-400 mt-3">
              <li>With payment processors (Square, PayPal) to process transactions</li>
              <li>With email service providers to send communications</li>
              <li>With association committee members who need access to fulfill their roles</li>
              <li>When required by law or to protect our rights</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">5. Data Security</h2>
            <p>
              We implement appropriate security measures to protect your personal information, including encrypted connections (HTTPS), secure authentication, and role-based access controls. Your data is stored on secure cloud infrastructure with industry-standard protections.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">6. Google User Data</h2>
            <p>
              When you sign in with Google, we access your basic profile information (name, email, and profile photo) solely for authentication and account identification purposes. We do not access your Google contacts, calendar, drive, or any other Google services. You can revoke access at any time through your Google Account settings.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">7. Cookies and Analytics</h2>
            <p>
              We use essential cookies for authentication and session management. We may use Google Analytics to understand platform usage patterns. No advertising cookies or trackers are used.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">8. Your Rights</h2>
            <p>You have the right to:</p>
            <ul className="list-disc list-inside space-y-1 text-slate-400 mt-3">
              <li>Access your personal information through the member portal</li>
              <li>Request correction of inaccurate information</li>
              <li>Request deletion of your account and associated data</li>
              <li>Opt out of non-essential communications</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">9. Contact Us</h2>
            <p>
              If you have questions about this Privacy Policy or your personal data, please contact us at{' '}
              <a href="mailto:info@meantdallas.org" className="text-blue-400 hover:text-blue-300">info@meantdallas.org</a>.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
