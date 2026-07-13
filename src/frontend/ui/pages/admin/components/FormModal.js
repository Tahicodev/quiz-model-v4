/**
 * src/frontend/ui/pages/admin/components/FormModal.js
 * Modal that hosts a form. Reads field values synchronously at confirm time
 * (before the modal DOM is torn down), then invokes onConfirm(values).
 *
 * Why this exists separately from the generic Modal: the base Modal removes
 * its DOM 200ms after confirm, so reading form fields inside onConfirm is unsafe.
 * FormModal attaches the confirm handler to submit/confirm-button and reads the
 * form values synchronously, passing them to the caller's handler before close.
 */

import { Modal }       from '../../../components/Modal.js';
import { escapeHTML } from '../../../../utils/sanitize.js';

/**
 * Show a form modal.
 *
 * @param {Object} opts
 * @param {string} opts.title
 * @param {string} opts.fieldsHTML - trusted HTML describing the form fields
 *                                   (use buildField() / field() helpers to avoid raw concat)
 * @param {string} [opts.confirmText='Save']
 * @param {string} [opts.cancelText='Cancel']
 * @param {(values: Record<string,string|boolean>) => (Promise<void>|void)} opts.onSubmit
 *   - receives the form values read at submit time. Throw to keep the modal open.
 * @param {() => void} [opts.onCancel]
 * @returns {void}
 */
export function formModal({ title, fieldsHTML, confirmText = 'Save', cancelText = 'Cancel', onSubmit, onCancel }) {
  // Wrap fields in a <form> so we can use FormData to read everything by name.
  const wrapped = `<form id="form-modal__form" autocomplete="off">${fieldsHTML}</form>`;
  let submitted = false;

  const modal = new Modal({
    title,
    contentHTML: wrapped,
    confirmText,
    cancelText,
    isDangerous: false,
    onConfirm: () => {
      // Called AFTER the Modal has already scheduled DOM removal (200ms).
      // By then the form is detached — so this path must NOT read values here.
      // The real submit happens via the custom handler we wire below.
      // If onSubmit never ran (user clicked confirm without our handler?), no-op.
    },
    onCancel,
  });

  modal.show();

  // Hijack the confirm button to read values FIRST, then close.
  const confirmBtn = modal.element.querySelector('.confirm-btn');
  confirmBtn.type = 'button';
  confirmBtn.onclick = async () => {
    if (submitted) return;
    const form = modal.element.querySelector('#form-modal__form');
    if (!form) return;

    const values = readForm(form);

    submitted = true;
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Saving…';

    try {
      await onSubmit(values);
      // Success → close for real
      modal.close(true);
    } catch (err) {
      // Keep open on error; show inline feedback if validation fields exist
      submitted = false;
      confirmBtn.disabled = false;
      confirmBtn.textContent = confirmText;
      showInlineErrors(form, err);
    }
  };

  // Enter key in the form also submits
  const form = modal.element.querySelector('#form-modal__form');
  form.addEventListener('submit', (e) => { e.preventDefault(); confirmBtn.click(); });
}

/**
 * Read all named form controls into a plain object.
 * Checkboxes become boolean; everything else is string.
 */
function readForm(form) {
  const fd = new FormData(form);
  const out = {};
  for (const [key, value] of fd.entries()) {
    out[key] = value;
  }
  // Booleans for checkboxes (FormData omits unchecked)
  for (const input of form.querySelectorAll('input[type="checkbox"]')) {
    out[input.name] = Boolean(input.checked);
  }
  return out;
}

/**
 * Render validation error fields inline beneath their offending inputs.
 * `err.fields` is the shape from ValidationError: { fieldName: ['msg'] }.
 */
function showInlineErrors(form, err) {
  // Clear previous errors
  form.querySelectorAll('.field-error').forEach(n => n.remove());
  form.querySelectorAll('input,select,textarea').forEach(n => n.classList.remove('input--error'));

  const fields = err?.fields;
  if (fields && typeof fields === 'object') {
    for (const [name, messages] of Object.entries(fields)) {
      const input = form.querySelector(`[name="${CSS.escape(name)}"]`);
      if (!input) continue;
      input.classList.add('input--error');
      const msg = document.createElement('div');
      msg.className = 'field-error';
      msg.textContent = Array.isArray(messages) ? messages.join(' ') : String(messages);
      input.insertAdjacentElement('afterend', msg);
    }
  } else {
    // Generic error → show at top of form
    const generic = document.createElement('div');
    generic.className = 'field-error field-error--generic';
    generic.textContent = err?.message || 'Submission failed';
    form.prepend(generic);
  }
}

// ── Field builder helpers ─────────────────────────────────────────────────────
// These produce safe HTML strings; values are always escaped on the way in.

export function textField(name, label, { value = '', placeholder = '', required = false, type = 'text' } = {}) {
  const req = required ? ' required' : '';
  return `
    <div class="form-field">
      <label for="fld-${name}">${escapeHTML(label)}${required ? ' <span class="req">*</span>' : ''}</label>
      <input id="fld-${name}" name="${escapeHTML(name)}" type="${escapeHTML(type)}" value="${escapeHTML(value)}" placeholder="${escapeHTML(placeholder)}"${req} />
    </div>`;
}

export function textareaField(name, label, { value = '', placeholder = '', required = false, rows = 3 } = {}) {
  const req = required ? ' required' : '';
  return `
    <div class="form-field">
      <label for="fld-${name}">${escapeHTML(label)}${required ? ' <span class="req">*</span>' : ''}</label>
      <textarea id="fld-${name}" name="${escapeHTML(name)}" rows="${rows}" placeholder="${escapeHTML(placeholder)}"${req}>${escapeHTML(value)}</textarea>
    </div>`;
}

export function selectField(name, label, options, { value = '', required = false } = {}) {
  // options: [{ value, label }] or { value: label }
  const opts = Array.isArray(options)
    ? options
    : Object.entries(options).map(([v, l]) => ({ value: v, label: l }));
  const optHtml = opts.map(o => {
    const sel = String(o.value) === String(value) ? ' selected' : '';
    return `<option value="${escapeHTML(String(o.value))}"${sel}>${escapeHTML(String(o.label))}</option>`;
  }).join('');
  const req = required ? ' required' : '';
  return `
    <div class="form-field">
      <label for="fld-${name}">${escapeHTML(label)}${required ? ' <span class="req">*</span>' : ''}</label>
      <select id="fld-${name}" name="${escapeHTML(name)}"${req}>${optHtml}</select>
    </div>`;
}

export function checkboxField(name, label, { checked = false } = {}) {
  const chk = checked ? ' checked' : '';
  return `
    <div class="form-field form-field--inline">
      <label><input type="checkbox" name="${escapeHTML(name)}"${chk} /> ${escapeHTML(label)}</label>
    </div>`;
}
