import LoginPage from './loginPage';

import CofrnLayout from '@/components/layout';

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
