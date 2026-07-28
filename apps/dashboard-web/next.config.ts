import type { NextConfig } from 'next';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH?.trim();

const nextConfig: NextConfig = {
  transpilePackages: ['@reclaimai/ui-components'],
  output: 'standalone',
  ...(basePath && basePath !== '/'
    ? {
        basePath,
      }
    : {}),
};

export default nextConfig;
