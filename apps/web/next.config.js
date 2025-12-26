/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@moneio/core-ledger', '@moneio/domain'],
  experimental: {
    typedRoutes: true,
  },
  i18n: {
    locales: ['en', 'et', 'fa', 'ar'],
    defaultLocale: 'en',
    localeDetection: true,
  },
};

module.exports = nextConfig;
