/**
 * public/kids/components/KidsCard.js
 *
 * Bubble-bordered, glassmorphic interactive card component.
 */

export class KidsCard {
  static create({ content, className = '', emoji = null, onClick = null }) {
    const card = document.createElement('div');
    card.className = `kids-card ${className}`;

    let inner = '';
    if (emoji) {
      inner += `<div class="kids-card-emoji">${emoji}</div>`;
    }
    inner += `<div class="kids-card-body">${content}</div>`;
    card.innerHTML = inner;

    if (onClick) {
      card.classList.add('is-interactive');
      card.addEventListener('click', (e) => {
        card.classList.add('card-tap');
        setTimeout(() => card.classList.remove('card-tap'), 250);
        onClick(e);
      });
    }

    return card;
  }
}
