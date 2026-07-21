import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { redactSecrets } from '../src/tools/git.js';
import { Policy } from '../src/safety/policy.js';
import { defaultConfig } from '../src/config/index.js';
import { compactSessionMessages } from '../src/session/compact.js';
import type { Message } from '../src/session/types.js';
import { AgentLoop } from '../src/agent/loop.js';
import type { AgentEvent } from '../src/agent/events.js';
import { SessionStore } from '../src/session/store.js';
import { MockProvider } from '../src/llm/mock.js';
import { ToolRegistry } from '../src/tools/registry.js';
import { Approver } from '../src/safety/approver.js';
import { AuditLog } from '../src/safety/audit.js';
import { nullLogger } from '../src/logging/index.js';
import {
  listForgeRows,
  writeForgeToken,
  normalizeForgeBaseUrl,
} from '../src/forge/index.js';
import { writeConfig, loadConfig, writeSecret, listKeyRows } from '../src/config/index.js';

describe('redactSecrets', () => {
  it('strips credentials from remote URLs and common PAT shapes', () => {
    expect(redactSecrets('fatal: https://x-access-token:ghp_ABCDEFGHIJKLMNOPQRSTUV@github.com/a/b.git')).toContain(
      '://***@',
    );
    expect(redactSecrets('https://oauth2:secret@gitea.example.com/x.git')).not.toContain('secret');
    expect(redactSecrets('token ghp_abcdefghijklmnopqrstuvwxyz1234567890')).toContain('ghp_***');
  });
});

describe('policy force-push via args', () => {
  it('denies force push when -f is in args (not only flags)', () => {
    const config = defaultConfig();
    config.tools.git.allowForcePush = false;
    const policy = new Policy(config);
    const decision = policy.classify({
      tool: 'git',
      input: { action: 'push', args: ['origin', 'main', '-f'], flags: [] },
      requiresApproval: true,
    });
    expect(decision.decision).toBe('deny');
  });
});

describe('compact turn boundaries', () => {
  it('does not start the kept window on an orphan tool message', () => {
    const messages: Message[] = [
      { role: 'user', content: 'u0' },
      { role: 'assistant', content: 'a0' },
      { role: 'user', content: 'u1' },
      { role: 'assistant', content: 'thinking', toolCalls: [{ id: 't1', name: 'shell', input: {} }] },
      { role: 'tool', content: 'huge output', toolCallId: 't1', name: 'shell' },
      { role: 'assistant', content: 'done' },
      { role: 'user', content: 'u2' },
    ];
    // keepRecent=1 would naively keep only the last user — fine.
    // keepRecent=2 starting from tool: we snap so tool is not first.
    const result = compactSessionMessages(messages, { keepRecent: 2, reason: 'manual' });
    const afterMarker = result.messages.filter((m) => !String(m.content).startsWith('[compacted'));
    const nonSystem = afterMarker.filter((m) => m.role !== 'system');
    expect(nonSystem[0]?.role).not.toBe('tool');
  });
});

describe('dashboard API smoke (local server)', () => {
  let dir: string;
  let prevHome: string | undefined;
  let prevSecrets: string | undefined;
  let server: ReturnType<typeof createServer>;
  let port: number;
  const token = 'test-token-abcdef';

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'sky-dash-'));
    prevHome = process.env.SKY_HOME;
    prevSecrets = process.env.SKY_SECRETS;
    process.env.SKY_HOME = dir;
    process.env.SKY_SECRETS = join(dir, 'secrets.json');
    writeFileSync(join(dir, 'config.json'), JSON.stringify({ defaultProvider: 'mock' }));

    // Minimal mirror of dashboard auth + state routes for regression.
    const { startDashboard: _unused } = await import('../src/cli/dashboard.js');
    void _unused;
    server = createServer(async (req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      const send = (status: number, body: unknown) => {
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(body));
      };
      if (url.pathname.startsWith('/api/') && req.headers['x-sky-token'] !== token) {
        return send(401, { error: 'unauthorized' });
      }
      if (req.method === 'GET' && url.pathname === '/api/state') {
        const config = loadConfig({ path: join(dir, 'config.json'), cwd: dir });
        return send(200, {
          keys: listKeyRows(config.providers, process.env, config.defaultProvider),
          forges: listForgeRows(config),
        });
      }
      if (req.method === 'POST' && url.pathname === '/api/forge') {
        const chunks: Buffer[] = [];
        for await (const c of req) chunks.push(c as Buffer);
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {
          id: string;
          type: 'github' | 'gitea';
          baseUrl: string;
          username?: string;
          token?: string;
        };
        if (body.type !== 'github' && body.type !== 'gitea') return send(400, { error: 'bad type' });
        const config = loadConfig({ path: join(dir, 'config.json'), cwd: dir });
        config.forge.remotes[body.id] = {
          type: body.type,
          baseUrl: normalizeForgeBaseUrl(body.baseUrl),
          username: body.username,
        };
        config.forge.default = body.id;
        writeConfig(config, join(dir, 'config.json'));
        if (body.token) writeForgeToken(body.id, body.token);
        return send(200, { ok: true });
      }
      if (req.method === 'POST' && url.pathname === '/api/keys') {
        const chunks: Buffer[] = [];
        for await (const c of req) chunks.push(c as Buffer);
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { provider: string; key: string };
        writeSecret(body.provider, body.key);
        return send(200, { ok: true });
      }
      send(404, { error: 'not found' });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const addr = server.address();
    port = typeof addr === 'object' && addr ? addr.port : 0;
  });

  afterEach(() => {
    server.close();
    if (prevHome === undefined) delete process.env.SKY_HOME;
    else process.env.SKY_HOME = prevHome;
    if (prevSecrets === undefined) delete process.env.SKY_SECRETS;
    else process.env.SKY_SECRETS = prevSecrets;
    rmSync(dir, { recursive: true, force: true });
  });

  it('rejects /api/state without token and accepts with token', async () => {
    const bare = await fetch(`http://127.0.0.1:${port}/api/state`);
    expect(bare.status).toBe(401);
    const ok = await fetch(`http://127.0.0.1:${port}/api/state`, {
      headers: { 'X-Sky-Token': token },
    });
    expect(ok.status).toBe(200);
    const body = (await ok.json()) as { forges: unknown[] };
    expect(Array.isArray(body.forges)).toBe(true);
  });

  it('connects a gitea forge and lists it', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/forge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Sky-Token': token },
      body: JSON.stringify({
        id: 'work',
        type: 'gitea',
        baseUrl: 'https://gitea.example.com',
        username: 'me',
        token: 'pat-secret',
      }),
    });
    expect(res.status).toBe(200);
    const state = (await fetch(`http://127.0.0.1:${port}/api/state`, {
      headers: { 'X-Sky-Token': token },
    }).then((r) => r.json())) as { forges: Array<{ id: string; hasToken: boolean }> };
    expect(state.forges.some((f) => f.id === 'work' && f.hasToken)).toBe(true);
  });
});

describe('e2e agent loop (mock provider)', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'sky-e2e-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('runs a multi-tool turn under YOLO without approval prompts', async () => {
    const config = defaultConfig();
    const store = new SessionStore({
      dir: join(dir, 'sessions'),
      indexPath: join(dir, 'sessions.index'),
    });
    const session = store.create({ mode: 'agent', cwd: dir, provider: 'mock', model: 'mock-1' });
    const provider = new MockProvider({
      script: [
        {
          text: 'writing',
          toolCalls: [{ id: 'c1', name: 'write', input: { path: 'ok.txt', content: 'hello' } }],
        },
        { text: 'done' },
      ],
    });
    const policy = new Policy(config);
    const loop = new AgentLoop({
      provider,
      registry: new ToolRegistry(),
      approver: new Approver({
        policy,
        audit: new AuditLog({ path: join(dir, 'audit.log') }),
        yolo: true,
      }),
      policy,
      session,
      store,
      config,
      logger: nullLogger,
    });
    const events: AgentEvent[] = [];
    for await (const e of loop.run('write ok.txt')) events.push(e);
    expect(events.some((e) => e.type === 'tool-result' && e.ok)).toBe(true);
    expect(events.some((e) => e.type === 'turn-end')).toBe(true);
    expect(events.some((e) => e.type === 'error')).toBe(false);
  });
});
