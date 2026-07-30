/**
 * src/frontend/config.js
 * Frontend environment configuration injected at build time or via script tag.
 */

window.APP_CONFIG = window.APP_CONFIG || {
  mode:         'local', // 'local' | 'saas'
  apiUrl:       '',      // Used if mode === 'saas'
  socketUrl:    '',      // Used by realtime client
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
