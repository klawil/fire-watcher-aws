import AudioList from '@/components/audioList/audioList';
import CofrnLayout from '@/components/layout';

export const metadata = {
  title: 'Radio Traffic | COFRN',
  description: 'Recorded radio traffic',
};

export default function Home() {
  return (
    <CofrnLayout
      pageConfig={{
        title: 'Radio Traffic',
        hasAudio: true,
        centerAll: true,
        fluid: true,
        containerClass: 'container-md',
      }}
    >
      <AudioList />
    </CofrnLayout>
  );
}
