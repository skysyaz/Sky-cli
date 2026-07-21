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
import { clearSecret, isOpenCodeFreeModel } from '../config/secrets.js';

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
  /**
   * OpenCode Zen free-model guest auth. On 401, retry with alternate
   * Authorization strategies (some mobile networks reject `Bearer public`).
   */
  opencodeGuest?: boolean;
}

const DEFAULT_LIMITS: TokenLimits = { contextWindow: 128_000, maxOutput: 16_384 };

type GuestAuthMode = 'bearer-public' | 'no-auth';

/**
 * The OpenAI adapter (§8.3). Also backs the Ollama and OpenRouter adapters via
 * a base-URL override, since both expose OpenAI-compatible endpoints (§3.8).
 * The `openai` SDK is imported dynamically so it remains an optional dependency.
 */
export class OpenAiAdapter implements Provider {
  readonly name: string;
  private client: unknown;
  private guestAuthMode: GuestAuthMode = 'bearer-public';
  private readonly options: OpenAiAdapterOptions;

  constructor(options: OpenAiAdapterOptions) {
    this.options = options;
    this.name = options.name ?? 'openai';
  }

  private resetClient(): void {
    this.client = undefined;
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

    const guest = Boolean(this.options.opencodeGuest);
    const authMode = this.guestAuthMode;
    this.client = new OpenAI({
      apiKey: guest ? 'public' : this.options.apiKey || 'not-needed',
      baseURL: this.options.baseUrl,
      defaultHeaders: this.options.defaultHeaders,
      timeout: 120_000,
      ...(guest
        ? {
            fetch: async (url: Parameters<typeof fetch>[0], init?: RequestInit) => {
              const headers = new Headers(init?.headers);
              if (authMode === 'no-auth') {
                headers.delete('Authorization');
              } else {
                headers.set('Authorization', 'Bearer public');
              }
              return fetch(url, { ...init, headers });
            },
          }
        : {}),
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
    const guest = Boolean(this.options.opencodeGuest) || (this.name === 'opencode' && isOpenCodeFreeModel(request.model));
    const modes: GuestAuthMode[] = guest ? ['bearer-public', 'no-auth'] : ['bearer-public'];

    let lastError: unknown;
    for (let i = 0; i < modes.length; i++) {
      const mode = modes[i]!;
      if (guest) {
        this.guestAuthMode = mode;
        this.resetClient();
      }
      try {
        yield* this.streamOnce(request, { guest });
        return;
      } catch (error) {
        lastError = error;
        const status = (error as { status?: number }).status ?? (SkyError.is(error) && error.code === ErrorCode.ProviderAuthFailed ? 401 : undefined);
        const is401 =
          status === 401 || (SkyError.is(error) && error.code === ErrorCode.ProviderAuthFailed);
        if (!guest || !is401 || i === modes.length - 1) {
          if (guest && is401) {
            try {
              clearSecret('opencode');
            } catch {
              /* ignore */
            }
            throw new SkyError(
              ErrorCode.ProviderAuthFailed,
              {
                detail:
                  ' — OpenCode guest auth failed on this network. Get a free Zen key at https://opencode.ai/auth then run `/keys set opencode <key>` (or `sky keys set opencode <key>`).',
              },
              error,
            );
          }
          throw SkyError.is(error)
            ? error
            : providerErrorFromStatus(status, (error as Error).message, error);
        }
        // try next guest auth mode
      }
    }
    throw SkyError.from(lastError);
  }

  private async *streamOnce(
    request: StreamRequest,
    opts: { guest: boolean },
  ): AsyncGenerator<StreamChunk> {
    const client = await this.getClient();
    const cap = this.options.maxOutputCap;
    const maxTokens =
      request.maxOutputTokens !== undefined && cap !== undefined
        ? Math.min(request.maxOutputTokens, cap)
        : (request.maxOutputTokens ?? cap);

    let stream: AsyncIterable<any>;
    try {
      const extraHeaders: Record<string, string> = {};
      // Skip custom cache header on OpenCode — some mobile WAFs are picky.
      if (!opts.guest && this.name !== 'opencode') {
        extraHeaders['X-Sky-Prompt-Cache'] = 'ephemeral';
      }
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
        {
          ...(request.signal ? { signal: request.signal } : {}),
          ...(Object.keys(extraHeaders).length ? { headers: extraHeaders } : {}),
        },
      );
    } catch (error) {
      throw providerErrorFromStatus((error as { status?: number }).status, (error as Error).message, error);
    }

    const toolAcc = new Map<number, { id: string; name: string; args: string }>();
    let usage = { inputTokens: 0, outputTokens: 0 };
    let finish: 'stop' | 'tool_calls' | 'length' = 'stop';
    let emittedText = false;

    try {
      for await (const part of stream) {
        if (request.signal?.aborted) throw new SkyError(ErrorCode.AgentAborted, {});
        const choice = part.choices?.[0];
        const delta = choice?.delta;
        const text =
          typeof delta?.content === 'string'
            ? delta.content
            : typeof (delta as { reasoning_content?: unknown } | undefined)?.reasoning_content === 'string' &&
                !delta?.content
              ? ''
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
