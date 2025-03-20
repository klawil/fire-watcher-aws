import CofrnLayout from "@/components/layout";
import UserEditPage from "@/app/users/userEditPage";

export const metadata = {
  title: 'Users | COFRN',
  description: 'Manage users for departments using COFRN',
};

export default function Page() {
  return (<CofrnLayout
    pageConfig={{
      title: 'User Management',
      requireAdmin: true,
      fluid: true,
      containerClass: 'container-md',
    }}>
      <UserEditPage />
    </CofrnLayout>
  )
}
