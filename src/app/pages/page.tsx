import PagesPage from './pagesPage';

import CofrnLayout from '@/components/layout';

export const metadata = {
  title: 'Pages | COFRN',
  description: 'List of past pages that were recorded',
};

export default function Page() {
  return <CofrnLayout
    pageConfig={{
      title: 'Pages',
      requireAuth: true,
      requireAdmin: false,
    }}
  >
    <PagesPage />
  </CofrnLayout>;
}
