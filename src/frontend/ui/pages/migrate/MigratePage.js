/**
 * src/frontend/ui/pages/migrate/MigratePage.js
 * Tooling for migrating legacy LocalStorage data to the backend (SaaS mode).
 *
 * POSTs to /api/v1/migrate (admin-only, tenant-scoped, idempotent) instead of
 * pushing rows through container.repo.createMany directly. The backend enforces
 * FK order, tenant scoping, and skip-duplicates idempotency — see
 * src/backend/routes/migrate.routes.js.
 */

import { getContainer } from '../../../container.js';
import { config }        from '../../../config.js';
import { withError }    from '../../../utils/eventBus.js';

/** FK-safe order — parents before children. Must match the backend's MIGRATE_ORDER. */
const MIGRATE_ORDER = [
  'classes',
  'categories',
  'users',
  'questions',
  'exams',
  'exam_questions',
  'exam_classes',
  'results',
  'games',
  'game_sessions',
  'tournaments',
  'tournament_entries',
  'exam_sessions',
  'settings',
];

/** Build the { data: { [table]: rows } } payload from LocalStorage. */
async function buildPayload() {
  // Read from a fresh LocalStorageRepository regardless of the active mode —
  // in SaaS mode the active repo is the ApiRepository, so we instantiate the
  // LocalStorage impl just to read the legacy data off disk.
  const { LocalStorageRepository } = await import('../../../infrastructure/LocalStorageRepository.js');
  const localRepo = new LocalStorageRepository();

  const data = {};
  for (const table of MIGRATE_ORDER) {
    const rows = localRepo.getAll_sync(table);
    if (rows.length > 0) data[table] = rows;
  }
  return { data };
}

/**
 * POST all LocalStorage data to /api/v1/migrate.
 * @returns {Promise<string[]>} per-table human-readable log lines.
 */
export async function migrateDataToBackend() {
  const container = getContainer();
  const token     = container.authSvc.getToken();
  const baseUrl   = config.apiUrl || ''; // '' → same-origin in SaaS mode
  const log       = [];

  const payload = await buildPayload();
  const tables  = Object.keys(payload.data);
  if (tables.length === 0) {
    log.push('No LocalStorage data found to migrate.');
    return log;
  }

  await withError(async () => {
    const res = await fetch(`${baseUrl}/api/v1/migrate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(`Migration failed (${res.status}): ${body.message || res.statusText}`);
    }

    const { results, totalInserted } = await res.json();
    for (const r of results) {
      log.push(`Migrated ${r.inserted}/${r.total} records for ${r.table}` +
        (r.skipped ? ` (${r.skipped} skipped as duplicates)` : '') +
        (r.error ? ` — ERROR: ${r.error}` : ''));
    }
    log.push(`Total inserted: ${totalInserted}. Re-run to confirm idempotency (expect 0 inserted).`);
  }, 'Migration to backend complete');

  return log;
}

/**
 * GET /api/v1/migrate/status — verify per-table counts in the backend match.
 * @returns {Promise<object>} { counts: { [table]: number } }
 */
export async function getMigrationStatus() {
  const container = getContainer();
  const token     = container.authSvc.getToken();
  const baseUrl   = config.apiUrl || '';

  const res = await fetch(`${baseUrl}/api/v1/migrate/status`, {
    headers: { ...(token && { Authorization: `Bearer ${token}` }) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`Status fetch failed (${res.status}): ${body.message || res.statusText}`);
  }
  return res.json();
}
