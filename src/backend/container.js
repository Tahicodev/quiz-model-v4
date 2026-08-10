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
import { RAGService } from './services/RAGService.js';
import { ProfileRequestService } from './services/ProfileRequestService.js';
import { AccountRequestService } from './services/AccountRequestService.js';
import { GamePresetService } from './services/GamePresetService.js';
import { NotificationService } from './services/NotificationService.js';
import { GamificationService } from './services/GamificationService.js';
import { TeacherMessageService } from './services/TeacherMessageService.js';
import { TeacherAssignmentService } from './services/TeacherAssignmentService.js';

// Reused frontend services (pure JS, repo-based, no browser deps)
import { QuestionService } from '../frontend/services/QuestionService.js';
import { ExamService } from '../frontend/services/ExamService.js';
import { ResultService } from '../frontend/services/ResultService.js';
import { ClassService } from '../frontend/services/ClassService.js';
import { CategoryService } from '../frontend/services/CategoryService.js';
import { GameService } from '../frontend/services/GameService.js';
import { TournamentService } from '../frontend/services/TournamentService.js';
import { SessionService } from '../frontend/services/SessionService.js';
import { SettingsService } from '../frontend/services/SettingsService.js';

let _container = null;

export function createContainer() {
  if (_container) return _container;

  const repo = new PrismaRepository(prisma);

  // Instantiate into locals so dependent services receive their dependencies.
  const gameSvc = new GameService(repo);
  const tournamentSvc = new TournamentService(repo, gameSvc); // depends on gameSvc

  _container = Object.freeze({
    repo,

    // Backend-specific
    authSvc: new AuthService(repo),
    userSvc: new UserService(repo, logger),
    auditSvc: new AuditService(repo),

    // AI
    aiSvc:  new AIService(repo, logger),
    ragSvc: new RAGService(repo, logger),
    questionSvc: new QuestionService(repo),
    examSvc: new ExamService(repo),
    resultSvc: new ResultService(repo),
    classSvc: new ClassService(repo),
    categorySvc: new CategoryService(repo),
    gameSvc,
    tournamentSvc,
    sessionSvc: new SessionService(repo),
    settingsSvc: new SettingsService(repo),

    // Full-persistence stores (Phase 2)
    notificationSvc: new NotificationService(repo),
    gamificationSvc: new GamificationService(repo),
    profileRequestSvc: new ProfileRequestService(repo),
    accountRequestSvc: new AccountRequestService(repo, null),
    gamePresetSvc: new GamePresetService(repo),
    teacherMessageSvc: new TeacherMessageService(repo),
    teacherAssignmentSvc: new TeacherAssignmentService(repo),
  });

  return _container;
}

export function getContainer() {
  if (!_container) {
    throw new Error('Container not initialized. Call createContainer() in server.js first.');
  }
  return _container;
}
