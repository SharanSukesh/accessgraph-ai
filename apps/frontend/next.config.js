/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Environment variables exposed to the browser
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000',
    NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME || 'AccessGraph AI',
  },

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
