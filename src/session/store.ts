import {
  readFileSync,
  writeFileSync,
  renameSync,
  existsSync,
  mkdirSync,
  readdirSync,
  appendFileSync,
  copyFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { ErrorCode, SkyError } from '../errors/index.js';
import { nullLogger, type Logger } from '../logging/index.js';
import { sessionsDir as defaultSessionsDir, sessionsIndexPath as defaultIndexPath } from '../config/paths.js';
import {
  sessionSchema,
  sessionIndexEntrySchema,
  CURRENT_SESSION_VERSION,
  type Session,
  type SessionIndexEntry,
  type Message,
  type Mode,
} from './types.js';
import { migrateSession } from './migrations.js';

export interface SessionStoreOptions {
  dir?: string;
  indexPath?: string;
  logger?: Logger;
}

/** Generate a short, url-safe session id. */
export function generateSessionId(): string {
  return randomBytes(6).toString('hex');
}

/**
 * The persistence layer (§2.4.5, §7). Every state change is written atomically
 * (temp file + rename) so a crash never leaves a partial file. An append-only
 * index makes `sky ls` fast without reading every session.
 */
export class SessionStore {
  private readonly dir: string;
  private readonly indexPath: string;
  private readonly logger: Logger;

  constructor(options: SessionStoreOptions = {}) {
    this.dir = options.dir ?? defaultSessionsDir();
    this.indexPath = options.indexPath ?? defaultIndexPath();
    this.logger = options.logger ?? nullLogger;
    mkdirSync(this.dir, { recursive: true });
  }

  private filePath(id: string): string {
    return join(this.dir, `${id}.json`);
  }

  /** Create a new active session and persist it. */
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
    this.logger.info('session.started', { id: session.id, mode: session.mode });
    return session;
  }

  /** Whether a session file exists. */
  exists(id: string): boolean {
    return existsSync(this.filePath(id));
  }

  /**
   * Load a session, running migrations and validation. A parse failure is
   * SKY-E-4002; an unmigratable file is SKY-E-4001. On corruption a `.bak` of
   * the original is preserved before throwing.
   */
  load(id: string): Session {
    const path = this.filePath(id);
    if (!existsSync(path)) throw new SkyError(ErrorCode.SessionNotFound, { id });

    let raw: string;
    try {
      raw = readFileSync(path, 'utf8');
    } catch (cause) {
      throw new SkyError(ErrorCode.SessionCorrupt, { detail: `cannot read ${id}` }, cause);
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw) as Record<string, unknown>;
    } catch (cause) {
      this.backup(path);
      throw new SkyError(ErrorCode.SessionCorrupt, { detail: (cause as Error).message }, cause);
    }

    const migrated = migrateSession(parsed);
    const result = sessionSchema.safeParse(migrated);
    if (!result.success) {
      this.backup(path);
      throw new SkyError(ErrorCode.SessionCorrupt, {
        detail: result.error.errors.map((e) => e.path.join('.')).join(', '),
      });
    }
    return result.data;
  }

  private backup(path: string): void {
    try {
      copyFileSync(path, `${path}.bak`);
    } catch {
      // best-effort; failure here should not mask the original error
    }
  }

  /**
   * Persist a session with the atomic temp-file + rename strategy (§11.7).
   * Updates `lastActivity` and refreshes the index entry.
   */
  save(session: Session): void {
    session.lastActivity = new Date().toISOString();
    const validated = sessionSchema.parse(session);
    const path = this.filePath(session.id);
    const tmp = `${path}.tmp`;
    writeFileSync(tmp, JSON.stringify(validated, null, 2), 'utf8');
    renameSync(tmp, path); // atomic w.r.t. the directory entry on POSIX
    this.updateIndex(validated);
  }

  /** Append a message and persist atomically. */
  appendMessage(session: Session, message: Message): void {
    session.messages.push({ ...message, timestamp: message.timestamp ?? new Date().toISOString() });
    this.save(session);
  }

  /** Move a session to a new lifecycle state (§7.3) and persist. */
  setStatus(session: Session, status: Session['status']): void {
    session.status = status;
    this.save(session);
  }

  // --- Index (§7.4) -------------------------------------------------------

  private updateIndex(session: Session): void {
    const entry: SessionIndexEntry = {
      id: session.id,
      cwd: session.cwd,
      started: session.started,
      lastActivity: session.lastActivity,
      mode: session.mode,
      messages: session.messages.length,
      status: session.status,
    };
    try {
      appendFileSync(this.indexPath, JSON.stringify(entry) + '\n', 'utf8');
    } catch (cause) {
      this.logger.warn('session.index.appendFailed', { detail: (cause as Error).message });
    }
  }

  /**
   * Read the index, collapsing to the latest entry per id. If the index is
   * missing or a line is corrupt, it is rebuilt from the sessions directory.
   */
  list(filter?: { cwd?: string; sinceMs?: number }): SessionIndexEntry[] {
    let entries = this.readIndex();
    if (entries === undefined) entries = this.rebuildIndex();

    // Collapse to the latest entry per id, recording the index-file position so
    // ties on lastActivity resolve deterministically (later write == newer).
    const latest = new Map<string, { entry: SessionIndexEntry; seq: number }>();
    entries.forEach((entry, seq) => latest.set(entry.id, { entry, seq }));

    let result = [...latest.values()].filter((x) => x.entry.status !== 'archived');
    if (filter?.cwd) result = result.filter((x) => x.entry.cwd === filter.cwd);
    if (filter?.sinceMs !== undefined) {
      const cutoff = Date.now() - filter.sinceMs;
      result = result.filter((x) => Date.parse(x.entry.lastActivity) >= cutoff);
    }
    return result
      .sort((a, b) => {
        const byTime = Date.parse(b.entry.lastActivity) - Date.parse(a.entry.lastActivity);
        return byTime !== 0 ? byTime : b.seq - a.seq;
      })
      .map((x) => x.entry);
  }

  private readIndex(): SessionIndexEntry[] | undefined {
    if (!existsSync(this.indexPath)) return undefined;
    const raw = readFileSync(this.indexPath, 'utf8');
    const out: SessionIndexEntry[] = [];
    const lines = raw.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      try {
        const parsed = sessionIndexEntrySchema.parse(JSON.parse(line));
        out.push(parsed);
      } catch {
        // A corrupt trailing line is tolerated (partial append, §7.4); a corrupt
        // interior line signals a broken index → force a rebuild.
        if (i < lines.length - 2) return undefined;
      }
    }
    return out;
  }

  /** Rebuild the index by scanning every session file. */
  rebuildIndex(): SessionIndexEntry[] {
    this.logger.info('session.index.rebuild', {});
    const entries: SessionIndexEntry[] = [];
    for (const file of readdirSync(this.dir)) {
      if (!file.endsWith('.json') || file.endsWith('.tmp')) continue;
      const id = file.replace(/\.json$/, '');
      try {
        const session = this.load(id);
        entries.push({
          id: session.id,
          cwd: session.cwd,
          started: session.started,
          lastActivity: session.lastActivity,
          mode: session.mode,
          messages: session.messages.length,
          status: session.status,
        });
      } catch {
        // skip unreadable files during a rebuild
      }
    }
    // Rewrite the index atomically from the scan.
    const tmp = `${this.indexPath}.tmp`;
    writeFileSync(tmp, entries.map((e) => JSON.stringify(e)).join('\n') + (entries.length ? '\n' : ''), 'utf8');
    renameSync(tmp, this.indexPath);
    return entries;
  }

  /** Resolve `latest` or a concrete id to a session id for the given cwd. */
  resolveId(idOrLatest: string, cwd?: string): string {
    if (idOrLatest !== 'latest') return idOrLatest;
    const sessions = this.list(cwd ? { cwd } : undefined);
    if (sessions.length === 0) throw new SkyError(ErrorCode.SessionNotFound, { id: 'latest' });
    return sessions[0].id;
  }
}
