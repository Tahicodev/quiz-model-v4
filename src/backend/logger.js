/**
 * src/backend/logger.js
 *
 * Structured logging via Pino. Raw JSON in production; human-readable
 * (pino-pretty) in development. Import `logger` everywhere — no console.log.
 *
 * Log level policy (enforce across the backend):
 *   logger.debug  — dev only: socket events, cache hits, DB query details
 *   logger.info   — notable events: login success, exam submitted
 *   logger.warn   — unexpected but handled: login failure, rate limit, expired session
 *   logger.error  — failures that should not happen: DB errors, unhandled exceptions
 *   securityLog() — always logged at WARN: auth failures, unauthorized access, admin actions
 */

import pino from 'pino';
import { config } from './config.js';
import { recordLog } from './server-metrics.js';

const isProduction = config.nodeEnv === 'production';

export const logger = pino({
	level: config.logLevel,
	base: { service: 'quiz-app' },
	...(isProduction
		? // Raw JSON, no transport — fastest, ideal for log aggregators.
			{}
		: {
				transport: {
					target: 'pino-pretty',
					options: { colorize: true, translateTime: 'HH:MM:ss' },
				},
			}),
});

// Keep a small in-memory diagnostic stream for the admin monitoring panel.
// The normal Pino output remains the authoritative server log destination.
for (const level of ['trace', 'debug', 'info', 'warn', 'error', 'fatal']) {
	const write = logger[level].bind(logger);
	logger[level] = (...args) => {
		recordLog(level, args);
		return write(...args);
	};
}

/**
 * Security-specific log helper. Always written at WARN level regardless of the
 * global LOG_LEVEL (Pino respects level, but we bump severity explicitly).
 *
 * @param {string} event    Short event id: 'login_failure', 'unauthorized_route', ...
 * @param {object} details  Additional structured context (never include passwords/tokens).
 */
export function securityLog(event, details = {}) {
	logger.warn({ type: 'SECURITY', event, ...details });
}
