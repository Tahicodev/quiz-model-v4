/**
 * src/frontend/ui/pages/admin/components/ConfirmDialog.js
 * Confirm dialog for destructive actions (delete, archive, reset password).
 *
 * Usage:
 *   const ok = await confirmDialog({ title: 'Delete question?', message: 'This cannot be undone.', confirmText: 'Delete' });
 *   if (ok) { await deleteQuestion(); }
 */

import { Modal } from '../../../components/Modal.js';
import { escapeHTML } from '../../../../utils/sanitize.js';

/**
 * Show a confirm dialog. Resolves true if the user confirmed, false otherwise.
 * @param {Object} opts
 * @param {string} opts.title
 * @param {string} opts.message - plain text (will be escaped)
 * @param {string} [opts.confirmText='Confirm']
 * @param {string} [opts.cancelText='Cancel']
 * @param {boolean} [opts.danger=true] - red confirm button
 * @returns {Promise<boolean>}
 */
export function confirmDialog({ title, message, confirmText = 'Confirm', cancelText = 'Cancel', danger = true }) {
  // Escape the message once; Modal will render via safeSetHTML(body, html, true),
  // but since we pre-escape the message first, no script can survive the trip.
  const safeMsg = escapeHTML(message);
  return new Promise((resolve) => {
    const modal = new Modal({
      title,
      contentHTML: `<p class="confirm-message">${safeMsg}</p>`,
      confirmText,
      cancelText,
      isDangerous: danger,
      onConfirm: () => resolve(true),
      onCancel:  () => resolve(false),
    });
    modal.show();
  });
}
