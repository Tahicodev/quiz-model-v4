/**
 * src/backend/container.js
 *
 * Dependency Injection container for the backend. Wires the PrismaRepository
 * into every service. Most services are REUSED DIRECTLY from the frontend
 * (src/frontend/services/) — they are pure JS, repo-based, and have no browser
 * dependencies. Only AuthService, UserService, and AuditService are
 * backend-specific (they need bcrypt/JWT/refresh-token logic that cannot run in
 * a browser). This avoids duplicate service implementations drifting apart.
 */

import { prisma } from './prisma.js';
import { logger } from './logger.js';
import { PrismaRepository } from './infrastructure/PrismaRepository.js';

// Backend-specific services
import { AuthService } from './services/AuthService.js';
import { UserService } from './services/UserService.js';
import { AuditService } from './services/AuditService.js';
import { AIService } from './services/AIService.js';
import { ImageGenService } from './services/ImageGenService.js';
import { RAGService } from './services/RAGService.js';
import { AIConfigService } from './services/AIConfigService.js';
import { ProfileRequestService } from './services/ProfileRequestService.js';
import { AccountRequestService } from './services/AccountRequestService.js';
import { GamePresetService } from './services/GamePresetService.js';
import { NotificationService } from './services/NotificationService.js';
import { NotificationFeedService } from './services/NotificationFeedService.js';
import { GamificationService } from './services/GamificationService.js';
import { TeacherMessageService } from './services/TeacherMessageService.js';
import { TeacherAssignmentService } from './services/TeacherAssignmentService.js';
import { DeviceService } from './services/DeviceService.js';
import { OverviewAnalyticsService } from './services/OverviewAnalyticsService.js';
import { TeacherOverviewService } from './services/TeacherOverviewService.js';
import { RoleService } from './services/RoleService.js';
import { SecurityEventService } from './services/SecurityEventService.js';
import { PlatformAnalyticsService } from './services/PlatformAnalyticsService.js';
import { AuditQueryService } from './services/AuditQueryService.js';
import { SystemHealthService } from './services/SystemHealthService.js';
import { AdminActionService } from './services/AdminActionService.js';
import { listPresence } from './realtime/presence.registry.js';
import { ExamDocumentService } from './services/ExamDocumentService.js';
import { GeneratedDocumentService } from './services/GeneratedDocumentService.js';

// Reused frontend services (pure JS, repo-based, no browser deps)
import { QuestionService } from '../frontend/services/QuestionService.js';
import { ExamService } from '../frontend/services/ExamService.js';
import { ResultService } from '../frontend/services/ResultService.js';
import { ClassService } from '../frontend/services/ClassService.js';
import { CategoryService } from '../frontend/services/CategoryService.js';
import { SubjectService } from '../frontend/services/SubjectService.js';
import { CourseService } from '../frontend/services/CourseService.js';
import { GameService } from '../frontend/services/GameService.js';
import { TournamentService } from '../frontend/services/TournamentService.js';
import { SessionService } from '../frontend/services/SessionService.js';
import { SettingsService } from '../frontend/services/SettingsService.js';
import { KidsGameService } from '../frontend/services/KidsGameService.js';
import { KidsChampionshipService } from './services/KidsChampionshipService.js';

let _container = null;

export function createContainer() {
  if (_container) return _container;

  const repo = new PrismaRepository(prisma);

  // Instantiate into locals so dependent services receive their dependencies.
  const gameSvc = new GameService(repo);
  const tournamentSvc = new TournamentService(repo, gameSvc); // depends on gameSvc
  // Governance services are created first: AuthService writes the durable
  // security trail, so it needs the service instance at construction time.
  const roleSvc = new RoleService(repo);
  const securityEventSvc = new SecurityEventService(repo);
  const auditSvc = new AuditService(repo);
  // Platform read model for the Admin control center. Aggregates across
  // organizations at platform scope, inside one organization at school scope.
  const platformAnalyticsSvc = new PlatformAnalyticsService(repo);
  const auditQuerySvc = new AuditQueryService(repo);
  const systemHealthSvc = new SystemHealthService(repo);
  // Administrative writes. Needs the audit + security writers, so it is
  // created after them.
  const adminActionSvc = new AdminActionService(repo, {
    auditSvc,
    securityEventSvc,
    logger,
  });

  _container = Object.freeze({
    repo,

    // Backend-specific
    authSvc: new AuthService(repo, { securityEventSvc }),
    userSvc: new UserService(repo, logger),
    auditSvc,

    // AI
    aiSvc:  new AIService(repo, logger),
    imageGenSvc: new ImageGenService({ logger }),
    ragSvc: new RAGService(repo, logger),
    aiConfigSvc: new AIConfigService(repo, logger),
    questionSvc: new QuestionService(repo),
    examSvc: new ExamService(repo),
    resultSvc: new ResultService(repo),
    classSvc: new ClassService(repo),
    categorySvc: new CategoryService(repo),
    subjectSvc: new SubjectService(repo),
    courseSvc: new CourseService(repo),
    gameSvc,
    tournamentSvc,
    sessionSvc: new SessionService(repo),
    settingsSvc: new SettingsService(repo),
    kidsGameSvc: new KidsGameService(repo),
    kidsChampionshipSvc: new KidsChampionshipService(repo),

    // Full-persistence stores (Phase 2)
    notificationSvc: new NotificationService(repo),
    notificationFeedSvc: new NotificationFeedService(repo),
    gamificationSvc: new GamificationService(repo),
    profileRequestSvc: new ProfileRequestService(repo),
    accountRequestSvc: new AccountRequestService(repo, null),
    gamePresetSvc: new GamePresetService(repo),
    teacherMessageSvc: new TeacherMessageService(repo),
    teacherAssignmentSvc: new TeacherAssignmentService(repo),
    deviceSvc: new DeviceService(repo),

    // School-wide analytics for the Admin Dashboard Overview (admin-only).
    overviewAnalyticsSvc: new OverviewAnalyticsService(repo),

    // Teacher-scoped pedagogical analytics for the Teacher Overview tab.
    // Population boundary = the teacher's assigned classes (never school-wide).
    // Presence is read from the live socket registry written by the realtime bridge.
    teacherOverviewSvc: new TeacherOverviewService(repo, { listPresence }),

    // Admin platform governance: role catalog + per-user permission overrides.
    roleSvc,

    // Durable authentication / access-control trail. AuditService records
    // administrative actions; this records who tried to get in and whether
    // they succeeded.
    securityEventSvc,

    // Platform-wide read model behind the Admin control center.
    platformAnalyticsSvc,

    // Searchable audit trail (administrative actions + security events).
    auditQuerySvc,

    // Operational read model: availability, latency, database, storage.
    systemHealthSvc,

    // Administrative writes for the control center (status transitions, role
    // changes, permission overrides). Every action is audit-logged.
    adminActionSvc,

    // Printable exam documents (PDF/DOCX). Read-only over exams and questions:
    // the only thing it writes is its own header slice inside options_json.
    examDocSvc: new ExamDocumentService(repo),

    // Registry + on-disk store for every document the app renders for teachers
    // (course booklets, prep sheets, exercises with solutions, exams).
    genDocSvc: new GeneratedDocumentService(repo, { logger }),
  });

  return _container;
}

export function getContainer() {
  if (!_container) {
    throw new Error('Container not initialized. Call createContainer() in server.js first.');
  }
  return _container;
}
