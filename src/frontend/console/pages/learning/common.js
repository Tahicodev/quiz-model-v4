/**
 * src/frontend/console/pages/learning/common.js
 *
 * Shared furniture for the three learning pages (hub, questions, taxonomy).
 *
 * It exists so the panel root — and therefore the `dir="rtl"` attribute the
 * spec confines to the learning panel — is declared in exactly ONE place. A
 * page that forgot the wrapper would silently break Arabic.
 */

import { api } from '../../core/api.js';
import { esc } from '../../viz/charts.js';
import { loadingBlock, errorState } from '../../components/states.js';
import { toast } from '../../components/ui.js';
import { LANGUAGES, dirFor, getLanguage, setLanguage, translator } from './labels.js';
import { isAdaptiveEnabled, loadFlags, setAdaptiveEnabled } from './flags.js';

/** The translator for the currently selected language. */
export function tr() {
	return translator(getLanguage());
}

/** The dir for the currently selected language. */
export function currentDir() {
	return dirFor(getLanguage());
}

/**
 * The learning panel root.
 *
 * Every learning page renders inside this wrapper: it carries the panel-only
 * `dir`, the language selector and the page's own trailing actions.
 */
export function learningShell({ body, actions = '' }) {
	const lang = getLanguage();
	const t = translator(lang);
	return `<div class="learning-panel ac-stack" dir="${dirFor(lang)}" data-ac-learning-panel>
		<div class="learning-panel__head">
			<div class="ac-field learning-panel__lang">
				<label class="ac-field__label" for="ac-learning-lang">${esc(t('lang.label'))}</label>
				<select class="ac-select" id="ac-learning-lang" data-ac-learning-lang>
					${LANGUAGES.map(
						(entry) =>
							`<option value="${esc(entry.key)}"${entry.key === lang ? ' selected' : ''}>${esc(entry.label)}</option>`,
					).join('')}
				</select>
				<p class="ac-field__hint">${esc(t('hint.language'))}</p>
			</div>
			${actions ? `<div class="learning-panel__actions">${actions}</div>` : ''}
		</div>
		<div class="learning-panel__body">${body}</div>
	</div>`;
}

/** Bind the language selector. Must be called after every render. */
export function bindLearningShell(host, ctx) {
	const select = host.querySelector('[data-ac-learning-lang]');
	if (!select) return;
	select.addEventListener('change', () => {
		setLanguage(select.value);
		ctx.rerender();
	});
}

/**
 * Guard: render the "learning is disabled" state and return false when the
 * organization has not enabled the Phase 1 surfaces.
 *
 * The flags are re-read on every render (the pages render rarely, and a toggle
 * must take effect immediately). A failed read fails CLOSED — the surfaces go
 * hidden rather than half-drawn.
 */
export async function ensureEnabled(host, ctx) {
	await loadFlags({ force: true });
	if (isAdaptiveEnabled()) return true;
	host.innerHTML = learningShell({ body: disabledBody(ctx) });
	bindLearningShell(host, ctx);
	bindEnableToggle(host, ctx);
	return false;
}

/** The body shown while the master switch is off. */
export function disabledBody(ctx) {
	const t = tr();
	const canManage = ctx.canAny(['school.learning.manage']);
	return `<div class="ac-section-panel">
		<div class="ac-section-panel__body">
			<div class="ac-alert ac-alert--info">
				<div class="ac-alert__body">
					<p class="ac-alert__title">${esc(t('flag.disabled.title'))}</p>
					<p class="ac-alert__text">${esc(t('flag.disabled.body'))}</p>
				</div>
			</div>
			${
				canManage
					? `<div class="learning-panel__toggle"><button type="button" class="ac-btn ac-btn--primary" data-ac-learning-enable>${esc(
							t('flag.toggle.on'),
						)}</button></div>`
					: `<p class="ac-field__hint">${esc(t('flag.adminOnly'))}</p>`
			}
		</div>
	</div>`;
}

/** Wire the "turn learning on" button (present only for administrators). */
export function bindEnableToggle(host, ctx) {
	const button = host.querySelector('[data-ac-learning-enable]');
	if (!button) return;
	const t = tr();
	button.addEventListener('click', async () => {
		button.disabled = true;
		try {
			await setAdaptiveEnabled(true);
			toast(t('toast.flagOn'), 'success');
			ctx.rerender();
		} catch (err) {
			button.disabled = false;
			toast(err.message, 'error');
		}
	});
}

// ── Bloom catalog ───────────────────────────────────────────────────────────

/**
 * Fetch the Bloom catalog once per page render.
 *
 * The dimension labels come from the SERVER (`labels_json` with en/fr/ar), so
 * the panel never carries a second translation of them.
 */
export async function fetchBloom() {
	const payload = await api.get('learning/bloom');
	return Array.isArray(payload?.data) ? payload.data : [];
}

/** The label of a Bloom dimension in the selected language. */
export function bloomLabel(dimension, lang = getLanguage()) {
	if (!dimension) return null;
	const labels = dimension.labels || dimension.labels_json || null;
	let parsed = labels;
	if (typeof parsed === 'string') {
		try {
			parsed = JSON.parse(parsed);
		} catch (_error) {
			parsed = null;
		}
	}
	return parsed?.[lang] || parsed?.en || dimension.name || dimension.key || null;
}

/** `{ value, label }` options for a Bloom select. */
export function bloomOptions(bloom, { includeAll = false, allLabel = null, lang = getLanguage() } = {}) {
	const options = (bloom || []).map((dimension) => ({
		value: dimension.id,
		label: bloomLabel(dimension, lang),
	}));
	return includeAll ? [{ value: '', label: allLabel || 'All' }, ...options] : options;
}

/** Look up one Bloom dimension (or its id list) by id. */
export function bloomById(bloom, id) {
	if (!id) return null;
	return (bloom || []).find((dimension) => dimension.id === id) || null;
}

// ── Small shared renderers ─────────────────────────────────────────────────

/** A pedagogy-status chip. */
export function pedagogyChip(lang, status) {
	const key = status || 'unclassified';
	const t = translator(lang);
	return `<span class="learning-chip learning-chip--${esc(key)}">${esc(t(`status.${key}`))}</span>`;
}

/** An objective-status chip. */
export function objectiveChip(lang, status) {
	const key = status || 'proposed';
	const t = translator(lang);
	return `<span class="learning-chip learning-chip--obj-${esc(key)}">${esc(t(`objective.${key}`))}</span>`;
}

/**
 * The shared "load failed" body inside the panel. Returns true when the error
 * was rendered, so the caller can bail out.
 */
export function renderLoadError(host, ctx, err) {
	host.innerHTML = learningShell({
		body: errorState({ title: tr()('error.load'), message: err?.message || '' }),
	});
	bindLearningShell(host, ctx);
	const retry = host.querySelector('[data-ac-retry]');
	if (retry) retry.addEventListener('click', () => ctx.rerender());
	return true;
}

/** A loading body inside the panel. */
export function renderLoading(host, ctx, rows = 4) {
	host.innerHTML = learningShell({ body: loadingBlock(rows) });
	bindLearningShell(host, ctx);
}
