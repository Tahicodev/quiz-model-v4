/**
 * src/frontend/container.js
 * Dependency Injection Container for the Frontend.
 *
 * SaaS-only build: every service is wired against the ApiRepository — there is
 * no LocalStorage fallback and no CacheDecorator wrap. The repository contract
 * is identical, so services carry no mode checks.
 */

import { config }                 from './config.js';
import { ApiRepository }          from './infrastructure/ApiRepository.js';

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

  // Forward-declared so ApiRepository can read tokens off AuthService.
  let authSvcReference;

  const repo = new ApiRepository({
    baseUrl: config.apiUrl,
    getToken: () => authSvcReference?.getToken(),
    onUnauthorized: () => { window.location.href = '/'; },
  });

  const authSvc       = new AuthService(repo);
  authSvcReference    = authSvc;

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
    repo,
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
