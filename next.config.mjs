/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: { serverActions: { bodySizeLimit: '6mb' } },
  images: { unoptimized: true },
  async headers() {
    return [{ source: '/upcatch-ops/:path*', headers: [{ key: 'Cache-Control', value: 'private, no-store' }, { key: 'X-Robots-Tag', value: 'noindex, nofollow' }] }, { source: '/auth/:path*', headers: [
      { key: 'Referrer-Policy', value: 'no-referrer' },
      { key: 'Cache-Control', value: 'private, no-store' },
    ] }]
  },
}
export default nextConfig
