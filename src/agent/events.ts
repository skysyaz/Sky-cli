import type { ToolCall } from '../session/types.js';
import type { Usage } from '../llm/types.js';
import type { SkyError } from '../errors/index.js';

/**
 * The discriminated union of events the agent loop yields (§2.4.1). The TUI and
 * the headless JSON renderer both consume this same stream — the only
 * difference is whether it is rendered or serialized (§5.10).
 */
export type AgentEvent =
  | { type: 'turn-start'; mode: string; model: string; provider: string }
  | { type: 'text-delta'; text: string }
  | { type: 'tool-call'; toolCall: ToolCall }
  | { type: 'approval-request'; toolCall: ToolCall; reason: string }
  | { type: 'approval-resolved'; toolCallId: string; granted: boolean; autoApproved: boolean }
  | { type: 'tool-result'; toolCallId: string; toolName: string; ok: boolean; output: string }
  | { type: 'usage'; usage: Usage; estimatedCostUsd: number }
  | { type: 'turn-end'; finishReason: string }
  | { type: 'error'; error: SkyError };
