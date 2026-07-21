import { ErrorCode, SkyError } from '../errors/index.js';
import type {
  Provider,
  StreamChunk,
  StreamRequest,
  LlmMessage,
  TokenLimits,
  ToolDefinition,
} from './types.js';
import { heuristicCountTokens } from './tokens.js';
import { providerErrorFromStatus } from './errors.js';

export interface OpenAiAdapterOptions {
  apiKey: string;
  baseUrl?: string;
  /** OpenRouter requires an HTTP-Referer header (§3.8). */
  defaultHeaders?: Record<string, string>;
  /** Feature flags Ollama does not support are disabled by the caller. */
  includeUsage?: boolean;
  name?: string;
  limits?: Record<string, TokenLimits>;
  /** Cap max_tokens for gateways that stall / interrupt on huge budgets. */
  maxOutputCap?: number;
}

const DEFAULT_LIMITS: TokenLimits = { contextWindow: 128_000, maxOutput: 16_384 };

/**
 * The OpenAI adapter (§8.3). Also backs the Ollama and OpenRouter adapters via
 * a base-URL override, since both expose OpenAI-compatible endpoints (§3.8).
 * The `openai` SDK is imported dynamically so it remains an optional dependency.
 */
export class OpenAiAdapter implements Provider {
  readonly name: string;
  private client: unknown;
  private readonly options: OpenAiAdapterOptions;

  constructor(options: OpenAiAdapterOptions) {
    this.options = options;
    this.name = options.name ?? 'openai';
  }

  private async getClient(): Promise<any> {
    if (this.client) return this.client;
    let OpenAI: any;
    try {
      ({ default: OpenAI } = await import('openai'));
    } catch (cause) {
      throw new SkyError(
        ErrorCode.ProviderRequestFailed,
        { detail: 'the `openai` package is not installed; run `npm install openai`' },
        cause,
      );
    }
    this.client = new OpenAI({
      apiKey: this.options.apiKey || 'not-needed',
      baseURL: this.options.baseUrl,
      defaultHeaders: this.options.defaultHeaders,
      // Mobile / flaky networks (Termux) benefit from a longer idle timeout.
      timeout: 120_000,
    });
    return this.client;
  }

  private toOpenAiMessages(messages: LlmMessage[]): unknown[] {
    return messages.map((m) => {
      if (m.role === 'tool') {
        return { role: 'tool', tool_call_id: m.toolCallId, content: m.content };
      }
      if (m.role === 'assistant' && m.toolCalls?.length) {
        return {
          role: 'assistant',
          content: m.content || null,
          tool_calls: m.toolCalls.map((tc) => ({
            id: tc.id,
            type: 'function',
            function: { name: tc.name, arguments: JSON.stringify(tc.input) },
          })),
        };
      }
      return { role: m.role, content: m.content };
    });
  }

  private toOpenAiTools(tools: ToolDefinition[] | undefined): unknown[] | undefined {
    if (!tools?.length) return undefined;
    return tools.map((t) => ({
      type: 'function',
      function: { name: t.name, description: t.description, parameters: t.parameters },
    }));
  }

  async *stream(request: StreamRequest): AsyncIterable<StreamChunk> {
    const client = await this.getClient();
    const cap = this.options.maxOutputCap;
    const maxTokens =
      request.maxOutputTokens !== undefined && cap !== undefined
        ? Math.min(request.maxOutputTokens, cap)
        : (request.maxOutputTokens ?? cap);

    let stream: AsyncIterable<any>;
    try {
      stream = await client.chat.completions.create(
        {
          model: request.model,
          messages: this.toOpenAiMessages(request.messages),
          tools: this.toOpenAiTools(request.tools),
          max_tokens: maxTokens,
          temperature: request.temperature,
          stream: true,
          ...(this.options.includeUsage === false ? {} : { stream_options: { include_usage: true } }),
        },
        request.signal ? { signal: request.signal } : undefined,
      );
    } catch (error) {
      throw providerErrorFromStatus((error as { status?: number }).status, (error as Error).message, error);
    }

    // Accumulate streamed tool-call fragments keyed by index.
    const toolAcc = new Map<number, { id: string; name: string; args: string }>();
    let usage = { inputTokens: 0, outputTokens: 0 };
    let finish: 'stop' | 'tool_calls' | 'length' = 'stop';
    let emittedText = false;

    try {
      for await (const part of stream) {
        if (request.signal?.aborted) throw new SkyError(ErrorCode.AgentAborted, {});
        const choice = part.choices?.[0];
        const delta = choice?.delta;
        // Some gateways (OpenCode Zen free models) stream `content: null` while
        // emitting `reasoning_content`. Only yield real string content.
        const text =
          typeof delta?.content === 'string'
            ? delta.content
            : typeof (delta as { reasoning_content?: unknown } | undefined)?.reasoning_content === 'string' &&
                !delta?.content
              ? '' // ignore reasoning tokens for the user-visible stream
              : undefined;
        if (text) {
          emittedText = true;
          yield { type: 'text-delta', text };
        }
        if (delta?.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index ?? 0;
            const acc = toolAcc.get(idx) ?? { id: tc.id ?? `call_${idx}`, name: '', args: '' };
            if (tc.id) acc.id = tc.id;
            if (tc.function?.name) acc.name = tc.function.name;
            if (tc.function?.arguments) acc.args += tc.function.arguments;
            toolAcc.set(idx, acc);
          }
        }
        if (choice?.finish_reason) {
          finish = choice.finish_reason === 'tool_calls' ? 'tool_calls' : choice.finish_reason === 'length' ? 'length' : 'stop';
        }
        if (part.usage) {
          usage = { inputTokens: part.usage.prompt_tokens ?? 0, outputTokens: part.usage.completion_tokens ?? 0 };
        }
      }
    } catch (error) {
      if (SkyError.is(error)) throw error;
      // Mobile / flaky networks often drop Mid-stream after partial text
      // (especially OpenCode free models that reason for a long time). Prefer
      // returning what we have over a hard SKY-E-5020 when content already landed.
      if (emittedText || toolAcc.size > 0) {
        for (const acc of toolAcc.values()) {
          let input: Record<string, unknown> = {};
          try {
            input = acc.args ? (JSON.parse(acc.args) as Record<string, unknown>) : {};
          } catch {
            input = {};
          }
          yield { type: 'tool-call', toolCall: { id: acc.id, name: acc.name, input } };
        }
        yield { type: 'done', usage, finishReason: toolAcc.size > 0 ? 'tool_calls' : finish };
        return;
      }
      throw new SkyError(
        ErrorCode.ProviderStreamInterrupted,
        { detail: (error as Error).message ? `: ${(error as Error).message}` : '' },
        error,
      );
    }

    for (const acc of toolAcc.values()) {
      let input: Record<string, unknown> = {};
      try {
        input = acc.args ? (JSON.parse(acc.args) as Record<string, unknown>) : {};
      } catch (error) {
        throw new SkyError(ErrorCode.ProviderStreamParse, { detail: `bad tool args: ${(error as Error).message}` }, error);
      }
      yield { type: 'tool-call', toolCall: { id: acc.id, name: acc.name, input } };
    }

    yield { type: 'done', usage, finishReason: toolAcc.size > 0 ? 'tool_calls' : finish };
  }

  countTokens(messages: LlmMessage[]): number {
    // A real build swaps in tiktoken (cl100k); the heuristic is a safe default.
    return heuristicCountTokens(messages);
  }

  tokenLimits(model: string): TokenLimits {
    const base = this.options.limits?.[model] ?? DEFAULT_LIMITS;
    if (this.options.maxOutputCap !== undefined) {
      return { ...base, maxOutput: Math.min(base.maxOutput, this.options.maxOutputCap) };
    }
    return base;
  }
}
