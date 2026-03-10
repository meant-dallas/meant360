import { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Terms of Service | MEANT 360',
  description: 'Terms of Service for the MEANT 360 community platform',
};

export default function TermsOfServicePage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-300">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <Link href="/" className="text-sm text-blue-400 hover:text-blue-300 mb-8 inline-block">&larr; Back to home</Link>

        <h1 className="text-3xl font-bold text-white mb-2">Terms of Service</h1>
        <p className="text-sm text-slate-500 mb-10">Last updated: March 10, 2026</p>

        <div className="space-y-8 text-sm leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold text-white mb-3">1. Acceptance of Terms</h2>
            <p>
              By accessing or using MEANT 360 (&quot;the Platform&quot;), the community platform of the Malayalee Engineers&apos; Association of North Texas (&quot;MEANT&quot;), you agree to be bound by these Terms of Service. If you do not agree, please do not use the Platform.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">2. Eligibility</h2>
            <p>
              The Platform is available to MEANT members, prospective members, and event attendees. Administrative access is restricted to authorized committee members and officers of the association.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">3. Account and Access</h2>
            <ul className="list-disc list-inside space-y-1 text-slate-400">
              <li>You may sign in using Google OAuth or email-based one-time password (OTP)</li>
              <li>You are responsible for maintaining the security of your account credentials</li>
              <li>Access to the Platform is granted based on your membership status and role</li>
              <li>We reserve the right to suspend or terminate access at any time</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">4. Acceptable Use</h2>
            <p className="mb-3">You agree not to:</p>
            <ul className="list-disc list-inside space-y-1 text-slate-400">
              <li>Use the Platform for any unlawful purpose</li>
              <li>Attempt to gain unauthorized access to any part of the Platform</li>
              <li>Share your login credentials with others</li>
              <li>Submit false or misleading information</li>
              <li>Interfere with or disrupt the Platform&apos;s operation</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">5. Payments and Refunds</h2>
            <p>
              Event registration fees and membership dues are processed through third-party payment providers (Square and PayPal). All payments are subject to the respective provider&apos;s terms. Refund requests are handled on a case-by-case basis by the MEANT committee — please contact us directly for refund inquiries.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">6. Intellectual Property</h2>
            <p>
              The Platform and its content, including design, code, and branding, are the property of MEANT. You may not reproduce, distribute, or create derivative works without prior written permission.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">7. Disclaimer of Warranties</h2>
            <p>
              The Platform is provided &quot;as is&quot; and &quot;as available&quot; without warranties of any kind, either express or implied. MEANT does not guarantee that the Platform will be uninterrupted, error-free, or secure at all times.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">8. Limitation of Liability</h2>
            <p>
              MEANT and its officers, committee members, and volunteers shall not be liable for any indirect, incidental, or consequential damages arising from your use of the Platform.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">9. Changes to Terms</h2>
            <p>
              We may update these Terms from time to time. Continued use of the Platform after changes constitutes acceptance of the updated Terms.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-white mb-3">10. Contact Us</h2>
            <p>
              For questions about these Terms, please contact us at{' '}
              <a href="mailto:info@meantdallas.org" className="text-blue-400 hover:text-blue-300">info@meantdallas.org</a>.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
