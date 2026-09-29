/**
 * public/kids/components/ProgressBar.js
 */

export class ProgressBar {
  static create({ current = 0, total = 10 }) {
    const wrap = document.createElement('div');
    wrap.className = 'kids-progress-wrap';

    const fill = document.createElement('div');
    fill.className = 'kids-progress-bar';
    const percent = Math.min(100, Math.round((current / total) * 100));
    fill.style.width = `${percent}%`;

    wrap.appendChild(fill);

    return {
      element: wrap,
      setProgress: (newCurrent, newTotal = total) => {
        const p = Math.min(100, Math.round((newCurrent / newTotal) * 100));
        fill.style.width = `${p}%`;
      },
    };
  }
}
