/**
 * src/backend/services/kids/ActivityValidator.js
 *
 * Pre-publication validation rules for Kids Activities.
 */

import { ValidationError } from '../../../shared/errors.js';
import { validateLevelContent } from '../../../shared/schemas/kids-activity.schema.js';
import { GameTemplateRegistry } from './GameTemplateRegistry.js';

export class ActivityValidator {
  /**
   * Validates an activity and its levels before it can be published.
   * @param {{ activity: object, levels: object[] }} param0
   */
  static validateForPublish({ activity, levels }) {
    const errors = {};

    if (!activity.title || activity.title.trim().length === 0) {
      errors.title = ['Le titre de l’activité est requis'];
    }

    if (!levels || levels.length === 0) {
      errors.levels = ['L’activité doit contenir au moins un niveau ou une question'];
    }

    const template = GameTemplateRegistry.getById(activity.game_template);
    if (!template) {
      errors.game_template = [`Modèle de jeu inconnu: ${activity.game_template}`];
    } else if (levels && levels.length < template.min_items) {
      errors.levels = errors.levels || [];
      errors.levels.push(`Ce jeu nécessite au moins ${template.min_items} éléments (actuel: ${levels.length})`);
    }

    // Validate level contents
    if (levels && levels.length > 0) {
      const levelErrors = [];
      levels.forEach((lvl, idx) => {
        try {
          validateLevelContent(lvl.level_type, lvl.content_json);
        } catch (err) {
          levelErrors.push(`Niveau #${idx + 1} (${lvl.level_type}): ${err.message}`);
        }
      });
      if (levelErrors.length > 0) {
        errors.level_contents = levelErrors;
      }
    }

    if (Object.keys(errors).length > 0) {
      throw new ValidationError(errors);
    }

    return true;
  }
}
