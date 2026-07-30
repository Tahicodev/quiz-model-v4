/**
 * src/frontend/ui/pages/admin/SettingsPage.js
 * Admin settings editor: lists public/teacher/admin visibility tiers and lets
 * admins edit or add settings. System-tier settings are intentionally never
 * exposed here (per spec §6 — system settings never sent to the client).
 *
 * Uses SettingsService via the container:
 *   getPublicSettings / getTeacherSettings / getAdminSettings / updateSetting / bulkUpdate
 */

import { getContainer }   from '../../../container.js';
import { withError }       from '../../../utils/eventBus.js';
import { logger }          from '../../../utils/logger.js';
import { confirmDialog }   from './components/ConfirmDialog.js';
import { formModal, textField, selectField } from './components/FormModal.js';
import { SETTINGS_VISIBILITY } from '../../../../shared/constants.js';

let hostRef = null;

export async function initSettingsPage(host) {
  hostRef = host;
  host.replaceChildren();

  const title = document.createElement('h1');
  title.className = 'page-title';
  title.textContent = 'Settings';
  host.appendChild(title);

  const subtitle = document.createElement('p');
  subtitle.className = 'page-subtitle';
  subtitle.textContent = 'Manage app configuration. Public settings are sent to all clients; admin settings only to admins; system settings are never exposed.';
  host.appendChild(subtitle);

  const toolbar = document.createElement('div');
  toolbar.className = 'admin-toolbar';
  const spacer = document.createElement('span');
  spacer.style.flex = '1';
  const newBtn = document.createElement('button');
  newBtn.type = 'button'; newBtn.className = 'btn btn-primary';
  newBtn.textContent = '+ New setting';
  newBtn.addEventListener('click', () => openSettingForm(null));
  toolbar.append(spacer, newBtn);
  host.appendChild(toolbar);

  const sectionsHost = document.createElement('div');
  sectionsHost.id = 'settings-sections';
  host.appendChild(sectionsHost);

  await load();
  return load;
}

async function load() {
  const host = document.getElementById('settings-sections');
  if (!host) return;
  host.replaceChildren();

  const c = getContainer();
  let publicSettings = [], teacherSettings = [], adminSettings = [];
  try { publicSettings  = await c.settingsSvc.getPublicSettings()  ?? []; } catch (e) { logger.warn('public settings load failed', e); }
  try { teacherSettings = await c.settingsSvc.getTeacherSettings() ?? []; } catch (e) { logger.warn('teacher settings load failed', e); }
  try { adminSettings   = await c.settingsSvc.getAdminSettings()   ?? []; } catch (e) { logger.warn('admin settings load failed', e); }

  host.append(
    section('Public settings', 'Visible to everyone, including unauthenticated users.', publicSettings, SETTINGS_VISIBILITY.PUBLIC),
    section('Teacher settings', 'Visible to admins and teachers.', teacherSettings, SETTINGS_VISIBILITY.TEACHER),
    section('Admin settings', 'Visible only to admins.', adminSettings, SETTINGS_VISIBILITY.ADMIN),
  );
}

function section(titleText, hint, items, visibility) {
  const wrap = document.createElement('section');
  wrap.className = 'admin-settings__section';
  const h = document.createElement('h2');
  h.className = 'admin-settings__section-title';
  h.textContent = titleText;
  const hintEl = document.createElement('p');
  hintEl.className = 'admin-modal__hint';
  hintEl.textContent = hint;
  wrap.append(h, hintEl);

  if (!items || items.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'admin-empty-inline';
    empty.textContent = 'No settings in this tier.';
    wrap.appendChild(empty);
    return wrap;
  }

  const table = document.createElement('table');
  table.className = 'data-table';
  const thead = document.createElement('thead');
  const trh = document.createElement('tr');
  ['Key', 'Value', 'Actions'].forEach(t => {
    const th = document.createElement('th'); th.textContent = t; trh.appendChild(th);
  });
  thead.appendChild(trh);
  table.appendChild(thead);
  const tbody = document.createElement('tbody');
  for (const s of items) tbody.appendChild(settingRow(s, visibility));
  table.appendChild(tbody);
  wrap.appendChild(table);
  return wrap;
}

function settingRow(s, visibility) {
  const tr = document.createElement('tr');
  const k = document.createElement('td'); k.textContent = s.key; tr.appendChild(k);
  const v = document.createElement('td'); v.textContent = s.value; v.style.maxWidth = '40ch'; v.style.overflowWrap = 'anywhere'; tr.appendChild(v);

  const actions = document.createElement('td');
  const edit = document.createElement('button');
  edit.type = 'button'; edit.className = 'btn btn-secondary btn-sm';
  edit.textContent = 'Edit'; edit.addEventListener('click', () => openSettingForm(s));
  const del = document.createElement('button');
  del.type = 'button'; del.className = 'btn btn-danger btn-sm';
  del.textContent = 'Delete'; del.addEventListener('click', () => deleteSetting(s));
  actions.append(edit, del);
  tr.appendChild(actions);
  return tr;
}

function openSettingForm(setting) {
  const isEdit = !!setting;
  const fieldsHTML = [
    textField('key', 'Key', { value: setting?.key ?? '', required: true, placeholder: 'app.name' }),
    textField('value', 'Value', { value: setting?.value ?? '', required: true }),
    selectField('visibility', 'Visibility', SETTINGS_VISIBILITY, { value: setting?.visibility ?? SETTINGS_VISIBILITY.ADMIN, required: true }),
  ].join('');
  formModal({
    title: isEdit ? 'Edit setting' : 'New setting',
    fieldsHTML,
    confirmText: isEdit ? 'Update' : 'Create',
    onSubmit: async (values) => {
      const c = getContainer();
      await c.settingsSvc.updateSetting('local', values.key, values.value, values.visibility);
      await load();
    },
  });
}

async function deleteSetting(setting) {
  const ok = await confirmDialog({
    title: 'Delete setting?',
    message: `Delete "${setting.key}"? This may change app behavior for affected users.`,
    confirmText: 'Delete',
  });
  if (!ok) return;
  // No dedicated delete service method exposed; delete via repo (admin-gated by virtue of being on this page).
  await withError(async () => {
    const c = getContainer();
    const schoolId = c.authSvc.getCurrentUser()?.school_id ?? 'local';
    await c.settingsSvc.deleteSetting(schoolId, setting.key);
    await load();
  }, 'Setting deleted');
}
