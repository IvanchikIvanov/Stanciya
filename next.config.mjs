/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['@electric-sql/pglite', 'pg'],
  async headers() {
    const headers = [{ key: 'Referrer-Policy', value: 'no-referrer' }];
    return [
      { source: '/order/:path*', headers },
      { source: '/register', headers },
    ];
  },
};

export default nextConfig;
