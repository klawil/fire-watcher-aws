import CofrnLayout from '@/components/layout';
import LoginPage from './loginPage';

export const metadata = {
  title: 'Login | COFRN',
  description: 'Log into COFRN',
};

export default function Page() {
  return <CofrnLayout
    pageConfig={{
      title: 'Login',
    }}
  >
    <LoginPage />
  </CofrnLayout>;
}
