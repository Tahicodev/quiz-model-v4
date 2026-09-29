/**
 * public/kids/components/HintBubble.js
 */

export class HintBubble {
  static create({ text, onClose }) {
    const bubble = document.createElement('div');
    bubble.className = 'kids-hint-bubble hint-appear';
    bubble.innerHTML = `
      <div class="hint-icon">💡</div>
      <div class="hint-content">${text}</div>
      <button class="hint-close-btn" aria-label="Fermer l'indice">✖</button>
    `;

    bubble.querySelector('.hint-close-btn').addEventListener('click', () => {
      bubble.classList.add('hint-disappear');
      setTimeout(() => {
        bubble.remove();
        if (onClose) onClose();
      }, 300);
    });

    return bubble;
  }
}
