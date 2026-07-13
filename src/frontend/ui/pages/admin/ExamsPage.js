/**
 * src/frontend/ui/pages/admin/ExamsPage.js
 * Exam CRUD + status management + question bank assignment + class assignment.
 *
 * Uses ExamService via the container:
 *   list / getById / getWithQuestions / create / update / delete
 *   addQuestion / removeQuestion / reorderQuestions
 *   publish / archive / assignToClass / removeFromClass
 */

import { getContainer }    from '../../../container.js';
import { withError }      from '../../../utils/eventBus.js';
import { logger }          from '../../../utils/logger.js';
import { escapeHTML }     from '../../../utils/sanitize.js';
import { createDataTable } from './components/DataTable.js';
import { confirmDialog }   from './components/ConfirmDialog.js';
import { formModal, textField, textareaField, selectField, checkboxField } from './components/FormModal.js';
import { EXAM_STATUS }    from '../../../../shared/constants.js';

let tableCtl = null;
let hostRef = null;

export async function initExamsPage(host) {
  hostRef = host;
  host.replaceChildren();

  const title = document.createElement('h1');
  title.className = 'page-title';
  title.textContent = 'Exams';

  const toolbar = document.createElement('div');
  toolbar.className = 'admin-toolbar';
  const spacer = document.createElement('span');
  spacer.style.flex = '1';
  const newBtn = document.createElement('button');
  newBtn.type = 'button'; newBtn.className = 'btn btn-primary';
  newBtn.textContent = '+ New Exam';
  newBtn.addEventListener('click', () => openExamForm(null));
  toolbar.append(statusFilter(), spacer, newBtn);

  const tableHost = document.createElement('div');
  tableHost.id = 'exams-table-host';
  host.append(title, toolbar, tableHost);

  tableCtl = createDataTable({
    containerId: 'exams-table-host',
    columns: [
      { key: 'name',   label: 'Name',   sortable: true, render: (v) => truncate(String(v ?? ''), 60) },
      { key: 'status', label: 'Status', sortable: true, render: (v) => statusBadge(v) },
      { key: 'passing_score', label: 'Pass %', sortable: true },
      { key: 'duration', label: 'Duration (min)', sortable: false, render: (v) => v ?? '—' },
      { key: 'is_training', label: 'Mode', sortable: false, render: (v) => v ? 'Training' : 'Exam' },
      { key: 'actions', label: 'Actions', sortable: false, render: (_v, row) => actionButtons(row) },
    ],
    fetch: async (p) => {
      const c = getContainer();
      const filters = {};
      const statusSel = document.getElementById('exam-filter-status');
      if (statusSel?.value) filters.status = statusSel.value;
      return c.examSvc.list(filters, {
        limit: p.limit, offset: p.offset, orderBy: p.orderBy, direction: p.direction, search: p.search,
      });
    },
    initialOrderBy: 'created_at',
    initialDirection: 'desc',
  });

  await tableCtl.render();
  return async () => { await tableCtl.resetAndRefresh(); };
}

function statusFilter() {
  const wrap = document.createElement('label');
  wrap.className = 'admin-toolbar__field';
  wrap.style.marginRight = '0.5rem';
  const span = document.createElement('span');
  span.textContent = 'Status';
  const sel = document.createElement('select');
  sel.id = 'exam-filter-status';
  for (const [v, l] of Object.entries({ '': 'All', ...EXAM_STATUS })) {
    const o = document.createElement('option');
    o.value = v; o.textContent = l;
    sel.appendChild(o);
  }
  sel.addEventListener('change', () => tableCtl?.resetAndRefresh());
  wrap.append(span, sel);
  return wrap;
}

function statusBadge(v) {
  const span = document.createElement('span');
  span.className = 'badge badge--' + (v || 'draft');
  span.textContent = v || 'draft';
  return span;
}

function actionButtons(row) {
  const wrap = document.createElement('div');
  wrap.className = 'admin-row-actions';
  const edit = document.createElement('button');
  edit.type = 'button'; edit.className = 'btn btn-secondary btn-sm';
  edit.textContent = 'Edit'; edit.addEventListener('click', () => openExamForm(row));
  const manage = document.createElement('button');
  manage.type = 'button'; manage.className = 'btn btn-secondary btn-sm';
  manage.textContent = 'Questions';
  manage.addEventListener('click', () => openExamQuestions(row));
  const classes = document.createElement('button');
  classes.type = 'button'; classes.className = 'btn btn-secondary btn-sm';
  classes.textContent = 'Classes';
  classes.addEventListener('click', () => openExamClasses(row));
  const publish = document.createElement('button');
  publish.type = 'button'; publish.className = 'btn btn-primary btn-sm';
  publish.textContent = 'Publish';
  publish.disabled = row.status !== EXAM_STATUS.DRAFT;
  publish.addEventListener('click', () => publishExam(row));
  const archive = document.createElement('button');
  archive.type = 'button'; archive.className = 'btn btn-secondary btn-sm';
  archive.textContent = 'Archive';
  archive.disabled = row.status === EXAM_STATUS.ARCHIVED;
  archive.addEventListener('click', () => archiveExam(row));
  const del = document.createElement('button');
  del.type = 'button'; del.className = 'btn btn-danger btn-sm';
  del.textContent = 'Delete';
  del.addEventListener('click', () => deleteExam(row));
  wrap.append(edit, manage, classes, publish, archive, del);
  return wrap;
}

function truncate(s, n) { return s.length > n ? s.slice(0, n - 1) + '…' : s; }

// ── create/edit exam ──────────────────────────────────────────────────────────

function openExamForm(exam) {
  const isEdit = !!exam;
  const fieldsHTML = [
    textField('name', 'Name', { value: exam?.name ?? '', required: true }),
    textareaField('description', 'Description', { value: exam?.description ?? '', rows: 2 }),
    textField('duration', 'Duration (minutes)', { value: exam?.duration ?? '', type: 'number' }),
    textField('passing_score', 'Passing score (%)', { value: exam?.passing_score ?? 50, type: 'number', required: true }),
    selectField('status', 'Status', EXAM_STATUS, { value: exam?.status ?? 'draft', required: true }),
    checkboxField('is_training', 'Training mode (not graded)', { checked: !!exam?.is_training }),
    checkboxField('randomize', 'Randomize question order', { checked: !!exam?.randomize }),
    textField('max_attempts', 'Max attempts (blank = unlimited)', { value: exam?.max_attempts ?? '', type: 'number' }),
  ].join('');

  formModal({
    title: isEdit ? 'Edit Exam' : 'New Exam',
    fieldsHTML,
    confirmText: isEdit ? 'Update' : 'Create',
    onSubmit: async (values) => {
      const c = getContainer();
      const me = c.authSvc.getCurrentUser();
      const payload = {
        ...values,
        passing_score: Number(values.passing_score) || 50,
        duration: values.duration ? Number(values.duration) : null,
        max_attempts: values.max_attempts ? Number(values.max_attempts) : null,
      };
      if (isEdit) await c.examSvc.update(exam.id, payload, me);
      else        await c.examSvc.create(payload, me);
      await tableCtl.resetAndRefresh();
    },
  });
}

// ── publish / archive / delete ────────────────────────────────────────────────

async function publishExam(exam) {
  const ok = await confirmDialog({
    title: 'Publish exam?',
    message: `"${truncate(exam.name, 60)}" will become active and visible to assigned classes. Drafts can be re-published.`,
    confirmText: 'Publish',
    danger: false,
  });
  if (!ok) return;
  await withError(async () => {
    const c = getContainer();
    await c.examSvc.publish(exam.id, c.authSvc.getCurrentUser());
    await tableCtl.resetAndRefresh();
  }, 'Exam published');
}

async function archiveExam(exam) {
  const ok = await confirmDialog({
    title: 'Archive exam?',
    message: `Archiving "${truncate(exam.name, 60)}" hides it from students. Existing results are preserved.`,
    confirmText: 'Archive',
  });
  if (!ok) return;
  await withError(async () => {
    const c = getContainer();
    await c.examSvc.archive(exam.id, c.authSvc.getCurrentUser());
    await tableCtl.resetAndRefresh();
  }, 'Exam archived');
}

async function deleteExam(exam) {
  const ok = await confirmDialog({
    title: 'Delete exam?',
    message: `Permanently delete "${truncate(exam.name, 60)}"? Exams with recorded results cannot be deleted.`,
    confirmText: 'Delete',
  });
  if (!ok) return;
  await withError(async () => {
    const c = getContainer();
    await c.examSvc.delete(exam.id, c.authSvc.getCurrentUser());
    await tableCtl.resetAndRefresh();
  }, 'Exam deleted');
}

// ── exam questions management ─────────────────────────────────────────────────
// A modal listing currently-linked questions + a picker to add from the bank.

async function openExamQuestions(exam) {
  const c = getContainer();
  let linked = [];
  try {
    const withQ = await c.examSvc.getWithQuestions(exam.id);
    linked = withQ?.questions ?? [];
  } catch (err) { logger.warn('Could not load exam questions', err); }

  const fieldsHTML = `
    <p class="admin-modal__hint">Exam: <strong></strong></p>
    <div id="exam-q-list" class="admin-checklist"></div>
    <div class="admin-modal__section">
      <h3>Add from question bank</h3>
      <input id="exam-q-search" type="search" class="admin-table__search" placeholder="Filter questions…" />
      <div id="exam-q-bank" class="admin-checklist"></div>
    </div>
  `;

  formModal({
    title: 'Manage Exam Questions',
    fieldsHTML,
    confirmText: 'Done',
    onSubmit: async () => { /* changes are applied inline via buttons */ },
  });

  // Patch the <strong> with the (escaped) exam name
  const strong = document.querySelector('#form-modal__form .admin-modal__hint strong');
  if (strong) strong.textContent = exam.name;

  await renderExamQuestionLists(exam.id, linked);
}

async function renderExamQuestionLists(examId, linked) {
  const listEl = document.getElementById('exam-q-list');
  const bankEl = document.getElementById('exam-q-bank');
  if (!listEl || !bankEl) return;
  listEl.replaceChildren();
  bankEl.replaceChildren();

  // Linked questions list with remove buttons
  if (linked.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'admin-empty-inline';
    empty.textContent = 'No questions linked yet. Add some from the bank below.';
    listEl.appendChild(empty);
  } else {
    for (const q of linked) {
      listEl.appendChild(linkedQuestionRow(q, examId));
    }
  }

  // Question bank with add buttons
  const c = getContainer();
  try {
    const { data } = await c.questionSvc.list({}, { limit: 200, orderBy: 'created_at', direction: 'desc' });
    const linkedIds = new Set(linked.map(q => q.id));
    const renderBank = (filter) => {
      bankEl.replaceChildren();
      const filtered = filter
        ? data.filter(q => (q.text ?? '').toLowerCase().includes(filter.toLowerCase()))
        : data;
      if (filtered.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'admin-empty-inline';
        empty.textContent = 'No questions available.';
        bankEl.appendChild(empty);
        return;
      }
      for (const q of filtered) {
        bankEl.appendChild(bankQuestionRow(q, examId, linkedIds.has(q.id)));
      }
    };
    renderBank('');
    const search = document.getElementById('exam-q-search');
    if (search) search.addEventListener('input', () => renderBank(search.value.trim()));
  } catch (err) { logger.warn('Could not load question bank', err); }
}

function linkedQuestionRow(q, examId) {
  const row = document.createElement('div');
  row.className = 'admin-checklist__item';
  const text = document.createElement('span');
  text.className = 'admin-checklist__label';
  text.textContent = truncate(String(q.text ?? ''), 70);
  const rm = document.createElement('button');
  rm.type = 'button'; rm.className = 'btn btn-danger btn-sm';
  rm.textContent = 'Remove';
  rm.addEventListener('click', async () => {
    await withError(async () => {
      const c = getContainer();
      await c.examSvc.removeQuestion(examId, q.id, c.authSvc.getCurrentUser());
      row.remove();
    }, 'Question removed');
  });
  row.append(text, rm);
  return row;
}

function bankQuestionRow(q, examId, alreadyLinked) {
  const row = document.createElement('div');
  row.className = 'admin-checklist__item';
  const text = document.createElement('span');
  text.className = 'admin-checklist__label';
  text.textContent = truncate(String(q.text ?? ''), 70);
  const add = document.createElement('button');
  add.type = 'button'; add.className = 'btn btn-secondary btn-sm';
  add.textContent = alreadyLinked ? '✓ Already added' : 'Add';
  add.disabled = alreadyLinked;
  if (!alreadyLinked) {
    add.addEventListener('click', async () => {
      await withError(async () => {
        const c = getContainer();
        await c.examSvc.addQuestion(examId, q.id, 0, c.authSvc.getCurrentUser());
        add.textContent = '✓ Added';
        add.disabled = true;
      }, 'Question added');
    });
  }
  row.append(text, add);
  return row;
}

// ── exam class assignment ─────────────────────────────────────────────────────

async function openExamClasses(exam) {
  const c = getContainer();
  let assigned = new Set();
  let allClasses = [];
  try {
    // No service method for "get assigned classes"; pull exam_classes via repo query
    const { data } = await c.repo.getAll('exam_classes', { filters: { exam_id: exam.id }, limit: 200 });
    assigned = new Set(data.map(x => x.class_id));
  } catch (err) { logger.warn('Could not load exam classes', err); }
  try {
    const res = await c.classSvc.list({}, { limit: 200, orderBy: 'name' });
    allClasses = res?.data ?? [];
  } catch (err) { logger.warn('Could not load classes for assignment', err); }

  const rows = allClasses.map(cls => `
    <div class="admin-checklist__item" data-class-id="${cls.id}">
      <label>
        <input type="checkbox" name="class_${cls.id}" ${assigned.has(cls.id) ? 'checked' : ''} />
        <span class="admin-checklist__label">${escapeHTML(cls.name)}</span>
      </label>
    </div>
  `).join('');
  const fieldsHTML = `
    <p class="admin-modal__hint">Assign classes to: <strong></strong></p>
    <div class="admin-checklist">${rows || '<p class="admin-empty-inline">No classes exist yet.</p>'}</div>
  `;

  formModal({
    title: 'Assign Classes',
    fieldsHTML,
    confirmText: 'Save',
    onSubmit: async (values) => {
      const c2 = getContainer();
      const me = c2.authSvc.getCurrentUser();
      for (const cls of allClasses) {
        const wants = !!values['class_' + cls.id];
        const had = assigned.has(cls.id);
        if (wants && !had) {
          await c2.examSvc.assignToClass(exam.id, cls.id, me);
        } else if (!wants && had) {
          await c2.examSvc.removeFromClass(exam.id, cls.id, me);
        }
      }
      await tableCtl.refresh();
    },
  });

  const strong = document.querySelector('#form-modal__form .admin-modal__hint strong');
  if (strong) strong.textContent = exam.name;
}
