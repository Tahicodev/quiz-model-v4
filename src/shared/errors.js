/**
 * src/shared/errors.js
 * Typed domain errors — shared between frontend and backend.
 * Import from this file in both environments; never throw plain Error objects.
 */

export class AppError extends Error {
  constructor(code, message, statusCode = 500) {
    super(message);
    this.name       = 'AppError';
    this.code       = code;
    this.statusCode = statusCode;
  }
}

export class NotFoundError extends AppError {
  constructor(entity = 'Resource') {
    super('NOT_FOUND', `${entity} not found`, 404);
  }
}

export class UnauthorizedError extends AppError {
  constructor(msg = 'Unauthorized') {
    super('UNAUTHORIZED', msg, 401);
  }
}

export class ForbiddenError extends AppError {
  constructor() {
    super('FORBIDDEN', 'Access denied', 403);
  }
}

export class ValidationError extends AppError {
  /**
   * @param {Record<string, string[]>} fields  e.g. { name: ['Required'] }
   */
  constructor(fields = {}) {
    super('VALIDATION_ERROR', 'Validation failed', 422);
    this.fields = fields;
  }
}

export class ConflictError extends AppError {
  constructor(msg) {
    super('CONFLICT', msg, 409);
  }
}

export class RateLimitError extends AppError {
  constructor() {
    super('RATE_LIMITED', 'Too many requests', 429);
  }
}

export class SessionError extends AppError {
  constructor(msg) {
    super('SESSION_ERROR', msg, 400);
  }
}
