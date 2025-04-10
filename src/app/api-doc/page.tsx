import CofrnLayout from '@/components/layout';
import ApiDocPage from './apiDocPage';
import { readFileSync } from 'fs';

export const metadata = {
  title: 'API Documentation | COFRN',
  description: 'The APIs that power the website',
};

export default function Page() {
  const spec: { [propName: string]: unknown } =
    JSON.parse(readFileSync(__dirname + '/../../../../oas.json', 'utf-8'));

  return <CofrnLayout
    pageConfig={{ title: 'API Docs', }}
  >
    <ApiDocPage
      spec={spec}
    />
  </CofrnLayout>;
}
