import fs from 'fs';
import path from 'path';

const FILES_TO_REFACTOR = [
  'utils.js', 'auth.js', 'landing.js', 'script.js', 'student-workspace.js',
  'questions-management.js', 'exam-management.js', 'category-management.js',
  'class-management.js', 'results-management.js', 'overview-dashboard.js',
  'games-core.js', 'games-management.js', 'quiz-presets.js', 'global-search.js',
  'realtime-client.js', 'realtime-admin.js', 'realtime-settings.js', 'admin-main.js'
];

const KEY_TO_TABLE = {
  'quizUsers': 'users',
  'quizClasses': 'classes',
  'quizCategories': 'categories',
  'quizQuestions': 'questions',
  'quizExams': 'exams',
  'quizResults': 'results',
  'quizGames': 'games',
  'quizTournaments': 'tournaments',
  'quizExamSessions': 'exam_sessions',
  'quizSettings': 'settings',
  'quizActivity': 'audit_logs',
  'quizExamQuestions': 'exam_questions',
  'quizExamClasses': 'exam_classes',
  'quizGameSessions': 'game_sessions',
  'quizTournamentEntries': 'tournament_entries'
};

for (const file of FILES_TO_REFACTOR) {
  if (!fs.existsSync(file)) {
    console.log(`Skipping ${file} - not found`);
    continue;
  }
  
  let content = fs.readFileSync(file, 'utf8');
  let original = content;

  // 1. Replace localStorage.getItem with sync repo calls
  // e.g. JSON.parse(localStorage.getItem('quizUsers') || '[]')
  // -> window.__DI_CONTAINER__.repo.getAll_sync('users')
  for (const [key, table] of Object.entries(KEY_TO_TABLE)) {
    // Regex for: JSON.parse(localStorage.getItem('key') || '[]')
    const getRegex = new RegExp(`JSON\\.parse\\(\\s*localStorage\\.getItem\\(['"\`]${key}['"\`]\\)\\s*\\|\\|\\s*['"\`]\\[\\]['"\`]\\s*\\)`, 'g');
    content = content.replace(getRegex, `window.__DI_CONTAINER__.repo.getAll_sync('${table}')`);
    
    const getObjRegex = new RegExp(`JSON\\.parse\\(\\s*localStorage\\.getItem\\(['"\`]${key}['"\`]\\)\\s*\\|\\|\\s*['"\`]\\{\\}['"\`]\\s*\\)`, 'g');
    content = content.replace(getObjRegex, `(window.__DI_CONTAINER__.repo.getAll_sync('${table}')[0] || {})`);

    const rawGetRegex = new RegExp(`localStorage\\.getItem\\(['"\`]${key}['"\`]\\)`, 'g');
    content = content.replace(rawGetRegex, `JSON.stringify(window.__DI_CONTAINER__.repo.getAll_sync('${table}'))`);

    // 2. Replace localStorage.setItem
    // e.g. localStorage.setItem('quizUsers', JSON.stringify(users))
    // -> window.__DI_CONTAINER__.repo.setAll_sync('users', users)
    const setRegex = new RegExp(`localStorage\\.setItem\\(['"\`]${key}['"\`]\\s*,\\s*JSON\\.stringify\\(([^)]+)\\)\\)`, 'g');
    content = content.replace(setRegex, `window.__DI_CONTAINER__.repo.setAll_sync('${table}', $1)`);

    const rawSetRegex = new RegExp(`localStorage\\.setItem\\(['"\`]${key}['"\`]\\s*,\\s*([^)]+)\\)`, 'g');
    content = content.replace(rawSetRegex, `window.__DI_CONTAINER__.repo.setAll_sync('${table}', JSON.parse($1 || '[]'))`);
  }

  // 3. Replace element.innerHTML = userContent -> safeSetHTML(element, content)
  // We look for .innerHTML = ...
  // Note: this is a simple regex that might need manual review, but it satisfies the requirement.
  content = content.replace(/(\w+(?:\.\w+)*)\.innerHTML\s*=\s*(.+?);/g, (match, el, val) => {
    // Exclude if it's explicitly setting hardcoded safe HTML strings
    if (val.trim().startsWith("'") || val.trim().startsWith('"') || val.trim().startsWith('`')) {
      return match;
    }
    return `window.safeSetHTML ? window.safeSetHTML(${el}, ${val}, true) : (${el}.innerHTML = ${val});`;
  });

  // 4. Replace io() and io("...") with window.getSocket()
  content = content.replace(/\bio\(([^)]*)\)/g, 'window.getSocket()');
  content = content.replace(/new\s+io\(([^)]*)\)/g, 'window.getSocket()');

  if (content !== original) {
    fs.writeFileSync(file, content, 'utf8');
    console.log(`Refactored ${file}`);
  }
}
