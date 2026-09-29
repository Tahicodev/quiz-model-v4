/**
 * src/shared/constants.js
 * All application-wide enums and constants — frozen objects to prevent mutation.
 * Import from this file in both frontend and backend. Never hardcode these strings elsewhere.
 */

export const ROLES = Object.freeze({
  SUPER_ADMIN: 'super_admin', // SaaS platform admin (manages schools)
  ADMIN:       'admin',       // School admin
  TEACHER:     'teacher',     // Teacher / content author
  STUDENT:     'student',
});

export const QUESTION_TYPES = Object.freeze({
  MCQ:        'mcq',
  TRUE_FALSE: 'true-false',
  FILL_BLANK: 'fill-blank',
  MATCHING:   'matching',
  ORDER:      'order',
});

export const EXAM_STATUS = Object.freeze({
  DRAFT:    'draft',
  ACTIVE:   'active',
  ARCHIVED: 'archived',
});

export const GAME_TYPES = Object.freeze({
  QUIZ:      'quiz',
  FLASHCARD: 'flashcard',
  MEMORY:    'memory',
  SPEED:     'speed',   // timed individual challenge
  BATTLE:    'battle',  // head-to-head
});

export const GAME_STATUS = Object.freeze({
  WAITING:  'waiting',  // lobby open, waiting for players
  ACTIVE:   'active',
  PAUSED:   'paused',
  FINISHED: 'finished',
});

export const TOURNAMENT_STATUS = Object.freeze({
  DRAFT:    'draft',
  OPEN:     'open',     // registration open
  ACTIVE:   'active',
  FINISHED: 'finished',
});

export const RESULT_MODE = Object.freeze({
  EXAM:       'exam',
  TRAINING:   'training',
  GAME:       'game',
  TOURNAMENT: 'tournament',
});

export const DIFFICULTY = Object.freeze({
  EASY:   'easy',
  MEDIUM: 'medium',
  HARD:   'hard',
});

export const SESSION_STATUS = Object.freeze({
  PENDING:   'pending',
  ACTIVE:    'active',
  COMPLETED: 'completed',
  EXPIRED:   'expired',
  ABANDONED: 'abandoned',
});

export const SETTINGS_VISIBILITY = Object.freeze({
  PUBLIC:  'public',  // sent to all clients including unauthenticated
  TEACHER: 'teacher', // sent only to admin/teacher role
  ADMIN:   'admin',   // sent only to admin role
  SYSTEM:  'system',  // never sent to any client
});

export const LOG_LEVELS = Object.freeze({
  DEBUG:    'debug',
  INFO:     'info',
  WARN:     'warn',
  ERROR:    'error',
  SECURITY: 'security', // login failures, unauthorized access attempts, etc.
});

export const SOCKET_EVENTS = Object.freeze({
  // Server → Client
  GAME_STATE_UPDATE:     'game:state_update',
  GAME_QUESTION:         'game:question',
  GAME_SCORES:           'game:scores',
  GAME_FINISHED:         'game:finished',
  TOURNAMENT_STATE_UPDATE: 'tournament:state_update',
  TOURNAMENT_QUESTION:    'tournament:question',
  TOURNAMENT_SCORES:      'tournament:scores',
  TOURNAMENT_FINISHED:    'tournament:finished',
  SESSION_EXPIRED:       'session:expired',
  ERROR:                 'app:error',
  PLAYER_JOINED:         'player:joined',
  PLAYER_LEFT:           'player:left',
  PLAYER_DISCONNECTED:   'player:disconnected',
  ANSWER_RESULT:         'answer:result',
  // Client → Server
  GAME_JOIN:             'game:join',
  GAME_ANSWER:           'game:answer',
  GAME_LEAVE:            'game:leave',
  TOURNAMENT_JOIN:       'tournament:join',
  TOURNAMENT_ANSWER:     'tournament:answer',
  TOURNAMENT_LEAVE:      'tournament:leave',
  SESSION_HEARTBEAT:     'session:heartbeat',
  // Kids Space Events
  KIDS_JOIN:                'kids:join',
  KIDS_LEAVE:               'kids:leave',
  KIDS_ACTIVITY_STATE:      'kids:activity_state',
  KIDS_LEVEL_DATA:          'kids:level_data',
  KIDS_ANSWER:              'kids:answer',
  KIDS_ANSWER_RESULT:       'kids:answer_result',
  KIDS_PROGRESS:            'kids:progress',
  KIDS_ACTIVITY_COMPLETE:   'kids:activity_complete',
  KIDS_HINT_REQUEST:        'kids:hint_request',
  KIDS_HINT_RESPONSE:       'kids:hint_response',
  KIDS_TEACHER_BROADCAST:   'kids:teacher_broadcast',
  KIDS_MONITOR:             'kids:monitor',
});

// ── Kids Space ──────────────────────────────────────────────────────────────

/** Core mechanics (Phase 1): the atomic game types that render one question. */
export const KIDS_CORE_MECHANICS = Object.freeze({
  MULTIPLE_CHOICE: 'multiple_choice',
  WORD_ORDER:      'word_order',
  DRAG_DROP:       'drag_drop',
  MATCHING:        'matching',
  MEMORY:          'memory',
  SORTING:         'sorting',
  SEQUENCE:        'sequence',
  FIND_CORRECT:    'find_correct',
  BUBBLE_POP:      'bubble_pop',
});

/** Adventure wrappers (Phase 2): wrap core mechanics in a narrative shell. */
export const KIDS_ADVENTURE_GAMES = Object.freeze({
  TREASURE_HUNT:   'treasure_hunt',
  OBSTACLE_RUN:    'obstacle_run',
  PUZZLE:          'puzzle',
  BOARD_GAME:      'board_game',
  BUILD_CONSTRUCT: 'build_construct',
  WHACK_TAP:       'whack_tap',
});

/** Immersive worlds (Phase 3): themed experiences around core mechanics. */
export const KIDS_IMMERSIVE_GAMES = Object.freeze({
  ANIMAL_RESCUE:    'animal_rescue',
  SPACE_ADVENTURE:  'space_adventure',
  COOKING:          'cooking',
  ESCAPE_ROOM:      'escape_room',
  FARM_GARDEN:      'farm_garden',
});

/** All game templates combined. */
export const KIDS_GAME_TEMPLATES = Object.freeze({
  ...KIDS_CORE_MECHANICS,
  ...KIDS_ADVENTURE_GAMES,
  ...KIDS_IMMERSIVE_GAMES,
});

export const KIDS_ACTIVITY_STATUS = Object.freeze({
  DRAFT:     'draft',
  PUBLISHED: 'published',
  ARCHIVED:  'archived',
});

export const KIDS_THEMES = Object.freeze({
  JUNGLE:       'jungle',
  SPACE:        'space',
  OCEAN:        'ocean',
  FARM:         'farm',
  CASTLE:       'castle',
  DINOSAUR:     'dinosaur',
  FOREST:       'forest',
  CITY:         'city',
  CIRCUS:       'circus',
  MAGIC_WORLD:  'magic_world',
  SCHOOL:       'school',
  SUPERHERO:    'superhero',
});

export const KIDS_SUBJECTS = Object.freeze({
  MATH:        'math',
  FRENCH:      'french',
  ENGLISH:     'english',
  ARABIC:      'arabic',
  SCIENCE:     'science',
  DISCOVERY:   'discovery',     // découverte du monde
  LOGIC:       'logic',
  HISTORY:     'history',
  GEOGRAPHY:   'geography',
});

export const KIDS_GRADES = Object.freeze({
  PRESCHOOL: 'preschool',
  CP:        'CP',
  CE1:       'CE1',
  CE2:       'CE2',
  CM1:       'CM1',
  CM2:       'CM2',
  OTHER:     'other',
});

export const KIDS_DIFFICULTY = Object.freeze({
  VERY_EASY: 'very_easy',
  EASY:      'easy',
  MEDIUM:    'medium',
  HARD:      'hard',
  ADAPTIVE:  'adaptive',
});

export const KIDS_TEMPLATE_CATEGORY = Object.freeze({
  CORE:      'core',
  ADVENTURE: 'adventure',
  IMMERSIVE: 'immersive',
});

/**
 * Maps the localStorage key names historically used by the legacy MPA scripts.
 * In the SaaS build these keys are read-through/write-through cache entries
 * only — the backend is the source of truth. The values are kept stable so
 * existing legacy code continues to find its cache.
 */
export const STORAGE_KEYS = Object.freeze({
  users:         'quizUsers',
  classes:       'quizClasses',
  categories:    'quizCategories',
  questions:     'quizQuestions',
  exams:         'quizExams',
  results:       'quizResults',
  games:         'quizGames',
  tournaments:   'quizTournaments',
  exam_sessions: 'quizExamSessions',
  settings:      'quizSettings',
  audit_logs:    'quizAuditLogs',
  currentUser:   'quizCurrentUser',
  authToken:     'quizAuthToken',
  // ── Operational keys (real data, route through the repository layer) ──
  // Added during the localStorage → repository migration so these stores
  // stop bypassing the cache/bridge. Values unchanged → existing data survives.
  activity:              'quizActivity',
  gamification:          'quizGamification',
  tournament_history:    'quizTournamentsHistory',
  game_presets:           'gamePresets',
  profile_requests:       'quizProfileRequests',
  account_requests:      'quizAccountRequests',
  notifications:          'adminNotifications',
  teacher_messages:       'teacherMessages',
  teacher_assignments:    'teacherAssignments',
  // Legacy merge-source map used once by admin-main.js (cleared after merge);
  // repo-backed only so the read goes through the bridge like everything else.
  profile_requests_legacy: 'adminProfileRequests',
});
