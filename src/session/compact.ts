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
  /**
   * Max chars kept as a prefix when stubbing a tool result (default 120).
   * Older tools beyond `protectRecentTools` are trimmed to this prefix + marker.
   */
  stubMaxChars?: number;
  /**
   * Newest tool messages to leave intact when stubbing (default 0).
   * Prevents explore→compact→forget loops mid-turn.
   */
  protectRecentTools?: number;
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
 *
 * Triggers when **current history size** (estimated tokens) hits either:
 * - `autoCompactThreshold` (absolute), or
 * - `autoCompactRatio` of the model budget
 *
 * Important: do NOT use lifetime `tokenUsage` here — that never resets after
 * compact and causes perpetual re-compact → forget → re-explore loops.
 */
export function shouldAutoCompact(options: {
  messages: Message[];
  /** Ignored for triggers (kept for callers); use history estimate instead. */
  cumulativeTokens?: number;
  limits: CompactLimits;
  autoCompact: boolean;
  autoCompactThreshold: number;
  autoCompactRatio: number;
}): boolean {
  if (!options.autoCompact) return false;
  const nonSystem = options.messages.filter((m) => m.role !== 'system').length;
  if (nonSystem < 6) return false;

  const used = estimateMessageTokens(options.messages);
  if (used >= options.autoCompactThreshold) return true;

  const budget = contextBudget(options.limits);
  if (budget <= 0) return true;
  return used >= budget * options.autoCompactRatio;
}

function stubToolContent(content: string, maxChars: number): string {
  const bytes = Buffer.byteLength(content);
  if (maxChars <= 0) return `[tool result trimmed] (${bytes} bytes)`;
  const prefix = content.slice(0, maxChars);
  return `${prefix}\n… [tool result trimmed] (${bytes} bytes total)`;
}

function maybeStubTools(
  messages: Message[],
  stub: boolean,
  maxChars: number,
  protectRecentTools: number,
): Message[] {
  if (!stub) return messages;
  const protect = Math.max(0, protectRecentTools);
  // Indices of tool messages from oldest → newest; protect the newest ones.
  const toolIdx: number[] = [];
  for (let i = 0; i < messages.length; i++) {
    if (messages[i]?.role === 'tool') toolIdx.push(i);
  }
  const protectedSet = new Set(toolIdx.slice(Math.max(0, toolIdx.length - protect)));

  return messages.map((m, i) => {
    if (m.role === 'tool' && m.content.length > maxChars && !protectedSet.has(i)) {
      return { ...m, content: stubToolContent(m.content, maxChars) };
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
  const protectRecentTools = options.protectRecentTools ?? 0;
  const reason = options.reason ?? 'manual';

  const systemKeep = messages.filter((m) => m.role === 'system');
  const nonSystem = messages.filter((m) => m.role !== 'system');

  if (nonSystem.length <= keepRecent) {
    const stubbed = maybeStubTools(
      messages,
      Boolean(options.stubToolResults),
      stubMaxChars,
      protectRecentTools,
    );
    return { messages: stubbed, dropped: 0, reason };
  }

  let start = Math.max(0, nonSystem.length - keepRecent);
  // Never start mid tool-turn: snap back to the owning assistant (or user) message.
  while (start > 0 && nonSystem[start]?.role === 'tool') start--;
  // Drop orphan tool messages if we still somehow start on tool.
  let recent = nonSystem.slice(start);
  while (recent.length > 0 && recent[0]?.role === 'tool') recent = recent.slice(1);

  const dropped = nonSystem.length - recent.length;
  if (dropped <= 0) {
    const stubbed = maybeStubTools(
      messages,
      Boolean(options.stubToolResults),
      stubMaxChars,
      protectRecentTools,
    );
    return { messages: stubbed, dropped: 0, reason };
  }

  const keptRecent = maybeStubTools(
    recent,
    Boolean(options.stubToolResults),
    stubMaxChars,
    protectRecentTools,
  );
  const summary: Message = {
    role: 'user',
    content:
      `[compacted ${dropped} earlier messages to reclaim context] ` +
      `Do not re-explore the whole repo from scratch — reuse what you already know, ` +
      `and only re-read files when a tool result was trimmed or you need fresh content.`,
  };

  return {
    messages: [...systemKeep, summary, ...keptRecent],
    dropped,
    reason,
  };
}

/**
 * Drop orphan tool messages (no preceding assistant tool_calls) that break
 * some providers after aggressive compaction.
 */
export function sanitizeToolTurns(messages: Message[]): Message[] {
  const toolCallIds = new Set<string>();
  const out: Message[] = [];
  for (const m of messages) {
    if (m.role === 'assistant' && m.toolCalls?.length) {
      for (const c of m.toolCalls) toolCallIds.add(c.id);
      out.push(m);
      continue;
    }
    if (m.role === 'tool') {
      if (m.toolCallId && toolCallIds.has(m.toolCallId)) out.push(m);
      continue;
    }
    out.push(m);
  }
  return out;
}

/** Progressively more aggressive keep counts for overflow retries. */
export function overflowKeepRecent(attempt: number): number {
  if (attempt <= 0) return 12;
  if (attempt === 1) return 6;
  return 3;
}

/** Default keep window for proactive (threshold/ratio) auto-compact. */
export const AUTO_COMPACT_KEEP_RECENT = 24;

/** Newest tool results left intact during proactive auto-compact. */
export const AUTO_COMPACT_PROTECT_TOOLS = 8;

/** Prefix length when stubbing older tool payloads during auto-compact. */
export const AUTO_COMPACT_STUB_CHARS = 1500;
