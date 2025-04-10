import WeatherPage from '@/app/weather/weatherPage';
import CofrnLayout from '@/components/layout';

export const metadata = {
  title: 'Weather | COFRN',
  description: 'Fire weather information for Crestone, CO',
};

export default function Page() {
  return <CofrnLayout pageConfig={{ title: 'Weather', }}>
    <WeatherPage />
  </CofrnLayout>;
}
