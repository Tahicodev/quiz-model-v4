/** Suggests the next difficulty without changing server-side content. */
export class ProgressionEngine {
  static suggest({ streak = 0, attempts = 1, difficulty = 'easy' }) {
    const order = ['very_easy', 'easy', 'medium', 'hard'];
    const index = Math.max(0, order.indexOf(difficulty));
    if (streak >= 4 && attempts <= 1) return order[Math.min(index + 1, order.length - 1)];
    if (attempts >= 3) return order[Math.max(index - 1, 0)];
    return order[index];
  }
}
