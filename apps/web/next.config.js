const createNextIntlPlugin = require('next-intl/plugin');

const withNextIntl = createNextIntlPlugin('./src/i18n.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@moneio/ui', '@moneio/i18n', '@moneio/core-ledger', '@moneio/domain'],
  experimental: {
    typedRoutes: true,
  },
};

module.exports = withNextIntl(nextConfig);
