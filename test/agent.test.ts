import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

let dir: string;

function makeLoop(provider: MockProvider, mode: 'agent' | 'plan' | 'ask', opts: { yolo?: boolean } = {}) {
  const config = defaultConfig();
  const store = new SessionStore({ dir: join(dir, 'sessions'), indexPath: join(dir, 'sessions.index') });
  const session = store.create({ mode, cwd: dir, provider: 'mock', model: 'mock-1' });
  const policy = new Policy(config, session.sessionAllowlist);
  const approver = new Approver({
    policy,
    audit: new AuditLog({ path: join(dir, 'audit.log') }),
    yolo: opts.yolo,
  });
  const loop = new AgentLoop({
    provider,
    registry: new ToolRegistry(),
    approver,
    policy,
    session,
    store,
    config,
    logger: nullLogger,
  });
  return { loop, store, session };
}

async function collect(gen: AsyncGenerator<AgentEvent>): Promise<AgentEvent[]> {
  const events: AgentEvent[] = [];
  for await (const event of gen) events.push(event);
  return events;
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'sky-agent-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('AgentLoop (§2.4.1)', () => {
  it('runs a plain text turn end-to-end', async () => {
    const { loop } = makeLoop(new MockProvider({ script: [{ text: 'Hello from the agent.' }] }), 'agent');
    const events = await collect(loop.run('hi'));
    const text = events.filter((e) => e.type === 'text-delta').map((e) => (e as any).text).join('');
    expect(text).toContain('Hello from the agent');
    expect(events.at(-1)?.type).toBe('turn-end');
  });

  it('executes a tool call, gets approval, and applies the change', async () => {
    const provider = new MockProvider({
      script: [
        { text: 'Creating the file.', toolCalls: [{ id: 'c1', name: 'write', input: { path: 'note.txt', content: 'agent was here' } }] },
        { text: 'Done — the file is created.' },
      ],
    });
    const { loop } = makeLoop(provider, 'agent', { yolo: true });
    const events = await collect(loop.run('create note.txt'));

    const toolResult = events.find((e) => e.type === 'tool-result');
    expect(toolResult && (toolResult as any).ok).toBe(true);
    expect(readFileSync(join(dir, 'note.txt'), 'utf8')).toBe('agent was here');

    const approvals = events.filter((e) => e.type === 'approval-resolved');
    expect(approvals).toHaveLength(1);
    expect((approvals[0] as any).autoApproved).toBe(true);
  });

  it('persists the conversation to the session', async () => {
    const provider = new MockProvider({ script: [{ text: 'reply' }] });
    const { loop, store, session } = makeLoop(provider, 'agent');
    await collect(loop.run('remember this'));
    const reloaded = store.load(session.id);
    expect(reloaded.messages.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(reloaded.lastTurnInterrupted).toBe(false);
  });

  it('rejects a tool call in plan mode (SKY-E-2010)', async () => {
    const provider = new MockProvider({
      script: [{ toolCalls: [{ id: 'c1', name: 'write', input: { path: 'x', content: 'y' } }] }],
    });
    const { loop } = makeLoop(provider, 'plan');
    const events = await collect(loop.run('do it'));
    const error = events.find((e) => e.type === 'error');
    expect(error && (error as any).error.code).toBe('SKY-E-2010');
  });

  it('surfaces a denied tool call without applying it', async () => {
    const provider = new MockProvider({
      script: [
        { toolCalls: [{ id: 'c1', name: 'shell', input: { command: 'rm -rf /' } }] },
        { text: 'stopping' },
      ],
    });
    // yolo still cannot bypass the hardcoded denylist.
    const { loop } = makeLoop(provider, 'agent', { yolo: true });
    const events = await collect(loop.run('destroy'));
    const result = events.find((e) => e.type === 'tool-result');
    expect(result && (result as any).ok).toBe(false);
    expect((result as any).output).toContain('Denied by policy');
  });
});
