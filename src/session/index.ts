/**
 * The `session/` module (§2.4.5). Single source of truth for conversation
 * state; depends only on config/logging/errors.
 */
export * from './types.js';
export * from './store.js';
export * from './compact.js';
export { migrateSession, type Migration } from './migrations.js';
