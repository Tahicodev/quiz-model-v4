/**
 * src/backend/middleware/validate.js
 *
 * Zod validation middleware for request bodies and query strings.
 * Uses the shared ValidationError class (422 status, field-level errors).
 */

import { ValidationError } from '../../shared/errors.js';

/**
 * Validates req.body against a Zod schema.
 * On success, replaces req.body with the parsed/coerced data.
 * On failure, throws ValidationError with field-level error map.
 *
 * @param {import('zod').ZodSchema} schema
 */
export const validateBody = (schema) => {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const fields = result.error.flatten().fieldErrors;
      return next(new ValidationError(fields));
    }
    req.body = result.data;
    next();
  };
};

/**
 * Validates req.query against a Zod schema.
 * On success, replaces req.query with the parsed/coerced data.
 *
 * @param {import('zod').ZodSchema} schema
 */
export const validateQuery = (schema) => {
  return (req, res, next) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      const fields = result.error.flatten().fieldErrors;
      return next(new ValidationError(fields));
    }
    req.query = result.data;
    next();
  };
};

// Aliases matching the spec naming
export const validate = validateBody;
export const validateRequest = validateBody;
