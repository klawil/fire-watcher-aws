import Link from 'next/link';

import CofrnLayout from '@/components/layout';

export const metadata = {
  title: 'Privacy Policy | COFRN',
  description: 'Privacy policy for COFRN',
};

export default function Page() {
  return <CofrnLayout
    pageConfig={{
      title: 'Privacy Policy',
      requireAuth: false,
      requireAdmin: false,
    }}
  >
    <i>Last Updated: May 9, 2026</i>
    <h4>1. Introduction</h4>
    <p>This Privacy Policy describes how we collect, use, and handle your personal information when
      you use our platform. Our website is designed to provide event alerts to first responders, and
      we are committed to protecting the privacy of those who serve our communities.</p>

    <h4>2. Information We Collect</h4>

    <p>We collect the minimum amount of data necessary to provide our alerting services:</p>

    <ul>
      <li><b>Identity Data:</b> Name and professional affiliation.</li>
      <li><b>Contact Data:</b> Email address and phone number.</li>
      <li><b>Usage Data:</b> Information about how you use our website, collected through Google
        Analytics (e.g., IP addresses, browser type, and pages visited).</li>
    </ul>

    <h4>3. How We Use Your Data</h4>

    <p>Your data is used strictly for the following purposes:</p>

    <ul>
      <li><b>Emergency Alerts:</b> To transmit time-sensitive event notifications via email or
        SMS.</li>
      <li><b>Administrative Communications:</b> To provide updates regarding your account or changes
        to our service.</li>
      <li><b>Service Improvement:</b> We use Google Analytics to monitor site performance and
        improve the user experience. This data is aggregated and does not personally identify you to
        us for marketing purposes.</li>
    </ul>

    <h4>4. Payments</h4>

    <p>For institutional users paying via check, we collect billing contact information. We do not
      process credit cards or digital payments directly through the website, and therefore do not
      store or transmit sensitive financial cardholder data.</p>

    <h4>5. Data Storage and Third Parties</h4>

    <p>We do not sell, rent, or trade your personal information to third parties. This explicitly
      includes text messaging originator opt-in data and consent; this information will not be
      shared with any third parties, excluding aggregators and providers of the Text Message
      services.</p>

    <p><strong>Hosting:</strong> Your data is stored in a secure cloud environment hosted by Amazon
      Web Services (AWS).</p>

    <p><strong>Service Providers:</strong> We use Google Analytics to understand site traffic.
      Google may use the data collected to track and examine the use of our site; you can review
      Google&apos;s privacy documentation for further details on their data handling.</p>

    <h4>6. Data Retention and Security</h4>

    <p>We retain your information for as long as your account is active or as needed to provide you
      with services. We implement industry-standard security measures provided by our hosting
      environment to protect against unauthorized access, alteration, or destruction of data.</p>

    <h4>7. Your Rights and Choices</h4>

    <p>We believe in providing users with control over their information:</p>

    <ul>
      <li><b>Access:</b> You may view the personal data we hold about you directly through your
        user dashboard on the website.</li>
      <li><b>Correction/Deletion:</b> To request the deletion of your account or the removal of your
        personal data, please contact the institutional administrator (e.g., your department or
        agency head) under whom your account was created.</li>
      <li><b>Opt-Out:</b> You may manage your notification preferences through your account
        settings.</li>
    </ul>

    <h4>8. Children’s Privacy</h4>

    <p>Our services are directed to professional first responders and are not intended for
      individuals under the age of 18. We do not knowingly collect data from children.</p>

    <h4>9. Changes to This Policy</h4>

    <p>We may update this policy from time to time. We will notify you of any significant changes by
      posting the new policy on this page and updating the &quot;Last Updated&quot; date.</p>

    <h4>10. Contact Us</h4>

    <p>If you have any questions about this Privacy Policy, please contact us at <Link href='mailto:help@cofrn.org'>help@cofrn.org</Link>.</p>
  </CofrnLayout>;
}
