import EventsReportPage from './eventsReportPage';

import CofrnLayout from '@/components/layout';

export const metadata = {
  title: 'DTR Events Report | COFRN',
  description: 'Generate a report on DTR events',
};

export default function Page() {
  return <CofrnLayout
    pageConfig={{
      title: 'DTR Events Report',
      requireAuth: true,
      requireAdmin: false,
      fluid: true,
    }}
  >
    <EventsReportPage />
  </CofrnLayout>;
}

