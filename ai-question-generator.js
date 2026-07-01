/**
 * AI Question Generator Module
 * Professional multi-provider AI integration for quiz question generation
 * 
 * Features:
 * - Multi-provider support (OpenRouter, Anthropic, OpenAI, Google AI)
 * - Exponential backoff rate limiting
 * - Configurable parameters
 * - Intelligent cooldown system
 * - Debug mode
 * - Connection testing
 */

// ============================================
// PROVIDER CONFIGURATIONS
// ============================================

const AI_PROVIDERS = {
	openrouter: {
		name: 'OpenRouter',
		baseUrl: 'https://openrouter.ai/api/v1/chat/completions',
		modelsUrl: 'https://openrouter.ai/api/v1/models',
		helpLink: 'https://openrouter.ai/keys',
		models: {
			free: [
				// Currently available free models on OpenRouter (as of 2024)
				{ id: 'meta-llama/llama-3.2-3b-instruct:free', name: 'Llama 3.2 3B Instruct (Free)' },
				{ id: 'meta-llama/llama-3.2-1b-instruct:free', name: 'Llama 3.2 1B Instruct (Free)' },
				{ id: 'meta-llama/llama-3.1-8b-instruct:free', name: 'Llama 3.1 8B Instruct (Free)' },
				{ id: 'qwen/qwen-2-7b-instruct:free', name: 'Qwen 2 7B Instruct (Free)' },
				{ id: 'google/gemini-2.0-flash-exp:free', name: 'Gemini 2.0 Flash Exp (Free)' },
				{ id: 'google/gemini-exp-1206:free', name: 'Gemini Exp 1206 (Free)' },
				{ id: 'deepseek/deepseek-r1:free', name: 'DeepSeek R1 (Free)' },
				{ id: 'deepseek/deepseek-chat:free', name: 'DeepSeek Chat (Free)' },
				{ id: 'huggingfaceh4/zephyr-7b-beta:free', name: 'Zephyr 7B Beta (Free)' },
				{ id: 'mistralai/mistral-7b-instruct:free', name: 'Mistral 7B Instruct (Free)' }
			],
			premium: [
				{ id: 'deepseek/deepseek-chat', name: 'DeepSeek V3' },
				{ id: 'deepseek/deepseek-r1', name: 'DeepSeek R1' },
				{ id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet' },
				{ id: 'openai/gpt-4o', name: 'GPT-4o' },
				{ id: 'google/gemini-pro-1.5', name: 'Gemini 1.5 Pro' }
			]
		},
		headers: (apiKey) => {
			const origin = window.location.origin && window.location.origin !== 'null' 
				? window.location.origin 
				: 'http://localhost:3000';
			return {
				'Authorization': `Bearer ${apiKey}`,
				'Content-Type': 'application/json',
				'HTTP-Referer': origin,
				'X-Title': 'Quiz Admin Generator'
			};
		}
	},
	anthropic: {
		name: 'Anthropic',
		baseUrl: 'https://api.anthropic.com/v1/messages',
		helpLink: 'https://console.anthropic.com/settings/keys',
		models: {
			premium: [
				{ id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet' },
				{ id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku' }
			]
		},
		headers: (apiKey) => ({
			'x-api-key': apiKey,
			'Content-Type': 'application/json',
			'anthropic-version': '2023-06-01'
		})
	},
	openai: {
		name: 'OpenAI',
		baseUrl: 'https://api.openai.com/v1/chat/completions',
		modelsUrl: 'https://api.openai.com/v1/models',
		helpLink: 'https://platform.openai.com/api-keys',
		models: {
			premium: [
				{ id: 'gpt-4o', name: 'GPT-4o' },
				{ id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
				{ id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo' }
			]
		},
		headers: (apiKey) => ({
			'Authorization': `Bearer ${apiKey}`,
			'Content-Type': 'application/json'
		})
	},
	google: {
		name: 'Google AI (Gemini)',
		baseUrl: 'https://generativelanguage.googleapis.com/v1/models',
		modelsUrl: 'https://generativelanguage.googleapis.com/v1/models',
		helpLink: 'https://aistudio.google.com/app/apikey',
		models: {
			free: [
				{ id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash Preview (Recommended)' },
				{ id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash (Recommended)' },
				{ id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash-Lite (Recommended)' },
				{ id: 'gemini-2.5-flash-image', name: 'Gemini 2.5 Flash Image (Multimodal)' },
				{ id: 'gemini-2.5-flash-native-audio-preview', name: 'Gemini 2.5 Flash Audio (Beta)' }
			],
			premium: [
				{ id: 'gemini-3-pro-preview', name: 'Gemini 3 Pro Preview' },
				{ id: 'gemini-3-pro-image-preview', name: 'Gemini 3 Pro Image (Beta)' },
				{ id: 'gemini-exp-1206', name: 'Gemini Exp 1206' }
			]
		},
		headers: (apiKey) => ({
			'Content-Type': 'application/json'
		})
	},
	deepseek: {
		name: 'DeepSeek',
		baseUrl: 'https://api.deepseek.com/chat/completions',
		helpLink: 'https://platform.deepseek.com/api_keys',
		models: {
			free: [
				{ id: 'deepseek-chat', name: 'DeepSeek V3 (Cheap)' },
				{ id: 'deepseek-reasoner', name: 'DeepSeek R1 (Reasoner)' }
			],
			premium: [] // DeepSeek is very cheap, putting in free tier for visibility or generic
		},
		headers: (apiKey) => ({
			'Authorization': `Bearer ${apiKey}`,
			'Content-Type': 'application/json'
		})
	},
	custom: {
		name: 'Custom / Local (Ollama, LM Studio)',
		baseUrl: 'http://localhost:11434/v1/chat/completions', // Default
		helpLink: '',
		models: {
			free: [
				{ id: 'llama3:8b', name: 'Llama 3 8B (Ollama)' },
				{ id: 'mistral', name: 'Mistral (Ollama)' },
				{ id: 'qwen2.5:7b', name: 'Qwen 2.5 7B (Ollama)' },
				{ id: 'deepseek-r1:8b', name: 'DeepSeek R1 8B (Ollama)' }
			],
			premium: []
		},
		headers: (apiKey) => {
			const headers = { 'Content-Type': 'application/json' };
			if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
			return headers;
		}
	}
};

// ============================================
// DEFAULT CONFIGURATION
// ============================================

const DEFAULT_AI_CONFIG = {
	provider: 'openrouter',
	apiKeys: {
		openrouter: '',
		anthropic: '',
		openai: '',
		google: '',
		deepseek: '',
		custom: ''
	},
	model: 'google/gemini-2.0-flash-lite-preview-02-05:free', // Switched to a more capable model for better JSON adherence and longer outputs
	customModel: '',
	customBaseUrl: '', // For custom/local provider
	temperature: 0.7,
	maxTokens: 8192, // Increased for advanced code questions and RAG content
	topP: 0.9,
	frequencyPenalty: 0.3,
	presencePenalty: 0.3,
	cooldownSeconds: 10,
	timeoutSeconds: 120, // Increased timeout for longer responses
	debugMode: true // Enable debug by default for now
};

const AI_GENERATOR_CODE_MODES = [
	'multiple-choice',
	'fill-blank',
	'odd-one-out',
	'draggable',
	'matching-pairs',
];

const AI_GENERATOR_TYPE_ALIASES = {
	'multiple-choice': 'multiple-choice',
	'multiple-choice-multi': 'multiple-choice',
	'multiple-choice-multiple': 'multiple-choice',
	'multiple-answer': 'multiple-choice',
	'multi-select': 'multiple-choice',
	'single-choice': 'multiple-choice',
	'true-false': 'true-false',
	truefalse: 'true-false',
	boolean: 'true-false',
	'true-or-false': 'true-false',
	mcq: 'multiple-choice',
	mc: 'multiple-choice',
	choice: 'multiple-choice',
	'fill-blank': 'fill-blank',
	'fill-in-blank': 'fill-blank',
	'fill-in-the-blank': 'fill-blank',
	'fill-the-blank': 'fill-blank',
	blank: 'fill-blank',
	draggable: 'draggable',
	'drag-drop': 'draggable',
	'drag-and-drop': 'draggable',
	dragdrop: 'draggable',
	order: 'draggable',
	ordering: 'draggable',
	sequence: 'draggable',
	sequencing: 'draggable',
	'odd-one-out': 'odd-one-out',
	'odd-one': 'odd-one-out',
	'odd-out': 'odd-one-out',
	oddoneout: 'odd-one-out',
	odd: 'odd-one-out',
	'matching-pairs': 'matching-pairs',
	'match-pairs': 'matching-pairs',
	'match-the-pairs': 'matching-pairs',
	matching: 'matching-pairs',
	match: 'matching-pairs',
	pairs: 'matching-pairs',
	code: 'code',
	coding: 'code',
	'code-question': 'code',
	programming: 'code',
};

function normalizeAIKey(value) {
	return String(value ?? '')
		.trim()
		.toLowerCase()
		.replace(/&/g, 'and')
		.replace(/[_\s]+/g, '-')
		.replace(/[^a-z0-9-]/g, '');
}

function inferAIQuestionType(question = {}) {
	if (question.codeSnippet || question.codeAnswerMode) return 'code';
	if (question.isDraggable) return 'draggable';
	const answer = String(question.answer || '');
	if (answer.includes('-->')) return 'matching-pairs';
	if (question.useWordBank || String(question.question || '').includes('___')) {
		return 'fill-blank';
	}
	return 'multiple-choice';
}

function normalizeAIQuestionType(rawType, question = {}) {
	const key = normalizeAIKey(rawType);
	if (!key || ['undefined', 'null', 'none', 'na', 'nan'].includes(key)) {
		return inferAIQuestionType(question);
	}

	const canonical = AI_GENERATOR_TYPE_ALIASES[key];
	if (canonical) {
		if (
			canonical !== 'code' &&
			(question.codeSnippet || question.codeAnswerMode)
		) {
			return 'code';
		}
		return canonical;
	}

	return inferAIQuestionType(question);
}

function normalizeAICodeAnswerMode(rawMode, fallback = 'multiple-choice') {
	const fallbackMode = AI_GENERATOR_CODE_MODES.includes(fallback)
		? fallback
		: 'multiple-choice';
	const key = normalizeAIKey(rawMode);
	if (!key || ['undefined', 'null', 'none', 'na', 'nan', 'code'].includes(key)) {
		return fallbackMode;
	}

	const canonical = AI_GENERATOR_TYPE_ALIASES[key];
	if (AI_GENERATOR_CODE_MODES.includes(canonical)) return canonical;
	if (key.includes('choice')) return 'multiple-choice';
	if (key.includes('blank')) return 'fill-blank';
	if (key.includes('odd')) return 'odd-one-out';
	if (key.includes('drag') || key.includes('order') || key.includes('sequence')) {
		return 'draggable';
	}
	if (key.includes('match') || key.includes('pair')) return 'matching-pairs';

	return fallbackMode;
}

function getAIOptionText(entry) {
	if (entry && typeof entry === 'object') {
		return String(entry.text || entry.label || entry.value || entry.answer || '').trim();
	}
	return String(entry || '').trim();
}

// ... (AIQuestionGenerator Class start)

class AIQuestionGenerator {
	constructor() {
		this.config = this.loadConfig();
		this.isGenerating = false;
		this.cooldownEndTime = 0;
		this.abortController = null;
		
		// Ensure valid referer for OpenRouter
		this.siteUrl = window.location.origin && window.location.origin !== 'null' 
			? window.location.origin 
			: 'http://localhost:3000';
		this.siteName = 'Quiz Admin Generator';
	}

	// Load configuration from localStorage
	loadConfig() {
		try {
			const saved = localStorage.getItem('quizAIConfig');
			if (saved) {
				const config = { ...DEFAULT_AI_CONFIG, ...JSON.parse(saved) };
				// Auto-upgrade maxTokens for existing users if it's the old default or too low
				if (config.maxTokens < 4096) {
					config.maxTokens = 4096;
				}
				return config;
			}
		} catch (e) {
			console.error('Error loading AI config:', e);
		}
		return { ...DEFAULT_AI_CONFIG };
	}

	// Save configuration to localStorage
	saveConfig(newConfig = null) {
		if (newConfig) {
			this.config = { ...this.config, ...newConfig };
		}
		try {
			localStorage.setItem('quizAIConfig', JSON.stringify(this.config));
			this.log('Configuration saved');
		} catch (e) {
			console.error('Error saving AI config:', e);
		}
	}

	// Debug logger
	log(...args) {
		if (this.config.debugMode) {
			console.log('[AI Generator]', ...args);
		}
	}

	// Get current provider config
	getProviderConfig() {
		return AI_PROVIDERS[this.config.provider];
	}

	// ============================================
	// DYNAMIC MODEL FETCHING
	// ============================================

	/**
	 * Fetch available models from the provider
	 * @returns {Promise<Array>} List of models
	 */
	async fetchAvailableModels() {
		const provider = this.getProviderConfig();
		if (!provider || !provider.modelsUrl) {
			console.log('Provider does not support dynamic model fetching or URL not set');
			return this.getAvailableModels(); // Fallback to static list
		}

		const apiKey = this.config.apiKeys[this.config.provider];
		if (!apiKey) return this.getAvailableModels();

		// Google AI requires API key in the URL, so use provider-specific flow
		if (this.config.provider === 'google') {
			try {
				// Google AI Gemini: Try v1 first, then v1beta if needed
				const versions = ['v1', 'v1beta'];
				let fetchedModels = [];
				let success = false;

				for (const ver of versions) {
					const listUrl = `https://generativelanguage.googleapis.com/${ver}/models?key=${apiKey}`;
					try {
						const listResponse = await fetch(listUrl, {
							method: 'GET',
							headers: { 'Content-Type': 'application/json' },
						});
						if (listResponse.ok) {
							const listData = await listResponse.json();
							const models = listData.models
								.filter((m) =>
									m.supportedGenerationMethods.includes('generateContent'),
								)
								.map((m) => {
									const id = m.name.split('/').pop();
									let displayName = m.displayName || m.name;
									if (ver === 'v1beta') displayName += ' (Beta)';

									return {
										id: id,
										name: displayName,
										isFree: !id.includes('pro') && !id.includes('exp'),
										version: ver,
										isFlash: id.includes('flash'),
									};
								});

							// Add to our list, avoiding duplicates
							models.forEach((m) => {
								if (!fetchedModels.find((fm) => fm.id === m.id)) {
									fetchedModels.push(m);
								}
							});
							success = true;
						}
					} catch (e) {
						console.warn(`Fetch models failed for Google AI ${ver}:`, e);
					}
				}

				if (success) {
					// Sort: Flash first, then Pro/Other
					fetchedModels.sort((a, b) => {
						if (a.isFlash && !b.isFlash) return -1;
						if (!a.isFlash && b.isFlash) return 1;
						return 0;
					});
					return fetchedModels;
				}

				console.warn('Google AI model list failed for all versions, using static list');
				return this.getAvailableModels();
			} catch (error) {
				console.error('Error fetching models:', error);
				return this.getAvailableModels();
			}
		}

		try {
			const headers = provider.headers(apiKey);
			const response = await fetch(provider.modelsUrl, {
				method: 'GET',
				headers: headers
			});

			if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
			
			const data = await response.json();
			let fetchedModels = [];

			if (this.config.provider === 'openrouter') {
				fetchedModels = data.data.map(m => ({
					id: m.id,
					name: m.name || m.id,
					isFree: m.id.endsWith(':free'),
					pricing: m.pricing
				}));
			} else if (this.config.provider === 'openai') {
				fetchedModels = data.data
					.filter(m => m.id.includes('gpt'))
					.map(m => ({
						id: m.id,
						name: m.id,
						isFree: false
					}));
			}

			return fetchedModels;
		} catch (error) {
			console.error('Error fetching models:', error);
			return this.getAvailableModels(); // Fallback to static
		}
	}

	/**
	 * Get all models for current provider
	 */
	getAvailableModels() {
		const provider = this.getProviderConfig();
		if (!provider) return [];
		const allModels = [];
		if (provider.models.free) {
			allModels.push(...provider.models.free.map(m => ({ ...m, tier: 'free' })));
		}
		if (provider.models.premium) {
			allModels.push(...provider.models.premium.map(m => ({ ...m, tier: 'premium' })));
		}
		return allModels;
	}

	// Check if currently in cooldown
	isInCooldown() {
		return Date.now() < this.cooldownEndTime;
	}

	// Get remaining cooldown time in seconds
	getCooldownRemaining() {
		const remaining = Math.max(0, this.cooldownEndTime - Date.now());
		return Math.ceil(remaining / 1000);
	}

	// Start cooldown period
	startCooldown() {
		this.cooldownEndTime = Date.now() + (this.config.cooldownSeconds * 1000);
	}

	// Sleep utility
	sleep(ms) {
		return new Promise(resolve => setTimeout(resolve, ms));
	}

	// Exponential backoff retry wrapper
	async executeWithRetry(fn, maxRetries = 3, baseDelay = 2000) {
		let lastError;
		
		for (let attempt = 0; attempt <= maxRetries; attempt++) {
			try {
				return await fn();
			} catch (error) {
				lastError = error;
				
				// Check if rate limited (429) or server error (5xx)
				const isRateLimit = error.status === 429;
				const isServerErr = error.status >= 500 && error.status < 600;
				
				// Don't retry if it's a client error (400-403) or known refusal
				if (!isRateLimit && !isServerErr && error.status && error.status < 500) {
					throw error;
				}
				
				if (attempt === maxRetries) {
					console.warn(`Max retries (${maxRetries}) reached. Last error:`, error);
					break;
				}
				
				// Calculate delay: longer for rate limits
				let delay = baseDelay * Math.pow(2, attempt) + Math.random() * 500;
				if (isRateLimit) {
					delay *= 2; // Double delay for rate limits
					this.log(`Rate limit hit (429). Waiting ${Math.round(delay/1000)}s before retry ${attempt + 1}...`);
				} else {
					this.log(`Retry attempt ${attempt + 1}/${maxRetries} after ${Math.round(delay)}ms`);
				}
				
				await this.sleep(delay);
			}
		}
		
		// If we're here, we failed all retries
		if (lastError.status === 429) {
			throw new Error('Rate limit exceeded. Please try a different model or wait a moment.');
		}
		throw lastError;
	}

	// Test connection to provider
	async testConnection() {
		const provider = this.getProviderConfig();
		const apiKey = this.config.apiKeys[this.config.provider];
		
		if (!apiKey) {
			throw new Error('API key not configured');
		}

		this.log('Testing connection to', provider.name);

		try {
			// Send a minimal request to verify API key
			const response = await this.makeAPIRequest({
				messages: [{ role: 'user', content: 'Say "OK"' }],
				maxTokens: 10
			});
			
			this.log('Connection test successful');
			return { success: true, message: `Connected to ${provider.name}` };
		} catch (error) {
			this.log('Connection test failed:', error);
			throw error;
		}
	}

	/**
	 * Make API request to current provider
	 * @param {Object} options - Request options (messages, maxTokens, etc.)
	 */
	async makeAPIRequest(options) {
		const provider = this.getProviderConfig();
		if (!provider) throw new Error(`Unknown provider: ${this.config.provider}`);

		const apiKey = this.config.apiKeys[this.config.provider];
		if (!apiKey) throw new Error(`API key missing for ${provider.name}`);

		// Create abort controller for timeout
		this.abortController = new AbortController();
		const timeoutId = setTimeout(() => {
			if (this.abortController) this.abortController.abort();
		}, (options.timeoutSeconds || this.config.timeoutSeconds) * 1000);

		try {
			let url = provider.baseUrl;
			let body = {};
			const headers = provider.headers(apiKey);

			// Provider-specific request formatting
			if (this.config.provider === 'google') {
				// Intelligent endpoint switching for Google AI
				const model = this.config.model || 'gemini-1.5-flash';
				const isBetaModel = model.includes('preview') || model.includes('exp') || model.includes('gemini-3') || model.includes('2.5');
				const apiVersion = isBetaModel ? 'v1beta' : 'v1';
				
				url = `https://generativelanguage.googleapis.com/${apiVersion}/models/${model}:generateContent?key=${apiKey}`;
				
				// Standardize messages to Google's content format
				const userMsg = options.messages.find(m => m.role === 'user')?.content || '';
				const systemMsg = options.messages.find(m => m.role === 'system')?.content || '';
				const fullPrompt = systemMsg ? `${systemMsg}\n\n${userMsg}` : userMsg;

				body = {
					contents: [{ parts: [{ text: fullPrompt }] }],
					generationConfig: {
						temperature: options.temperature || this.config.temperature,
						maxOutputTokens: options.maxTokens || this.config.maxTokens
					}
				};
			} else if (this.config.provider === 'anthropic') {
				url = provider.baseUrl;
				const systemMsg = options.messages.find(m => m.role === 'system')?.content;
				const userMessages = options.messages.filter(m => m.role !== 'system');
				
				body = {
					model: this.config.model,
					max_tokens: options.maxTokens || this.config.maxTokens,
					temperature: options.temperature || this.config.temperature,
					messages: userMessages
				};
				if (systemMsg) body.system = systemMsg;
			} else {
				// OpenRouter, OpenAI, DeepSeek, Custom (OpenAI-compatible)
				url = (this.config.provider === 'custom' && this.config.customBaseUrl) 
					? this.config.customBaseUrl 
					: provider.baseUrl;
				
				body = {
					model: this.config.model,
					messages: options.messages,
					temperature: options.temperature || this.config.temperature,
					max_tokens: options.maxTokens || this.config.maxTokens,
					top_p: options.topP || this.config.topP
				};

				// Add extra params for specific providers if needed
				if (this.config.provider === 'openrouter') {
					body.referer = this.siteUrl;
					body.title = this.siteName;
				}
			}

			this.log('Making request to:', url);
			const response = await fetch(url, {
				method: 'POST',
				headers: headers,
				body: JSON.stringify(body),
				signal: this.abortController.signal
			});

			clearTimeout(timeoutId);

			if (!response.ok) {
				const responseText = await response.text();
				let errorData = {};
				try {
					errorData = JSON.parse(responseText);
				} catch (e) {
					errorData = { error: { message: responseText } };
				}
				
				const errorMessage = errorData.error?.message || errorData.message || `HTTP ${response.status} ${response.statusText}`;
				this.log('API Error Response:', errorData);
				
				const error = new Error(`${provider.name} Error: ${errorMessage}`);
				error.status = response.status;
				error.details = errorData;
				throw error;
			}

			const data = await response.json();
			
			// Extract content based on provider
			let content = '';
			if (this.config.provider === 'google') {
				content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
			} else if (this.config.provider === 'anthropic') {
				content = data.content?.[0]?.text || '';
			} else {
				content = data.choices?.[0]?.message?.content || '';
				if (data.choices?.[0]?.finish_reason === 'content_filter') {
					throw new Error('AI refused to generate content (content filter)');
				}
			}

			return content;
		} catch (error) {
			clearTimeout(timeoutId);
			if (error.name === 'AbortError') {
				throw new Error(`Request timed out after ${this.config.timeoutSeconds} seconds`);
			}
			throw error;
		}
	}



	// ============================================
	// PROMPT BUILDER
	// ============================================

	/**
	 * Build the generation prompt for the AI
	 * @param {Object} options - Generation options
	 * @returns {string} The formatted prompt
	 */
	buildPrompt(options) {
		const {
			topic = 'General Knowledge',
			types = ['multiple-choice'],
			typeCounts = {},
			count = 5,
			difficulty = 'medium',
			category = '',
			codeTypeCounts = {},
			language = 'fr',
			extraInstruction = ''
		} = options;

		// Build per-type distribution instructions
		let typeDistribution = '';
		const hasTypeCounts = Object.keys(typeCounts).length > 0;
		if (hasTypeCounts) {
			const parts = [];
			for (const [type, qty] of Object.entries(typeCounts)) {
				if (qty > 0) parts.push(`  - ${qty}x "${type}"`);
			}
			typeDistribution = `\nEXACT TYPE DISTRIBUTION (follow strictly):\n${parts.join('\n')}`;
			
			if (types.includes('code') && Object.keys(codeTypeCounts).length > 0) {
				const codeParts = [];
				for (const st of AI_GENERATOR_CODE_MODES) {
					const qty = Number.parseInt(codeTypeCounts[st], 10) || 0;
					if (qty > 0) {
						codeParts.push(
							`    - ${qty}x code question(s) with "type": "code" and "codeAnswerMode": "${st}"`,
						);
					}
				}
				if (codeParts.length > 0) {
					typeDistribution += `\n\nCRITICAL CODE FORMAT DISTRIBUTION (MANDATORY):\n${codeParts.join('\n')}\nFor every listed code question, the top-level "type" MUST stay exactly "code". The selected format belongs only in "codeAnswerMode". Never output "type": "undefined" or put the sub-format in "type".`;
				}
			}
		} else {
			typeDistribution = `\nSUPPORTED TYPES: ${types.join(', ')}\nDistribute ${count} questions across these types evenly.`;
		}

		// Build type-specific schema examples
		const typeSchemas = [];

		if (types.includes('multiple-choice')) {
			typeSchemas.push(`
  MULTIPLE-CHOICE (single answer):
  {
    "question": "Question text here?",
    "type": "multiple-choice",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "answer": "Option A",
    "explanation": "Brief explanation",
    "difficulty": "${difficulty}",
    "allowMultipleAnswers": false
  }`);
		}

		if (types.includes('multiple-choice-multi')) {
			typeSchemas.push(`
  MULTIPLE-CHOICE (multiple answers):
  {
    "question": "Select ALL correct answers:",
    "type": "multiple-choice",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "answer": "Option A,Option C",
    "explanation": "Brief explanation",
    "difficulty": "${difficulty}",
    "allowMultipleAnswers": true
  }`);
		}

		if (types.includes('true-false')) {
			typeSchemas.push(`
  TRUE/FALSE:
  {
    "question": "Statement to evaluate as true or false?",
    "type": "true-false",
    "options": ["Vrai", "Faux"],
    "answer": "Vrai",
    "explanation": "Brief explanation",
    "difficulty": "${difficulty}",
    "allowMultipleAnswers": false
  }`);
		}

		if (types.includes('fill-blank')) {
			typeSchemas.push(`
  FILL-IN-THE-BLANK:
  {
    "question": "The ___ is used to store data in ___.",
    "type": "fill-blank",
    "options": ["variable", "memory", "function", "output"],
    "answer": "1:variable|2:memory",
    "explanation": "Brief explanation",
    "difficulty": "${difficulty}",
    "useWordBank": true
  }`);
		}

		if (types.includes('draggable')) {
			typeSchemas.push(`
  DRAG & DROP (ordering):
  {
    "question": "Arrange these steps in the correct order:",
    "type": "draggable",
    "options": ["Step 1", "Step 2", "Step 3", "Step 4"],
    "answer": "Step 1,Step 2,Step 3,Step 4",
    "explanation": "Brief explanation",
    "difficulty": "${difficulty}",
    "isDraggable": true
  }`);
		}

		if (types.includes('odd-one-out')) {
			typeSchemas.push(`
  ODD ONE OUT:
  {
    "question": "Which one does NOT belong?",
    "type": "odd-one-out",
    "options": ["Related A", "Related B", "Related C", "The Outlier"],
    "answer": "The Outlier",
    "explanation": "Brief explanation why it doesn't belong",
    "difficulty": "${difficulty}"
  }`);
		}

		if (types.includes('matching-pairs')) {
			typeSchemas.push(`
  MATCHING PAIRS:
  {
    "question": "Match each term with its definition:",
    "type": "matching-pairs",
    "options": ["Term1", "Definition1", "Term2", "Definition2", "Term3", "Definition3"],
    "answer": "Term1-->Definition1|Term2-->Definition2|Term3-->Definition3",
    "explanation": "Brief explanation",
    "difficulty": "${difficulty}"
  }`);
		}

		if (types.includes('code')) {
			const requestedCodeModes = AI_GENERATOR_CODE_MODES.filter(
				(mode) => (Number.parseInt(codeTypeCounts[mode], 10) || 0) > 0,
			);
			const requestedCodeModeList = requestedCodeModes.length
				? requestedCodeModes.join(', ')
				: AI_GENERATOR_CODE_MODES.join(', ');
			typeSchemas.push(`
  CODE (top-level type plus answer sub-format):
  {
    "question": "What does this code output?",
    "type": "code",
    "codeSnippet": "console.log(2 + 2);",
    "codeLanguage": "javascript",
    "codeAnswerMode": "multiple-choice",
    "options": ["4", "5", "6", "TypeError"],
    "answer": "4",
    "explanation": "Brief explanation of the code behavior",
    "difficulty": "${difficulty}"
  }
  CODE FORMAT RULES:
  - Allowed codeAnswerMode values for this request: ${requestedCodeModeList}.
  - The top-level "type" for every code question MUST be exactly "code".
  - codeAnswerMode "multiple-choice": options are answer choices; answer is the exact correct option.
  - codeAnswerMode "fill-blank": the question text MUST include "___"; answer uses "1:value|2:value"; options are the word bank.
  - codeAnswerMode "odd-one-out": options are code concepts/lines/outputs; answer is the exact odd option text.
  - codeAnswerMode "draggable": options are ordered steps/lines; answer is the correct comma-separated order.
  - codeAnswerMode "matching-pairs": answer uses "Key1-->Value1|Key2-->Value2"; options contains all keys and values.`);
		}

		const langInstruction = language === 'fr'
			? 'LANGUAGE: All question content, explanations, and options MUST be in professional, academic French.'
			: 'LANGUAGE: All question content, explanations, and options should be in English.';

		return `CRITICAL: Generate EXACTLY ${count} quiz questions about "${topic}".
All questions MUST be at the "${difficulty}" difficulty level.
${category ? `Category: "${category}"` : ''}
${typeDistribution}
${extraInstruction ? `\nADDITIONAL INSTRUCTION:\n${extraInstruction}\n` : ''}

TYPE-SPECIFIC JSON SCHEMAS (follow EXACTLY):
${typeSchemas.join('\n')}

${langInstruction}

FORMAT RULES:
1. Return a JSON array of objects. Start with [ and end with ].
2. Each object MUST have: question, type, options, answer, explanation, difficulty.
3. Allowed top-level "type" values are ONLY: multiple-choice, true-false, fill-blank, draggable, odd-one-out, matching-pairs, code. For multiple-answer questions use "type": "multiple-choice" with allowMultipleAnswers true.
4. "answer" for multiple-choice MUST be the EXACT text of one of the options (not a letter/number).
5. For multiple-choice-multi: set "allowMultipleAnswers": true and "answer" as comma-separated option texts.
6. For fill-blank: use "___" for blanks in the question. "answer" format is "1:word|2:word". "options" contains the word bank.
7. For matching-pairs: "answer" format is "Key1-->Value1|Key2-->Value2". "options" contains all keys and values interleaved.
8. For draggable: "answer" is the correct order of "options" joined by commas.
9. For odd-one-out: "answer" is the text of the odd item.
10. For code: include "codeSnippet", "codeLanguage", and "codeAnswerMode" fields. The top-level "type" remains "code"; never use "undefined" as a type.
11. If ${count} is greater than 1, create ${count} separate JSON objects. Never combine multiple questions or multiple code exercises into one object.

STRICT JSON RULES:
- NO trailing commas.
- Properly escape all double quotes within strings (especially in code snippets).
- Ensure ALL keys are in double quotes.
- Response MUST be a valid JSON array. NO markdown code blocks. NO extra text.
- Do NOT wrap in \`\`\`json blocks.`;
	}

	// Parse AI response to extract questions
	parseResponse(content) {
		this.log('Parsing response length:', content.length);
		
		// 1. Initial cleanup
		let jsonContent = content.trim();
		
		// 2. Remove markdown code blocks if present
		jsonContent = jsonContent.replace(/```json\s*/gi, '').replace(/```\s*/g, '');
		
		// 3. Try to find the first [ and the last ] to extract just the array
		// Look for the first [ that is likely the start of our array. Do not
		// fall back to an options array inside a single question object.
		const arrayMatch = jsonContent.match(/\[\s*\{/);
		const startsWithArray = jsonContent.trimStart().startsWith('[');
		const firstBracket = arrayMatch
			? arrayMatch.index
			: (startsWithArray ? jsonContent.indexOf('[') : -1);
		const lastBracket = jsonContent.lastIndexOf(']');
		
		if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
			jsonContent = jsonContent.substring(firstBracket, lastBracket + 1);
		}
		
		// A. Remove comments (// or /* */) safely (ignoring strings/URLs)
		// This regex matches strings first to skip them, then matches comments
		jsonContent = jsonContent.replace(/("(?:\\"|[^"])*")|(\/\/.*|\/\*[\s\S]*?\*\/)/g, (m, str, comm) => comm ? "" : m);

		// B. Fix missing commas between objects: } {  ->  }, {
		jsonContent = jsonContent.replace(/\}\s*\{/g, '}, {');
		
		// C. Fix trailing commas in arrays/objects: [1, 2,] -> [1, 2]
		jsonContent = jsonContent.replace(/,\s*(?=[\]\}])/g, '');

		// D. Fix common AI JSON omissions before quote repair.
		jsonContent = this.repairCommonJSONIssues(jsonContent);

		// E. Robust state-aware char-by-char repair
		let repaired = '';
		let inString = false;
		let expectingProperty = false;
		let contextStack = []; // Stack to track { or [
		
		for (let i = 0; i < jsonContent.length; i++) {
			let char = jsonContent[i];
			
			// Track structure to know if we expect a property or value
			if (!inString) {
				if (char === '{') {
					contextStack.push('{');
					expectingProperty = true;
				} else if (char === '[') {
					contextStack.push('[');
					expectingProperty = false;
				} else if (char === '}') {
					contextStack.pop();
					// If we are back in an object, the comma after this will set it to true
					expectingProperty = false; 
				} else if (char === ']') {
					contextStack.pop();
					expectingProperty = false;
				} else if (char === ',') {
					// In object, comma precedes property name. In array, it precedes value.
					expectingProperty = (contextStack[contextStack.length - 1] === '{');
				} else if (char === ':') {
					expectingProperty = false;
				}
			}
			
			if (char === '"' && jsonContent[i-1] !== '\\') {
				if (!inString) {
					inString = true;
					repaired += char;
				} else {
					// Check for terminal quote
					let isTerminal = false;
					for (let j = i + 1; j < jsonContent.length; j++) {
						const next = jsonContent[j];
						if (next === ' ' || next === '\t' || next === '\n' || next === '\r') continue;
						
						if (expectingProperty) {
							// Property names must be followed by ':'
							if (next === ':') isTerminal = true;
						} else {
							// Values must be followed by ',' or '}' or ']'
							if (next === ',' || next === '}' || next === ']') isTerminal = true;
						}
						break;
					}
					
					if (isTerminal) {
						inString = false;
						repaired += char;
					} else {
						// Internal quote - escape it
						repaired += '\\"';
					}
				}
			} else if (inString && (char === '\n' || char === '\r')) {
				repaired += '\\n';
			} else {
				repaired += char;
			}
		}
		
		if (inString) repaired += '"';
		jsonContent = repaired;

		// 5. Detect and repair truncated JSON (Brackets balancing)
		let openBrackets = (jsonContent.match(/\[/g) || []).length;
		let closedBrackets = (jsonContent.match(/\]/g) || []).length;
		let openBraces = (jsonContent.match(/\{/g) || []).length;
		let closedBraces = (jsonContent.match(/\}/g) || []).length;
		
		// If we are mid-object, try to close it and the array
		if (openBraces > closedBraces) {
			while (openBraces > closedBraces) {
				jsonContent += '}';
				closedBraces++;
			}
		}
		while (openBrackets > closedBrackets) {
			jsonContent += ']';
			closedBrackets++;
		}

		// 6. FINAL CLEANUP: Remove any trailing commas that may lead to parse errors (e.g. { "a": 1, })
		// This must run AFTER balancing to catch commas created by truncation
		jsonContent = this.repairCommonJSONIssues(jsonContent);
		jsonContent = jsonContent.replace(/,\s*(?=[\]\}])/g, '');
		
		try {
			const questions = JSON.parse(jsonContent);
			
			if (!Array.isArray(questions)) {
				// If AI returned an object containing the array (e.g. { "questions": [...] })
				if (typeof questions === 'object' && questions !== null) {
					const possibleArray = questions.questions || questions.data || questions.items || Object.values(questions).find(val => Array.isArray(val));
					if (Array.isArray(possibleArray)) {
						this.log('Extracted array from wrapper object');
						return possibleArray.map((q, i) => this.normalizeQuestion(q, i)).filter(Boolean);
					}
					
					// If just a single object, wrap it
					this.log('AI returned single object instead of array, wrapping...');
					return [this.normalizeQuestion(questions, 0)];
				}
				throw new Error('Response is not an array');
			}
			
			// Validate and normalize each question
			return questions
				.map((q, index) => {
					try {
						return this.normalizeQuestion(q, index);
					} catch (normalErr) {
						this.log(`Skipping invalid question ${index}:`, normalErr.message);
						return null;
					}
				})
				.filter(Boolean);
		} catch (e) {
			this.log('Initial parse error:', e.message);
			
			// RESCUE MODE: Try to extract all object-like structures independently
			try {
				this.log('Entering Rescue Mode: Extracting individual objects...');
				for (const source of [jsonContent, content]) {
					const extracted = this.extractJSONObjects(source);
					if (extracted && extracted.length > 0) {
						this.log(`Rescue successful: Extracted ${extracted.length} objects.`);
						// Filter for objects that look like questions
						const questions = extracted
							.filter(obj => obj && (obj.question || obj.text))
							.map((q, i) => {
								try {
									return this.normalizeQuestion(q, i);
								} catch (normalErr) {
									this.log(`Skipping rescued invalid question ${i}:`, normalErr.message);
									return null;
								}
							})
							.filter(Boolean);

						if (questions.length > 0) return questions;
					}
				}
			} catch (rescueErr) {
				this.log('Rescue Mode failed:', rescueErr.message);
			}

			this.log('Cleaned content snippet:', jsonContent.substring(0, 200) + '...');
			throw new Error(`Failed to parse AI response: ${e.message}`);
		}
	}

	/**
	 * Repairs common model slips that are still unambiguous JSON:
	 * missing commas between adjacent fields and adjacent array string items.
	 */
	repairCommonJSONIssues(jsonStr) {
		if (!jsonStr) return '';

		let repaired = String(jsonStr);

		repaired = repaired
			// Missing comma between objects in an array.
			.replace(/\}\s*\{/g, '}, {')
			// Missing comma after a string value before the next object key.
			.replace(/"\s*(?="[\w-]+"\s*:)/g, '", ')
			// Missing comma after an object/array value before the next object key.
			.replace(/([}\]])\s*(?="[\w-]+"\s*:)/g, '$1, ')
			// Missing comma between adjacent quoted array values.
			.replace(/"\s+(?="[^"]+"\s*(?:[,}\]]))/g, '", ')
			// Missing comma after numbers/booleans/null before a quoted array value.
			.replace(/\b(true|false|null|-?\d+(?:\.\d+)?)\s+(?="[^"]+"\s*(?:[,}\]]))/g, '$1, ')
			// Trailing commas remain the most common final cleanup.
			.replace(/,\s*(?=[\]\}])/g, '');

		return repaired;
	}

	/**
	 * Extracts all JSON-like objects from a string.
	 * Highly resilient fallback for malformed JSON arrays.
	 */
	extractJSONObjects(text) {
		const objects = [];
		let braceCount = 0;
		let startIdx = -1;
		let inString = false;
		
		// Clean markdown blocks
		let cleanText = this.repairCommonJSONIssues(
			text.replace(/```json\s*/gi, '').replace(/```\s*/g, ''),
		);
		
		for (let i = 0; i < cleanText.length; i++) {
			const char = cleanText[i];
			
			// More robust quote tracking for Rescue Mode
			if (char === '"' && cleanText[i-1] !== '\\') {
				// If we think we're ending a string, check if it's actually followed by JSON delimiters
				if (inString) {
					let isActualEnd = false;
					for (let j = i + 1; j < Math.min(i + 10, cleanText.length); j++) {
						const next = cleanText[j];
						if (next === ' ' || next === '\t' || next === '\n' || next === '\r') continue;
						if (next === ':' || next === ',' || next === '}' || next === ']') {
							isActualEnd = true;
						}
						break;
					}
					if (isActualEnd) inString = false;
				} else {
					inString = true;
				}
			}
			
			if (!inString) {
				if (char === '{') {
					if (braceCount === 0) startIdx = i;
					braceCount++;
				} else if (char === '}') {
					braceCount--;
					if (braceCount === 0 && startIdx !== -1) {
						let potential = cleanText.substring(startIdx, i + 1);
						try {
							objects.push(JSON.parse(potential));
						} catch (err) {
							// Try fixing the chunk manually
							try {
								const fixed = this.attemptManualRepair(potential);
								objects.push(JSON.parse(fixed));
							} catch (err2) {
								// Still fails, skip this chunk
							}
						}
						startIdx = -1;
					}
				}
			}
		}
		
		// If we found objects nested in a top-level object, the above might only find the top-level one.
		// If we only found 1 object and it's large, check if it contains a questions array.
		if (objects.length === 1) {
			const obj = objects[0];
			const possibleArray = obj.questions || obj.data || obj.items || Object.values(obj).find(val => Array.isArray(val));
			if (Array.isArray(possibleArray)) return possibleArray;
		}

		return objects;
	}

	/**
	 * Aggressively attempt to repair a malformed JSON object string
	 */
	attemptManualRepair(jsonStr) {
		if (!jsonStr) return "";
		
		let repaired = this.repairCommonJSONIssues(jsonStr.trim());
		
		// 1. Remove trailing commas
		repaired = repaired.replace(/,\s*(?=[\]\}])/g, '');
		
		// 2. Fix unescaped newlines in values
		// We look for newlines that are not preceded by a quote and followed by a property name or closing brace
		// Actually, simpler: just replace all raw newlines with \n if they are between quotes
		let inString = false;
		let result = '';
		for (let i = 0; i < repaired.length; i++) {
			const char = repaired[i];
			if (char === '"' && repaired[i-1] !== '\\') inString = !inString;
			
			if (inString && (char === '\n' || char === '\r')) {
				result += '\\n';
			} else {
				result += char;
			}
		}
		repaired = result;

		// 3. Fix unescaped internal quotes
		// This is tricky. We'll use a delimiter-based approach
		// Structural quotes are followed by :, ,, }, or ]
		inString = false;
		result = '';
		for (let i = 0; i < repaired.length; i++) {
			const char = repaired[i];
			if (char === '"' && repaired[i-1] !== '\\') {
				// Potential structural quote. Check surroundings.
				let isStructural = false;
				
				// Case A: Start of object or after comma (start of key)
				const prev = repaired.substring(0, i).trim();
				if (prev.endsWith('{') || prev.endsWith(',')) isStructural = true;
				
				// Case B: End of key (followed by :)
				// Case C: End of value (followed by , or } or ])
				if (!isStructural) {
					for (let j = i + 1; j < Math.min(i + 15, repaired.length); j++) {
						const next = repaired[j];
						if (next === ' ' || next === '\t' || next === '\n' || next === '\r') continue;
						if (next === ':' || next === ',' || next === '}' || next === ']') {
							isStructural = true;
						}
						break;
					}
				}
				
				if (isStructural) {
					inString = !inString;
					result += char;
				} else {
					// Internal quote! Escape it.
					result += '\\"';
				}
			} else {
				result += char;
			}
		}
		repaired = result;

		return repaired;
	}

	// Normalize question to match application format
	normalizeQuestion(rawQuestion, index) {
		const q = { ...rawQuestion };
		
		// Ensure required fields
		if (!q.question) {
			throw new Error(`Question ${index + 1} missing question text`);
		}
		
		// Set defaults based on type
		const rawTypeValue = q.type || q.questionType || '';
		const rawType = normalizeAIKey(rawTypeValue);
		q.type = normalizeAIQuestionType(rawTypeValue, q);
		if (q.type === 'code') {
			const fallbackModeFromType = normalizeAICodeAnswerMode(rawTypeValue, '');
			q.codeAnswerMode = normalizeAICodeAnswerMode(
				q.codeAnswerMode || fallbackModeFromType,
				fallbackModeFromType || 'multiple-choice',
			);
		}
		q.options = Array.isArray(q.options)
			? q.options
					.map((entry) => getAIOptionText(entry))
					.filter(Boolean)
			: [];
		q.answer = q.answer || '';
		q.explanation = q.explanation || '';
		q.difficulty = q.difficulty || 'medium';
		q.points = q.points || 1;

		const mapAnswerTokenToOptionText = (rawToken) => {
			const token = String(rawToken || '').trim();
			if (!token || !q.options.length) return token;
			const asNumber = Number.parseInt(token, 10);
			if (
				Number.isFinite(asNumber) &&
				String(asNumber) === token &&
				asNumber >= 1 &&
				asNumber <= q.options.length
			) {
				return q.options[asNumber - 1];
			}
			const letterMatch = token.match(/^[A-H]$/i);
			if (letterMatch) {
				const idx = letterMatch[0].toUpperCase().charCodeAt(0) - 65;
				if (idx >= 0 && idx < q.options.length) return q.options[idx];
			}
			const match = q.options.find(
				(option) => option.toLowerCase() === token.toLowerCase(),
			);
			return match || token;
		};
		if (
			((q.type === 'code' ? q.codeAnswerMode : q.type) === 'multiple-choice' ||
				(q.type === 'code' ? q.codeAnswerMode : q.type) === 'odd-one-out' ||
				(q.type === 'code' ? q.codeAnswerMode : q.type) === 'draggable') &&
			q.answer
		) {
			q.answer = String(q.answer)
				.split(',')
				.map((token) => mapAnswerTokenToOptionText(token))
				.filter(Boolean)
				.join(',');
		}
		
		// Type-specific normalization
		switch (q.type) {
			case 'draggable':
				q.isDraggable = true;
				break;
			case 'fill-blank':
				q.useWordBank = q.useWordBank !== false;
				// Normalize placeholders from [blank] to ___
				if (q.question && q.question.includes('[blank]')) {
					q.question = q.question.replace(/\[blank\]/g, '___');
				}
				break;
			case 'multiple-choice':
				q.allowMultipleAnswers =
					rawType === 'multiple-choice-multi' ||
					rawType === 'multiple-choice-multiple' ||
					Boolean(q.allowMultipleAnswers);
				break;
			case 'code':
				q.codeSnippet = q.codeSnippet || '';
				q.codeLanguage = q.codeLanguage || 'javascript';
				q.codeAnswerMode = normalizeAICodeAnswerMode(
					q.codeAnswerMode,
					'multiple-choice',
				);
				break;
		}
		q.optionData = q.options.map((text, optionIndex) => ({
			text,
			image: '',
			isImageOnly: false,
			id: `opt_${optionIndex + 1}`,
			number: '',
		}));
		q.questionType = q.type;
		
		// Generate unique ID
		q.id = this.generateUUID();
		q.dateCreated = new Date().toISOString();
		q.aiGenerated = true;
		
		return q;
	}

	// Generate UUID
	generateUUID() {
		return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
			const r = Math.random() * 16 | 0;
			const v = c === 'x' ? r : (r & 0x3 | 0x8);
			return v.toString(16);
		});
	}

	getRequestedCount(options = {}) {
		return Math.max(0, Number.parseInt(options.count, 10) || 0);
	}

	getGenerationSystemPrompt(options) {
		return `You are an elite quiz curator. 
CRITICAL MISSION: 
1. Generate EXACTLY ${options.count} questions. 
2. Match difficulty level "${options.difficulty}" perfectly.
Do not stop until the task is 100% complete. $200 bonus for perfect adherence.`;
	}

	async requestQuestionBatch(options) {
		const prompt = this.buildPrompt(options);
		this.log('Generated prompt:', prompt);

		const response = await this.executeWithRetry(async () => {
			return await this.makeAPIRequest({
				messages: [
					{
						role: 'system',
						content: this.getGenerationSystemPrompt(options),
					},
					{ role: 'user', content: prompt }
				]
			});
		});

		return this.parseResponse(response);
	}

	isResponseParseError(error) {
		return (
			error &&
			typeof error.message === 'string' &&
			error.message.includes('Failed to parse AI response')
		);
	}

	normalizeQuestionFingerprint(question = {}) {
		return String(question.question || question.text || '')
			.toLowerCase()
			.replace(/\s+/g, ' ')
			.trim();
	}

	dedupeQuestionBatch(existingQuestions = [], candidateQuestions = []) {
		const seen = new Set(
			existingQuestions
				.map((question) => this.normalizeQuestionFingerprint(question))
				.filter(Boolean),
		);

		return candidateQuestions.filter((question) => {
			const key = this.normalizeQuestionFingerprint(question);
			if (!key || seen.has(key)) return false;
			seen.add(key);
			return true;
		});
	}

	isTrueFalseQuestion(question = {}) {
		const options = Array.isArray(question.options) ? question.options : [];
		const normalizedOptions = new Set(options.map((option) => normalizeAIKey(option)));
		return (
			(normalizedOptions.has('vrai') && normalizedOptions.has('faux')) ||
			(normalizedOptions.has('true') && normalizedOptions.has('false'))
		);
	}

	getQuestionTypeDistributionKey(question = {}, remainingCounts = {}) {
		const hasRemaining = (key) => (Number.parseInt(remainingCounts[key], 10) || 0) > 0;
		const normalizedType = normalizeAIQuestionType(
			question.type || question.questionType,
			question,
		);

		if (normalizedType === 'code') {
			return hasRemaining('code') ? 'code' : '';
		}

		if (normalizedType === 'multiple-choice') {
			if (question.allowMultipleAnswers && hasRemaining('multiple-choice-multi')) {
				return 'multiple-choice-multi';
			}
			if (this.isTrueFalseQuestion(question) && hasRemaining('true-false')) {
				return 'true-false';
			}
			if (hasRemaining('multiple-choice')) return 'multiple-choice';
			if (hasRemaining('multiple-choice-multi')) return 'multiple-choice-multi';
			if (hasRemaining('true-false')) return 'true-false';
		}

		if (hasRemaining(normalizedType)) return normalizedType;

		return Object.keys(remainingCounts).find((key) => {
			return (
				hasRemaining(key) &&
				normalizeAIQuestionType(key, {}) === normalizedType
			);
		}) || '';
	}

	decrementFulfilledCodeMode(question = {}, remainingCodeTypeCounts = {}) {
		const preferredMode = normalizeAICodeAnswerMode(
			question.codeAnswerMode,
			'multiple-choice',
		);
		const targetMode = (Number.parseInt(remainingCodeTypeCounts[preferredMode], 10) || 0) > 0
			? preferredMode
			: AI_GENERATOR_CODE_MODES.find(
				(mode) => (Number.parseInt(remainingCodeTypeCounts[mode], 10) || 0) > 0,
			);

		if (targetMode) {
			remainingCodeTypeCounts[targetMode] =
				(Number.parseInt(remainingCodeTypeCounts[targetMode], 10) || 0) - 1;
		}
	}

	balanceCountsToTotal(counts = {}, targetTotal = 0, preferredKeys = []) {
		const balanced = {};
		for (const [key, rawValue] of Object.entries(counts)) {
			const value = Math.max(0, Number.parseInt(rawValue, 10) || 0);
			if (value > 0) balanced[key] = value;
		}

		const keys = preferredKeys.length ? preferredKeys : Object.keys(balanced);
		let total = Object.values(balanced).reduce((sum, value) => sum + value, 0);

		while (total > targetTotal) {
			const key = [...Object.keys(balanced)].reverse().find((entry) => balanced[entry] > 0);
			if (!key) break;
			balanced[key] -= 1;
			if (balanced[key] <= 0) delete balanced[key];
			total -= 1;
		}

		while (total < targetTotal && keys.length > 0) {
			const key = keys.find((entry) => balanced[entry] > 0) || keys[0];
			balanced[key] = (balanced[key] || 0) + 1;
			total += 1;
		}

		return balanced;
	}

	getRemainingGenerationOptions(baseOptions, currentQuestions) {
		const requestedCount = this.getRequestedCount(baseOptions);
		const remainingCount = Math.max(0, requestedCount - currentQuestions.length);
		if (remainingCount <= 0) return null;

		const nextOptions = {
			...baseOptions,
			count: remainingCount,
		};

		const typeCounts = baseOptions.typeCounts || {};
		if (Object.keys(typeCounts).length > 0) {
			const remainingTypeCounts = {};
			for (const [type, rawValue] of Object.entries(typeCounts)) {
				const value = Math.max(0, Number.parseInt(rawValue, 10) || 0);
				if (value > 0) remainingTypeCounts[type] = value;
			}

			const remainingCodeTypeCounts = {};
			for (const mode of AI_GENERATOR_CODE_MODES) {
				const value = Math.max(
					0,
					Number.parseInt(baseOptions.codeTypeCounts?.[mode], 10) || 0,
				);
				if (value > 0) remainingCodeTypeCounts[mode] = value;
			}

			currentQuestions.forEach((question) => {
				const typeKey = this.getQuestionTypeDistributionKey(question, remainingTypeCounts);
				if (!typeKey) return;
				remainingTypeCounts[typeKey] -= 1;
				if (remainingTypeCounts[typeKey] <= 0) delete remainingTypeCounts[typeKey];
				if (typeKey === 'code') {
					this.decrementFulfilledCodeMode(question, remainingCodeTypeCounts);
				}
			});

			const preferredTypeKeys = Object.keys(typeCounts).filter(
				(type) => (Number.parseInt(typeCounts[type], 10) || 0) > 0,
			);
			nextOptions.typeCounts = this.balanceCountsToTotal(
				remainingTypeCounts,
				remainingCount,
				preferredTypeKeys,
			);
			nextOptions.types = Object.keys(nextOptions.typeCounts);

			const remainingCodeCount = Number.parseInt(nextOptions.typeCounts.code, 10) || 0;
			if (remainingCodeCount > 0) {
				nextOptions.codeTypeCounts = this.balanceCountsToTotal(
					remainingCodeTypeCounts,
					remainingCodeCount,
					AI_GENERATOR_CODE_MODES,
				);
			} else {
				nextOptions.codeTypeCounts = {};
			}
		}

		return nextOptions;
	}

	buildTopUpInstruction(existingQuestions = [], remainingCount = 0) {
		const existingList = existingQuestions
			.slice(-10)
			.map((question, index) => `${index + 1}. ${question.question}`)
			.join('\n');

		return `This is a continuation because the previous response contained too few questions. Generate ONLY the ${remainingCount} missing question(s), as separate JSON object(s), and do not repeat any existing question.
Return ONLY a valid JSON array. The first character must be "[" and the last character must be "]".
Do not include markdown, explanations, partial fragments, or placeholder schema text such as Option A, Term1, Key1, Value1, or Value2.
${existingList ? `Existing questions to avoid:\n${existingList}` : ''}`;
	}

	buildStrictTopUpInstruction(existingQuestions = [], remainingCount = 0) {
		return `${this.buildTopUpInstruction(existingQuestions, remainingCount)}
The previous continuation was invalid JSON. Retry with complete JSON only:
- Every key and string value must use double quotes.
- Do not output bare words like Value2.
- Do not copy examples from the schema.
- Output exactly ${remainingCount} object(s) inside one array.`;
	}

	buildStrictInitialInstruction(options = {}) {
		const count = this.getRequestedCount(options);
		return `The previous response was invalid because it was plain text or malformed JSON. Retry from scratch.
Return ONLY one valid JSON array. The first character must be "[" and the last character must be "]".
Generate exactly ${count} separate question object(s), no more and no less.
Do not include markdown, prefaces, explanations outside JSON, partial fragments, or placeholder schema text.
Every key and every string value must use double quotes.`;
	}

	async requestInitialQuestionBatch(options) {
		try {
			return await this.requestQuestionBatch(options);
		} catch (error) {
			if (!this.isResponseParseError(error)) throw error;

			this.log(
				'Initial AI response was invalid JSON. Retrying with stricter instructions.',
				error.message,
			);

			const strictOptions = {
				...options,
				extraInstruction: [
					options.extraInstruction,
					this.buildStrictInitialInstruction(options),
				]
					.filter(Boolean)
					.join('\n\n'),
			};

			return await this.requestQuestionBatch(strictOptions);
		}
	}

	async fillMissingQuestions(options, initialQuestions) {
		const requestedCount = this.getRequestedCount(options);
		let questions = this.dedupeQuestionBatch([], initialQuestions).slice(0, requestedCount);
		const maxTopUpAttempts = Math.min(Math.max(requestedCount, 2), 8);

		for (
			let attempt = 1;
			questions.length < requestedCount && attempt <= maxTopUpAttempts;
			attempt++
		) {
			const remainingOptions = this.getRemainingGenerationOptions(options, questions);
			if (!remainingOptions || remainingOptions.count <= 0) break;

			remainingOptions.extraInstruction = this.buildTopUpInstruction(
				questions,
				remainingOptions.count,
			);

			this.log(
				`AI under-generated (${questions.length} vs ${requestedCount}). Top-up attempt ${attempt}, requesting ${remainingOptions.count}.`,
			);

			let topUpQuestions = [];
			try {
				topUpQuestions = await this.requestQuestionBatch(remainingOptions);
			} catch (error) {
				if (!this.isResponseParseError(error)) throw error;

				this.log(
					`Top-up attempt ${attempt} returned invalid JSON. Retrying with stricter instructions.`,
					error.message,
				);
				remainingOptions.extraInstruction = this.buildStrictTopUpInstruction(
					questions,
					remainingOptions.count,
				);

				try {
					topUpQuestions = await this.requestQuestionBatch(remainingOptions);
				} catch (retryError) {
					if (!this.isResponseParseError(retryError)) throw retryError;
					this.log(
						`Strict top-up attempt ${attempt} also returned invalid JSON. Continuing.`,
						retryError.message,
					);
					continue;
				}
			}
			const uniqueQuestions = this.dedupeQuestionBatch(questions, topUpQuestions);
			if (uniqueQuestions.length === 0) {
				this.log(`Top-up attempt ${attempt} returned no unique questions.`);
				continue;
			}

			questions = questions.concat(uniqueQuestions).slice(0, requestedCount);
		}

		return questions;
	}

	// Main generation method
	async generate(options) {
		if (this.isGenerating) {
			throw new Error('Generation already in progress');
		}

		this.log('Generation started with options:', JSON.stringify({
			topic: options.topic,
			count: options.count,
			types: options.types,
			codeTypeCounts: options.codeTypeCounts
		}));

		if (this.isInCooldown()) {
			throw new Error(`Please wait ${this.getCooldownRemaining()} seconds`);
		}

		const apiKey = this.config.apiKeys[this.config.provider];
		if (!apiKey) {
			throw new Error(`Please configure your ${this.getProviderConfig().name} API key in Settings`);
		}

		this.isGenerating = true;
		
		try {
			const requestedCount = this.getRequestedCount(options);
			let questions = await this.requestInitialQuestionBatch(options);
			
			// Safety: Filter and Slice to ensure exactly the requested count
			if (questions.length > requestedCount) {
				this.log(`AI over-generated (${questions.length} vs ${requestedCount}). Slicing array.`);
				questions = questions.slice(0, requestedCount);
			} else if (questions.length < requestedCount) {
				questions = await this.fillMissingQuestions(options, questions);
			}

			if (questions.length < requestedCount) {
				this.log(`AI still under-generated (${questions.length} vs ${requestedCount}) after top-up attempts.`);
			}
			
			// Post-processing: Ensure difficulty and category are set correctly
			questions.forEach(q => {
				q.difficulty = options.difficulty || q.difficulty || 'medium';
				if (options.category) q.category = options.category;
				q.aiGenerated = true;
			});

			this.startCooldown();
			this.log('Final questions produced:', questions.length);
			
			return questions;
		} finally {
			this.isGenerating = false;
		}
	}

	// Cancel ongoing request
	cancel() {
		if (this.abortController) {
			this.abortController.abort();
		}
		this.isGenerating = false;
	}
}

// ============================================
// GLOBAL INSTANCE & EXPORTS
// ============================================

window.aiGenerator = new AIQuestionGenerator();
window.AI_PROVIDERS = AI_PROVIDERS;
window.DEFAULT_AI_CONFIG = DEFAULT_AI_CONFIG;

// Make class available for testing
window.AIQuestionGenerator = AIQuestionGenerator;

console.log('AI Question Generator module loaded');
