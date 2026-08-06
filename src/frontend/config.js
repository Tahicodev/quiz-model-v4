/**
 * src/frontend/config.js
 * Frontend environment configuration injected at boot by the backend
 * (see src/backend/server.js — APP_CONFIG is rendered into the served HTML).
 *
 * SaaS-only build: `mode` is always `'saas'`. The field is kept for backward
 * compatibility with the legacy bridge scripts that still read it; it is no
 * longer a branch point.
 */

window.APP_CONFIG = window.APP_CONFIG || {
  mode:         'saas',
  apiUrl:       '/api/v1',
  socketUrl:    '/',
  telemetryUrl: '',      // Optional production error logging endpoint
};

export const config = window.APP_CONFIG;

/**
 * Resolve a path against the configured API base without duplicating the
 * `/api/v1` prefix. `apiUrl` may be an origin, `/api/v1`, or an empty string
 * for same-origin deployments.
 */
export function apiUrl(path = '') {
  const base = String(config.apiUrl || '').replace(/\/$/, '');
  const target = String(path || '');
  if (!target) return base;
  if (!base) return target.startsWith('/') ? target : `/${target}`;
  if (target === base || target.startsWith(`${base}/`)) return target;
  if (/^[a-z][a-z\d+.-]*:\/\//i.test(base)) {
    const root = new URL(base);
    const basePath = root.pathname.replace(/\/$/, '');
    const targetUrl = new URL(target.startsWith('/') ? target : `/${target}`, root.origin);
    targetUrl.pathname = `${basePath}${targetUrl.pathname}`.replace(/\/+/g, '/');
    return targetUrl.toString();
  }
  return `${base}${target.startsWith('/') ? target : `/${target}`}`;
}
