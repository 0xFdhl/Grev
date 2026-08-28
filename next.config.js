/** @type {import('next').NextConfig} */

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  { key: 'X-XSS-Protection', value: '0' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "font-src 'self'",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),
  },
];

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
  async rewrites() {
    const honeypot = '/api/honeypot';
    return [
      { source: '/.env', destination: honeypot },
      { source: '/.env.local', destination: honeypot },
      { source: '/.env.production', destination: honeypot },
      { source: '/wp-admin', destination: honeypot },
      { source: '/wp-login.php', destination: honeypot },
      { source: '/wp-config.php', destination: honeypot },
      { source: '/.git/:path*', destination: honeypot },
      { source: '/api/wp-admin', destination: honeypot },
      { source: '/api/config', destination: honeypot },
      { source: '/phpmyadmin/:path*', destination: honeypot },
    ];
  },
};

module.exports = nextConfig;
