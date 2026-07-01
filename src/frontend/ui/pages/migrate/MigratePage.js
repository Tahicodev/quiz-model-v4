/**
 * src/frontend/ui/pages/migrate/MigratePage.js
 * Tooling for migrating legacy LocalStorage data to the new Backend (SaaS mode).
 */

import { getContainer } from '../../../container.js';
import { withError }    from '../../../utils/eventBus.js';

export async function migrateDataToBackend() {
  const container = getContainer();

  // For migration, we explicitly want the raw LocalStorageRepository
  // We grab it from container.repo if local mode, but in SaaS mode repo is ApiRepository
  // So we instantiate a fresh LocalStorageRepository just to read data.
  const { LocalStorageRepository } = await import('../../../infrastructure/LocalStorageRepository.js');
  const localRepo = new LocalStorageRepository();

  const tables = ['users', 'classes', 'categories', 'questions', 'exams', 'results'];
  const log = [];

  for (const table of tables) {
    const data = localRepo.getAll_sync(table);
    if (data.length === 0) continue;

    await withError(async () => {
      // In SaaS mode, container.repo is the ApiRepository.
      // We push the whole array to the bulk insert endpoint.
      await container.repo.createMany(table, data);
      log.push(`Migrated ${data.length} records for ${table}`);
    }, `Successfully migrated ${table}`);
  }

  return log;
}
