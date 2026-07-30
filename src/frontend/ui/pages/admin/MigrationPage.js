/**
 * Admin migration tab. Keeps the legacy LocalStorage → backend migration
 * available from the migrated admin shell instead of linking to a page that
 * no longer exists.
 */

import { config } from '../../../config.js';
import { migrateDataToBackend, getMigrationStatus } from '../migrate/MigratePage.js';

export async function initMigrationPage(host) {
  host.replaceChildren();

  const title = document.createElement('h1');
  title.className = 'page-title';
  title.textContent = 'Data migration';

  const intro = document.createElement('p');
  intro.className = 'page-subtitle';
  intro.textContent = 'Import legacy LocalStorage data into the backend. The operation is tenant-scoped and safe to run more than once.';

  const warning = document.createElement('p');
  warning.className = 'admin-modal__hint';
  warning.textContent = config.mode === 'saas'
    ? 'Run this after signing in to the target school. Existing records are skipped.'
    : 'Migration is available when the app is connected to the backend in SaaS mode.';

  const toolbar = document.createElement('div');
  toolbar.className = 'admin-toolbar';
  const migrateBtn = document.createElement('button');
  migrateBtn.type = 'button';
  migrateBtn.className = 'btn btn-primary';
  migrateBtn.textContent = 'Start migration';
  migrateBtn.disabled = config.mode !== 'saas';
  const statusBtn = document.createElement('button');
  statusBtn.type = 'button';
  statusBtn.className = 'btn btn-secondary';
  statusBtn.textContent = 'Refresh backend status';
  statusBtn.disabled = config.mode !== 'saas';
  toolbar.append(migrateBtn, statusBtn);

  const output = document.createElement('pre');
  output.className = 'admin-migration-output';
  output.setAttribute('aria-live', 'polite');
  output.textContent = 'No migration run in this session.';

  const statusHost = document.createElement('div');
  statusHost.className = 'admin-migration-status';

  host.append(title, intro, warning, toolbar, output, statusHost);

  migrateBtn.addEventListener('click', async () => {
    migrateBtn.disabled = true;
    output.textContent = 'Migrating…';
    try {
      output.textContent = (await migrateDataToBackend()).join('\n');
      await renderStatus(statusHost);
    } catch (err) {
      output.textContent = `Migration failed: ${err.message}`;
    } finally {
      migrateBtn.disabled = false;
    }
  });

  statusBtn.addEventListener('click', () => renderStatus(statusHost));
  if (config.mode === 'saas') await renderStatus(statusHost);
  return () => renderStatus(statusHost);
}

async function renderStatus(host) {
  host.replaceChildren();
  try {
    const { counts = {} } = await getMigrationStatus();
    const table = document.createElement('table');
    table.className = 'data-table';
    const head = document.createElement('thead');
    const row = document.createElement('tr');
    for (const label of ['Table', 'Backend records']) {
      const cell = document.createElement('th');
      cell.textContent = label;
      row.appendChild(cell);
    }
    head.appendChild(row);
    table.appendChild(head);
    const body = document.createElement('tbody');
    for (const [tableName, count] of Object.entries(counts)) {
      const tr = document.createElement('tr');
      const name = document.createElement('td');
      name.textContent = tableName;
      const total = document.createElement('td');
      total.textContent = count == null ? 'Unavailable' : String(count);
      tr.append(name, total);
      body.appendChild(tr);
    }
    table.appendChild(body);
    host.appendChild(table);
  } catch (err) {
    const message = document.createElement('p');
    message.className = 'admin-error';
    message.textContent = `Could not load backend status: ${err.message}`;
    host.appendChild(message);
  }
}
