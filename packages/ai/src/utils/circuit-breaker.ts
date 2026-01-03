/**
 * Circuit Breaker Pattern for LLM API Calls
 *
 * Prevents cascade failures when LLM APIs are unavailable or rate-limited.
 * Implements the circuit breaker pattern with three states:
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Circuit is tripped, requests fail immediately
 * - HALF_OPEN: Testing if service has recovered
 */

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerConfig {
  /** Number of failures before opening circuit (default: 5) */
  failureThreshold: number;
  /** Time in ms to wait before trying again (default: 30000) */
  resetTimeout: number;
  /** Number of successful calls in half-open to close circuit (default: 2) */
  successThreshold: number;
  /** Time window in ms to track failures (default: 60000) */
  failureWindow: number;
}

export interface CircuitBreakerStats {
  state: CircuitState;
  failures: number;
  successes: number;
  lastFailure: Date | null;
  lastSuccess: Date | null;
  totalRequests: number;
  totalFailures: number;
}

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  resetTimeout: 30000, // 30 seconds
  successThreshold: 2,
  failureWindow: 60000, // 1 minute
};

/**
 * Circuit Breaker Error - thrown when circuit is open
 */
export class CircuitBreakerOpenError extends Error {
  constructor(
    public readonly serviceName: string,
    public readonly retryAfter: number
  ) {
    super(`Circuit breaker is OPEN for ${serviceName}. Retry after ${retryAfter}ms`);
    this.name = 'CircuitBreakerOpenError';
  }
}

/**
 * Circuit Breaker implementation
 */
export class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private failures: number = 0;
  private successes: number = 0;
  private lastFailureTime: number = 0;
  private failureTimestamps: number[] = [];
  private totalRequests: number = 0;
  private totalFailures: number = 0;
  private lastSuccessTime: number = 0;

  constructor(
    private readonly serviceName: string,
    private readonly config: CircuitBreakerConfig = DEFAULT_CONFIG
  ) {}

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.totalRequests++;

    // Check if circuit should be tested
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime >= this.config.resetTimeout) {
        this.state = 'HALF_OPEN';
        this.successes = 0;
        console.log(`[CircuitBreaker:${this.serviceName}] Transitioning to HALF_OPEN`);
      } else {
        const retryAfter = this.config.resetTimeout - (Date.now() - this.lastFailureTime);
        throw new CircuitBreakerOpenError(this.serviceName, retryAfter);
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error);
      throw error;
    }
  }

  /**
   * Handle successful call
   */
  private onSuccess(): void {
    this.lastSuccessTime = Date.now();

    if (this.state === 'HALF_OPEN') {
      this.successes++;
      console.log(
        `[CircuitBreaker:${this.serviceName}] Success in HALF_OPEN (${this.successes}/${this.config.successThreshold})`
      );

      if (this.successes >= this.config.successThreshold) {
        this.state = 'CLOSED';
        this.failures = 0;
        this.failureTimestamps = [];
        console.log(`[CircuitBreaker:${this.serviceName}] Circuit CLOSED - service recovered`);
      }
    } else {
      // In CLOSED state, clear old failures
      this.cleanupOldFailures();
    }
  }

  /**
   * Handle failed call
   */
  private onFailure(error: unknown): void {
    this.totalFailures++;
    this.lastFailureTime = Date.now();
    this.failureTimestamps.push(this.lastFailureTime);

    // Clean up old failures outside the window
    this.cleanupOldFailures();

    this.failures = this.failureTimestamps.length;

    console.warn(
      `[CircuitBreaker:${this.serviceName}] Failure (${this.failures}/${this.config.failureThreshold}):`,
      error instanceof Error ? error.message : error
    );

    if (this.state === 'HALF_OPEN') {
      // Any failure in HALF_OPEN opens the circuit again
      this.state = 'OPEN';
      console.log(
        `[CircuitBreaker:${this.serviceName}] Circuit OPEN - failure during recovery test`
      );
    } else if (this.failures >= this.config.failureThreshold) {
      this.state = 'OPEN';
      console.log(
        `[CircuitBreaker:${this.serviceName}] Circuit OPEN - threshold reached (${this.failures} failures in ${this.config.failureWindow}ms)`
      );
    }
  }

  /**
   * Remove failures outside the time window
   */
  private cleanupOldFailures(): void {
    const cutoff = Date.now() - this.config.failureWindow;
    this.failureTimestamps = this.failureTimestamps.filter((ts) => ts > cutoff);
  }

  /**
   * Get current circuit breaker statistics
   */
  getStats(): CircuitBreakerStats {
    this.cleanupOldFailures();
    return {
      state: this.state,
      failures: this.failureTimestamps.length,
      successes: this.successes,
      lastFailure: this.lastFailureTime ? new Date(this.lastFailureTime) : null,
      lastSuccess: this.lastSuccessTime ? new Date(this.lastSuccessTime) : null,
      totalRequests: this.totalRequests,
      totalFailures: this.totalFailures,
    };
  }

  /**
   * Get current state
   */
  getState(): CircuitState {
    // Check if we should transition from OPEN to HALF_OPEN
    if (this.state === 'OPEN' && Date.now() - this.lastFailureTime >= this.config.resetTimeout) {
      return 'HALF_OPEN';
    }
    return this.state;
  }

  /**
   * Manually reset the circuit breaker
   */
  reset(): void {
    this.state = 'CLOSED';
    this.failures = 0;
    this.successes = 0;
    this.failureTimestamps = [];
    console.log(`[CircuitBreaker:${this.serviceName}] Manually reset to CLOSED`);
  }

  /**
   * Check if circuit is allowing requests
   */
  isAllowingRequests(): boolean {
    return this.getState() !== 'OPEN';
  }
}

/**
 * Global circuit breakers for different LLM providers
 */
const circuitBreakers = new Map<string, CircuitBreaker>();

/**
 * Get or create a circuit breaker for a service
 */
export function getCircuitBreaker(
  serviceName: string,
  config?: Partial<CircuitBreakerConfig>
): CircuitBreaker {
  if (!circuitBreakers.has(serviceName)) {
    circuitBreakers.set(
      serviceName,
      new CircuitBreaker(serviceName, { ...DEFAULT_CONFIG, ...config })
    );
  }
  return circuitBreakers.get(serviceName)!;
}

/**
 * Get circuit breaker for OpenAI
 */
export function getOpenAiCircuitBreaker(): CircuitBreaker {
  return getCircuitBreaker('openai', {
    failureThreshold: 5,
    resetTimeout: 30000,
    successThreshold: 2,
  });
}

/**
 * Get circuit breaker for Gemini
 */
export function getGeminiCircuitBreaker(): CircuitBreaker {
  return getCircuitBreaker('gemini', {
    failureThreshold: 5,
    resetTimeout: 30000,
    successThreshold: 2,
  });
}

/**
 * Get all circuit breaker stats (for monitoring)
 */
export function getAllCircuitBreakerStats(): Record<string, CircuitBreakerStats> {
  const stats: Record<string, CircuitBreakerStats> = {};
  for (const [name, breaker] of circuitBreakers) {
    stats[name] = breaker.getStats();
  }
  return stats;
}
