/**
 * src/frontend/ui/pages/admin/UsersPage.js
 * User CRUD + role + class assignment + status + reset password.
 *
 * Uses UserService via the container:
 *   list / getById / create / update / delete / changeStatus / assignToClass / resetPassword
 */

import { getContainer }    from '../../../container.js';
import { withError }       from '../../../utils/eventBus.js';
import { logger }          from '../../../utils/logger.js';
import { createDataTable } from './components/DataTable.js';
import { confirmDialog }   from './components/ConfirmDialog.js';
import { formModal, textField, selectField } from './components/FormModal.js';
import { ROLES } from '../../../../shared/constants.js';

let tableCtl = null;
let classesCache = [];

export async function initUsersPage(host) {
  host.replaceChildren();

  const title = document.createElement('h1');
  title.className = 'page-title';
  title.textContent = 'Users';

  const toolbar = document.createElement('div');
  toolbar.className = 'admin-toolbar';
  const spacer = document.createElement('span');
  spacer.style.flex = '1';
  const newBtn = document.createElement('button');
  newBtn.type = 'button'; newBtn.className = 'btn btn-primary';
  newBtn.textContent = '+ New User';
  newBtn.addEventListener('click', () => openUserForm(null));
  toolbar.append(roleFilter(), statusFilter(), spacer, newBtn);

  const tableHost = document.createElement('div');
  tableHost.id = 'users-table-host';
  host.append(title, toolbar, tableHost);

  // Pre-load classes so form + display render correctly
  try {
    const c = getContainer();
    const res = await c.classSvc.list({}, { limit: 200, orderBy: 'name' });
    classesCache = res?.data ?? [];
  } catch (err) { logger.warn('Could not preload classes', err); }

  tableCtl = createDataTable({
    containerId: 'users-table-host',
    columns: [
      { key: 'name',     label: 'Name',     sortable: true },
      { key: 'username', label: 'Username', sortable: true },
      { key: 'role',     label: 'Role',     sortable: true, render: (v) => roleBadge(v) },
      { key: 'class_id', label: 'Class',    sortable: false, render: (v) => className(v) },
      { key: 'status',   label: 'Status',   sortable: true, render: (v) => statusBadge(v) },
      { key: 'last_login', label: 'Last login', sortable: true, render: (v) => v ? new Date(v).toLocaleDateString() : '—' },
      { key: 'actions', label: 'Actions', sortable: false, render: (_v, row) => actionButtons(row) },
    ],
    fetch: async (p) => {
      const c = getContainer();
      const filters = {};
      const roleSel = document.getElementById('user-filter-role');
      const statusSel = document.getElementById('user-filter-status');
      if (roleSel?.value) filters.role = roleSel.value;
      if (statusSel?.value) filters.status = statusSel.value;
      return c.userSvc.list(filters, {
        limit: p.limit, offset: p.offset, orderBy: p.orderBy, direction: p.direction, search: p.search,
      });
    },
    initialOrderBy: 'name',
    initialDirection: 'asc',
  });

  await tableCtl.render();
  return async () => { await tableCtl.resetAndRefresh(); };
}

function roleFilter() {
  const wrap = document.createElement('label');
  wrap.className = 'admin-toolbar__field';
  const span = document.createElement('span');
  span.textContent = 'Role';
  const sel = document.createElement('select');
  sel.id = 'user-filter-role';
  for (const [v, l] of Object.entries({ '': 'All roles', ...ROLES })) {
    const o = document.createElement('option');
    o.value = v; o.textContent = l;
    sel.appendChild(o);
  }
  sel.addEventListener('change', () => tableCtl?.resetAndRefresh());
  wrap.append(span, sel);
  return wrap;
}

function statusFilter() {
  const wrap = document.createElement('label');
  wrap.className = 'admin-toolbar__field';
  const span = document.createElement('span');
  span.textContent = 'Status';
  const sel = document.createElement('select');
  sel.id = 'user-filter-status';
  for (const [v, l] of Object.entries({ '': 'All', active: 'Active', inactive: 'Inactive', suspended: 'Suspended' })) {
    const o = document.createElement('option');
    o.value = v; o.textContent = l;
    sel.appendChild(o);
  }
  sel.addEventListener('change', () => tableCtl?.resetAndRefresh());
  wrap.append(span, sel);
  return wrap;
}

function className(id) {
  if (!id) return '—';
  const cls = classesCache.find(c => c.id === id);
  return cls ? cls.name : '—';
}

function roleBadge(v) {
  const span = document.createElement('span');
  span.className = 'badge badge--' + (v || 'student');
  span.textContent = v || 'student';
  return span;
}

function statusBadge(v) {
  const span = document.createElement('span');
  const cls = v === 'active' ? 'badge--green' : v === 'suspended' ? 'badge--red' : 'badge--gray';
  span.className = 'badge ' + cls;
  span.textContent = v || 'active';
  return span;
}

function actionButtons(row) {
  const wrap = document.createElement('div');
  wrap.className = 'admin-row-actions';
  const edit = document.createElement('button');
  edit.type = 'button'; edit.className = 'btn btn-secondary btn-sm';
  edit.textContent = 'Edit'; edit.addEventListener('click', () => openUserForm(row));
  const reset = document.createElement('button');
  reset.type = 'button'; reset.className = 'btn btn-secondary btn-sm';
  reset.textContent = 'Reset password';
  reset.addEventListener('click', () => resetPassword(row));
  const toggle = document.createElement('button');
  toggle.type = 'button'; toggle.className = 'btn btn-secondary btn-sm';
  toggle.textContent = row.status === 'suspended' ? 'Activate' : 'Suspend';
  toggle.addEventListener('click', () => toggleStatus(row));
  const del = document.createElement('button');
  del.type = 'button'; del.className = 'btn btn-danger btn-sm';
  del.textContent = 'Delete';
  del.addEventListener('click', () => deleteUser(row));
  wrap.append(edit, reset, toggle, del);
  return wrap;
}

// ── create/edit ───────────────────────────────────────────────────────────────

function openUserForm(user) {
  const isEdit = !!user;
  const classOptions = { '': '— None —', ...Object.fromEntries(classesCache.map(c => [c.id, c.name])) };
  const fieldsHTML = [
    textField('name', 'Full name', { value: user?.name ?? '', required: true }),
    textField('username', 'Username', { value: user?.username ?? '', required: true }),
    isEdit ? '' : textField('password', 'Password (min 6 chars)', { value: '', required: !isEdit, type: 'password' }),
    selectField('role', 'Role', ROLES, { value: user?.role ?? 'student', required: true }),
    selectField('class_id', 'Class', classOptions, { value: user?.class_id ?? '' }),
    textField('numero', 'Student number (optional)', { value: user?.numero ?? '' }),
    selectField('status', 'Status', { active: 'Active', inactive: 'Inactive', suspended: 'Suspended' }, { value: user?.status ?? 'active', required: true }),
  ].join('');

  formModal({
    title: isEdit ? 'Edit User' : 'New User',
    fieldsHTML,
    confirmText: isEdit ? 'Update' : 'Create',
    onSubmit: async (values) => {
      const c = getContainer();
      const me = c.authSvc.getCurrentUser();
      const payload = {
        ...values,
        class_id: values.class_id || null,
      };
      if (isEdit) {
        // Never send password on edit form here — password changes go through reset
        delete payload.password;
        await c.userSvc.update(user.id, payload, me);
      } else {
        await c.userSvc.create(payload, me);
      }
      await tableCtl.resetAndRefresh();
    },
  });
}

// ── reset password ────────────────────────────────────────────────────────────

function resetPassword(user) {
  const fieldsHTML = `
    <div class="form-field">
      <label for="fld-newpw">New password (min 6 chars) <span class="req">*</span></label>
      <input id="fld-newpw" name="newPassword" type="password" required minlength="6" autocomplete="new-password" />
    </div>
    <p class="admin-modal__hint">User: <strong></strong></p>
  `;
  formModal({
    title: 'Reset password',
    fieldsHTML,
    confirmText: 'Reset',
    onSubmit: async (values) => {
      const c = getContainer();
      await c.userSvc.resetPassword(user.id, values.newPassword, c.authSvc.getCurrentUser());
      await tableCtl.refresh();
    },
  });
  const strong = document.querySelector('#form-modal__form .admin-modal__hint strong');
  if (strong) strong.textContent = user.username;
}

// ── suspend / activate ────────────────────────────────────────────────────────

async function toggleStatus(user) {
  const newStatus = user.status === 'suspended' ? 'active' : 'suspended';
  const verb = newStatus === 'suspended' ? 'Suspend' : 'Activate';
  const ok = await confirmDialog({
    title: `${verb} user?`,
    message: `${verb} "${user.name ?? user.username}"?`,
    confirmText: verb,
    danger: newStatus === 'suspended',
  });
  if (!ok) return;
  await withError(async () => {
    const c = getContainer();
    await c.userSvc.changeStatus(user.id, newStatus, c.authSvc.getCurrentUser());
    await tableCtl.refresh();
  }, `User ${verb.toLowerCase()}d`);
}

// ── delete ────────────────────────────────────────────────────────────────────

async function deleteUser(user) {
  const me = getContainer().authSvc.getCurrentUser();
  if (user.id === me.id) {
    await confirmDialog({
      title: 'Cannot delete yourself',
      message: 'You cannot delete the account you are currently signed in with.',
      confirmText: 'OK',
      danger: false,
    });
    return;
  }
  const ok = await confirmDialog({
    title: 'Delete user?',
    message: `Permanently delete "${user.name ?? user.username}"? This cannot be undone.`,
    confirmText: 'Delete',
  });
  if (!ok) return;
  await withError(async () => {
    const c = getContainer();
    await c.userSvc.delete(user.id, c.authSvc.getCurrentUser());
    await tableCtl.resetAndRefresh();
  }, 'User deleted');
}
