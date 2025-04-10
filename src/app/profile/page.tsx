import ProfilePage from './profilePage';

import CofrnLayout from '@/components/layout';

export const metadata = {
  title: 'Profile | COFRN',
  description: 'User profile page for COFRN',
};

export default function Page() {
  return <CofrnLayout
    pageConfig={{
      title: 'Profile',
      requireAuth: true,
    }}
  >
    <ProfilePage />
  </CofrnLayout>;
}
