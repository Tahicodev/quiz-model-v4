/**
 * src/frontend/utils/logger.js
 * Browser-side structured logger.
 * Silenced in production mode (except for ERROR level if configured to send to backend).
 */

import { LOG_LEVELS } from '../../shared/constants.js';

class Logger {
  #isProd;

  constructor() {
    this.#isProd = window.APP_CONFIG?.mode === 'production';
  }

  #log(level, msg, ...args) {
    if (this.#isProd && level !== LOG_LEVELS.ERROR && level !== LOG_LEVELS.SECURITY) return;
    
    const prefix = `[${level.toUpperCase()}]`;
    const style  = this.#getStyle(level);
    
    // eslint-disable-next-line no-console
    console.log(`%c${prefix}`, style, msg, ...args);

    if (this.#isProd && (level === LOG_LEVELS.ERROR || level === LOG_LEVELS.SECURITY)) {
      this.#sendToBackend(level, msg, args);
    }
  }

  #getStyle(level) {
    switch (level) {
      case LOG_LEVELS.DEBUG:    return 'color: #888;';
      case LOG_LEVELS.INFO:     return 'color: #3b82f6;';
      case LOG_LEVELS.WARN:     return 'color: #f59e0b; font-weight: bold;';
      case LOG_LEVELS.ERROR:    return 'color: #ef4444; font-weight: bold; background: #fee2e2; padding: 2px 4px;';
      case LOG_LEVELS.SECURITY: return 'color: #fff; font-weight: bold; background: #000; padding: 2px 4px;';
      default:                  return '';
    }
  }

  #sendToBackend(level, msg, args) {
    // Fire-and-forget telemetry for critical client errors in production
    if (!window.APP_CONFIG?.telemetryUrl) return;
    try {
      fetch(window.APP_CONFIG.telemetryUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          level,
          msg,
          args: args.map(a => (a instanceof Error ? a.stack : a)),
          url: window.location.href,
          ua: navigator.userAgent,
        }),
      }).catch(() => {});
    } catch { /* ignore */ }
  }

  debug(msg, ...args)    { this.#log(LOG_LEVELS.DEBUG, msg, ...args); }
  info(msg, ...args)     { this.#log(LOG_LEVELS.INFO, msg, ...args); }
  warn(msg, ...args)     { this.#log(LOG_LEVELS.WARN, msg, ...args); }
  error(msg, ...args)    { this.#log(LOG_LEVELS.ERROR, msg, ...args); }
  security(msg, ...args) { this.#log(LOG_LEVELS.SECURITY, msg, ...args); }
}

export const logger = new Logger();
