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

  res.status(statusCode).json({
    success: false,
    error: {
      code,
      message,
      ...(fields && { fields }),
    }
  });
};
