/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@accessgraph/shared-types', '@accessgraph/shared-config'],

  // Environment variables exposed to the browser
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000',
    NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME || 'AccessGraph AI',
  },

  // Production output
  output: process.env.NODE_ENV === 'production' ? 'standalone' : undefined,

  // Logging
  logging: {
    fetches: {
      fullUrl: true,
    },
  },

  // Optimize for production
  swcMinify: true,

  // Disable x-powered-by header
  poweredByHeader: false,

  // Compress responses
  compress: true,
}

module.exports = nextConfig
