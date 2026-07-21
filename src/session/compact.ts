/**
 * Session history compaction — keeps long sessions usable by dropping older
 * turns and stubbing bulky tool results while preserving system prompts and
 * recent context.
 */

import type { Message } from './types.js';

export type CompactReason = 'threshold' | 'ratio' | 'overflow' | 'manual';

export interface CompactLimits {
  contextWindow: number;
  maxOutput: number;
}

export interface CompactOptions {
  /** How many recent non-system messages to keep (default 8). */
  keepRecent?: number;
  /** Stub large tool payloads in the kept window (default false). */
  stubToolResults?: boolean;
  /** Max chars kept for a stubbed tool result (default 120). */
  stubMaxChars?: number;
  reason?: CompactReason;
}

export interface CompactResult {
  messages: Message[];
  dropped: number;
  reason: CompactReason;
}

/** Rough token estimate (4 chars ≈ 1 token) — same heuristic as llm/tokens. */
export function estimateMessageTokens(messages: Message[]): number {
  let chars = 0;
  for (const message of messages) {
    chars += message.content.length;
    if (message.toolCalls) {
      for (const call of message.toolCalls) {
        chars += call.name.length + JSON.stringify(call.input).length;
      }
    }
    chars += 8;
  }
  return Math.ceil(chars / 4);
}

/** Usable input budget for a model. */
export function contextBudget(limits: CompactLimits, safetyMargin = 2048): number {
  return Math.max(0, limits.contextWindow - limits.maxOutput - safetyMargin);
}

/**
 * Whether proactive auto-compact should run before the next provider call.
 * Triggers on cumulative usage threshold OR when estimated history fills
 * `autoCompactRatio` of the model budget (whichever comes first).
 */
export function shouldAutoCompact(options: {
  messages: Message[];
  cumulativeTokens: number;
  limits: CompactLimits;
  autoCompact: boolean;
  autoCompactThreshold: number;
  autoCompactRatio: number;
}): boolean {
  if (!options.autoCompact) return false;
  const nonSystem = options.messages.filter((m) => m.role !== 'system').length;
  if (nonSystem < 6) return false;

  if (options.cumulativeTokens >= options.autoCompactThreshold) return true;

  const budget = contextBudget(options.limits);
  if (budget <= 0) return true;
  const used = estimateMessageTokens(options.messages);
  return used >= budget * options.autoCompactRatio;
}

function stubToolContent(content: string): string {
  const bytes = Buffer.byteLength(content);
  return `[tool result trimmed] (${bytes} bytes)`;
}

function maybeStubTools(messages: Message[], stub: boolean, maxChars: number): Message[] {
  if (!stub) return messages;
  return messages.map((m) => {
    if (m.role === 'tool' && m.content.length > maxChars) {
      return { ...m, content: stubToolContent(m.content) };
    }
    return m;
  });
}

/**
 * Compact a message list: keep all system messages + a short marker + the
 * most recent non-system turns. Optionally stub tool bodies in the kept window.
 */
export function compactSessionMessages(messages: Message[], options: CompactOptions = {}): CompactResult {
  const keepRecent = Math.max(2, options.keepRecent ?? 8);
  const stubMaxChars = options.stubMaxChars ?? 120;
  const reason = options.reason ?? 'manual';

  const systemKeep = messages.filter((m) => m.role === 'system');
  const nonSystem = messages.filter((m) => m.role !== 'system');

  if (nonSystem.length <= keepRecent) {
    const stubbed = maybeStubTools(messages, Boolean(options.stubToolResults), stubMaxChars);
    return { messages: stubbed, dropped: 0, reason };
  }

  const recent = nonSystem.slice(-keepRecent);
  const dropped = nonSystem.length - recent.length;
  const keptRecent = maybeStubTools(recent, Boolean(options.stubToolResults), stubMaxChars);
  const summary: Message = {
    role: 'user',
    content: `[compacted ${dropped} earlier messages to reclaim context]`,
  };

  return {
    messages: [...systemKeep, summary, ...keptRecent],
    dropped,
    reason,
  };
}

/** Progressively more aggressive keep counts for overflow retries. */
export function overflowKeepRecent(attempt: number): number {
  if (attempt <= 0) return 6;
  if (attempt === 1) return 4;
  return 2;
}
