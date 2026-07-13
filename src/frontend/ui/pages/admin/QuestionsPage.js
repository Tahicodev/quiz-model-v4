/**
 * src/frontend/ui/pages/admin/QuestionsPage.js
 * Question bank management: searchable/filterable table, create/edit modal,
 * single + bulk delete. Uses QuestionService via the container.
 *
 * Endpoints covered (via questionSvc):
 *   list / getById / create / update / delete
 */

import { getContainer }    from '../../../container.js';
import { withError }       from '../../../utils/eventBus.js';
import { logger }          from '../../../utils/logger.js';
import { createDataTable } from './components/DataTable.js';
import { confirmDialog }   from './components/ConfirmDialog.js';
import { formModal, textField, textareaField, selectField } from './components/FormModal.js';
import { QUESTION_TYPES, DIFFICULTY } from '../../../../shared/constants.js';

let tableCtl = null;
let selectedIds = new Set();
let hostRef = null;

/**
 * @param {HTMLElement} host
 * @returns {() => Promise<void>} refresh
 */
export async function initQuestionsPage(host) {
  hostRef = host;
  selectedIds = new Set();
  host.replaceChildren();

  const title = document.createElement('h1');
  title.className = 'page-title';
  title.textContent = 'Questions';

  const toolbar = document.createElement('div');
  toolbar.className = 'admin-toolbar';
  toolbar.append(
    typeFilter(),
    difficultyFilter(),
    categoryFilter(),
    buildSpacer(),
    buildNewButton(),
    buildBulkDeleteButton(),
  );

  const tableHost = document.createElement('div');
  tableHost.id = 'questions-table-host';
  host.append(title, toolbar, tableHost);

  tableCtl = createDataTable({
    containerId: 'questions-table-host',
    columns: [
      { key: 'checkbox', label: '', sortable: false, render: (_v, row) => checkboxCell(row.id) },
      { key: 'text',       label: 'Question', sortable: true, render: (v) => truncate(String(v ?? ''), 80) },
      { key: 'type',       label: 'Type',     sortable: true },
      { key: 'difficulty', label: 'Difficulty', sortable: true, render: (v) => difficultyBadge(v) },
      { key: 'points',     label: 'Pts',      sortable: true },
      { key: 'category_id', label: 'Category', sortable: false, render: (v) => categoryName(v) },
      { key: 'actions', label: 'Actions', sortable: false, render: (_v, row) => actionButtons(row) },
    ],
    fetch: async (p) => {
      const c = getContainer();
      const filters = {};
      const typeSel = document.getElementById('q-filter-type');
      const diffSel = document.getElementById('q-filter-difficulty');
      const catSel  = document.getElementById('q-filter-category');
      if (typeSel?.value) filters.type = typeSel.value;
      if (diffSel?.value) filters.difficulty = diffSel.value;
      if (catSel?.value)  filters.category_id = catSel.value;
      return c.questionSvc.list(filters, {
        limit: p.limit, offset: p.offset, orderBy: p.orderBy, direction: p.direction, search: p.search,
      });
    },
    initialOrderBy: 'created_at',
    initialDirection: 'desc',
  });

  await tableCtl.render();
  return async () => { selectedIds.clear(); await tableCtl.refresh(); };
}

// ── toolbar + cell renderers ──────────────────────────────────────────────────

function buildSpacer() {
  const s = document.createElement('span');
  s.style.flex = '1';
  return s;
}

function typeFilter() {
  return labeledSelect('Type', 'q-filter-type', { '': 'All types', ...QUESTION_TYPES });
}
function difficultyFilter() {
  return labeledSelect('Difficulty', 'q-filter-difficulty', { '': 'All', ...DIFFICULTY });
}
async function categoryFilter() {
  const sel = labeledSelect('Category', 'q-filter-category', { '': 'All categories' });
  try {
    const c = getContainer();
    const { data } = await c.categorySvc.list({}, { limit: 200, orderBy: 'name', direction: 'asc' });
    for (const cat of data) {
      const opt = document.createElement('option');
      opt.value = cat.id; opt.textContent = cat.name;
      sel.querySelector('select').appendChild(opt);
    }
  } catch (err) { logger.warn('Could not load category filter', err); }
  return sel;
}

function labeledSelect(labelText, id, options) {
  const wrap = document.createElement('label');
  wrap.className = 'admin-toolbar__field';
  wrap.style.marginRight = '0.5rem';
  const span = document.createElement('span');
  span.textContent = labelText;
  span.style.marginRight = '0.25rem';
  const sel = document.createElement('select');
  sel.id = id;
  for (const [v, l] of Object.entries(options)) {
    const o = document.createElement('option');
    o.value = v; o.textContent = l;
    sel.appendChild(o);
  }
  sel.addEventListener('change', () => tableCtl?.resetAndRefresh());
  wrap.append(span, sel);
  return wrap;
}

function buildNewButton() {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn btn-primary';
  btn.textContent = '+ New Question';
  btn.addEventListener('click', () => openQuestionForm(null));
  return btn;
}

function buildBulkDeleteButton() {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.id = 'q-bulk-delete';
  btn.className = 'btn btn-danger';
  btn.textContent = 'Delete selected';
  btn.disabled = true;
  btn.addEventListener('click', bulkDelete);
  return btn;
}

function checkboxCell(id) {
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.checked = selectedIds.has(id);
  cb.setAttribute('aria-label', 'Select row');
  cb.addEventListener('change', () => {
    if (cb.checked) selectedIds.add(id); else selectedIds.delete(id);
    updateBulkButton();
  });
  return cb;
}

function updateBulkButton() {
  const btn = document.getElementById('q-bulk-delete');
  if (btn) btn.disabled = selectedIds.size === 0;
}

function actionButtons(row) {
  const wrap = document.createElement('div');
  wrap.className = 'admin-row-actions';
  const edit = document.createElement('button');
  edit.type = 'button'; edit.className = 'btn btn-secondary btn-sm';
  edit.textContent = 'Edit'; edit.addEventListener('click', () => openQuestionForm(row));
  const del = document.createElement('button');
  del.type = 'button'; del.className = 'btn btn-danger btn-sm';
  del.textContent = 'Delete';
  del.addEventListener('click', () => deleteOne(row));
  wrap.append(edit, del);
  return wrap;
}

function difficultyBadge(v) {
  const span = document.createElement('span');
  span.className = 'badge badge--' + (v || 'medium');
  span.textContent = v || 'medium';
  return span;
}

let categoryCache = null;
async function categoryName(id) {
  if (!id) return '—';
  if (!categoryCache) {
    try {
      const c = getContainer();
      const { data } = await c.categorySvc.list({}, { limit: 200, orderBy: 'name' });
      categoryCache = new Map(data.map(x => [x.id, x.name]));
    } catch { categoryCache = new Map(); }
  }
  return categoryCache.get(id) ?? '—';
}

function truncate(s, n) {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

// ── create/edit modal ─────────────────────────────────────────────────────────

async function openQuestionForm(question) {
  const isEdit = !!question;
  const c = getContainer();
  const me = c.authSvc.getCurrentUser();

  // Build category options
  let catOptions = { '': '— None —' };
  try {
    const { data } = await c.categorySvc.list({}, { limit: 500, orderBy: 'name' });
    catOptions = { '': '— None —', ...Object.fromEntries(data.map(x => [x.id, x.name])) };
  } catch (err) { logger.warn('Could not load categories for form', err); }

  const fieldsHTML = [
    selectField('type', 'Type', QUESTION_TYPES, { value: question?.type ?? 'mcq', required: true }),
    textField('text', 'Question text', { value: question?.text ?? '', required: true, placeholder: 'Enter the question' }),
    textareaField('options_json', 'Options (one per line, for MCQ)', {
      value: optionsToText(question?.options_json), placeholder: 'Option A\nOption B\n…', rows: 4,
    }),
    textField('answer', 'Answer', { value: question?.answer ?? '', required: true, placeholder: 'Correct answer or option label' }),
    textareaField('explanation', 'Explanation', { value: question?.explanation ?? '', rows: 2 }),
    selectField('difficulty', 'Difficulty', DIFFICULTY, { value: question?.difficulty ?? 'medium', required: true }),
    selectField('category_id', 'Category', catOptions, { value: question?.category_id ?? '' }),
    textField('points', 'Points', { value: question?.points ?? 1, type: 'number', required: true }),
    textField('tags', 'Tags (comma-separated)', { value: question?.tags ?? '' }),
  ].join('');

  formModal({
    title: isEdit ? 'Edit Question' : 'New Question',
    fieldsHTML,
    confirmText: isEdit ? 'Update' : 'Create',
    onSubmit: async (values) => {
      // Normalize points + options
      const payload = {
        ...values,
        points: Number(values.points) || 1,
        options_json: textToOptions(values.options_json),
        category_id: values.category_id || null,
      };
      if (isEdit) {
        await c.questionSvc.update(question.id, payload, me);
      } else {
        await c.questionSvc.create(payload, me);
      }
      await tableCtl.resetAndRefresh();
    },
  });
}

function optionsToText(json) {
  if (!json) return '';
  try {
    const arr = typeof json === 'string' ? JSON.parse(json) : json;
    return Array.isArray(arr) ? arr.join('\n') : '';
  } catch { return ''; }
}

function textToOptions(text) {
  if (!text || !text.trim()) return null;
  const lines = text.split('\n').map(s => s.trim()).filter(Boolean);
  return lines.length ? JSON.stringify(lines) : null;
}

// ── delete handlers ─────────────────────────────────────────────────────────

async function deleteOne(question) {
  const ok = await confirmDialog({
    title: 'Delete question?',
    message: `"${truncate(String(question.text ?? ''), 60)}" will be removed. This cannot be undone.`,
    confirmText: 'Delete',
  });
  if (!ok) return;
  await withError(async () => {
    const c = getContainer();
    await c.questionSvc.delete(question.id, c.authSvc.getCurrentUser());
    await tableCtl.resetAndRefresh();
  }, 'Question deleted');
}

async function bulkDelete() {
  if (selectedIds.size === 0) return;
  const ok = await confirmDialog({
    title: 'Delete selected questions?',
    message: `${selectedIds.size} question(s) will be deleted. This cannot be undone.`,
    confirmText: 'Delete all',
  });
  if (!ok) return;
  const c = getContainer();
  const me = c.authSvc.getCurrentUser();
  let okCount = 0, failCount = 0;
  for (const id of [...selectedIds]) {
    try { await c.questionSvc.delete(id, me); okCount++; }
    catch (err) { logger.warn('Failed to delete question', id, err); failCount++; }
  }
  selectedIds.clear();
  updateBulkButton();
  await tableCtl.resetAndRefresh();
  if (failCount > 0) {
    withError(async () => { throw new Error(`${failCount} question(s) could not be deleted (used in active exams?)`); });
  } else {
    withError(async () => {}, `${okCount} question(s) deleted`);
  }
}
