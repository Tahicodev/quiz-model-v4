/**
 * src/frontend/ui/pages/admin/components/api.js
 * Thin fetch wrapper for admin endpoints that don't map cleanly to a frontend
 * service (e.g. exam publish/archive already have service methods, but a few
 * raw GETs for dashboard KPIs are simpler to issue directly).
 *
 * All admin pages should prefer container services first; use this only when a
 * service method is genuinely missing.
 */

import { getContainer } from '../../../../container.js';
import { config }        from '../../../../config.js';
import { AppError }       from '../../../../shared/errors.js';

/**
 * @param {string} method
 * @param {string} path - path under /api/v1, with leading slash
 * @param {object|null} [body]
 * @returns {Promise<any>}
 */
export async function api(method, path, body = null) {
  const { authSvc } = getContainer();
  const baseUrl = config.apiUrl || ''; // '' → same-origin in SaaS mode
  const headers = { 'Content-Type': 'application/json' };
  const token = authSvc.getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    credentials: 'include',
    body: body !== null ? JSON.stringify(body) : undefined,
  });

  // 204 → empty
  if (res.status === 204) return null;

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new AppError(json.code ?? 'API_ERROR', json.message ?? res.statusText, res.status);
  }
  return json;
}
