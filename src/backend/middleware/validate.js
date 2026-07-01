import { AppError } from '../../shared/errors.js';

/**
 * Validates request bodies against Zod schemas from our shared layer.
 * @param {import('zod').ZodSchema} schema 
 */
export const validateBody = (schema) => {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    
    if (!result.success) {
      // Map Zod errors to our ValidationError format
      const fields = {};
      result.error.issues.forEach(issue => {
        const path = issue.path.join('.');
        fields[path] = issue.message;
      });
      
      const err = new AppError('Validation failed', 400, 'VALIDATION_ERROR');
      err.fields = fields;
      return next(err);
    }
    
    // Replace body with parsed (and typed/coerced) data
    req.body = result.data;
    next();
  };
};
