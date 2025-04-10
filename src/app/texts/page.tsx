import CofrnLayout from '@/components/layout';
import TextsPage from './textsPage';

export const metadata = {
  title: 'Texts | COFRN',
  description: 'See statistics around texts that have been sent using the system',
};

export default function Page() {
  return <CofrnLayout
    pageConfig={{
      title: 'Texts',
      requireAdmin: true,
      fluid: true,
    }}
  >
    <TextsPage />
  </CofrnLayout>;
}
