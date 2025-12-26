/**
 * Base error class for Moneio application errors
 */
export class MoneioError extends Error {
  public readonly code: string;
  public readonly statusCode: number;

  constructor(message: string, code: string, statusCode = 500) {
    super(message);
    this.name = 'MoneioError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

/**
 * Not found error
 */
export class NotFoundError extends MoneioError {
  constructor(resource: string, id?: string) {
    const message = id ? `${resource} with id ${id} not found` : `${resource} not found`;
    super(message, 'NOT_FOUND', 404);
    this.name = 'NotFoundError';
  }
}

/**
 * Validation error
 */
export class ValidationError extends MoneioError {
  public readonly details: Record<string, string[]>;

  constructor(message: string, details: Record<string, string[]> = {}) {
    super(message, 'VALIDATION_ERROR', 400);
    this.name = 'ValidationError';
    this.details = details;
  }
}

/**
 * Unauthorized error
 */
export class UnauthorizedError extends MoneioError {
  constructor(message = 'Unauthorized') {
    super(message, 'UNAUTHORIZED', 401);
    this.name = 'UnauthorizedError';
  }
}

/**
 * Forbidden error
 */
export class ForbiddenError extends MoneioError {
  constructor(message = 'Forbidden') {
    super(message, 'FORBIDDEN', 403);
    this.name = 'ForbiddenError';
  }
}

/**
 * Rate limit error
 */
export class RateLimitError extends MoneioError {
  public readonly retryAfter: number;

  constructor(retryAfter = 60) {
    super('Rate limit exceeded', 'RATE_LIMIT_EXCEEDED', 429);
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
  }
}
