import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import createNextIntlPlugin from 'next-intl/plugin';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const withNextIntl = createNextIntlPlugin('./src/lib/i18n.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Output file tracing root for monorepo - helps Vercel find Prisma engines
  outputFileTracingRoot: join(__dirname, '../../'),
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
