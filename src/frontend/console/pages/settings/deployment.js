/**
 * src/frontend/console/pages/settings/deployment.js
 *
 * Deployment & session — where this installation runs, and what this
 * session can reach.
 *
 * Everything on this page is READ. The deployment mode is decided by the
 * environment the server starts in (`DEPLOYMENT_MODE` → `APP_MODE` →
 * `DB_PROVIDER`), not by a setting an administrator can flip at runtime:
 * a switch that claimed to change the mode while the server kept the old one
 * would be a lie. Changing it is a matter of editing the environment and
 * restarting, and the page says exactly that.
 */

import { panel, escapeHtml } from './index.js';

export async function deploymentSection(ctx) {
	const session = ctx.session || {};
	const deployment = session.deployment || {};
	const organization = ctx.organization || {};

	const markup = [
		panel({
			title: 'Deployment & session',
			subtitle: 'Where this installation runs, and what this session can reach.',
			body: `<div class="ac-defs">
					<div class="ac-defs__item">
						<p class="ac-defs__term">Deployment mode</p>
						<p class="ac-defs__desc">${escapeHtml(deployment.mode || '—')}</p>
					</div>
					<div class="ac-defs__item">
						<p class="ac-defs__term">Database provider</p>
						<p class="ac-defs__desc">${escapeHtml(deployment.dbProvider || '—')}</p>
					</div>
					<div class="ac-defs__item">
						<p class="ac-defs__term">Signed in as</p>
						<p class="ac-defs__desc">${escapeHtml(session.user?.name || '')}</p>
					</div>
					<div class="ac-defs__item">
						<p class="ac-defs__term">Role</p>
						<p class="ac-defs__desc">${escapeHtml(
							session.user?.roleLabel || session.user?.role || '',
						)}</p>
					</div>
					<div class="ac-defs__item">
						<p class="ac-defs__term">Your scope</p>
						<p class="ac-defs__desc">${
							ctx.isPlatform
								? deployment.isOffline
									? 'Every organization on this installation'
									: 'Every organization on the platform'
								: organization?.name || 'Your organization'
						}</p>
					</div>
					<div class="ac-defs__item">
						<p class="ac-defs__term">Effective permissions</p>
						<p class="ac-defs__desc">${(session.permissions || []).length}</p>
					</div>
				</div>
				<div class="ac-alert ac-alert--info" style="margin-top:16px">
					<div class="ac-alert__body">
						<p class="ac-alert__title">Deployment mode and role are separate</p>
						<p class="ac-alert__text">${
							deployment.isOffline
								? 'On an offline installation this server is the whole platform, so administration covers the organizations hosted here and no feature requires internet access. An organization administrator still sees only their own organization, and a super administrator administers this installation.'
								: 'On a multi-tenant platform a super administrator reaches every organization while an organization administrator reaches only their own. Switching deployment mode never changes what a given role may reach.'
						}</p>
					</div>
				</div>
				<div class="ac-alert ac-alert--info" style="margin-top:12px">
					<div class="ac-alert__body">
						<p class="ac-alert__title">The mode is set by the environment</p>
						<p class="ac-alert__text">It is read from <code>DEPLOYMENT_MODE</code>, then <code>APP_MODE</code>, then <code>DB_PROVIDER</code>, and it is decided when the server starts. There is deliberately no switch here: a runtime toggle would leave the server running in the old mode while the screen claimed otherwise.</p>
					</div>
				</div>`,
		}),
		panel({
			title: 'Plan and capacity',
			subtitle: 'Observed configuration — nothing is enforced from it.',
			body: `<div class="ac-alert ac-alert--info">
					<div class="ac-alert__body">
						<p class="ac-alert__title">Plan and capacity are observed, not enforced</p>
						<p class="ac-alert__text">The business model does not support subscriptions or quotas yet. The plan and the student capacity recorded on the organization are displayed for information only — no entitlement is derived from them.</p>
					</div>
				</div>
				<div class="ac-defs">
					<div class="ac-defs__item">
						<p class="ac-defs__term">Plan</p>
						<p class="ac-defs__desc">${escapeHtml(organization?.plan || '—')}</p>
					</div>
					<div class="ac-defs__item">
						<p class="ac-defs__term">Student capacity</p>
						<p class="ac-defs__desc">${escapeHtml(String(organization?.maxStudents ?? '—'))}</p>
					</div>
					<div class="ac-defs__item">
						<p class="ac-defs__term">Academic year</p>
						<p class="ac-defs__desc">${escapeHtml(organization?.schoolYear || 'not set')}</p>
					</div>
					<div class="ac-defs__item">
						<p class="ac-defs__term">Organization status</p>
						<p class="ac-defs__desc">${escapeHtml(organization?.status || '—')}</p>
					</div>
				</div>`,
		}),
	].join('');

	return { markup, bind: null };
}
