import CofrnLayout from "@/components/layout";
import ProfilePage from "./profilePage";

export const metadata = {
  title: 'Profile | COFRN',
  description: 'User profile page for COFRN',
};

export default function Page() {
  return (<CofrnLayout
    pageConfig={{
      title: 'Profile',
    }}
  >
    <ProfilePage />
  </CofrnLayout>);
}
