/**
 * src/backend/services/GamificationService.js
 * One GamificationConfig per school (school_id is the PK).
 */

export class GamificationService {
  #repo;
  constructor(repo) { this.#repo = repo; }

  async get(schoolId) {
    const model = this.#repo.modelFor('gamification');
    const existing = await model.findUnique({ where: { school_id: schoolId } });
    if (existing) return existing;
    // Idempotent default seed per tenant
    return model.create({ data: { school_id: schoolId } });
  }

  async update(schoolId, data) {
    const model = this.#repo.modelFor('gamification');
    const patch = {};
    if (data.exp_per_correct != null) patch.exp_per_correct = Number(data.exp_per_correct) || 0;
    if (data.exp_per_win != null) patch.exp_per_win = Number(data.exp_per_win) || 0;
    if (data.auto_award_badges != null) patch.auto_award_badges = Boolean(data.auto_award_badges);
    return model.upsert({
      where: { school_id: schoolId },
      update: patch,
      create: { school_id: schoolId, ...patch },
    });
  }
}
