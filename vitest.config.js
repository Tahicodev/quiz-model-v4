// vitest.config.js — ESM (matches package.json "type": "module").
//
// All tests run in a Node environment (no jsdom) since they cover services,
// repositories, Express integration, and Socket.io handshake — none of which
// need a DOM. Frontend UI tests, when added later, can opt into jsdom per-file.

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    // The Prisma contract test needs a moment to bring up its throwaway sqlite
    // DB; give the whole suite a generous timeout rather than tuning per-test.
    testTimeout: 20_000,
    hookTimeout: 20_000,
    // Keep test output readable in a terminal.
    reporter: 'default',
  },
});
