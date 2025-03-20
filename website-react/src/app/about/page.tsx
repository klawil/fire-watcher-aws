import CofrnLayout from "@/components/layout";
import Link from "next/link";

export const metadata = {
  title: 'About Us | COFRN',
  description: 'About us page',
};

export default function Page() {
  return (<CofrnLayout
    pageConfig={{
      title: 'About Us',
    }}
  >
    <p className="text-center">First Responder Notifications, LLC provides text-based notifications of requests for emergency responses.
    This system is intended to be used as a backup to a primary paging system (such as radio or pagers). We also offer the ability to
    host a text group for your department.</p>

    <p className="text-center">Contact and business information can be found here: <Link href="https://www.sos.state.co.us/biz/BusinessEntityDetail.do?masterFileId=20248264569">Colorado Secretary of State Website</Link>.</p>
  </CofrnLayout>);
}
