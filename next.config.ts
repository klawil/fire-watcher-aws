import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'export',
  trailingSlash: true,
  productionBrowserSourceMaps: true,
};

if (process.env.PROD_BUILD) {
  nextConfig.distDir = 'output/build';
} else {
  nextConfig.rewrites = async () => {
    return {
      fallback: [
        {
          source: '/audio/:path*',
          destination: 'https://cofrn.org/audio/:path*',
        },
        {
          source: '/api/:path*',
          destination: 'https://cofrn.org/api/:path*',
        },
        {
          source: '/weather.json',
          destination: 'https://cofrn.org/weather.json',
        },
      ],
    };
  };
}

export default nextConfig;
