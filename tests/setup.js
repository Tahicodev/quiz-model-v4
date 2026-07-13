/**
 * tests/setup.js — runs once before each test file.
 * Ensures the backend `config.js` import (which calls requireEnv on
 * JWT_SECRET/DATABASE_URL) doesn't throw in the test environment by loading
 * .env, and pins NODE_ENV=test so config stays in development-like mode
 * (dotenv loads .env, JWT strength isn't enforced at 64 chars for local).
 */

process.env.NODE_ENV = process.env.NODE_ENV || 'test';
// config.js runs dotenv.config() only when NODE_ENV !== 'production', which
// test satisfies — so real .env values are visible. Nothing else to do.
export {};
