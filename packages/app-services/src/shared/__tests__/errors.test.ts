/**
 * Error Classes Tests
 */

import { describe, it, expect } from 'vitest';

import {
  AppError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
  RateLimitError,
  ConflictError,
} from '../errors';

describe('Error Classes', () => {
  describe('AppError', () => {
    it('creates error with message, code, and status code', () => {
      const error = new AppError('Something went wrong', 'INTERNAL_ERROR', 500);

      expect(error.message).toBe('Something went wrong');
      expect(error.code).toBe('INTERNAL_ERROR');
      expect(error.statusCode).toBe(500);
      expect(error.name).toBe('AppError');
      expect(error).toBeInstanceOf(Error);
    });

    it('captures stack trace', () => {
      const error = new AppError('Test error', 'TEST', 400);

      expect(error.stack).toBeDefined();
    });
  });

  describe('UnauthorizedError', () => {
    it('has 401 status code', () => {
      const error = new UnauthorizedError('Not logged in');

      expect(error.statusCode).toBe(401);
      expect(error.code).toBe('UNAUTHORIZED');
      expect(error.message).toBe('Not logged in');
      expect(error.name).toBe('UnauthorizedError');
    });

    it('uses default message', () => {
      const error = new UnauthorizedError();

      expect(error.message).toBe('Not authenticated');
    });
  });

  describe('ForbiddenError', () => {
    it('has 403 status code', () => {
      const error = new ForbiddenError('No access');

      expect(error.statusCode).toBe(403);
      expect(error.code).toBe('FORBIDDEN');
      expect(error.message).toBe('No access');
      expect(error.name).toBe('ForbiddenError');
    });

    it('uses default message', () => {
      const error = new ForbiddenError();

      expect(error.message).toBe('Permission denied');
    });
  });

  describe('NotFoundError', () => {
    it('has 404 status code', () => {
      const error = new NotFoundError('User not found');

      expect(error.statusCode).toBe(404);
      expect(error.code).toBe('NOT_FOUND');
      expect(error.message).toBe('User not found');
      expect(error.name).toBe('NotFoundError');
    });

    it('uses default message', () => {
      const error = new NotFoundError();

      expect(error.message).toBe('Resource not found');
    });
  });

  describe('ValidationError', () => {
    it('has 400 status code', () => {
      const error = new ValidationError('Invalid input');

      expect(error.statusCode).toBe(400);
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.message).toBe('Invalid input');
      expect(error.name).toBe('ValidationError');
    });

    it('uses default message', () => {
      const error = new ValidationError();

      expect(error.message).toBe('Validation failed');
    });

    it('can include validation details', () => {
      const error = new ValidationError('Invalid input', {
        email: ['Invalid email format'],
        password: ['Too short', 'Must contain number'],
      });

      expect(error.details).toEqual({
        email: ['Invalid email format'],
        password: ['Too short', 'Must contain number'],
      });
    });
  });

  describe('RateLimitError', () => {
    it('has 429 status code and retryAfter', () => {
      const error = new RateLimitError('Too many requests', 30);

      expect(error.statusCode).toBe(429);
      expect(error.code).toBe('RATE_LIMITED');
      expect(error.message).toBe('Too many requests');
      expect(error.retryAfter).toBe(30);
      expect(error.name).toBe('RateLimitError');
    });

    it('uses default message and undefined retryAfter', () => {
      const error = new RateLimitError();

      expect(error.message).toBe('Rate limit exceeded');
      expect(error.retryAfter).toBeUndefined();
    });
  });

  describe('ConflictError', () => {
    it('has 409 status code', () => {
      const error = new ConflictError('Already exists');

      expect(error.statusCode).toBe(409);
      expect(error.code).toBe('CONFLICT');
      expect(error.message).toBe('Already exists');
      expect(error.name).toBe('ConflictError');
    });

    it('uses default message', () => {
      const error = new ConflictError();

      expect(error.message).toBe('Resource conflict');
    });
  });

  describe('Error inheritance', () => {
    it('all errors extend AppError', () => {
      expect(new UnauthorizedError()).toBeInstanceOf(AppError);
      expect(new ForbiddenError()).toBeInstanceOf(AppError);
      expect(new NotFoundError()).toBeInstanceOf(AppError);
      expect(new ValidationError()).toBeInstanceOf(AppError);
      expect(new RateLimitError()).toBeInstanceOf(AppError);
      expect(new ConflictError()).toBeInstanceOf(AppError);
    });

    it('all errors extend Error', () => {
      expect(new UnauthorizedError()).toBeInstanceOf(Error);
      expect(new ForbiddenError()).toBeInstanceOf(Error);
      expect(new NotFoundError()).toBeInstanceOf(Error);
      expect(new ValidationError()).toBeInstanceOf(Error);
      expect(new RateLimitError()).toBeInstanceOf(Error);
      expect(new ConflictError()).toBeInstanceOf(Error);
    });
  });
});
