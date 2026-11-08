import type { NextConfig } from 'next';
const nextConfig: NextConfig = {
  experimental: { serverActions: { bodySizeLimit: '101mb' } },
  serverExternalPackages: ['better-sqlite3', 'sharp', 'ffmpeg-static'],
  async rewrites() {
    // Existing and newly uploaded files must share range validation and headers.
    return { beforeFiles: [{ source: '/uploads/:filename', destination: '/api/media/:filename' }] };
  },
  async headers() {
    return [{ source: '/:path*', headers: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'same-origin' },
      { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
    ] }];
  },
};
export default nextConfig;
