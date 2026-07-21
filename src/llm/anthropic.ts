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

export interface AnthropicAdapterOptions {
  apiKey: string;
  baseUrl?: string;
  limits?: Record<string, TokenLimits>;
}

const DEFAULT_LIMITS: TokenLimits = { contextWindow: 200_000, maxOutput: 8192 };

/**
 * The Anthropic adapter (§8.4). Anthropic's messages API differs from OpenAI's:
 * the system prompt is passed out-of-band, tool calls arrive as `tool_use`
 * content blocks, and tool results are `tool_result` blocks inside a user
 * message. The `@anthropic-ai/sdk` package is imported dynamically.
 */
export class AnthropicAdapter implements Provider {
  readonly name = 'anthropic';
  private client: unknown;
  private readonly options: AnthropicAdapterOptions;

  constructor(options: AnthropicAdapterOptions) {
    this.options = options;
  }

  private async getClient(): Promise<any> {
    if (this.client) return this.client;
    let Anthropic: any;
    try {
      ({ default: Anthropic } = await import('@anthropic-ai/sdk'));
    } catch (cause) {
      throw new SkyError(
        ErrorCode.ProviderRequestFailed,
        { detail: 'the `@anthropic-ai/sdk` package is not installed; run `npm install @anthropic-ai/sdk`' },
        cause,
      );
    }
    this.client = new Anthropic({ apiKey: this.options.apiKey, baseURL: this.options.baseUrl });
    return this.client;
  }

  /** Split out the system prompt and translate messages into Anthropic blocks. */
  private translate(messages: LlmMessage[]): { system: string; messages: unknown[] } {
    const system = messages
      .filter((m) => m.role === 'system')
      .map((m) => m.content)
      .join('\n\n');

    const out: unknown[] = [];
    for (const m of messages) {
      if (m.role === 'system') continue;
      if (m.role === 'tool') {
        const block = { type: 'tool_result', tool_use_id: m.toolCallId, content: m.content };
        // Anthropic requires alternating roles — merge consecutive tool results
        // into a single user message with multiple tool_result blocks.
        const prev = out[out.length - 1] as { role?: string; content?: unknown } | undefined;
        if (prev && prev.role === 'user' && Array.isArray(prev.content)) {
          (prev.content as unknown[]).push(block);
        } else {
          out.push({ role: 'user', content: [block] });
        }
        continue;
      }
      if (m.role === 'assistant' && m.toolCalls?.length) {
        const content: unknown[] = [];
        if (m.content) content.push({ type: 'text', text: m.content });
        for (const tc of m.toolCalls) {
          content.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.input });
        }
        out.push({ role: 'assistant', content });
        continue;
      }
      out.push({ role: m.role, content: m.content });
    }
    return { system, messages: out };
  }

  private toAnthropicTools(tools: ToolDefinition[] | undefined): unknown[] | undefined {
    if (!tools?.length) return undefined;
    return tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters }));
  }

  async *stream(request: StreamRequest): AsyncIterable<StreamChunk> {
    const client = await this.getClient();
    const { system, messages } = this.translate(request.messages);

    let stream: any;
    try {
      stream = await client.messages.stream({
        model: request.model,
        system: system || undefined,
        messages,
        tools: this.toAnthropicTools(request.tools),
        max_tokens: request.maxOutputTokens ?? DEFAULT_LIMITS.maxOutput,
        temperature: request.temperature,
      });
    } catch (error) {
      throw providerErrorFromStatus((error as { status?: number }).status, (error as Error).message, error);
    }

    const toolAcc = new Map<number, { id: string; name: string; json: string }>();
    let usage = { inputTokens: 0, outputTokens: 0 };

    try {
      for await (const event of stream) {
        if (request.signal?.aborted) throw new SkyError(ErrorCode.AgentAborted, {});
        if (event.type === 'content_block_start' && event.content_block?.type === 'tool_use') {
          toolAcc.set(event.index, { id: event.content_block.id, name: event.content_block.name, json: '' });
        } else if (event.type === 'content_block_delta') {
          if (event.delta?.type === 'text_delta') {
            yield { type: 'text-delta', text: event.delta.text };
          } else if (event.delta?.type === 'input_json_delta') {
            const acc = toolAcc.get(event.index);
            if (acc) acc.json += event.delta.partial_json;
          }
        } else if (event.type === 'message_delta' && event.usage) {
          usage.outputTokens = event.usage.output_tokens ?? usage.outputTokens;
        } else if (event.type === 'message_start' && event.message?.usage) {
          usage.inputTokens = event.message.usage.input_tokens ?? 0;
        }
      }
    } catch (error) {
      if (SkyError.is(error)) throw error;
      throw new SkyError(ErrorCode.ProviderStreamInterrupted, {}, error);
    }

    for (const acc of toolAcc.values()) {
      let input: Record<string, unknown> = {};
      try {
        input = acc.json ? (JSON.parse(acc.json) as Record<string, unknown>) : {};
      } catch (error) {
        throw new SkyError(ErrorCode.ProviderStreamParse, { detail: (error as Error).message }, error);
      }
      yield { type: 'tool-call', toolCall: { id: acc.id, name: acc.name, input } };
    }

    yield { type: 'done', usage, finishReason: toolAcc.size > 0 ? 'tool_calls' : 'stop' };
  }

  countTokens(messages: LlmMessage[]): number {
    return heuristicCountTokens(messages);
  }

  tokenLimits(model: string): TokenLimits {
    return this.options.limits?.[model] ?? DEFAULT_LIMITS;
  }
}
