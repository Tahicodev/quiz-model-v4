/**
 * src/frontend/infrastructure/IdGenerator.js
 * Thin wrapper around crypto.randomUUID() for the browser environment.
 * Using a wrapper means tests can mock it and the backend can swap to a
 * different implementation without touching any service code.
 */

export const IdGenerator = {
  /**
   * Generate a cryptographically-random UUID v4.
   * @returns {string}  e.g. "550e8400-e29b-41d4-a716-446655440000"
   */
  generate() {
    return crypto.randomUUID();
  },
};
