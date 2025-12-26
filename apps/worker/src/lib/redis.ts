import IORedis from 'ioredis';

/**
 * Create Redis connection for BullMQ
 * Supports both Upstash (TLS) and local Redis
 */
export function createRedisConnection() {
  const redisUrl = process.env.REDIS_URL || process.env.UPSTASH_REDIS_URL;

  if (!redisUrl) {
    throw new Error('REDIS_URL or UPSTASH_REDIS_URL is required');
  }

  // Check if using Upstash (TLS required)
  const isUpstash = redisUrl.includes('upstash.io');

  const connection = new IORedis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    // Upstash requires TLS
    ...(isUpstash && {
      tls: {
        rejectUnauthorized: false,
      },
    }),
  });

  connection.on('connect', () => {
    console.log('Redis connected');
  });

  connection.on('error', (err) => {
    console.error('Redis connection error:', err);
  });

  return connection;
}

// Singleton connection
let redisConnection: IORedis | null = null;

export function getRedisConnection() {
  if (!redisConnection) {
    redisConnection = createRedisConnection();
  }
  return redisConnection;
}

export async function closeRedisConnection() {
  if (redisConnection) {
    await redisConnection.quit();
    redisConnection = null;
  }
}
