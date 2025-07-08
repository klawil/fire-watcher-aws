import EventsPage from './eventsPage';

import CofrnLayout from '@/components/layout';

export const metadata = {
  title: 'DTR Events | COFRN',
  description: 'See DTR events associated with a talkgroup or radio',
};

export default function Page() {
  return <CofrnLayout
    pageConfig={{
      title: 'DTR Events',
      requireAuth: true,
      requireAdmin: false,
      fluid: true,
    }}
  >
    <EventsPage />
  </CofrnLayout>;
}

