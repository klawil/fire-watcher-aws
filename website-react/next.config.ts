import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'export',
  async rewrites() {
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
      ]
    };
  },
};

export default nextConfig;
