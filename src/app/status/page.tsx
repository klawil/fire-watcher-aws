import CofrnLayout from '@/components/layout';
import StatusPage from './statusPage';

export const metadata = {
  title: 'System Status | COFRN',
  description: 'System status dashboard for COFRN',
};

export default function Page() {
  return <CofrnLayout pageConfig={{
    title: 'System Status',
    requireAdmin: true,
    fluid: true,
  }}>
    <StatusPage />
  </CofrnLayout>;
}
