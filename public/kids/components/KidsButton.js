/**
 * public/kids/components/KidsButton.js
 *
 * Tactile, colorful, bouncy button component for young learners.
 */

export class KidsButton {
  /**
   * @param {{
   *   text: string,
   *   emoji?: string,
   *   colorVariant?: 'primary' | 'success' | 'warning' | 'purple' | 'cyan',
   *   size?: 'sm' | 'md' | 'lg',
   *   onClick?: (e: Event) => void
   * }} options
   */
  static create({ text, emoji, colorVariant = 'primary', size = 'md', onClick }) {
    const btn = document.createElement('button');
    btn.className = `kids-btn kids-btn-${colorVariant} kids-btn-${size}`;
    btn.type = 'button';

    let content = '';
    if (emoji) content += `<span class="btn-emoji">${emoji}</span> `;
    content += `<span class="btn-label">${text}</span>`;
    btn.innerHTML = content;

    btn.addEventListener('click', (e) => {
      // Gentle bounce micro-animation
      btn.classList.add('btn-bounce');
      setTimeout(() => btn.classList.remove('btn-bounce'), 300);
      if (onClick) onClick(e);
    });

    return btn;
  }
}
