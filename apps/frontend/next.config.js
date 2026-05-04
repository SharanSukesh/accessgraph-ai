const path = require('path')

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

  // Explicit webpack alias for `@/*` imports.
  //
  // Why we set this explicitly instead of relying on tsconfig.json's `paths`:
  // Next.js normally reads paths from tsconfig.json automatically via its
  // jsconfig-paths-webpack-plugin. On some build environments (notably the
  // Railway / Nixpacks builder) that auto-detection has been observed to
  // intermittently fail with "Module not found: Can't resolve '@/components/...'"
  // even though the file exists and the import is correctly cased.
  // Setting the alias explicitly here is belt-and-suspenders - it works
  // regardless of whether the tsconfig autodetect is working or not.
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      '@': path.resolve(__dirname, 'src'),
    }
    return config
  },
}

module.exports = nextConfig
