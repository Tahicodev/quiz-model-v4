/**
 * src/backend/services/kids/GameSelector.js
 *
 * Scores available game templates against pedagogical criteria
 * and returns ranked compatible games.
 */

import { GameTemplateRegistry } from './GameTemplateRegistry.js';

export class GameSelector {
  /**
   * @param {{
   *   subject: string,
   *   grade: string,
   *   age_min?: number,
   *   age_max?: number,
   *   objective?: string,
   *   difficulty?: string,
   *   count?: number
   * }} input
   * @returns {{ templateId: string, template: object, score: number, reasons: string[] }[]}
   */
  selectGames(input) {
    const templates = GameTemplateRegistry.getAll();
    const ranked = [];

    const ageMin = Number(input.age_min || 5);
    const ageMax = Number(input.age_max || 12);
    const subject = (input.subject || '').toLowerCase();
    const objective = (input.objective || '').toLowerCase();
    const difficulty = input.difficulty || 'easy';
    const count = Number(input.count || 8);

    for (const template of templates) {
      const reasons = [];
      let score = 0;

      // 1. Age compatibility (0-25 pts)
      const tMin = template.supportedAges.min;
      const tMax = template.supportedAges.max;
      const overlapStart = Math.max(ageMin, tMin);
      const overlapEnd = Math.min(ageMax, tMax);
      if (overlapEnd >= overlapStart) {
        const overlap = (overlapEnd - overlapStart + 1) / (ageMax - ageMin + 1);
        const ageScore = Math.round(overlap * 25);
        score += ageScore;
        reasons.push(`Adapté à la tranche d'âge ${ageMin}-${ageMax} ans (+${ageScore})`);
      } else {
        // Outside recommended age
        score -= 20;
      }

      // 2. Subject compatibility (0-20 pts)
      if (template.supportedSubjects.includes('*')) {
        score += 15;
        reasons.push('Universellement compatible avec toutes les matières (+15)');
      } else if (template.supportedSubjects.includes(subject)) {
        score += 20;
        reasons.push(`Spécialement optimisé pour la matière: ${subject} (+20)`);
      }

      // 3. Cognitive skills & pedagogical goals (0-20 pts)
      let goalMatch = 0;
      for (const goal of template.pedagogicalGoals) {
        if (objective.includes(goal)) goalMatch += 7;
      }
      for (const skill of template.cognitiveSkills) {
        if (objective.includes(skill)) goalMatch += 7;
      }
      goalMatch = Math.min(20, goalMatch);
      if (goalMatch > 0) {
        score += goalMatch;
        reasons.push(`Correspond à l'objectif pédagogique (+${goalMatch})`);
      }

      // 4. Difficulty fit (0-10 pts)
      const diffOrder = ['very_easy', 'easy', 'medium', 'hard'];
      const targetDiffIndex = diffOrder.indexOf(difficulty);
      const minDiffIndex = diffOrder.indexOf(template.difficultyRange.min);
      const maxDiffIndex = diffOrder.indexOf(template.difficultyRange.max);
      if (targetDiffIndex >= minDiffIndex && targetDiffIndex <= maxDiffIndex) {
        score += 10;
        reasons.push(`Niveau de difficulté adapté (${difficulty}) (+10)`);
      }

      // 5. Item count capacity (0-5 pts)
      if (count >= template.min_items && count <= template.max_items) {
        score += 5;
      }

      // Core mechanics get a slight priority in Phase 1
      if (template.category === 'core') {
        score += 5;
      }

      if (score > 10) {
        ranked.push({
          templateId: template.id,
          template,
          score,
          reasons,
        });
      }
    }

    ranked.sort((a, b) => b.score - a.score);
    return ranked;
  }

  /**
   * Return the best game template for the given input.
   */
  selectBest(input) {
    const list = this.selectGames(input);
    if (list.length > 0) {
      return list[0];
    }
    // Fallback default
    const fallback = GameTemplateRegistry.getById('multiple_choice');
    return {
      templateId: 'multiple_choice',
      template: fallback,
      score: 10,
      reasons: ['Modèle standard par défaut'],
    };
  }
}
