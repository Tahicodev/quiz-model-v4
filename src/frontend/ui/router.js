/**
 * src/frontend/ui/router.js
 * Basic routing utility.
 * In the current MPA (Multi-Page Application) architecture, this mainly handles
 * page transitions and ensures socket listeners are cleaned up before unloading.
 */

import { cleanupSocketListeners } from '../infrastructure/socket.client.js';
import { logger }                 from '../utils/logger.js';

export const Router = {
  /**
   * Navigate to a new URL, cleaning up socket listeners first.
   * @param {string} url 
   */
  navigate(url) {
    logger.debug(`Navigating to ${url}`);
    
    // In a true SPA, we would handle History API here.
    // Since we are currently MPA, we just assign window.location
    window.location.href = url;
  },

  /**
   * Register a cleanup hook to run when the page unloads.
   * Used heavily by game and tournament pages to remove socket listeners.
   * @param {string[]} socketEventsToClean 
   */
  registerCleanup(socketEventsToClean = []) {
    window.addEventListener('beforeunload', () => {
      cleanupSocketListeners(socketEventsToClean);
    });
  }
};
