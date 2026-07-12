import { ErrorCode, SkyError } from '../errors/index.js';
import { CURRENT_SESSION_VERSION } from './types.js';

/**
 * A migration is a pure function: given an old-version object it returns the
 * next-version object. It never mutates in place, never reads from disk, and
 * never fails silently (§7.8).
 */
export type Migration = (input: Record<string, unknown>) => Record<string, unknown>;

/** Keyed by the version they migrate *from*. */
export const SESSION_MIGRATIONS: Record<number, Migration> = {
  // Example scaffold for the first schema bump. No real migrations exist yet at
  // v1; the entry documents the shape a future migration would take.
  // 1: (s) => ({ ...s, schemaVersion: 2, newField: defaultValue }),
};

/**
 * Bring a loaded session object up to {@link CURRENT_SESSION_VERSION} by running
 * each migration in sequence. An unmigratable file throws
 * {@link ErrorCode.SessionMigrationFailed} (the caller preserves a `.bak`).
 */
export function migrateSession(input: Record<string, unknown>): Record<string, unknown> {
  let current = input;
  let version = typeof current.schemaVersion === 'number' ? current.schemaVersion : 1;

  while (version < CURRENT_SESSION_VERSION) {
    const migration = SESSION_MIGRATIONS[version];
    if (!migration) {
      throw new SkyError(ErrorCode.SessionMigrationFailed, {
        detail: `no migration from schemaVersion ${version}`,
      });
    }
    current = migration(current);
    const next = typeof current.schemaVersion === 'number' ? current.schemaVersion : version + 1;
    if (next <= version) {
      throw new SkyError(ErrorCode.SessionMigrationFailed, {
        detail: `migration from ${version} did not advance the version`,
      });
    }
    version = next;
  }

  return current;
}
