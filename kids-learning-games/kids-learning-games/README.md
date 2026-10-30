# Kids Learning Games — v1.0

Projet autonome en **HTML, CSS et JavaScript vanilla**, sans framework ni étape de compilation.

## Lancer le projet
1. Décompresser `kids-learning-games.zip`.
2. Ouvrir `index.html` dans un navigateur moderne.
3. Pour un environnement local, lancer un serveur statique depuis ce dossier (par exemple `python -m http.server 8000`) puis ouvrir `http://localhost:8000`.

## Contenu
- Français : Alphabet Explorer, Animal Match, Word Builder, Conjugaison Challenge, Orthographe Detective.
- العربية : رحلة الحروف، أشكال الحروف، الحركات، ابنِ الكلمة، عالم المفردات.
- Mathématiques : Number Explorer, Number Battle, Number Train, Math Factory, Puzzle des nombres.

Chaque activité propose une série de cinq défis, un retour immédiat, une progression et des étoiles locales. Le score affiché dans cette démo est stocké dans `localStorage` du navigateur.

## Structure
```text
kids-learning-games/
├── index.html
├── css/
│   └── styles.css
├── js/
│   ├── games-data.js
│   └── app.js
└── README.md
```

## Intégration dans le Quiz App

### Recommandation d'architecture
Ne remplace pas le moteur existant de Kids Games. Intègre ce projet comme une **couche de présentation/activités autonome** et conserve les mécanismes déjà en place pour les sessions, le chronomètre, le verrouillage, la correction et l'enregistrement des résultats.

Dans ton application, le catalogue est accessible via :
```js
window.KidsLearningGames.getCatalog()
```

Un montage isolé dans un conteneur est possible :
```js
const instance = window.KidsLearningGames.mount({
  root: document.querySelector("#kids-learning-game-host"),
  engine: existingGameEngine,
  config: { baseUrl: "/kids/learning-games/" }
});
```

Le montage utilise actuellement un iframe pour isoler les styles et scripts de la démo. `destroy()` retire cet iframe. C'est une première intégration visuelle, pas encore un branchement au moteur de correction du Quiz App.

### Branchement au moteur existant — étape nécessaire avant mise en production
La démo autonome valide les réponses localement. Pour l'intégration définitive, l'adaptateur de chaque activité doit envoyer les réponses au pipeline existant du Quiz App (par exemple `engine.answer(...)`, selon la signature réelle de ton moteur), et laisser le serveur / moteur existant calculer le score officiel. Ne considère pas `localStorage` ou le score local de cette démo comme une source de vérité.

Pour respecter l'architecture actuelle :
- garder le grading serveur et le pipeline `engine.answer()` ;
- garder le timer, le verrouillage et les feedbacks existants ;
- ne pas ajouter de schéma DB ni réinitialiser les données ;
- les niveaux choisis par l'enseignant peuvent être transmis dans `config_json.levels` ;
- progression anonyme limitée à la session, progression persistante uniquement pour les élèves connectés ;
- les pièces, étoiles ou monnaies restent cosmétiques.

### Personnalisation
- Modifier les titres, descriptions et catégories dans `js/games-data.js`.
- Modifier les questions et les mécaniques dans `js/app.js`.
- Modifier les couleurs, cartes et responsive design dans `css/styles.css`.

## Limites de cette première version
- Les activités utilisent des banques d'exemples intégrées au JavaScript : elles servent de prototype fonctionnel, pas de programme pédagogique complet.
- La reconnaissance vocale, l'audio de prononciation, le dessin libre et le vrai glisser-déposer ne sont pas inclus dans cette première version.
- La banque arabe et les formes des lettres doivent être relues par un enseignant arabophone avant déploiement pédagogique.
- Les images sont représentées par des émojis pour garder le projet léger et sans dépendance d'assets externes.
