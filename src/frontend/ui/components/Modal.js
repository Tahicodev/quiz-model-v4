/**
 * src/frontend/ui/components/Modal.js
 * Basic programmatic modal wrapper for the legacy app.
 */

import { safeSetHTML } from '../../utils/sanitize.js';

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
    
    // We use safeSetHTML to ensure user content is sanitized
    const html = `
      <div class="modal-content scale-in">
        <div class="modal-header">
          <h3>${this.title}</h3>
          <button class="modal-close">&times;</button>
        </div>
        <div class="modal-body"></div>
        <div class="modal-footer">
          <button class="btn btn-secondary cancel-btn">${this.cancelText}</button>
          <button class="btn ${this.isDangerous ? 'btn-danger' : 'btn-primary'} confirm-btn">${this.confirmText}</button>
        </div>
      </div>
    `;
    
    // Set structure
    this.element.innerHTML = html;
    
    // Set safe content body
    const body = this.element.querySelector('.modal-body');
    safeSetHTML(body, this.contentHTML, true); // true because it's structure we passed in

    // Events
    this.element.querySelector('.modal-close').onclick = () => this.close(false);
    this.element.querySelector('.cancel-btn').onclick = () => this.close(false);
    this.element.querySelector('.confirm-btn').onclick = () => this.close(true);

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
