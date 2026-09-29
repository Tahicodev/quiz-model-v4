/** Deterministic client-side celebration metadata; the server remains score authority. */
export class RewardEngine {
  static badges({ streak = 0, stars = 0, completed = false }) {
    return [completed && 'finish', stars === 3 && 'star_master', streak >= 5 && 'streak_hero'].filter(Boolean);
  }
  static reaction({ streak = 0, correct = false }) {
    if (!correct) return 'encourage';
    return streak >= 5 ? 'amazed' : streak >= 3 ? 'excited' : 'happy';
  }
}
