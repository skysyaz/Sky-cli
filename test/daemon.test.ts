import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildRuntime } from '../src/cli/runtime.js';
import { startDaemonHttp, generateDaemonToken } from '../src/server/http.js';
import { ApprovalBridge } from '../src/server/approval-bridge.js';
import { formatSse } from '../src/protocol/api.js';
import { reexecServeArgs } from '../src/server/daemon.js';

describe('daemon protocol helpers', () => {
  it('formats SSE frames', () => {
    expect(formatSse('text-delta', { type: 'text-delta', text: 'hi' })).toContain('event: text-delta');
    expect(formatSse('text-delta', { type: 'text-delta', text: 'hi' })).toContain('"text":"hi"');
  });

  it('builds re-exec argv for serve --register', () => {
    const { args } = reexecServeArgs({ port: 4096, yolo: true });
    expect(args).toContain('serve');
    expect(args).toContain('--register');
    expect(args).toContain('--port');
    expect(args).toContain('4096');
    expect(args).toContain('--yolo');
  });
});

describe('ApprovalBridge', () => {
  it('resolves parked approvals', async () => {
    const seen: string[] = [];
    const bridge = new ApprovalBridge((p) => seen.push(p.id));
    const prompter = bridge.createPrompter();
    const pending = prompter({ toolName: 'write', input: { path: 'a' }, reason: 'test' });
    expect(seen).toHaveLength(1);
    expect(bridge.resolve(seen[0]!, 'yes')).toBe(true);
    await expect(pending).resolves.toBe('yes');
  });
});

describe('daemon HTTP API', () => {
  let dir: string;
  let prevHome: string | undefined;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'sky-daemon-'));
    prevHome = process.env.SKY_HOME;
    process.env.SKY_HOME = dir;
    writeFileSync(join(dir, 'config.json'), JSON.stringify({ defaultProvider: 'mock' }, null, 2));
  });
  afterEach(() => {
    if (prevHome === undefined) delete process.env.SKY_HOME;
    else process.env.SKY_HOME = prevHome;
    rmSync(dir, { recursive: true, force: true });
  });

  it('serves health, creates a session, and runs a yolo turn over SSE', async () => {
    const runtime = buildRuntime({ cwd: dir, provider: 'mock', quiet: true }, false);
    const token = generateDaemonToken();
    const http = await startDaemonHttp({
      runtime,
      global: { cwd: dir, provider: 'mock', yolo: true, force: true, quiet: true },
      token,
    });

    try {
      const health = await fetch(`${http.url}/health`);
      expect(health.ok).toBe(true);
      const healthBody = (await health.json()) as { ok: boolean };
      expect(healthBody.ok).toBe(true);

      const denied = await fetch(`${http.url}/sessions`, { method: 'POST', body: '{}' });
      expect(denied.status).toBe(401);

      const created = await fetch(`${http.url}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Sky-Token': token },
        body: JSON.stringify({ mode: 'ask', cwd: dir, provider: 'mock', model: 'mock-1' }),
      });
      expect(created.status).toBe(201);
      const session = (await created.json()) as { id: string };
      expect(session.id).toBeTruthy();

      const res = await fetch(`${http.url}/sessions/${session.id}/message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Sky-Token': token,
          Accept: 'text/event-stream',
        },
        body: JSON.stringify({ prompt: 'hello daemon', yolo: true }),
      });
      expect(res.ok).toBe(true);
      const text = await res.text();
      expect(text).toContain('event: turn-start');
      expect(text).toContain('event: turn-end');
      expect(text).toContain('event: done');
    } finally {
      await http.close();
    }
  });
});
