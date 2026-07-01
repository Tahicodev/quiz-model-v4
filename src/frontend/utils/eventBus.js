/**
 * src/frontend/utils/eventBus.js
 * Global event bus for the frontend.
 * Handles centralizing error reporting and success notifications (Toasts).
 */

const _bus = new EventTarget();

export const EventBus = {
  /**
   * @param {string} event
   * @param {any} detail
   */
  emit(event, detail) {
    _bus.dispatchEvent(new CustomEvent(event, { detail }));
  },

  /**
   * @param {string} event
   * @param {Function} handler
   */
  on(event, handler) {
    _bus.addEventListener(event, (e) => handler(e.detail));
  },

  /**
   * @param {string} event
   * @param {Function} handler
   */
  off(event, handler) {
    _bus.removeEventListener(event, handler);
  },
};

/**
 * Initialize the global event bus listeners.
 * Should be called once in main.js.
 */
export function initEventBus() {
  EventBus.on('app:error',   ({ message, code }) => showToast(message, 'error'));
  EventBus.on('app:success', ({ message })       => showToast(message, 'success'));
  EventBus.on('app:warning', ({ message })       => showToast(message, 'warning'));
}

/**
 * Wraps any async operation with centralized error handling.
 * Use this in ALL UI event handlers instead of try/catch boilerplate.
 *
 * @param {Function} fn        - Async function to execute
 * @param {string}   [successMsg] - Optional success toast message
 * @returns {Promise<any>}
 */
export async function withError(fn, successMsg = null) {
  try {
    const result = await fn();
    if (successMsg) {
      EventBus.emit('app:success', { message: successMsg });
    }
    return result;
  } catch (err) {
    // ValidationError: show field-level errors inline, not as a toast
    if (err.code === 'VALIDATION_ERROR' && err.fields) {
      EventBus.emit('app:validation', { fields: err.fields });
    } else {
      EventBus.emit('app:error', { message: err.message, code: err.code });
    }
    // Re-throw so the caller can still react (e.g. to stop a loading spinner)
    throw err;
  }
}

/**
 * Renders a simple toast notification.
 * @param {string} message
 * @param {'success'|'error'|'warning'|'info'} type
 */
function showToast(message, type = 'info') {
  // Remove any existing toast of the same type to prevent stacking
  document.querySelectorAll(`.toast--${type}`).forEach(t => t.remove());

  const toast = document.createElement('div');
  toast.className   = `toast toast--${type}`;
  toast.textContent = message;
  toast.setAttribute('role', 'alert');

  document.body.appendChild(toast);

  // Auto-dismiss after 4 seconds with CSS transition
  requestAnimationFrame(() => toast.classList.add('toast--visible'));
  setTimeout(() => {
    toast.classList.remove('toast--visible');
    toast.addEventListener('transitionend', () => toast.remove());
  }, 4000);
}
