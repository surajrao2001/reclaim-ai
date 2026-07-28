import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@reclaimai/ui-components'],
  output: 'standalone',
};

export default nextConfig;
