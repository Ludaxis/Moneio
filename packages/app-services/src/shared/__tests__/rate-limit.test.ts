/**
 * Rate Limiting Tests
 *
 * Tests tier-based rate limits and monthly quota tracking.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Set env vars before imports
process.env.UPSTASH_REDIS_REST_URL = 'https://test.upstash.io';
process.env.UPSTASH_REDIS_REST_TOKEN = 'test-token';

// Hoisted mocks
const mocks = vi.hoisted(() => {
  const limit = vi.fn();
  const get = vi.fn();
  const incrby = vi.fn();
  const expire = vi.fn();

  const MockRatelimit = vi.fn().mockImplementation(() => ({
    limit,
  })) as unknown as { slidingWindow: ReturnType<typeof vi.fn> } & ReturnType<typeof vi.fn>;
  MockRatelimit.slidingWindow = vi.fn().mockReturnValue('sliding-window-limiter');

  return { limit, get, incrby, expire, MockRatelimit };
});

vi.mock('@upstash/ratelimit', () => ({
  Ratelimit: mocks.MockRatelimit,
}));

vi.mock('@upstash/redis', () => ({
  Redis: vi.fn().mockImplementation(() => ({
    get: mocks.get,
    incrby: mocks.incrby,
    expire: mocks.expire,
  })),
}));

import { RateLimitError } from '../errors';
import {
  TIER_LIMITS,
  TIER_MONTHLY_QUOTAS,
  checkRateLimit,
  checkRateLimitWithTier,
  checkMonthlyQuota,
  incrementMonthlyQuota,
  getMonthlyQuotaUsage,
  type TenantTier,
  type RateLimitType,
} from '../rate-limit';

// Convenience aliases
const mockLimit = mocks.limit;
const mockGet = mocks.get;
const mockIncrby = mocks.incrby;
const mockExpire = mocks.expire;

describe('Rate Limiting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('TIER_LIMITS configuration', () => {
    it('has limits for all tiers', () => {
      const tiers: TenantTier[] = ['free', 'starter', 'pro', 'enterprise'];
      const types: RateLimitType[] = ['api', 'ai', 'upload', 'export', 'import'];

      for (const tier of tiers) {
        expect(TIER_LIMITS[tier]).toBeDefined();
        for (const type of types) {
          expect(typeof TIER_LIMITS[tier][type]).toBe('number');
          expect(TIER_LIMITS[tier][type]).toBeGreaterThan(0);
        }
      }
    });

    it('has increasing limits for higher tiers', () => {
      expect(TIER_LIMITS.starter.api).toBeGreaterThan(TIER_LIMITS.free.api);
      expect(TIER_LIMITS.pro.api).toBeGreaterThan(TIER_LIMITS.starter.api);
      expect(TIER_LIMITS.enterprise.api).toBeGreaterThan(TIER_LIMITS.pro.api);
    });

    it('has lower AI limits than API limits', () => {
      for (const tier of ['free', 'starter', 'pro'] as TenantTier[]) {
        expect(TIER_LIMITS[tier].ai).toBeLessThan(TIER_LIMITS[tier].api);
      }
    });
  });

  describe('TIER_MONTHLY_QUOTAS configuration', () => {
    it('has quotas for all tiers', () => {
      const tiers: TenantTier[] = ['free', 'starter', 'pro', 'enterprise'];
      const quotaTypes = ['documents', 'aiCalls', 'transactions'] as const;

      for (const tier of tiers) {
        expect(TIER_MONTHLY_QUOTAS[tier]).toBeDefined();
        for (const type of quotaTypes) {
          const quota = TIER_MONTHLY_QUOTAS[tier][type];
          expect(quota === null || typeof quota === 'number').toBe(true);
        }
      }
    });

    it('enterprise tier has unlimited quotas', () => {
      expect(TIER_MONTHLY_QUOTAS.enterprise.documents).toBeNull();
      expect(TIER_MONTHLY_QUOTAS.enterprise.aiCalls).toBeNull();
      expect(TIER_MONTHLY_QUOTAS.enterprise.transactions).toBeNull();
    });

    it('has increasing quotas for higher tiers', () => {
      expect(TIER_MONTHLY_QUOTAS.starter.documents!).toBeGreaterThan(
        TIER_MONTHLY_QUOTAS.free.documents!
      );
      expect(TIER_MONTHLY_QUOTAS.pro.documents!).toBeGreaterThan(
        TIER_MONTHLY_QUOTAS.starter.documents!
      );
    });
  });

  describe('checkRateLimit', () => {
    it('passes when under limit', async () => {
      mockLimit.mockResolvedValue({ success: true, remaining: 50, reset: Date.now() + 60000 });

      await expect(checkRateLimit('user-123', 'api')).resolves.not.toThrow();
    });

    it('throws RateLimitError when limit exceeded', async () => {
      const resetTime = Date.now() + 30000;
      mockLimit.mockResolvedValue({ success: false, remaining: 0, reset: resetTime });

      await expect(checkRateLimit('user-123', 'api')).rejects.toThrow(RateLimitError);
    });
  });

  describe('checkRateLimitWithTier', () => {
    it('uses tier-specific limits', async () => {
      mockLimit.mockResolvedValue({ success: true, remaining: 50, reset: Date.now() + 60000 });

      await checkRateLimitWithTier('user-123', 'api', 'enterprise');

      // Should have called limit (Ratelimit is mocked)
      expect(mockLimit).toHaveBeenCalledWith('user-123');
    });

    it('throws error with retry info when exceeded', async () => {
      const resetTime = Date.now() + 45000;
      mockLimit.mockResolvedValue({ success: false, remaining: 0, reset: resetTime });

      try {
        await checkRateLimitWithTier('user-123', 'ai', 'free');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(RateLimitError);
        expect((error as RateLimitError).message).toContain('Rate limit exceeded');
      }
    });
  });

  describe('checkMonthlyQuota', () => {
    it('passes when under quota', async () => {
      mockGet.mockResolvedValue(10);

      await expect(checkMonthlyQuota('ws-123', 'documents', 'free')).resolves.not.toThrow();
    });

    it('throws when quota exceeded', async () => {
      // Free tier has 50 documents limit
      mockGet.mockResolvedValue(50);

      await expect(checkMonthlyQuota('ws-123', 'documents', 'free')).rejects.toThrow(
        RateLimitError
      );
    });

    it('skips check for unlimited (enterprise) quotas', async () => {
      await expect(checkMonthlyQuota('ws-123', 'documents', 'enterprise')).resolves.not.toThrow();

      // Should not have called Redis
      expect(mockGet).not.toHaveBeenCalled();
    });
  });

  describe('incrementMonthlyQuota', () => {
    it('increments quota and sets expiry', async () => {
      mockIncrby.mockResolvedValue(11);
      mockExpire.mockResolvedValue(true);

      const result = await incrementMonthlyQuota('ws-123', 'documents', 1);

      expect(result).toBe(11);
      expect(mockIncrby).toHaveBeenCalled();
      expect(mockExpire).toHaveBeenCalled();
    });

    it('supports custom increment amount', async () => {
      mockIncrby.mockResolvedValue(15);
      mockExpire.mockResolvedValue(true);

      const result = await incrementMonthlyQuota('ws-123', 'transactions', 5);

      expect(result).toBe(15);
    });
  });

  describe('getMonthlyQuotaUsage', () => {
    it('returns usage for all quota types', async () => {
      mockGet.mockResolvedValueOnce(25); // documents
      mockGet.mockResolvedValueOnce(50); // aiCalls
      mockGet.mockResolvedValueOnce(100); // transactions

      const result = await getMonthlyQuotaUsage('ws-123', 'starter');

      expect(result.documents).toEqual({
        used: 25,
        limit: TIER_MONTHLY_QUOTAS.starter.documents,
      });
      expect(result.aiCalls).toEqual({
        used: 50,
        limit: TIER_MONTHLY_QUOTAS.starter.aiCalls,
      });
      expect(result.transactions).toEqual({
        used: 100,
        limit: TIER_MONTHLY_QUOTAS.starter.transactions,
      });
    });

    it('returns null limit for enterprise tier', async () => {
      mockGet.mockResolvedValue(1000);

      const result = await getMonthlyQuotaUsage('ws-123', 'enterprise');

      expect(result.documents.limit).toBeNull();
      expect(result.aiCalls.limit).toBeNull();
      expect(result.transactions.limit).toBeNull();
    });
  });
});
