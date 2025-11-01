import CofrnLayout from '@/components/layout';

export const metadata = {
  title: '404 | COFRN',
  description: 'Page not found',
};

export default function Home() {
  return (
    <CofrnLayout
      pageConfig={{
        title: 'Uh oh!',
        requireAuth: false,
        requireAdmin: false,
        hasAudio: true,
        centerAll: true,
        fluid: true,
        containerClass: 'container-md',
      }}
    >
      <h2>We couldn&apos;t find that page, try accessing a different page from the navbar above</h2>
    </CofrnLayout>
  );
}
