/**
 * src/shared/constants.js
 * All application-wide enums and constants — frozen objects to prevent mutation.
 * Import from this file in both frontend and backend. Never hardcode these strings elsewhere.
 */

export const ROLES = Object.freeze({
  SUPER_ADMIN: 'super_admin', // SaaS platform admin (manages schools)
  ADMIN:       'admin',       // School admin / teacher
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
  SESSION_HEARTBEAT:     'session:heartbeat',
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
