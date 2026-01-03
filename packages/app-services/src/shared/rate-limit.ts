/**
 * Rate limiting using Upstash Redis
 *
 * Provides per-user and per-workspace rate limits for different operation types.
 * Supports tenant-specific quotas based on subscription tier.
 */

import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

import { RateLimitError } from './errors';

// ============================================================
// Configuration
// ============================================================

export type RateLimitType = 'api' | 'ai' | 'upload' | 'export' | 'import';
export type TenantTier = 'free' | 'starter' | 'pro' | 'enterprise';

/**
 * Rate limits per tier (requests per minute)
 */
export const TIER_LIMITS: Record<TenantTier, Record<RateLimitType, number>> = {
  free: {
    api: 60,
    ai: 10,
    upload: 20,
    export: 5,
    import: 10,
  },
  starter: {
    api: 100,
    ai: 30,
    upload: 50,
    export: 20,
    import: 30,
  },
  pro: {
    api: 300,
    ai: 100,
    upload: 100,
    export: 50,
    import: 100,
  },
  enterprise: {
    api: 1000,
    ai: 500,
    upload: 500,
    export: 200,
    import: 500,
  },
};

/**
 * Monthly quotas per tier (null = unlimited)
 */
export const TIER_MONTHLY_QUOTAS: Record<
  TenantTier,
  {
    documents: number | null;
    aiCalls: number | null;
    transactions: number | null;
  }
> = {
  free: {
    documents: 50,
    aiCalls: 100,
    transactions: 500,
  },
  starter: {
    documents: 500,
    aiCalls: 1000,
    transactions: 5000,
  },
  pro: {
    documents: 5000,
    aiCalls: 10000,
    transactions: 50000,
  },
  enterprise: {
    documents: null, // unlimited
    aiCalls: null,
    transactions: null,
  },
};

// ============================================================
// Redis Client
// ============================================================

// Lazy-load Redis client (only when rate limiting is used)
let redis: Redis | null = null;

function getRedis(): Redis {
  if (!redis) {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;

    if (!url || !token) {
      throw new Error('Upstash Redis credentials not configured');
    }

    redis = new Redis({ url, token });
  }
  return redis;
}

// ============================================================
// Rate Limiters
// ============================================================

// Cache for tier-specific limiters
const limiterCache: Map<string, Ratelimit> = new Map();

/**
 * Get or create a rate limiter for a specific tier and type
 */
function getLimiterForTier(type: RateLimitType, tier: TenantTier): Ratelimit {
  const cacheKey = `${tier}:${type}`;

  if (!limiterCache.has(cacheKey)) {
    const r = getRedis();
    const limit = TIER_LIMITS[tier][type];

    limiterCache.set(
      cacheKey,
      new Ratelimit({
        redis: r,
        limiter: Ratelimit.slidingWindow(limit, '1m'),
        prefix: `rl:${tier}:${type}`,
      })
    );
  }

  return limiterCache.get(cacheKey)!;
}

/**
 * Check rate limit for an identifier (backward compatible)
 *
 * @param identifier - User ID or workspace ID
 * @param type - Type of rate limit to check
 * @throws RateLimitError if limit exceeded
 */
export async function checkRateLimit(
  identifier: string,
  type: RateLimitType = 'api'
): Promise<void> {
  return checkRateLimitWithTier(identifier, type, 'starter');
}

/**
 * Check rate limit for an identifier with tier-specific limits
 *
 * @param identifier - User ID or workspace ID
 * @param type - Type of rate limit to check
 * @param tier - Subscription tier
 * @throws RateLimitError if limit exceeded
 */
export async function checkRateLimitWithTier(
  identifier: string,
  type: RateLimitType,
  tier: TenantTier
): Promise<void> {
  // Skip rate limiting in development if not configured
  if (!process.env.UPSTASH_REDIS_REST_URL) {
    if (process.env.NODE_ENV === 'development') {
      return;
    }
    throw new Error('Rate limiting requires Upstash Redis configuration');
  }

  const limiter = getLimiterForTier(type, tier);
  const result = await limiter.limit(identifier);

  if (!result.success) {
    const retryAfter = Math.ceil((result.reset - Date.now()) / 1000);
    throw new RateLimitError(
      `Rate limit exceeded. Try again in ${retryAfter} seconds.`,
      retryAfter
    );
  }
}

/**
 * Get remaining rate limit for an identifier
 */
export async function getRateLimitRemaining(
  identifier: string,
  type: RateLimitType = 'api',
  tier: TenantTier = 'starter'
): Promise<{ remaining: number; reset: number; limit: number }> {
  const limit = TIER_LIMITS[tier][type];

  if (!process.env.UPSTASH_REDIS_REST_URL) {
    return { remaining: limit, reset: Date.now() + 60000, limit };
  }

  const limiter = getLimiterForTier(type, tier);
  const result = await limiter.limit(identifier);

  // Note: This consumes one request from the limit
  // For production, consider using a separate "get" method
  return {
    remaining: result.remaining,
    reset: result.reset,
    limit,
  };
}

// ============================================================
// Monthly Quota Tracking
// ============================================================

/**
 * Get the current month key for quota tracking
 */
function getMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Check monthly quota for a workspace
 *
 * @param workspaceId - Workspace ID
 * @param quotaType - Type of quota to check
 * @param tier - Subscription tier
 * @throws RateLimitError if quota exceeded
 */
export async function checkMonthlyQuota(
  workspaceId: string,
  quotaType: 'documents' | 'aiCalls' | 'transactions',
  tier: TenantTier
): Promise<void> {
  const quota = TIER_MONTHLY_QUOTAS[tier][quotaType];

  // Unlimited quota
  if (quota === null) {
    return;
  }

  // Skip in development if not configured
  if (!process.env.UPSTASH_REDIS_REST_URL) {
    if (process.env.NODE_ENV === 'development') {
      return;
    }
    throw new Error('Quota checking requires Upstash Redis configuration');
  }

  const r = getRedis();
  const monthKey = getMonthKey();
  const key = `quota:${workspaceId}:${quotaType}:${monthKey}`;

  const current = await r.get<number>(key);
  const used = current || 0;

  if (used >= quota) {
    throw new RateLimitError(
      `Monthly ${quotaType} quota exceeded (${used}/${quota}). Upgrade your plan for more.`,
      0
    );
  }
}

/**
 * Increment monthly quota usage
 */
export async function incrementMonthlyQuota(
  workspaceId: string,
  quotaType: 'documents' | 'aiCalls' | 'transactions',
  amount: number = 1
): Promise<number> {
  if (!process.env.UPSTASH_REDIS_REST_URL) {
    return 0;
  }

  const r = getRedis();
  const monthKey = getMonthKey();
  const key = `quota:${workspaceId}:${quotaType}:${monthKey}`;

  const newValue = await r.incrby(key, amount);

  // Set expiry to end of next month (to handle timezone edge cases)
  const expiryDate = new Date();
  expiryDate.setMonth(expiryDate.getMonth() + 2, 1);
  expiryDate.setHours(0, 0, 0, 0);
  const ttl = Math.ceil((expiryDate.getTime() - Date.now()) / 1000);

  await r.expire(key, ttl);

  return newValue;
}

/**
 * Get current monthly quota usage
 */
export async function getMonthlyQuotaUsage(
  workspaceId: string,
  tier: TenantTier
): Promise<Record<string, { used: number; limit: number | null }>> {
  const quotaTypes = ['documents', 'aiCalls', 'transactions'] as const;
  const result: Record<string, { used: number; limit: number | null }> = {};

  if (!process.env.UPSTASH_REDIS_REST_URL) {
    for (const type of quotaTypes) {
      result[type] = { used: 0, limit: TIER_MONTHLY_QUOTAS[tier][type] };
    }
    return result;
  }

  const r = getRedis();
  const monthKey = getMonthKey();

  for (const type of quotaTypes) {
    const key = `quota:${workspaceId}:${type}:${monthKey}`;
    const current = await r.get<number>(key);
    result[type] = {
      used: current || 0,
      limit: TIER_MONTHLY_QUOTAS[tier][type],
    };
  }

  return result;
}
