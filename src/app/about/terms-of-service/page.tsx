import Link from 'next/link';

import CofrnLayout from '@/components/layout';

export const metadata = {
  title: 'Terms of Service | COFRN',
  description: 'Terms of service for COFRN',
};

export default function Page() {
  return <CofrnLayout
    pageConfig={{
      title: 'Terms of Service',
      requireAuth: false,
      requireAdmin: false,
    }}
  >
    <p><i>Effective Date: May 9, 2026</i></p>

    <h4>1. Acceptance of Terms</h4>
    <p>By accessing or using this website (the &quot;Service&quot;), you agree to be bound by these
      Terms of Service. If you are using the Service on behalf of an organization (an
      &quot;Institutional User&quot;), you represent that you have the authority to bind that
      organization to these terms.</p>

    <h4>2. Purpose of Service</h4>
    <p>The Service provides paging alerts and intra-agency chat tools intended for professional
      first responders. <strong>The Service is a supplemental tool and should not be relied upon as
        a primary or sole life-safety communication system.</strong> Message frequency varies
      based on the number of pages your department receives and amount of activity in the department
      group chats.</p>

    <h4>3. User Accounts & Eligibility</h4>
    <ul>
      <li><strong>Professional Use:</strong> You represent that you are a qualified first responder
        or authorized personnel affiliated with an Institutional User.</li>
      <li><strong>Security:</strong> You are responsible for maintaining the confidentiality of your
        login credentials.</li>
      <li><strong>Accuracy:</strong> You agree to provide accurate and current contact information
        to ensure the delivery of alerts. If you change your mobile number, please update your
        preferences.</li>
    </ul>

    <h4>4. Payment Terms (Institutional)</h4>
    <p>For Institutional Users, payment is accepted via check. We reserve the right to suspend or
      terminate access if payments are not received within the specified timeframe.</p>

    <p>Message and data rates may apply to the recipients of any text or RCS based
      communications.</p>

    <h4>5. User Generated Content & Chat</h4>
    <ul>
      <li><strong>Agency Responsibility:</strong> The chat service is provided for professional
        intra-agency discussion. The relevant Institutional User is responsible for the content
        posted by its users.</li>
      <li><strong>Monitoring:</strong> We reserve the right to remove content that violates these
        Terms or is reported as a security risk.</li>
      <li><strong>Confidentiality:</strong> Users are responsible for ensuring that information
        shared within the chat complies with internal agency policies and applicable laws (e.g.,
        HIPAA, CJIS).</li>
    </ul>

    <h4>6. Prohibited Conduct</h4>
    <p>You agree not to:</p>
    <ul>
      <li>Use the Service for any purpose other than professional emergency notification and
        authorized intra-agency communication.</li>
      <li>Post or transmit any content that is unlawful, defamatory, or violates privacy
        rights.</li>
      <li>Attempt to interfere with the proper working of the Service or bypass any security
        measures.</li>
    </ul>

    <h4>7. Disclaimers & Limitation of Liability</h4>
    <ul>
      <li><strong>&quot;As-Is&quot; Basis:</strong> The Service is provided on an &quot;as-is&quot;
        basis without warranties of any kind.</li>
      <li><strong>Network Reliance:</strong> We are not responsible for delayed or undelivered
        notifications due to third-party telecommunications or internet service provider
        failures.</li>
      <li><strong>Limitation of Liability:</strong> To the maximum extent permitted by law, we shall
        not be liable for any indirect, incidental, or consequential damages arising out of the use
        of the Service.</li>
      <li>Carriers are not liable for any delayed or undelivered messages.</li>
    </ul>

    <h4>8. Termination</h4>
    <p>We reserve the right to terminate or suspend your access to the Service at our sole
      discretion, without notice, for conduct that violates these Terms.</p>

    <p><strong>If you wish to terminate receipt of any notifications, reply &quot;STOP&quot; or opt
      out on your account settings page after logging into this website.</strong></p>

    <h4>9. Governing Law</h4>
    <p>These Terms shall be governed by and construed in accordance with the laws of the United
      States of America and the state of Colorado.</p>

    <p>For help or questions contact <Link href='mailto:help@cofrn.org'>help@cofrn.org</Link>.</p>
  </CofrnLayout>;
}
