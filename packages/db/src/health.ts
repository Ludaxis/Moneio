import { prisma } from './client';

export interface HealthCheckResult {
  status: 'healthy' | 'unhealthy';
  latencyMs: number;
  timestamp: string;
  error?: string;
}

/**
 * Check database connectivity and measure latency
 */
export async function checkDatabaseHealth(): Promise<HealthCheckResult> {
  const start = Date.now();
  const timestamp = new Date().toISOString();

  try {
    // Simple query to check connectivity
    await prisma.$queryRaw`SELECT 1`;

    return {
      status: 'healthy',
      latencyMs: Date.now() - start,
      timestamp,
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      latencyMs: Date.now() - start,
      timestamp,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Gracefully disconnect from database
 */
export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
}
