/**
 * src/frontend/container.js
 * Dependency Injection Container for the Frontend.
 * Wires the active repository (Local or API) into all services.
 */

import { config }                 from './config.js';
import { LocalStorageRepository } from './infrastructure/LocalStorageRepository.js';
import { ApiRepository }          from './infrastructure/ApiRepository.js';
import { CacheDecorator }         from './infrastructure/CacheDecorator.js';

import { AuthService }       from './services/AuthService.js';
import { UserService }       from './services/UserService.js';
import { QuestionService }   from './services/QuestionService.js';
import { ExamService }       from './services/ExamService.js';
import { SessionService }    from './services/SessionService.js';
import { ResultService }     from './services/ResultService.js';
import { ClassService }      from './services/ClassService.js';
import { CategoryService }   from './services/CategoryService.js';
import { GameService }       from './services/GameService.js';
import { TournamentService } from './services/TournamentService.js';
import { SettingsService }   from './services/SettingsService.js';

let _container = null;

export function createContainer() {
  if (_container) return _container;

  // 1. Instantiate the Repository based on mode
  let baseRepo;
  let authSvcReference; // Forward declaration for ApiRepository

  if (config.mode === 'saas') {
    baseRepo = new ApiRepository({
      baseUrl: config.apiUrl,
      getToken: () => authSvcReference?.getToken(),
      onUnauthorized: () => { window.location.href = '/login.html'; },
    });
  } else {
    baseRepo = new LocalStorageRepository();
  }

  // 2. Wrap repo with caching only in local mode (SaaS uses fresh API calls)
  const repo = config.mode !== 'saas'
    ? new CacheDecorator(baseRepo, 30_000)
    : baseRepo;

  // 3. Instantiate Services
  const authSvc       = new AuthService(repo);
  authSvcReference    = authSvc; // bind for ApiRepository

  const userSvc       = new UserService(repo);
  const questionSvc   = new QuestionService(repo);
  const examSvc       = new ExamService(repo);
  const sessionSvc    = new SessionService(repo);
  const resultSvc     = new ResultService(repo);
  const classSvc      = new ClassService(repo);
  const categorySvc   = new CategoryService(repo);
  const gameSvc       = new GameService(repo);
  const tournamentSvc = new TournamentService(repo, gameSvc);
  const settingsSvc   = new SettingsService(repo);

  _container = {
    repo, // export repo for debug/legacy migrations if needed
    authSvc,
    userSvc,
    questionSvc,
    examSvc,
    sessionSvc,
    resultSvc,
    classSvc,
    categorySvc,
    gameSvc,
    tournamentSvc,
    settingsSvc,
  };

  return _container;
}

/**
 * Returns the instantiated container.
 * Throws if called before createContainer().
 */
export function getContainer() {
  if (!_container) {
    throw new Error('Container not initialized. Call createContainer() first in main.js');
  }
  return _container;
}
