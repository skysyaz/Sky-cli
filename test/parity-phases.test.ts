import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSessionStore } from '../src/session/create-store.js';
import { isSqliteAvailable } from '../src/session/sqlite-store.js';
import { skyDaemonOpenApi } from '../src/protocol/openapi.js';
import { PARALLEL_SAFE_TOOLS } from '../src/tools/types.js';
import { AgentLoop } from '../src/agent/loop.js';
import type { AgentEvent } from '../src/agent/events.js';
import { SessionStore } from '../src/session/store.js';
import { MockProvider } from '../src/llm/mock.js';
import { ToolRegistry } from '../src/tools/registry.js';
import { Policy } from '../src/safety/policy.js';
import { Approver } from '../src/safety/approver.js';
import { AuditLog } from '../src/safety/audit.js';
import { defaultConfig } from '../src/config/index.js';
import { nullLogger } from '../src/logging/index.js';
import { writeFileSync } from 'node:fs';

describe('session backends', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'sky-sess-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('json backend round-trips', () => {
    const store = createSessionStore({
      backend: 'json',
      dir: join(dir, 'sessions'),
      indexPath: join(dir, 'sessions.index'),
    });
    const s = store.create({ mode: 'agent', cwd: dir, provider: 'mock', model: 'm' });
    store.appendMessage(s, { role: 'user', content: 'hi' });
    const loaded = store.load(s.id);
    expect(loaded.messages).toHaveLength(1);
  });

  it('sqlite backend round-trips when available', () => {
    if (!isSqliteAvailable()) return;
    const store = createSessionStore({
      backend: 'sqlite',
      dir: join(dir, 'sessions'),
      logger: nullLogger,
    });
    const s = store.create({ mode: 'ask', cwd: dir, provider: 'mock', model: 'm' });
    store.appendMessage(s, { role: 'user', content: 'sqlite' });
    expect(store.list({ cwd: dir })[0]?.id).toBe(s.id);
    expect(store.load(s.id).messages[0]?.content).toBe('sqlite');
  });
});

describe('OpenAPI + parallel tools', () => {
  it('exports daemon OpenAPI paths', () => {
    expect(skyDaemonOpenApi.openapi).toBe('3.1.0');
    expect(skyDaemonOpenApi.paths['/sessions']).toBeTruthy();
    expect(skyDaemonOpenApi.paths['/sessions/{id}/message']).toBeTruthy();
  });

  it('marks read/search/forge as parallel-safe', () => {
    expect(PARALLEL_SAFE_TOOLS.has('read')).toBe(true);
    expect(PARALLEL_SAFE_TOOLS.has('search')).toBe(true);
    expect(PARALLEL_SAFE_TOOLS.has('forge')).toBe(true);
    expect(PARALLEL_SAFE_TOOLS.has('write')).toBe(false);
  });

  it('settles parallel-safe tool calls in one round', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'sky-par-'));
    try {
      writeFileSync(join(dir, 'a.txt'), 'A');
      writeFileSync(join(dir, 'b.txt'), 'B');
      const store = new SessionStore({ dir: join(dir, 'sessions'), indexPath: join(dir, 'sessions.index') });
      const session = store.create({ mode: 'ask', cwd: dir, provider: 'mock', model: 'mock-1' });
      const config = defaultConfig();
      const policy = new Policy(config);
      const provider = new MockProvider({
        script: [
          {
            text: 'reading',
            toolCalls: [
              { id: '1', name: 'read', input: { path: 'a.txt' } },
              { id: '2', name: 'read', input: { path: 'b.txt' } },
            ],
          },
          { text: 'done' },
        ],
      });
      const loop = new AgentLoop({
        provider,
        registry: new ToolRegistry(),
        approver: new Approver({ policy, audit: new AuditLog({ path: join(dir, 'audit.log') }), yolo: true }),
        policy,
        session,
        store,
        config,
        logger: nullLogger,
      });
      const events: AgentEvent[] = [];
      for await (const e of loop.run('read both')) events.push(e);
      const results = events.filter((e) => e.type === 'tool-result');
      expect(results).toHaveLength(2);
      expect(results.every((e) => e.type === 'tool-result' && e.ok)).toBe(true);
      expect(events.at(-1)?.type).toBe('turn-end');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
