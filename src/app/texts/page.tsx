import TextsPage from './textsPage';

import CofrnLayout from '@/components/layout';

export const metadata = {
  title: 'Texts | COFRN',
  description: 'See statistics around texts that have been sent using the system',
};

export default function Page() {
  return <CofrnLayout
    pageConfig={{
      title: 'Texts',
      requireAuth: true,
      requireAdmin: true,
      fluid: true,
    }}
  >
    <TextsPage />
  </CofrnLayout>;
}
