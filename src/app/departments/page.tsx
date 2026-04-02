import DepartmentsPage from '@/app/departments/departmentsPage';
import CofrnLayout from '@/components/layout';

export const metadata = {
  title: 'Departments | COFRN',
  description: 'Manage department settings using COFRN',
};

export default function Page() {
  return <CofrnLayout
    pageConfig={{
      title: 'Department Settings',
      requireAuth: true,
      requireAdmin: true,
      fluid: true,
      containerClass: 'container-md',
    }}>
    <DepartmentsPage />
  </CofrnLayout>;
}
