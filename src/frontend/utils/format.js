/**
 * src/frontend/utils/format.js
 * Centralized formatting logic for dates, numbers, and times.
 */

/**
 * @param {string|Date} dateString
 * @param {string} [locale='en-US']
 * @returns {string} e.g. "Oct 12, 2023, 14:30"
 */
export function formatDate(dateString, locale = 'en-US') {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return 'Invalid Date';

  return new Intl.DateTimeFormat(locale, {
    year:   'numeric',
    month:  'short',
    day:    'numeric',
    hour:   '2-digit',
    minute: '2-digit',
  }).format(date);
}

/**
 * Format score as percentage with optional color threshold logic.
 * @param {number} score
 * @param {number} passingScore
 * @returns {{ text: string, colorClass: string }}
 */
export function formatScore(score, passingScore = 50) {
  if (score === null || score === undefined) return { text: 'N/A', colorClass: '' };
  const num = Number(score);
  return {
    text:       `${num}%`,
    colorClass: num >= passingScore ? 'text-green' : 'text-red',
  };
}

/**
 * Formats duration from seconds to MM:SS or HH:MM:SS
 * @param {number} totalSeconds
 * @returns {string}
 */
export function formatDuration(totalSeconds) {
  if (typeof totalSeconds !== 'number' || isNaN(totalSeconds) || totalSeconds < 0) return '00:00';
  
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);

  const mStr = m.toString().padStart(2, '0');
  const sStr = s.toString().padStart(2, '0');

  return h > 0 
    ? `${h}:${mStr}:${sStr}` 
    : `${mStr}:${sStr}`;
}
