import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  compactSessionMessages,
  shouldAutoCompact,
  estimateMessageTokens,
  contextBudget,
  overflowKeepRecent,
} from '../src/session/compact.js';
import type { Message } from '../src/session/types.js';
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
import { ErrorCode } from '../src/errors/index.js';
import type { TokenLimits } from '../src/llm/types.js';

describe('session compact helpers', () => {
  it('estimates tokens and budget', () => {
    const messages: Message[] = [
      { role: 'user', content: 'abcd'.repeat(100) },
    ];
    expect(estimateMessageTokens(messages)).toBeGreaterThan(50);
    expect(contextBudget({ contextWindow: 8000, maxOutput: 2000 }, 1000)).toBe(5000);
  });

  it('keeps system + recent messages and drops the middle', () => {
    const messages: Message[] = [
      { role: 'system', content: 'sys' },
      ...Array.from({ length: 20 }, (_, i) => ({
        role: (i % 2 === 0 ? 'user' : 'assistant') as Message['role'],
        content: `msg-${i}`,
      })),
    ];
    const result = compactSessionMessages(messages, { keepRecent: 6, reason: 'manual' });
    expect(result.dropped).toBe(14);
    expect(result.messages[0]?.role).toBe('system');
    expect(result.messages[1]?.content).toContain('compacted 14');
    expect(result.messages.length).toBe(1 + 1 + 6); // system + marker + 6
  });

  it('stubs large tool results when asked', () => {
    const messages: Message[] = [
      { role: 'user', content: 'hi' },
      { role: 'tool', content: 'x'.repeat(5000), toolCallId: 't1', name: 'shell' },
      { role: 'assistant', content: 'done' },
    ];
    const result = compactSessionMessages(messages, {
      keepRecent: 8,
      stubToolResults: true,
      reason: 'ratio',
    });
    const tool = result.messages.find((m) => m.role === 'tool');
    expect(tool?.content).toContain('tool result trimmed');
    expect(tool!.content.length).toBeLessThan(80);
  });

  it('triggers auto-compact on ratio even below cumulative threshold', () => {
    const big = 'y'.repeat(4000);
    const messages: Message[] = Array.from({ length: 8 }, (_, i) => ({
      role: (i % 2 === 0 ? 'user' : 'assistant') as Message['role'],
      content: big,
    }));
    expect(
      shouldAutoCompact({
        messages,
        cumulativeTokens: 100,
        limits: { contextWindow: 4000, maxOutput: 500 },
        autoCompact: true,
        autoCompactThreshold: 50_000,
        autoCompactRatio: 0.55,
      }),
    ).toBe(true);
  });

  it('does not auto-compact short histories', () => {
    expect(
      shouldAutoCompact({
        messages: [
          { role: 'user', content: 'a' },
          { role: 'assistant', content: 'b' },
        ],
        cumulativeTokens: 99_000,
        limits: { contextWindow: 128_000, maxOutput: 4096 },
        autoCompact: true,
        autoCompactThreshold: 30_000,
        autoCompactRatio: 0.55,
      }),
    ).toBe(false);
  });

  it('overflow keep counts get smaller', () => {
    expect(overflowKeepRecent(0)).toBe(6);
    expect(overflowKeepRecent(1)).toBe(4);
    expect(overflowKeepRecent(2)).toBe(2);
  });
});

/** Provider with a small context window so fat history overflows without compact. */
class TinyContextProvider extends MockProvider {
  constructor() {
    super({
      limits: { contextWindow: 8_000, maxOutput: 1_000 } satisfies TokenLimits,
      script: [{ text: 'ok after compact' }],
    });
  }
}

describe('AgentLoop auto-compact on overflow', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'sky-compact-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('compacts and continues when history would overflow the window', async () => {
    const config = defaultConfig();
    config.sessions.autoCompact = true;
    config.sessions.autoCompactRatio = 0.3;
    config.sessions.autoCompactThreshold = 999_999;

    const store = new SessionStore({
      dir: join(dir, 'sessions'),
      indexPath: join(dir, 'sessions.index'),
    });
    const session = store.create({ mode: 'ask', cwd: dir, provider: 'mock', model: 'mock-1' });
    // Pad history with bulky turns so buildContext would fail without compact.
    for (let i = 0; i < 30; i++) {
      session.messages.push({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: 'z'.repeat(800),
      });
    }
    store.save(session);

    const provider = new TinyContextProvider();
    const policy = new Policy(config, session.sessionAllowlist);
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
    for await (const event of loop.run('what next?')) events.push(event);

    const compacted = events.filter((e) => e.type === 'session-compacted');
    expect(compacted.length).toBeGreaterThan(0);
    expect(events.some((e) => e.type === 'error' && e.error.code === ErrorCode.ContextWindowExceeded)).toBe(
      false,
    );
    expect(events.some((e) => e.type === 'turn-end')).toBe(true);
    expect(session.messages.length).toBeLessThan(32);
  });

  it('emits session-compacted when cumulative threshold is hit', async () => {
    const config = defaultConfig();
    config.sessions.autoCompact = true;
    config.sessions.autoCompactThreshold = 50;
    config.sessions.autoCompactRatio = 0.99;

    const store = new SessionStore({
      dir: join(dir, 'sessions'),
      indexPath: join(dir, 'sessions.index'),
    });
    const session = store.create({ mode: 'ask', cwd: dir, provider: 'mock', model: 'mock-1' });
    session.tokenUsage.input = 40;
    session.tokenUsage.output = 20;
    for (let i = 0; i < 12; i++) {
      session.messages.push({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `turn-${i}`,
      });
    }
    store.save(session);

    const provider = new MockProvider({
      script: [{ text: 'hi' }],
    });
    const policy = new Policy(config, session.sessionAllowlist);
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
    for await (const event of loop.run('hello')) events.push(event);

    expect(events.some((e) => e.type === 'session-compacted' && e.reason === 'threshold')).toBe(true);
  });
});
