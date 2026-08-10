/**
 * Shared Utility Functions
 * Common functions used across multiple JavaScript files
 * Load this file first before other scripts
 */

/**
 * Escapes HTML special characters to prevent XSS attacks
 * @param {string} unsafe - The string to escape
 * @returns {string} The escaped string
 */
function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

/**
 * Generates a random UUID v4
 * @returns {string} A UUID string
 */
function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

/**
 * Shows a toast notification
 * @param {string} message - The message to display
 * @param {string} type - The type of toast ('success', 'error', 'warning', 'info')
 */
function showToast(message, type = 'info') {
    // Check for existing toast with same message
    const existingToasts = document.querySelectorAll('.notification-toast');
    let duplicateToast = null;
    
    existingToasts.forEach(t => {
        if (t.textContent === message && t.classList.contains(`toast-${type}`)) {
            duplicateToast = t;
        }
    });
    
    // If duplicate exists, remove old one to refresh (clean slate)
    if (duplicateToast) {
        duplicateToast.remove();
    }
    
    // Check if toast container exists
    let toastContainer = document.getElementById('toast-container');
    
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.id = 'toast-container';
        document.body.appendChild(toastContainer);
    }
    
    const toast = document.createElement('div');
    toast.className = `notification-toast toast-${type}`;
    toast.setAttribute('role', 'status');
    toast.textContent = message;
    toastContainer.appendChild(toast);
    
    // Auto-remove after 4 seconds
    toast.removeTimeout = setTimeout(() => {
        toast.classList.add('toast-leave');
        setTimeout(() => toast.remove(), 240);
    }, 4000);
}

// Add CSS animations if not already present
if (!document.getElementById('toast-animations')) {
    const style = document.createElement('style');
    style.id = 'toast-animations';
    style.textContent = `
        @keyframes toastSlideIn {
            from {
                transform: translate3d(0, 12px, 0);
                opacity: 0;
            }
            to {
                transform: translate3d(0, 0, 0);
                opacity: 1;
            }
        }
        @keyframes toastSlideOut {
            from {
                transform: translate3d(0, 0, 0);
                opacity: 1;
            }
            to {
                transform: translate3d(0, 12px, 0);
                opacity: 0;
            }
        }
        @keyframes shake {
            10%, 90% { transform: translate3d(-1px, 0, 0); }
            20%, 80% { transform: translate3d(2px, 0, 0); }
            30%, 50%, 70% { transform: translate3d(-4px, 0, 0); }
            40%, 60% { transform: translate3d(4px, 0, 0); }
        }
    `;
    document.head.appendChild(style);
}

/**
 * Logs an activity to the system
 * @param {string} type - The type of activity (question, exam, class, category, result)
 * @param {string} name - The name/description of the item
 * @param {string} action - The action performed (created, deleted, edited, imported, exported)
 * @param {object} metadata - Optional additional data
 */
function logActivity(type, name, action = 'created', metadata = {}) {
    // ── Backend-first: persist to Notification table so the bell shows it ──
    // The /notifications endpoint creates a real DB row (unlike audit_logs
    // which requires an entity_id we often don't have for pure UI events).
    if (window.API && typeof window.API.create === 'function') {
        window.API.create('notifications', {
            type: type,
            message: `${name} ${action}`,
            data: { name: name, action: action, metadata: metadata },
        }).catch(function (err) {
            console.warn('[utils] notification persist failed:', err && err.message);
        });
    }

    const activityLog = window.__DI_CONTAINER__.repo.getAll_sync('audit_logs');

    // Create new activity entry
    const newActivity = {
        type: type,
        name: name,
        action: action, // Explicit action type
        date: new Date().toISOString(),
        metadata: metadata,
        meta: metadata,
        id: generateUUID() // Use the existing generateUUID function
    };

    // Add to beginning of log
    activityLog.unshift(newActivity);

    // Limit log size (keep last 500 entries)
    if (activityLog.length > 500) {
        activityLog.length = 500;
    }

    window.__DI_CONTAINER__.repo.setAll_sync('audit_logs', activityLog);

    // Refresh dashboard if available
    if (typeof initDashboard === 'function' && document.getElementById('overview') && document.getElementById('overview').classList.contains('active')) {
        initDashboard();
    }

    window.dispatchEvent(new CustomEvent('admin:notifications-updated'));
}

// Expose to window
window.logActivity = logActivity;

const ADMIN_NOTIFICATIONS_KEY = 'adminNotifications';
const ADMIN_NOTIFICATIONS_SEEN_KEY = 'adminNotificationsSeenAt';

		function addAdminNotification(payload = {}) {
			var r = window.__DI_CONTAINER__ && window.__DI_CONTAINER__.repo;
		    var notifications = r ? r.getValue_sync('notifications', []) : JSON.parse(localStorage.getItem(ADMIN_NOTIFICATIONS_KEY) || '[]');
		    var entry = {
		        id: typeof generateUUID === 'function' ? generateUUID() : '' + Date.now(),
		        type: payload.type || 'activity',
		        message: payload.message || 'New activity',
		        data: payload.data || {},
		        createdAt: new Date().toISOString()
		    };
		    notifications.unshift(entry);
		    if (notifications.length > 200) notifications.length = 200;
		    if (r) { r.setAll_sync('notifications', notifications); } else { localStorage.setItem(ADMIN_NOTIFICATIONS_KEY, JSON.stringify(notifications)); }
		    window.dispatchEvent(new CustomEvent('admin:notifications-updated'));

		    // Persist to the backend so the admin bell is populated from the DB
		    // (readable from any device). Fire-and-forget — the local mirror keeps
		    // the UI responsive even if the write fails.
		    if (window.API && typeof window.API.create === 'function') {
		        window.API.create('notifications', {
		            type: entry.type,
		            message: entry.message,
		            data: entry.data,
		        }).catch(function (err) {
		            console.warn('[notifications] API persist failed:', err);
		        });
		    }
		    return entry;
		}

	function getAdminNotificationCount() {
	    var seenAt = localStorage.getItem(ADMIN_NOTIFICATIONS_SEEN_KEY);
	    var seenTime = seenAt ? new Date(seenAt).getTime() : 0;
	    var unique = new Set();

	    var r = window.__DI_CONTAINER__ && window.__DI_CONTAINER__.repo;
	    var notifications = r ? r.getValue_sync('notifications', []) : JSON.parse(localStorage.getItem(ADMIN_NOTIFICATIONS_KEY) || '[]');
    notifications.forEach((n) => {
        const ts = new Date(n.createdAt || '').getTime();
        if (!Number.isFinite(ts) || ts <= seenTime) return;
        const key = n.id || `${n.type || 'activity'}||${n.message || ''}||${n.createdAt || ''}`;
        unique.add(key);
    });

    const activity = window.__DI_CONTAINER__.repo.getAll_sync('audit_logs');
    activity.forEach((a) => {
        const date = a.date || a.timestamp || a.createdAt || '';
        const ts = new Date(date).getTime();
        if (!Number.isFinite(ts) || ts <= seenTime) return;
        const key = a.id || `${a.type || 'activity'}||${a.name || ''}||${date}`;
        unique.add(key);
    });

    return unique.size;
}

function markAdminNotificationsSeen() {
    localStorage.setItem(ADMIN_NOTIFICATIONS_SEEN_KEY, new Date().toISOString());
    window.dispatchEvent(new CustomEvent('admin:notifications-updated'));
}

	function getAdminNotifications() {
		var r = window.__DI_CONTAINER__ && window.__DI_CONTAINER__.repo;
		return r ? r.getValue_sync('notifications', []) : JSON.parse(localStorage.getItem(ADMIN_NOTIFICATIONS_KEY) || '[]');
	}

window.addAdminNotification = addAdminNotification;
window.getAdminNotificationCount = getAdminNotificationCount;
window.markAdminNotificationsSeen = markAdminNotificationsSeen;
window.getAdminNotifications = getAdminNotifications;

const QUIZ_TYPE_ALIASES = {
    'multiple-choice': 'multiple-choice',
    'multiple-choice-multi': 'multiple-choice',
    'multiple-answer': 'multiple-choice',
    'multi-select': 'multiple-choice',
    mcq: 'multiple-choice',
    mc: 'multiple-choice',
    'true-false': 'true-false',
    truefalse: 'true-false',
    boolean: 'true-false',
    'true-or-false': 'true-false',
    'fill-blank': 'fill-blank',
    'fill-in-blank': 'fill-blank',
    'fill-in-the-blank': 'fill-blank',
    fillblank: 'fill-blank',
    draggable: 'draggable',
    'drag-drop': 'draggable',
    'drag-and-drop': 'draggable',
    ordering: 'draggable',
    order: 'draggable',
    'odd-one-out': 'odd-one-out',
    oddoneout: 'odd-one-out',
    'odd-one': 'odd-one-out',
    matching: 'matching-pairs',
    match: 'matching-pairs',
    'matching-pairs': 'matching-pairs',
    code: 'code',
    coding: 'code',
    programming: 'code'
};

function normalizeQuizTypeKey(value) {
    return String(value ?? '')
        .trim()
        .toLowerCase()
        .replace(/&/g, 'and')
        .replace(/[_\s]+/g, '-')
        .replace(/[^a-z0-9-]/g, '');
}

function isTrueFalseQuestion(question = {}) {
    const options = Array.isArray(question.options) ? question.options : [];
    if (options.length !== 2) return false;
    const normalized = options.map((option) => normalizeQuizTypeKey(option));
    const trueWords = new Set(['true', 'vrai', 'yes', 'oui']);
    const falseWords = new Set(['false', 'faux', 'no', 'non']);
    return normalized.some((word) => trueWords.has(word)) && normalized.some((word) => falseWords.has(word));
}

function normalizeQuizQuestionType(rawType, question = {}) {
    const key = normalizeQuizTypeKey(rawType || question.type || question.questionType || '');
    if (question.codeSnippet || question.codeAnswerMode) return 'code';
    if (key && QUIZ_TYPE_ALIASES[key]) {
        const canonical = QUIZ_TYPE_ALIASES[key];
        if (canonical === 'multiple-choice' && isTrueFalseQuestion(question)) return 'true-false';
        return canonical;
    }
    if (question.isDraggable) return 'draggable';
    if (String(question.answer || '').includes('-->')) return 'matching-pairs';
    if (question.useWordBank || String(question.question || '').includes('___')) return 'fill-blank';
    if (isTrueFalseQuestion(question)) return 'true-false';
    return 'multiple-choice';
}

function getQuizQuestionTypeLabel(type, question = {}) {
    const normalized = normalizeQuizQuestionType(type, question);
    const labels = {
        'multiple-choice': 'Multiple Choice',
        'true-false': 'True / False',
        'fill-blank': 'Fill in the Blank',
        draggable: 'Drag & Drop',
        'odd-one-out': 'Odd One Out',
        'matching-pairs': 'Matching Pairs',
        code: 'Code'
    };
    return labels[normalized] || normalized;
}

function getQuizQuestionTypeClass(type, question = {}) {
    const normalized = normalizeQuizQuestionType(type, question);
    const classes = {
        'multiple-choice': 'multiple-choice-type',
        'true-false': 'true-false-type',
        'fill-blank': 'fill-blank-type',
        draggable: 'draggable-type',
        'odd-one-out': 'odd-one-type',
        'matching-pairs': 'matching-pairs-type',
        code: 'code-type'
    };
    return classes[normalized] || 'multiple-choice-type';
}

window.QuizTypes = {
    normalize: normalizeQuizQuestionType,
    label: getQuizQuestionTypeLabel,
    className: getQuizQuestionTypeClass,
    isTrueFalse: isTrueFalseQuestion
};

function getStoredAdminSecret() {
    try {
        const settings = (window.__DI_CONTAINER__.repo.getAll_sync('settings')[0] || {});
        return String(settings.adminSecret || localStorage.getItem('quizAdminSecret') || '').trim();
    } catch (e) {
        return String(localStorage.getItem('quizAdminSecret') || '').trim();
    }
}

function buildAdminIdentifyPayload(extra = {}) {
    return {
        role: 'admin',
        adminSecret: getStoredAdminSecret(),
        ...extra
    };
}

function sanitizeImageUrl(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (/^(data:image\/(?:png|jpe?g|gif|webp|svg\+xml);base64,)/i.test(raw)) {
        return raw;
    }
    try {
        const url = new URL(raw, window.location.href);
        if (['http:', 'https:', 'blob:'].includes(url.protocol)) return url.href;
    } catch (e) {
        return '';
    }
    return '';
}

function sanitizeCssColor(value, fallback = '#9ca3af') {
    const raw = String(value || '').trim();
    if (/^#[0-9a-f]{3,8}$/i.test(raw)) return raw;
    if (/^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)$/i.test(raw)) return raw;
    if (/^hsla?\(\s*\d{1,3}\s*,\s*\d{1,3}%\s*,\s*\d{1,3}%(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)$/i.test(raw)) return raw;
    return fallback;
}

window.getStoredAdminSecret = getStoredAdminSecret;
window.buildAdminIdentifyPayload = buildAdminIdentifyPayload;
window.sanitizeImageUrl = window.sanitizeImageUrl || sanitizeImageUrl;
window.sanitizeCssColor = window.sanitizeCssColor || sanitizeCssColor;

/**
 * Universally initializes a "Scroll to Top" floating button
 */
function initScrollToTop() {
	// Create button element if not already present
	if (document.getElementById('universal-scroll-top')) return;

	const btn = document.createElement('div');
	btn.id = 'universal-scroll-top';
	btn.className = 'scroll-to-top';
	btn.setAttribute('role', 'button');
	btn.setAttribute('aria-label', 'Scroll to top');
	btn.setAttribute('title', 'Scroll to top');

	btn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
            <polyline points="18 15 12 9 6 15"></polyline>
        </svg>
    `;

	document.body.appendChild(btn);

	// Handle visibility on scroll
	const handleScroll = () => {
		if (window.scrollY > 300) {
			btn.classList.add('visible');
		} else {
			btn.classList.remove('visible');
		}
	};

	// Use passive listener for better performance
	window.addEventListener('scroll', handleScroll, { passive: true });

	// Smooth scroll to top on click
	btn.addEventListener('click', () => {
		window.scrollTo({
			top: 0,
			behavior: 'smooth',
		});
	});

	// Initial check
	handleScroll();
}

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', initScrollToTop);
} else {
	initScrollToTop();
}
