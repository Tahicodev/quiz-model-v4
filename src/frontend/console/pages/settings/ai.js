/**
 * src/frontend/console/pages/settings/ai.js
 *
 * Artificial intelligence — providers, keys, models.
 *
 * Ported in full from the legacy "AI Generation" settings tab:
 *
 *   • the provider list, with the API key and the base URL for a custom
 *     (local) OpenAI-compatible server
 *   • the LIVE model list of that provider, fetched on demand
 *   • publishing the selected models as SHARED models the teachers can use
 *   • a personal model, private to the person who registered it
 *   • testing a stored model against its provider
 *   • deleting a model
 *
 * The API key is encrypted on the server (AES-256-GCM) and is NEVER sent to
 * a browser. The list shows only a hint — the last four characters — so an
 * administrator can recognise a key without being able to read it.
 */

import { api } from '../../core/api.js';
import { toast, confirmDialog } from '../../components/ui.js';
import { renderTable } from '../../components/table.js';
import { panel, field, select, escapeHtml } from './index.js';

const PROVIDERS = [
	{ value: 'openrouter', label: 'OpenRouter — all providers, free tier' },
	{ value: 'openai', label: 'OpenAI (GPT family)' },
	{ value: 'anthropic', label: 'Anthropic (Claude)' },
	{ value: 'google', label: 'Google AI (Gemini)' },
	{ value: 'deepseek', label: 'DeepSeek' },
	{ value: 'custom', label: 'Custom / Local (Ollama, LM Studio…)' },
];

const API_KEY_HELP = {
	openrouter: 'https://openrouter.ai/keys',
	openai: 'https://platform.openai.com/api-keys',
	anthropic: 'https://console.anthropic.com/settings/keys',
	google: 'https://aistudio.google.com/app/apikey',
	deepseek: 'https://platform.deepseek.com/api_keys',
};

export async function aiSection(ctx) {
	const payload = await api.get('ai/configs');
	const configs = Array.isArray(payload?.data) ? payload.data : [];

	const shared = configs.filter((row) => row.is_shared);
	const personal = configs.filter((row) => !row.is_shared);

	const markup = [
		panel({
			title: 'Nothing here is required',
			subtitle: 'The platform works fully without an AI provider.',
			body: `<div class="ac-alert ac-alert--info">
					<div class="ac-alert__body">
						<p class="ac-alert__title">Optional by design</p>
						<p class="ac-alert__text">Without a configured model, question generation returns a generated set rather than an error, and image generation falls back to text options. A LAN installation can point a custom provider at a model server on the local network — no internet access is required for that either.</p>
					</div>
				</div>`,
		}),
		panel({
			title: 'Load models from a provider',
			subtitle:
				'Enter the provider key once, fetch the live model list, then publish the models the teachers should see.',
			body: `<div class="ac-field-grid">
					${select({
						id: 'set-ai-provider',
						label: 'Provider',
						options: PROVIDERS,
						value: 'openrouter',
					})}
					${field({
						id: 'set-ai-key',
						label: 'API key',
						type: 'password',
						hint: 'Stored encrypted on the server. It is never sent back to a browser.',
					})}
				</div>
				<div class="ac-field ac-field--full" data-ac-ai-base hidden>
					${field({
						id: 'set-ai-base-url',
						label: 'Base URL',
						value: '',
						placeholder: 'http://localhost:11434/v1',
						hint: 'The chat-completions endpoint of any OpenAI-compatible server (Ollama, LM Studio, vLLM, Groq, an enterprise gateway…).',
					})}
				</div>
				<div class="ac-toolbar" style="margin-bottom:12px">
					<div class="ac-toolbar__row">
						<button type="button" class="ac-btn ac-btn--primary" data-ac-ai-load>Load models (live)</button>
						<button type="button" class="ac-btn" data-ac-ai-test-key>Test connection</button>
						<span class="ac-table__muted" data-ac-ai-status></span>
					</div>
				</div>
				<div data-ac-ai-catalog hidden>
					<div class="ac-field-grid">
						${field({
							id: 'set-ai-model-filter',
							label: 'Filter the list',
							value: '',
							placeholder: 'Type to filter…',
						})}
					</div>
					<div data-ac-ai-models></div>
					<div class="ac-toolbar" style="margin:12px 0 0">
						<div class="ac-toolbar__row">
							<button type="button" class="ac-btn ac-btn--primary" data-ac-ai-publish>Publish the selected models</button>
						</div>
					</div>
				</div>`,
		}),
		panel({
			title: 'Shared models',
			subtitle: 'The models every teacher in this organization may use.',
			body: shared.length
				? renderTable({
						columns: [
							{
								key: 'name',
								label: 'Name',
								render: (row) =>
									`<span class="ac-table__primary">${escapeHtml(row.name)}</span><br><span class="ac-table__muted">${escapeHtml(
										row.provider,
									)} · ${escapeHtml(row.model_id)}</span>`,
							},
							{
								key: 'key_hint',
								label: 'Key',
								render: (row) =>
									row.has_key
										? `<code>${escapeHtml(row.key_hint || '••••')}</code>`
										: '<span class="ac-badge">none (local server)</span>',
							},
							{
								key: 'is_default',
								label: 'Default',
								render: (row) =>
									row.is_default
										? '<span class="ac-badge ac-badge--success">yes</span>'
										: '<span class="ac-badge">no</span>',
							},
							{
								key: 'actions',
								label: '',
								align: 'right',
								render: (row) =>
									`<button type="button" class="ac-btn ac-btn--sm" data-ac-ai-test="${escapeHtml(
										row.id,
									)}">Test</button> <button type="button" class="ac-btn ac-btn--sm" data-ac-ai-delete="${escapeHtml(
										row.id,
									)}">Delete</button>`,
							},
						],
						rows: shared,
					})
				: `<p class="ac-empty__message">No shared model yet. Load a provider list above and publish the models the teachers should use.</p>`,
		}),
		panel({
			title: 'My own model',
			subtitle: 'Private to you. A local server needs no key at all.',
			body: `<div class="ac-field-grid">
					${field({
						id: 'set-ai-personal-name',
						label: 'Display name',
						placeholder: 'My Ollama',
					})}
					${field({
						id: 'set-ai-personal-model',
						label: 'Model id',
						placeholder: 'llama3.1:8b, gpt-5-mini',
					})}
					${field({
						id: 'set-ai-personal-base',
						label: 'Base URL',
						placeholder: 'http://localhost:11434/v1',
					})}
					${field({
						id: 'set-ai-personal-key',
						label: 'API key',
						type: 'password',
						hint: 'Optional for a local server.',
					})}
				</div>
				<div class="ac-toolbar" style="margin-bottom:12px">
					<div class="ac-toolbar__row">
						<button type="button" class="ac-btn ac-btn--primary" data-ac-ai-save-personal>Save my model</button>
						<span class="ac-table__muted" data-ac-ai-personal-status></span>
					</div>
				</div>
				${
					personal.length
						? renderTable({
								columns: [
									{
										key: 'name',
										label: 'Model',
										render: (row) =>
											`<span class="ac-table__primary">${escapeHtml(row.name)}</span><br><span class="ac-table__muted">${escapeHtml(
												row.provider,
											)} · ${escapeHtml(row.model_id)}</span>`,
									},
									{
										key: 'actions',
										label: '',
										align: 'right',
										render: (row) =>
											`<button type="button" class="ac-btn ac-btn--sm" data-ac-ai-test="${escapeHtml(
												row.id,
											)}">Test</button> <button type="button" class="ac-btn ac-btn--sm" data-ac-ai-delete="${escapeHtml(
												row.id,
											)}">Delete</button>`,
									},
								],
								rows: personal,
							})
						: '<p class="ac-empty__message">You have no personal model yet.</p>'
				}`,
		}),
	].join('');

	function bind(root) {
		const statusEl = root.querySelector('[data-ac-ai-status]');
		const setStatus = (text) => {
			if (statusEl) statusEl.textContent = text;
		};

		const providerSelect = root.querySelector('#set-ai-provider');
		const baseField = root.querySelector('[data-ac-ai-base]');
		const keyHelp = root.querySelector('#set-ai-key');

		const syncProvider = () => {
			const provider = providerSelect?.value || '';
			if (baseField) baseField.hidden = provider !== 'custom';
			if (keyHelp) {
				const help = API_KEY_HELP[provider];
				keyHelp.placeholder = provider === 'custom' ? 'Not needed for a local server' : 'sk-…';
			}
		};
		providerSelect?.addEventListener('change', syncProvider);
		syncProvider();

		// The live model catalog, held for the publish action.
		let catalog = [];

		const renderCatalog = () => {
			const host = root.querySelector('[data-ac-ai-models]');
			if (!host) return;
			if (!catalog.length) {
				host.innerHTML = '<p class="ac-empty__message">The provider returned no model.</p>';
				return;
			}
			host.innerHTML = `<div class="ac-model-catalog">
				${catalog
					.map(
						(model) => `<label class="ac-model-catalog__item">
					<input type="checkbox" value="${escapeHtml(model.id)}" data-ac-ai-model />
					<span class="ac-model-catalog__name">${escapeHtml(model.label || model.id)}</span>
					<code class="ac-model-catalog__id">${escapeHtml(model.id)}</code>
				</label>`,
					)
					.join('')}
			</div>`;
		};

		const filterInput = root.querySelector('#set-ai-model-filter');
		filterInput?.addEventListener('input', () => {
			const needle = filterInput.value.trim().toLowerCase();
			const items = root.querySelectorAll('.ac-model-catalog__item');
			items.forEach((item) => {
				const text = item.textContent.toLowerCase();
				item.hidden = needle !== '' && !text.includes(needle);
			});
		});

		root.querySelector('[data-ac-ai-load]')?.addEventListener('click', async () => {
			setStatus('Loading…');
			try {
				const provider = root.querySelector('#set-ai-provider')?.value;
				const apiKey = root.querySelector('#set-ai-key')?.value || undefined;
				const baseUrl = root.querySelector('#set-ai-base-url')?.value || undefined;
				const result = await api.post('ai/models/refresh', {
					provider,
					api_key: apiKey || undefined,
					base_url: baseUrl || undefined,
				});
				catalog = Array.isArray(result?.data) ? result.data : [];
				const catalogHost = root.querySelector('[data-ac-ai-catalog]');
				if (catalogHost) catalogHost.hidden = false;
				renderCatalog();
				setStatus(`${catalog.length} model(s) returned.`);
			} catch (err) {
				setStatus(err.message);
				toast(err.message, 'error');
			}
		});

		root.querySelector('[data-ac-ai-test-key]')?.addEventListener('click', async () => {
			setStatus('Testing…');
			try {
				const provider = root.querySelector('#set-ai-provider')?.value;
				const apiKey = root.querySelector('#set-ai-key')?.value || undefined;
				const baseUrl = root.querySelector('#set-ai-base-url')?.value || undefined;
				const result = await api.post('ai/models/refresh', {
					provider,
					api_key: apiKey || undefined,
					base_url: baseUrl || undefined,
				});
				const count = Array.isArray(result?.data) ? result.data.length : 0;
				setStatus(
					count
						? `The provider answered: ${count} model(s).`
						: 'The provider answered but returned no model.',
				);
			} catch (err) {
				setStatus(err.message);
			}
		});

		root.querySelector('[data-ac-ai-publish]')?.addEventListener('click', async () => {
			const selected = Array.from(
				root.querySelectorAll('[data-ac-ai-model]:checked'),
			).map((input) => input.value);
			if (!selected.length) {
				toast('Select at least one model to publish.', 'error');
				return;
			}
			const provider = root.querySelector('#set-ai-provider')?.value;
			const apiKey = root.querySelector('#set-ai-key')?.value || undefined;
			const baseUrl = root.querySelector('#set-ai-base-url')?.value || undefined;
			try {
				for (const modelId of selected) {
					await api.post('ai/configs', {
						provider,
						name: modelId,
						model_id: modelId,
						base_url: provider === 'custom' ? baseUrl : undefined,
						api_key: apiKey || undefined,
						shared: true,
					});
				}
				toast(`${selected.length} model(s) published.`, 'success');
				ctx.rerender();
			} catch (err) {
				toast(err.message, 'error');
			}
		});

		root.querySelector('[data-ac-ai-save-personal]')?.addEventListener('click', async () => {
			const status = root.querySelector('[data-ac-ai-personal-status]');
			const read = (id) => root.querySelector(`#${id}`)?.value?.trim() ?? '';
			const name = read('set-ai-personal-name');
			const modelId = read('set-ai-personal-model');
			const baseUrl = read('set-ai-personal-base');
			const apiKey = read('set-ai-personal-key');
			if (!name || !modelId) {
				toast('A display name and a model id are required.', 'error');
				return;
			}
			try {
				await api.post('ai/configs', {
					provider: baseUrl ? 'custom' : 'openrouter',
					name,
					model_id: modelId,
					base_url: baseUrl || undefined,
					api_key: apiKey || undefined,
					shared: false,
				});
				if (status) status.textContent = 'Saved.';
				toast('Your model was saved.', 'success');
				ctx.rerender();
			} catch (err) {
				if (status) status.textContent = err.message;
				toast(err.message, 'error');
			}
		});

		root.querySelectorAll('[data-ac-ai-test]').forEach((button) => {
			button.addEventListener('click', async () => {
				try {
					const result = await api.post(`ai/configs/${encodeURIComponent(button.dataset.acAiTest)}/test`);
					toast(result?.message || (result?.ok ? 'The model is reachable.' : 'The model did not answer.'), result?.ok ? 'success' : 'error');
				} catch (err) {
					toast(err.message, 'error');
				}
			});
		});

		root.querySelectorAll('[data-ac-ai-delete]').forEach((button) => {
			button.addEventListener('click', async () => {
				const confirmed = await confirmDialog({
					title: 'Delete this model?',
					message: 'The model is removed from the server. Anyone using it will have to pick another one.',
					confirmLabel: 'Delete model',
					danger: true,
				});
				if (!confirmed) return;
				try {
					await api.del(`ai/configs/${encodeURIComponent(button.dataset.acAiDelete)}`);
					toast('The model was deleted.', 'success');
					ctx.rerender();
				} catch (err) {
					toast(err.message, 'error');
				}
			});
		});
	}

	return { markup, bind };
}
