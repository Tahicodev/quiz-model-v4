/**
 * src/backend/services/kids/GameTemplateRegistry.js
 *
 * In-memory game template metadata catalog.
 * Mirrors KidsGameTemplate entries in SQLite / PostgreSQL.
 */

import { KIDS_TEMPLATES_SEED_DATA } from '../../../../prisma/seeds/kids-game-templates.js';

export class GameTemplateRegistry {
  static #templates = new Map();

  static {
    for (const t of KIDS_TEMPLATES_SEED_DATA) {
      this.#templates.set(t.id, {
        ...t,
        supportedAges: JSON.parse(t.supported_ages_json),
        supportedSubjects: JSON.parse(t.supported_subjects),
        cognitiveSkills: JSON.parse(t.cognitive_skills),
        pedagogicalGoals: JSON.parse(t.pedagogical_goals),
        questionTypes: JSON.parse(t.question_types),
        difficultyRange: JSON.parse(t.difficulty_range),
      });
    }
  }

  static getAll() {
    return Array.from(this.#templates.values());
  }

  static getById(id) {
    return this.#templates.get(id) || null;
  }

  static getByCategory(category) {
    return this.getAll().filter(t => t.category === category);
  }

  static getByPhase(phase = 1) {
    return this.getAll().filter(t => t.phase <= phase);
  }
}
