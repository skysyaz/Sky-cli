/**
 * The provider abstraction (§8.1). This is the only module that knows about
 * vendor SDKs; the rest of Sky is vendor-agnostic. `LlmMessage` is structurally
 * identical to the session module's `Message`, so the two peer modules do not
 * import one another (§2.3).
 */

export interface LlmToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCalls?: LlmToolCall[];
  toolCallId?: string;
  name?: string;
}

/** A tool definition passed to the provider for function/tool calling. */
export interface ToolDefinition {
  name: string;
  description: string;
  /** JSON-schema parameters object. */
  parameters: Record<string, unknown>;
}

/** Token accounting returned at the end of a stream. */
export interface Usage {
  inputTokens: number;
  outputTokens: number;
}

/** A single streamed event from a provider (§5.10 / §8). */
export type StreamChunk =
  | { type: 'text-delta'; text: string }
  | { type: 'tool-call'; toolCall: LlmToolCall }
  | { type: 'done'; usage: Usage; finishReason: 'stop' | 'tool_calls' | 'length' };

export interface StreamRequest {
  messages: LlmMessage[];
  tools?: ToolDefinition[];
  model: string;
  maxOutputTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
}

/** Context-window limits for a model (§8.1). */
export interface TokenLimits {
  contextWindow: number;
  maxOutput: number;
}

/**
 * Every adapter implements this interface. It is deliberately small: streaming,
 * token counting, and the model's limits.
 */
export interface Provider {
  readonly name: string;
  stream(request: StreamRequest): AsyncIterable<StreamChunk>;
  countTokens(messages: LlmMessage[], model: string): number;
  tokenLimits(model: string): TokenLimits;
}
