/**
 * src/frontend/config.js
 * Frontend environment configuration injected at build time or via script tag.
 */

window.APP_CONFIG = window.APP_CONFIG || {
  mode:         'local', // 'local' | 'saas'
  apiUrl:       '',      // Used if mode === 'saas'
  socketUrl:    '',      // Used by realtime client
  telemetryUrl: '',      // Optional production error logging endpoint
};

export const config = window.APP_CONFIG;
