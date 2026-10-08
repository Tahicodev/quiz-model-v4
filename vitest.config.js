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
    setupFiles: ['tests/setup.js'],
    // Each integration file boots its own throwaway sqlite DB by running
    // `prisma migrate deploy` (a full child process). Vitest runs the files in
    // parallel, so those child processes contend for CPU: a setup that takes
    // ~4s alone measures ~13s under load, and before the module import of
    // helpers/app.js the hook lands past the default 20s budget. The budget is
    // for setup cost only — assertions are unchanged.
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // Keep test output readable in a terminal.
    reporter: 'default',
  },
});
