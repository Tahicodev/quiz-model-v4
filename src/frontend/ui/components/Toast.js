/**
 * src/frontend/ui/components/Toast.js
 * Toast notification component.
 * We already implemented the core of this inside eventBus.js
 * This file serves as an explicit export of the UI function if components want
 * to call it directly without using the event bus.
 */

import { EventBus } from '../../utils/eventBus.js';

export function showToast(message, type = 'info') {
  EventBus.emit(`app:${type === 'error' ? 'error' : (type === 'success' ? 'success' : 'warning')}`, { message });
}
