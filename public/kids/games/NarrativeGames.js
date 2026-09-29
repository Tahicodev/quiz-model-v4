/** Narrative shells reuse the proven core mechanics while adding a world-specific progress scene. */
import { GameRegistry } from '../engine/GameRegistry.js';

const WORLDS = {
  treasure_hunt:['🗺️','Chasse au trésor'], obstacle_run:['🏃','Course d’obstacles'], board_game:['🎲','Jeu de plateau'], puzzle:['🧩','Puzzle mystère'], build_construct:['🧱','Atelier construction'], whack_tap:['🔨','Tape la cible'],
  animal_rescue:['🦊','Sauvetage animal'], space_adventure:['🚀','Aventure spatiale'], cooking:['👩‍🍳','Petit chef'], escape_room:['🔐','Escape room'], farm_garden:['🌱','Jardin magique'],
};
const WORLD_PROPS = {
  treasure_hunt:'prop-adventure-treasure.jpg', obstacle_run:'prop-adventure-obstacle.jpg', board_game:'prop-adventure-board.jpg', puzzle:'prop-adventure-puzzle.jpg', build_construct:'prop-adventure-blocks.jpg', whack_tap:'prop-adventure-tap.jpg',
  animal_rescue:'prop-immersive-animals.jpg', space_adventure:'prop-immersive-planets.jpg', cooking:'prop-immersive-ingredients.jpg', escape_room:'prop-immersive-locks.jpg', farm_garden:'prop-immersive-seeds.png',
};
class NarrativeGame {
  constructor(props) { Object.assign(this, props); this.content = props.levelData.content || {}; }
  render() {
    const [emoji, title] = WORLDS[this.levelData.level_type] || ['✨','Aventure'];
    const mechanic = this.content.mechanic || this.content.baseMechanic || 'multiple_choice';
    const Renderer = GameRegistry.get(mechanic);
    const prop = WORLD_PROPS[this.levelData.level_type];
    this.container.innerHTML = `<div class="kids-world-banner"><img class="kids-world-prop" src="/kids/assets/${prop}" alt=""><div><strong>${emoji} ${title}</strong><small>${this.content.worldText || 'Une bonne réponse fait avancer ton aventure !'}</small></div><div class="kids-world-progress" aria-label="Progression"></div></div><div class="kids-world-core"></div>`;
    if (!Renderer || Renderer === NarrativeGame) { this.container.querySelector('.kids-world-core').textContent = 'Cette aventure a besoin d’une mécanique de jeu.'; return; }
    this.delegate = new Renderer({ container:this.container.querySelector('.kids-world-core'), levelData:{...this.levelData, level_type:mechanic, content:this.content}, onSubmit:this.onSubmit, onHint:this.onHint });
    this.delegate.render();
  }
  onWrongAnswer() { this.delegate?.onWrongAnswer?.(); }
  showHint(hint) { this.delegate?.showHint?.(hint); }
  destroy() { this.delegate?.destroy?.(); }
}
Object.keys(WORLDS).forEach(type => GameRegistry.register(type, NarrativeGame));
