/**
 * src/frontend/ui/pages/admin/ClassesPage.js
 * Class CRUD + student list (read-only) per class.
 *
 * Uses ClassService via the container:
 *   list / getById / create / update / delete / getStudents
 */

import { getContainer }    from '../../../container.js';
import { withError }       from '../../../utils/eventBus.js';
import { createDataTable } from './components/DataTable.js';
import { confirmDialog }   from './components/ConfirmDialog.js';
import { formModal, textField, textareaField } from './components/FormModal.js';

let tableCtl = null;

export async function initClassesPage(host) {
  host.replaceChildren();

  const title = document.createElement('h1');
  title.className = 'page-title';
  title.textContent = 'Classes';

  const toolbar = document.createElement('div');
  toolbar.className = 'admin-toolbar';
  const spacer = document.createElement('span');
  spacer.style.flex = '1';
  const newBtn = document.createElement('button');
  newBtn.type = 'button'; newBtn.className = 'btn btn-primary';
  newBtn.textContent = '+ New Class';
  newBtn.addEventListener('click', () => openClassForm(null));
  toolbar.append(spacer, newBtn);

  const tableHost = document.createElement('div');
  tableHost.id = 'classes-table-host';
  host.append(title, toolbar, tableHost);

  tableCtl = createDataTable({
    containerId: 'classes-table-host',
    columns: [
      { key: 'name', label: 'Name', sortable: true },
      { key: 'description', label: 'Description', sortable: false, render: (v) => v || '—' },
      { key: 'created_at', label: 'Created', sortable: true, render: (v) => v ? new Date(v).toLocaleDateString() : '—' },
      { key: 'actions', label: 'Actions', sortable: false, render: (_v, row) => actionButtons(row) },
    ],
    fetch: async (p) => {
      const c = getContainer();
      return c.classSvc.list({}, {
        limit: p.limit, offset: p.offset, orderBy: p.orderBy, direction: p.direction, search: p.search,
      });
    },
    initialOrderBy: 'name',
    initialDirection: 'asc',
  });

  await tableCtl.render();
  return async () => { await tableCtl.resetAndRefresh(); };
}

function actionButtons(row) {
  const wrap = document.createElement('div');
  wrap.className = 'admin-row-actions';
  const edit = document.createElement('button');
  edit.type = 'button'; edit.className = 'btn btn-secondary btn-sm';
  edit.textContent = 'Edit'; edit.addEventListener('click', () => openClassForm(row));
  const students = document.createElement('button');
  students.type = 'button'; students.className = 'btn btn-secondary btn-sm';
  students.textContent = 'Students'; students.addEventListener('click', () => showStudents(row));
  const del = document.createElement('button');
  del.type = 'button'; del.className = 'btn btn-danger btn-sm';
  del.textContent = 'Delete'; del.addEventListener('click', () => deleteClass(row));
  wrap.append(edit, students, del);
  return wrap;
}

function openClassForm(cls) {
  const isEdit = !!cls;
  const fieldsHTML = [
    textField('name', 'Name', { value: cls?.name ?? '', required: true }),
    textareaField('description', 'Description', { value: cls?.description ?? '', rows: 2 }),
  ].join('');
  formModal({
    title: isEdit ? 'Edit Class' : 'New Class',
    fieldsHTML,
    confirmText: isEdit ? 'Update' : 'Create',
    onSubmit: async (values) => {
      const c = getContainer();
      const me = c.authSvc.getCurrentUser();
      if (isEdit) await c.classSvc.update(cls.id, values, me);
      else        await c.classSvc.create(values, me);
      await tableCtl.resetAndRefresh();
    },
  });
}

async function showStudents(cls) {
  const c = getContainer();
  let students = [];
  try { students = await c.classSvc.getStudents(cls.id); }
  catch { students = []; }

  const rows = students.length === 0
    ? '<p class="admin-empty-inline">No students in this class.</p>'
    : students.map(s => `<div class="admin-checklist__item"><span class="admin-checklist__label">${escapeText(s.name ?? s.username)}</span><span class="badge">${escapeText(s.role)}</span></div>`).join('');

  formModal({
    title: `Students in ${cls.name}`,
    fieldsHTML: `<div class="admin-checklist">${rows}</div>`,
    confirmText: 'Close',
    onSubmit: async () => {},
  });
}

async function deleteClass(cls) {
  const ok = await confirmDialog({
    title: 'Delete class?',
    message: `Delete "${cls.name}"? Classes with students assigned cannot be deleted.`,
    confirmText: 'Delete',
  });
  if (!ok) return;
  await withError(async () => {
    const c = getContainer();
    await c.classSvc.delete(cls.id, c.authSvc.getCurrentUser());
    await tableCtl.resetAndRefresh();
  }, 'Class deleted');
}

function escapeText(s) {
  return String(s ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
  }[ch]));
}
