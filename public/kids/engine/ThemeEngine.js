/**
 * public/kids/engine/ThemeEngine.js
 *
 * Manages themes, visual environments, and age profiles.
 */

export const THEME_CONFIGS = {
  jungle: {
    name: 'Jungle & Aventure',
    mascot: '🦁',
    bgGradient: 'linear-gradient(135deg, #1b4d3e 0%, #2e7d32 100%)',
    primaryColor: '#2e7d32',
    accentColor: '#ffd54f',
    soundtrack: 'nature',
  },
  space: {
    name: 'Espace & Galaxies',
    mascot: '🚀',
    bgGradient: 'linear-gradient(135deg, #0d1b2a 0%, #1b263b 50%, #415a77 100%)',
    primaryColor: '#7c4dff',
    accentColor: '#00e5ff',
    soundtrack: 'cosmic',
  },
  ocean: {
    name: 'Océan & Coraux',
    mascot: '🐬',
    bgGradient: 'linear-gradient(135deg, #006064 0%, #00838f 50%, #00acc1 100%)',
    primaryColor: '#00bcd4',
    accentColor: '#ff80ab',
    soundtrack: 'waves',
  },
  farm: {
    name: 'Ferme & Campagne',
    mascot: '🐮',
    bgGradient: 'linear-gradient(135deg, #5d4037 0%, #8d6e63 100%)',
    primaryColor: '#ff9800',
    accentColor: '#8bc34a',
    soundtrack: 'farm',
  },
  castle: {
    name: 'Château des Chevaliers',
    mascot: '🏰',
    bgGradient: 'linear-gradient(135deg, #37474f 0%, #546e7a 100%)',
    primaryColor: '#ffb300',
    accentColor: '#e91e63',
    soundtrack: 'medieval',
  },
  dinosaur: {
    name: 'Monde des Dinosaures',
    mascot: '🦖',
    bgGradient: 'linear-gradient(135deg, #33691e 0%, #558b2f 100%)',
    primaryColor: '#7cb342',
    accentColor: '#ff7043',
    soundtrack: 'prehistoric',
  },
  forest: {
    name: 'Forêt Enchantée',
    mascot: '🦊',
    bgGradient: 'linear-gradient(135deg, #1b5e20 0%, #2e7d32 100%)',
    primaryColor: '#4caf50',
    accentColor: '#ffca28',
    soundtrack: 'forest',
  },
  city: { name:'Ville des découvertes', mascot:'🏙️', bgGradient:'linear-gradient(135deg,#1565c0,#42a5f5)', primaryColor:'#1565c0', accentColor:'#ffca28' },
  circus: { name:'Cirque', mascot:'🎪', bgGradient:'linear-gradient(135deg,#e91e63,#ffca28)', primaryColor:'#e91e63', accentColor:'#fff' },
  magic_world: { name:'Monde magique', mascot:'🪄', bgGradient:'linear-gradient(135deg,#4527a0,#ab47bc)', primaryColor:'#7c4dff', accentColor:'#ffd54f' },
  school: { name:'École', mascot:'📚', bgGradient:'linear-gradient(135deg,#00897b,#80cbc4)', primaryColor:'#00897b', accentColor:'#ffca28' },
  superhero: { name:'Super héros', mascot:'🦸', bgGradient:'linear-gradient(135deg,#c62828,#fdd835)', primaryColor:'#c62828', accentColor:'#fff' },
};

export class ThemeEngine {
  static applyTheme(themeKey = 'jungle', rootElement = document.body) {
    const config = THEME_CONFIGS[themeKey] || THEME_CONFIGS.jungle;

    // Remove existing theme-* classes
    for (const cls of Array.from(rootElement.classList)) {
      if (cls.startsWith('theme-')) rootElement.classList.remove(cls);
    }
    rootElement.classList.add(`theme-${themeKey}`);

    // The palette itself lives in themes/worlds.css (one rule per world, wired to
    // the supplied background art). Show the world's name to the player.
    const nameEl = document.getElementById('kids-theme-name');
    if (nameEl) nameEl.textContent = `${config.mascot} ${config.name}`;

    // The supplied mascot pack is shared across worlds. Keep its actual JPG/PNG
    // filenames rather than assuming the originally requested WebP convention.
    const mascotEl = document.querySelector('.kids-mascot');
    if (mascotEl) {
      mascotEl.dataset.theme = themeKey;
      this.setMascotReaction('idle');
    }

    return config;
  }

  static setMascotReaction(reaction = 'idle') {
    const image = document.getElementById('kids-mascot-image');
    if (!image) return;
    const extension = reaction === 'celebrate' ? 'png' : 'jpg';
    image.src = `/kids/assets/mascot-${reaction}.${extension}`;
    image.alt = `Mascotte Kids Space : ${reaction}`;
  }

  static applyAgeProfile(ageMin = 5, ageMax = 12, rootElement = document.body) {
    for (const cls of Array.from(rootElement.classList)) {
      if (cls.startsWith('age-')) rootElement.classList.remove(cls);
    }

    let ageTier = 'middle';
    if (ageMax <= 6) {
      ageTier = 'young'; // 4-6 years (preschool / CP)
    } else if (ageMin >= 10) {
      ageTier = 'older'; // 10-12 years (CM1 / CM2)
    }

    rootElement.classList.add(`age-${ageTier}`);
    return ageTier;
  }
}
