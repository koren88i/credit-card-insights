import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  experimental: { proxyClientMaxBodySize: '20mb' },
  outputFileTracingExcludes: {
    '/*': ['./data/**/*', './local-only/**/*', './backups/**/*', './exports/**/*', './imports/**/*', './uploads/**/*', './creditcarddata/**/*', './.env*'],
  },
};

export default nextConfig;
