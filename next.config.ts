import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  experimental: {
    ppr: true,
  },
  images: {
    remotePatterns: [
      {
        hostname: 'avatar.vercel.sh',
      },
      {
        hostname: 'aichatbotfiles2b28cd9f.blob.core.windows.net',
        protocol: 'https',
        pathname: '/ai-chatbot-files/**',
      },
    ],
  },
};

export default nextConfig;
