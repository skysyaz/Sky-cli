import { ErrorCode, SkyError } from '../errors/index.js';
import type { LlmMessage, TokenLimits } from './types.js';
import { heuristicCountTokens } from './tokens.js';

export interface BuildContextOptions {
  messages: LlmMessage[];
  limits: TokenLimits;
  /** Tokens reserved for tokenizer drift (§8.6). */
  safetyMargin?: number;
  /** How many recent assistant turns are protected from trimming (default 6). */
  keepRecentTurns?: number;
  countTokens?: (messages: LlmMessage[]) => number;
}

/**
 * Assemble the message array so its token count fits the model's budget
 * (§8.6). The budget is `contextWindow - maxOutput - safetyMargin`. Messages are
 * trimmed from the lowest-priority end: the system prompt (index 0) and the
 * current user message (last) are never trimmed; older tool results are stubbed
 * first, then older assistant turns are dropped.
 */
export function buildContext(options: BuildContextOptions): LlmMessage[] {
  const { messages, limits } = options;
  const safetyMargin = options.safetyMargin ?? 2048;
  const keepRecent = options.keepRecentTurns ?? 6;
  const count = options.countTokens ?? heuristicCountTokens;

  const budget = limits.contextWindow - limits.maxOutput - safetyMargin;
  if (budget <= 0) {
    throw new SkyError(ErrorCode.ContextWindowExceeded, {});
  }

  // Work on a copy so callers keep their full history.
  const working = messages.map((m) => ({ ...m }));
  if (count(working) <= budget) return working;

  const systemIdx = working.findIndex((m) => m.role === 'system');
  const lastUserIdx = findLastIndex(working, (m) => m.role === 'user');
  const protectedFrom = Math.max(0, working.length - keepRecent * 2);

  const isProtected = (idx: number): boolean =>
    idx === systemIdx || idx === lastUserIdx || idx >= protectedFrom;

  // Pass 1: stub the content of old tool results.
  for (let i = 0; i < working.length && count(working) > budget; i++) {
    if (isProtected(i)) continue;
    if (working[i].role === 'tool' && working[i].content.length > 40) {
      const bytes = Buffer.byteLength(working[i].content);
      working[i] = { ...working[i], content: `[tool result trimmed] (${bytes} bytes)` };
    }
  }

  // Pass 2: drop the oldest non-protected messages entirely.
  const kept: LlmMessage[] = [];
  const dropped = new Set<number>();
  for (let i = 0; i < working.length && count(filter(working, dropped)) > budget; i++) {
    if (isProtected(i)) continue;
    dropped.add(i);
  }
  for (let i = 0; i < working.length; i++) {
    if (!dropped.has(i)) kept.push(working[i]);
  }

  if (count(kept) > budget) {
    throw new SkyError(ErrorCode.ContextWindowExceeded, {});
  }
  return kept;
}

function filter(messages: LlmMessage[], dropped: Set<number>): LlmMessage[] {
  return messages.filter((_, i) => !dropped.has(i));
}

function findLastIndex<T>(arr: T[], predicate: (item: T) => boolean): number {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (predicate(arr[i])) return i;
  }
  return -1;
}
