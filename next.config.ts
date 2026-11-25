import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // La app no usa next/image: se desactiva la optimización de imágenes
  // para no depender del endpoint /_next/image (superficie de ataque).
  images: {
    unoptimized: true,
  },
  experimental: {
    optimizePackageImports: [
      '@phosphor-icons/react',
      'date-fns',
      'recharts',
    ],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },
          { key: 'X-Powered-By', value: 'SimplifiedLender' },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob:",
              "font-src 'self' data:",
              "connect-src 'self' https://snwwvvmszizarakrozah.supabase.co wss://snwwvvmszizarakrozah.supabase.co",
              "worker-src 'self'",
              "frame-ancestors 'self'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join('; '),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
