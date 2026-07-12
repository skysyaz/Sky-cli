import { z } from 'zod';

/** The agent operating mode a session was started in (§4.1). */
export type Mode = 'agent' | 'plan' | 'ask';

/** Session lifecycle state (§7.3). */
export type SessionStatus = 'active' | 'paused' | 'compacted' | 'archived';

/** A single tool call requested by the assistant. */
export const toolCallSchema = z.object({
  id: z.string(),
  name: z.string(),
  input: z.record(z.unknown()),
});
export type ToolCall = z.infer<typeof toolCallSchema>;

/**
 * A conversation message. This is the persisted, canonical shape (§2.4.5). The
 * llm module defines a structurally-compatible `LlmMessage` so the two peer
 * modules need not import one another (see §2.3 dependency graph).
 */
export const messageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant', 'tool']),
  content: z.string(),
  /** Tool calls requested by an assistant message. */
  toolCalls: z.array(toolCallSchema).optional(),
  /** For a tool-result message, the id of the call it answers. */
  toolCallId: z.string().optional(),
  /** For a tool-result message, the tool name (aids provider translation). */
  name: z.string().optional(),
  /** Wall-clock time the message was appended. */
  timestamp: z.string().optional(),
});
export type Message = z.infer<typeof messageSchema>;

/** Cumulative token accounting for cost tracking (§8.9). */
export const tokenUsageSchema = z.object({
  input: z.number().int().nonnegative().default(0),
  output: z.number().int().nonnegative().default(0),
  estimatedCostUsd: z.number().nonnegative().default(0),
});
export type TokenUsage = z.infer<typeof tokenUsageSchema>;

/** A session-scoped auto-approval pattern added via an "always" decision (§9.8). */
export const allowlistEntrySchema = z.object({
  tool: z.string(),
  pattern: z.string(),
});
export type AllowlistEntry = z.infer<typeof allowlistEntrySchema>;

/** The current on-disk session schema version. */
export const CURRENT_SESSION_VERSION = 1 as const;

export const sessionSchema = z.object({
  schemaVersion: z.number().int().positive().default(CURRENT_SESSION_VERSION),
  id: z.string(),
  cwd: z.string(),
  mode: z.enum(['agent', 'plan', 'ask']),
  status: z.enum(['active', 'paused', 'compacted', 'archived']).default('active'),
  model: z.string(),
  provider: z.string(),
  started: z.string(),
  lastActivity: z.string(),
  messages: z.array(messageSchema).default([]),
  tokenUsage: tokenUsageSchema.default({}),
  sessionAllowlist: z.array(allowlistEntrySchema).default([]),
  /** Set at turn start, cleared at turn end; drives crash recovery (§11.7). */
  lastTurnInterrupted: z.boolean().default(false),
  /** Friendly name set via `/save`. */
  name: z.string().optional(),
});
export type Session = z.infer<typeof sessionSchema>;

/** One line of the append-only session index (§7.4). */
export const sessionIndexEntrySchema = z.object({
  id: z.string(),
  cwd: z.string(),
  started: z.string(),
  lastActivity: z.string(),
  mode: z.enum(['agent', 'plan', 'ask']),
  messages: z.number().int().nonnegative(),
  status: z.enum(['active', 'paused', 'compacted', 'archived']).default('paused'),
});
export type SessionIndexEntry = z.infer<typeof sessionIndexEntrySchema>;
