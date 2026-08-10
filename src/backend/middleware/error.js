import { AppError } from '../../shared/errors.js';
import { logger } from '../logger.js';

export const errorHandler = (err, req, res, next) => {
  let statusCode = 500;
  let code = 'INTERNAL_ERROR';
  let message = 'An unexpected error occurred';
  let fields = null;

  if (err instanceof AppError) {
    statusCode = err.statusCode;
    code = err.code;
    message = err.message;
    fields = err.fields;
    
    // Log warnings for client errors, errors for server errors
    if (statusCode >= 500) {
      logger.error(`[${code}] ${message}`, { stack: err.stack, path: req.path });
    } else {
      logger.warn(`[${code}] ${message}`, { path: req.path });
    }
  } else {
    // Unhandled system errors
    logger.error('Unhandled Exception:', { error: err.message, stack: err.stack, path: req.path });
  }

  // Defense-in-depth: res.status() throws RangeError for non-numeric or
  // out-of-range codes. If a malformed AppError (e.g. a statusCode that came
  // through as a string such as "FORBIDDEN") ever reaches here, coerce to a
  // valid HTTP status so the response is never a spurious 500.
  if (!Number.isInteger(statusCode) || statusCode < 400 || statusCode > 599) {
    statusCode = 500;
    code = typeof code === 'string' && code ? code : 'INTERNAL_ERROR';
    message = typeof message === 'string' && message ? message : 'An unexpected error occurred';
  }

  res.status(statusCode).json({
    success: false,
    error: {
      code,
      message,
      ...(fields && { fields }),
    }
  });
};
