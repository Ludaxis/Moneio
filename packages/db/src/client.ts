import { PrismaClient } from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

const datasourceUrl = process.env.DATABASE_URL;
const usingDataProxy = datasourceUrl?.startsWith('prisma://');

/**
 * Create a Prisma client configured for serverless/pooler usage.
 * - Uses pooler-compatible connection limits via the connection string
 * - Supports Prisma Data Proxy if DATABASE_URL is prisma://
 */
function createPrismaClient() {
  return new PrismaClient({
    ...(datasourceUrl ? { datasourceUrl } : {}),
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });
}

/**
 * Prisma client singleton
 * In development, reuses the same instance across hot reloads (except when using Data Proxy)
 */
export const prisma =
  (!usingDataProxy && global.prisma) || createPrismaClient();

if (!usingDataProxy && process.env.NODE_ENV !== 'production') {
  global.prisma = prisma;
}

export type { PrismaClient };
