import UserEditPage from '@/app/users/userEditPage';
import CofrnLayout from '@/components/layout';

export const metadata = {
  title: 'Users | COFRN',
  description: 'Manage users for departments using COFRN',
};

export default function Page() {
  return <CofrnLayout
    pageConfig={{
      title: 'User Management',
      requireAuth: true,
      requireAdmin: true,
      fluid: true,
      containerClass: 'container-md',
    }}>
    <UserEditPage />
  </CofrnLayout>;

}
