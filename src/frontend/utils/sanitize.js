/**
 * src/frontend/utils/sanitize.js
 * XSS Prevention Utilities.
 * MUST be used in place of all direct .innerHTML assignments.
 */

/**
 * Escape ALL user-provided text before inserting into the DOM.
 * Use for: question text, exam names, usernames, category names — any user content.
 * @param {string} str
 * @returns {string}
 */
export function escapeHTML(str) {
  if (typeof str !== 'string') return String(str ?? '');
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Safe alternative to element.innerHTML = userContent.
 * If DOMPurify is loaded (via CDN), uses it for rich content.
 * Falls back to textContent for plain text fields.
 *
 * @param {HTMLElement} element
 * @param {string}      content   - User-provided content
 * @param {boolean}     allowHTML - true only for fields explicitly designed for HTML (e.g. rich question text)
 */
export function safeSetHTML(element, content, allowHTML = false) {
  if (!element) return;
  
  if (!allowHTML) {
    element.textContent = content; // Safest — zero XSS risk
    return;
  }

  if (window.DOMPurify) {
    element.innerHTML = window.DOMPurify.sanitize(content, {
      ALLOWED_TAGS: ['b', 'i', 'u', 'strong', 'em', 'br', 'p', 'ul', 'ol', 'li', 'code', 'pre', 'img', 'table', 'thead', 'tbody', 'tr', 'td', 'th'],
      // Only allow highly safe attributes. NO onclick, href, style, etc.
      ALLOWED_ATTR: ['src', 'alt', 'width', 'height'],
    });
  } else {
    // DOMPurify not loaded — fall back to safe text to prevent XSS
    element.textContent = content;
  }
}
