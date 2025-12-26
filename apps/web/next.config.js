import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/lib/i18n.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    '@moneio/core-ledger',
    '@moneio/domain',
    '@moneio/db',
    '@moneio/ui',
    '@moneio/i18n',
    '@moneio/utils',
  ],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.supabase.co',
      },
    ],
  },
};

export default withNextIntl(nextConfig);
