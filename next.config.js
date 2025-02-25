/** @type {import('next').NextConfig} */
const nextConfig = {
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
      {
        hostname: '*.blob.core.windows.net',
        protocol: 'https',
        pathname: '/**',
      },
    ],
  },
};

module.exports = nextConfig;
