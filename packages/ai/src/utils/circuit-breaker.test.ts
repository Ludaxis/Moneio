import { describe, it, expect, beforeEach, vi } from 'vitest';

import {
  CircuitBreaker,
  CircuitBreakerOpenError,
  getCircuitBreaker,
} from './circuit-breaker';

describe('CircuitBreaker', () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    // Create a fresh circuit breaker for each test with short timeouts
    breaker = new CircuitBreaker('test-service', {
      failureThreshold: 3,
      resetTimeout: 100, // 100ms for fast tests
      successThreshold: 2,
      failureWindow: 1000,
    });
  });

  describe('CLOSED state', () => {
    it('should start in CLOSED state', () => {
      expect(breaker.getState()).toBe('CLOSED');
    });

    it('should allow requests when CLOSED', () => {
      expect(breaker.isAllowingRequests()).toBe(true);
    });

    it('should execute successful functions', async () => {
      const fn = vi.fn().mockResolvedValue('success');
      const result = await breaker.execute(fn);
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalled();
    });

    it('should track failures and remain CLOSED below threshold', async () => {
      const failFn = vi.fn().mockRejectedValue(new Error('fail'));

      // First failure
      await expect(breaker.execute(failFn)).rejects.toThrow('fail');
      expect(breaker.getState()).toBe('CLOSED');

      // Second failure
      await expect(breaker.execute(failFn)).rejects.toThrow('fail');
      expect(breaker.getState()).toBe('CLOSED');

      const stats = breaker.getStats();
      expect(stats.failures).toBe(2);
    });
  });

  describe('CLOSED to OPEN transition', () => {
    it('should open circuit after threshold failures', async () => {
      const failFn = vi.fn().mockRejectedValue(new Error('fail'));

      // Three failures should trip the circuit
      await expect(breaker.execute(failFn)).rejects.toThrow('fail');
      await expect(breaker.execute(failFn)).rejects.toThrow('fail');
      await expect(breaker.execute(failFn)).rejects.toThrow('fail');

      expect(breaker.getState()).toBe('OPEN');
      expect(breaker.isAllowingRequests()).toBe(false);
    });

    it('should immediately reject requests when OPEN', async () => {
      const failFn = vi.fn().mockRejectedValue(new Error('fail'));

      // Trip the circuit
      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(failFn)).rejects.toThrow('fail');
      }

      // Next request should fail with CircuitBreakerOpenError
      const successFn = vi.fn().mockResolvedValue('success');
      await expect(breaker.execute(successFn)).rejects.toThrow(CircuitBreakerOpenError);

      // The function should NOT have been called
      expect(successFn).not.toHaveBeenCalled();
    });

    it('should include retry time in error', async () => {
      const failFn = vi.fn().mockRejectedValue(new Error('fail'));

      // Trip the circuit
      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(failFn)).rejects.toThrow('fail');
      }

      try {
        await breaker.execute(vi.fn());
      } catch (error) {
        expect(error).toBeInstanceOf(CircuitBreakerOpenError);
        expect((error as CircuitBreakerOpenError).serviceName).toBe('test-service');
        expect((error as CircuitBreakerOpenError).retryAfter).toBeGreaterThan(0);
      }
    });
  });

  describe('OPEN to HALF_OPEN transition', () => {
    it('should transition to HALF_OPEN after reset timeout', async () => {
      const failFn = vi.fn().mockRejectedValue(new Error('fail'));

      // Trip the circuit
      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(failFn)).rejects.toThrow('fail');
      }
      expect(breaker.getState()).toBe('OPEN');

      // Wait for reset timeout
      await new Promise((resolve) => setTimeout(resolve, 150));

      // State should now be HALF_OPEN
      expect(breaker.getState()).toBe('HALF_OPEN');
    });
  });

  describe('HALF_OPEN state', () => {
    beforeEach(async () => {
      const failFn = vi.fn().mockRejectedValue(new Error('fail'));

      // Trip the circuit
      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(failFn)).rejects.toThrow('fail');
      }

      // Wait for reset timeout
      await new Promise((resolve) => setTimeout(resolve, 150));
    });

    it('should allow test requests in HALF_OPEN', async () => {
      const successFn = vi.fn().mockResolvedValue('success');
      const result = await breaker.execute(successFn);
      expect(result).toBe('success');
      expect(successFn).toHaveBeenCalled();
    });

    it('should return to OPEN on failure in HALF_OPEN', async () => {
      const failFn = vi.fn().mockRejectedValue(new Error('fail'));
      await expect(breaker.execute(failFn)).rejects.toThrow('fail');
      expect(breaker.getState()).toBe('OPEN');
    });

    it('should transition to CLOSED after success threshold', async () => {
      const successFn = vi.fn().mockResolvedValue('success');

      // Need 2 successes to close
      await breaker.execute(successFn);
      expect(breaker.getState()).toBe('HALF_OPEN'); // Still half open

      await breaker.execute(successFn);
      expect(breaker.getState()).toBe('CLOSED'); // Now closed
    });
  });

  describe('Statistics', () => {
    it('should track total requests and failures', async () => {
      const successFn = vi.fn().mockResolvedValue('success');
      const failFn = vi.fn().mockRejectedValue(new Error('fail'));

      await breaker.execute(successFn);
      await breaker.execute(successFn);
      await expect(breaker.execute(failFn)).rejects.toThrow();

      const stats = breaker.getStats();
      expect(stats.totalRequests).toBe(3);
      expect(stats.totalFailures).toBe(1);
    });

    it('should track last success and failure times', async () => {
      const successFn = vi.fn().mockResolvedValue('success');
      const failFn = vi.fn().mockRejectedValue(new Error('fail'));

      await breaker.execute(successFn);
      const statsAfterSuccess = breaker.getStats();
      expect(statsAfterSuccess.lastSuccess).toBeInstanceOf(Date);

      await expect(breaker.execute(failFn)).rejects.toThrow();
      const statsAfterFailure = breaker.getStats();
      expect(statsAfterFailure.lastFailure).toBeInstanceOf(Date);
    });
  });

  describe('Manual reset', () => {
    it('should reset circuit to CLOSED state', async () => {
      const failFn = vi.fn().mockRejectedValue(new Error('fail'));

      // Trip the circuit
      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(failFn)).rejects.toThrow('fail');
      }
      expect(breaker.getState()).toBe('OPEN');

      // Manual reset
      breaker.reset();
      expect(breaker.getState()).toBe('CLOSED');
      expect(breaker.isAllowingRequests()).toBe(true);
    });
  });

  describe('Failure window cleanup', () => {
    it('should clear old failures outside window', async () => {
      const shortWindowBreaker = new CircuitBreaker('short-window', {
        failureThreshold: 3,
        resetTimeout: 100,
        successThreshold: 2,
        failureWindow: 50, // Very short window
      });

      const failFn = vi.fn().mockRejectedValue(new Error('fail'));

      // Two failures
      await expect(shortWindowBreaker.execute(failFn)).rejects.toThrow();
      await expect(shortWindowBreaker.execute(failFn)).rejects.toThrow();

      // Wait for window to expire
      await new Promise((resolve) => setTimeout(resolve, 60));

      // This failure should not trip the circuit because old ones expired
      await expect(shortWindowBreaker.execute(failFn)).rejects.toThrow();

      expect(shortWindowBreaker.getState()).toBe('CLOSED');
    });
  });
});

describe('getCircuitBreaker', () => {
  it('should return same instance for same service name', () => {
    const breaker1 = getCircuitBreaker('shared-service');
    const breaker2 = getCircuitBreaker('shared-service');
    expect(breaker1).toBe(breaker2);
  });

  it('should return different instances for different services', () => {
    const breaker1 = getCircuitBreaker('service-a');
    const breaker2 = getCircuitBreaker('service-b');
    expect(breaker1).not.toBe(breaker2);
  });
});
