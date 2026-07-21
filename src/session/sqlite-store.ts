/**
 * Optional SQLite-backed session store (OpenCode-style persistence backend).
 * Uses Node's `node:sqlite` DatabaseSync when available.
 */

import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { ErrorCode, SkyError } from '../errors/index.js';
import { nullLogger, type Logger } from '../logging/index.js';
import { sessionsDir as defaultSessionsDir } from '../config/paths.js';
import {
  sessionSchema,
  CURRENT_SESSION_VERSION,
  type Session,
  type SessionIndexEntry,
  type Message,
  type Mode,
} from './types.js';
import { generateSessionId, type SessionStoreOptions } from './store.js';
import { migrateSession } from './migrations.js';

const require = createRequire(import.meta.url);

type DatabaseSync = {
  exec(sql: string): void;
  prepare(sql: string): {
    run(...params: unknown[]): unknown;
    get(...params: unknown[]): Record<string, unknown> | undefined;
    all(...params: unknown[]): Record<string, unknown>[];
  };
  close(): void;
};

function openDb(path: string): DatabaseSync {
  const mod = require('node:sqlite') as { DatabaseSync: new (path: string) => DatabaseSync };
  return new mod.DatabaseSync(path);
}

export interface SqliteSessionStoreOptions extends SessionStoreOptions {
  dbPath?: string;
}

/**
 * Session persistence via SQLite. Same public surface as {@link SessionStore}
 * so the agent loop / CLI can swap backends via config.
 */
export class SqliteSessionStore {
  private readonly db: DatabaseSync;
  private readonly logger: Logger;
  readonly backend = 'sqlite' as const;

  constructor(options: SqliteSessionStoreOptions = {}) {
    this.logger = options.logger ?? nullLogger;
    const dir = options.dir ?? defaultSessionsDir();
    mkdirSync(dir, { recursive: true });
    const dbPath = options.dbPath ?? join(dir, 'sessions.sqlite');
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = openDb(dbPath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        cwd TEXT NOT NULL,
        mode TEXT NOT NULL,
        status TEXT NOT NULL,
        last_activity TEXT NOT NULL,
        started TEXT NOT NULL,
        messages INTEGER NOT NULL DEFAULT 0,
        json TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_sessions_cwd ON sessions(cwd);
      CREATE INDEX IF NOT EXISTS idx_sessions_activity ON sessions(last_activity);
    `);
  }

  create(params: { mode: Mode; cwd: string; provider: string; model: string; id?: string }): Session {
    const now = new Date().toISOString();
    const session: Session = sessionSchema.parse({
      schemaVersion: CURRENT_SESSION_VERSION,
      id: params.id ?? generateSessionId(),
      cwd: params.cwd,
      mode: params.mode,
      status: 'active',
      provider: params.provider,
      model: params.model,
      started: now,
      lastActivity: now,
      messages: [],
    });
    this.save(session);
    this.logger.info('session.started', { id: session.id, mode: session.mode, backend: 'sqlite' });
    return session;
  }

  exists(id: string): boolean {
    const row = this.db.prepare('SELECT 1 AS ok FROM sessions WHERE id = ?').get(id);
    return Boolean(row);
  }

  load(id: string): Session {
    const row = this.db.prepare('SELECT json FROM sessions WHERE id = ?').get(id);
    if (!row?.json) throw new SkyError(ErrorCode.SessionNotFound, { id });
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(String(row.json)) as Record<string, unknown>;
    } catch (cause) {
      throw new SkyError(ErrorCode.SessionCorrupt, { detail: (cause as Error).message }, cause);
    }
    const migrated = migrateSession(parsed);
    const result = sessionSchema.safeParse(migrated);
    if (!result.success) {
      throw new SkyError(ErrorCode.SessionCorrupt, {
        detail: result.error.errors.map((e) => e.path.join('.')).join(', '),
      });
    }
    return result.data;
  }

  save(session: Session): void {
    session.lastActivity = new Date().toISOString();
    const validated = sessionSchema.parse(session);
    this.db
      .prepare(
        `INSERT INTO sessions (id, cwd, mode, status, last_activity, started, messages, json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           cwd=excluded.cwd,
           mode=excluded.mode,
           status=excluded.status,
           last_activity=excluded.last_activity,
           started=excluded.started,
           messages=excluded.messages,
           json=excluded.json`,
      )
      .run(
        validated.id,
        validated.cwd,
        validated.mode,
        validated.status,
        validated.lastActivity,
        validated.started,
        validated.messages.length,
        JSON.stringify(validated),
      );
  }

  appendMessage(session: Session, message: Message): void {
    session.messages.push({ ...message, timestamp: message.timestamp ?? new Date().toISOString() });
    this.save(session);
  }

  setStatus(session: Session, status: Session['status']): void {
    session.status = status;
    this.save(session);
  }

  list(filter?: { cwd?: string; sinceMs?: number }): SessionIndexEntry[] {
    const rows = this.db
      .prepare(
        `SELECT id, cwd, started, last_activity AS lastActivity, mode, messages, status
         FROM sessions WHERE status != 'archived'`,
      )
      .all() as Array<{
      id: string;
      cwd: string;
      started: string;
      lastActivity: string;
      mode: Mode;
      messages: number;
      status: Session['status'];
    }>;

    let result: SessionIndexEntry[] = rows.map((r) => ({
      id: r.id,
      cwd: r.cwd,
      started: r.started,
      lastActivity: r.lastActivity,
      mode: r.mode,
      messages: r.messages,
      status: r.status,
    }));
    if (filter?.cwd) result = result.filter((x) => x.cwd === filter.cwd);
    if (filter?.sinceMs !== undefined) {
      const cutoff = Date.now() - filter.sinceMs;
      result = result.filter((x) => Date.parse(x.lastActivity) >= cutoff);
    }
    return result.sort((a, b) => Date.parse(b.lastActivity) - Date.parse(a.lastActivity));
  }

  rebuildIndex(): SessionIndexEntry[] {
    return this.list();
  }

  resolveId(idOrLatest: string, cwd?: string): string {
    if (idOrLatest !== 'latest') return idOrLatest;
    const sessions = this.list(cwd ? { cwd } : undefined);
    if (sessions.length === 0) throw new SkyError(ErrorCode.SessionNotFound, { id: 'latest' });
    return sessions[0]!.id;
  }

  close(): void {
    this.db.close();
  }
}

/** True when `node:sqlite` can be loaded in this runtime. */
export function isSqliteAvailable(): boolean {
  try {
    openDb(':memory:').close();
    return true;
  } catch {
    return false;
  }
}
