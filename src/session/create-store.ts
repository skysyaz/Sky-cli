/**
 * Factory for session persistence backends (`json` | `sqlite`).
 */

import type { Logger } from '../logging/index.js';
import { SessionStore, type SessionStoreOptions } from './store.js';
import { SqliteSessionStore, isSqliteAvailable } from './sqlite-store.js';

export type SessionBackend = 'json' | 'sqlite';

/** Structural store interface used by the agent loop and CLI. */
export type AnySessionStore = SessionStore | SqliteSessionStore;

export interface CreateSessionStoreOptions extends SessionStoreOptions {
  backend?: SessionBackend;
  logger?: Logger;
}

export function createSessionStore(options: CreateSessionStoreOptions = {}): AnySessionStore {
  const backend = options.backend ?? 'json';
  if (backend === 'sqlite') {
    if (!isSqliteAvailable()) {
      options.logger?.warn('session.sqlite.unavailable', {
        detail: 'node:sqlite not available; falling back to JSON files',
      });
      return new SessionStore(options);
    }
    try {
      return new SqliteSessionStore(options);
    } catch (error) {
      options.logger?.warn('session.sqlite.openFailed', {
        detail: (error as Error).message,
      });
      return new SessionStore(options);
    }
  }
  return new SessionStore(options);
}
