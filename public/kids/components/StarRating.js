/**
 * public/kids/components/StarRating.js
 */

export class StarRating {
  static create({ stars = 0, max = 3 }) {
    const el = document.createElement('div');
    el.className = 'kids-stars-display';

    for (let i = 1; i <= max; i++) {
      const star = document.createElement('span');
      star.className = `star-icon ${i <= stars ? 'is-filled' : 'is-empty'}`;
      star.textContent = i <= stars ? '⭐' : '☆';
      el.appendChild(star);
    }

    return {
      element: el,
      setStars: (newStars) => {
        const icons = el.querySelectorAll('.star-icon');
        icons.forEach((icon, idx) => {
          const filled = idx + 1 <= newStars;
          icon.className = `star-icon ${filled ? 'is-filled star-pop' : 'is-empty'}`;
          icon.textContent = filled ? '⭐' : '☆';
        });
      },
    };
  }
}
