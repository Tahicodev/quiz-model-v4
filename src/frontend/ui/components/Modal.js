/**
 * src/frontend/ui/components/Modal.js
 * Basic programmatic modal wrapper for the legacy app.
 * Uses DOM construction only — no innerHTML with user content.
 */

import { safeSetHTML, escapeHTML } from '../../utils/sanitize.js';

export class Modal {
  constructor({ title, contentHTML, onConfirm, onCancel, confirmText = 'Confirm', cancelText = 'Cancel', isDangerous = false }) {
    this.title = title;
    this.contentHTML = contentHTML;
    this.onConfirm = onConfirm;
    this.onCancel = onCancel;
    this.confirmText = confirmText;
    this.cancelText = cancelText;
    this.isDangerous = isDangerous;
    this.element = null;
  }

  show() {
    this.element = document.createElement('div');
    this.element.className = 'modal-backdrop fade-in';

    // Build content with DOM methods — avoids innerHTML injection
    const content = document.createElement('div');
    content.className = 'modal-content scale-in';

    // Header
    const header = document.createElement('div');
    header.className = 'modal-header';

    const h3 = document.createElement('h3');
    h3.textContent = this.title; // Safe — textContent, not innerHTML

    const closeBtn = document.createElement('button');
    closeBtn.className = 'modal-close';
    closeBtn.textContent = '×';
    closeBtn.onclick = () => this.close(false);

    header.append(h3, closeBtn);

    // Body — uses safeSetHTML for rich content support
    const body = document.createElement('div');
    body.className = 'modal-body';

    // Footer
    const footer = document.createElement('div');
    footer.className = 'modal-footer';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn btn-secondary cancel-btn';
    cancelBtn.textContent = this.cancelText;
    cancelBtn.onclick = () => this.close(false);

    const confirmBtn = document.createElement('button');
    confirmBtn.className = `btn ${this.isDangerous ? 'btn-danger' : 'btn-primary'} confirm-btn`;
    confirmBtn.textContent = this.confirmText;
    confirmBtn.onclick = () => this.close(true);

    footer.append(cancelBtn, confirmBtn);

    content.append(header, body, footer);
    this.element.appendChild(content);

    // Set safe content body — safeSetHTML handles sanitization
    safeSetHTML(body, this.contentHTML, true);

    document.body.appendChild(this.element);
  }

  close(confirmed = false) {
    if (this.element) {
      this.element.classList.add('fade-out');
      setTimeout(() => {
        this.element.remove();
        if (confirmed && this.onConfirm) this.onConfirm();
        if (!confirmed && this.onCancel) this.onCancel();
      }, 200);
    }
  }
}
