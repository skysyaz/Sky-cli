import type {
  Provider,
  StreamChunk,
  StreamRequest,
  LlmMessage,
  TokenLimits,
  LlmToolCall,
} from './types.js';
import { heuristicCountTokens } from './tokens.js';

/** A scripted turn: either streamed prose, tool calls, or both. */
export interface MockTurn {
  text?: string;
  toolCalls?: LlmToolCall[];
}

export interface MockProviderOptions {
  /** Scripted turns replayed in order. When exhausted, falls back to an echo. */
  script?: MockTurn[];
  limits?: TokenLimits;
}

/**
 * A deterministic, network-free provider used for tests, offline runs, and
 * `sky ... --provider mock`. It replays a script if given one, otherwise it
 * echoes a short acknowledgement of the last user message. This is the same
 * mechanism the E2E fixtures use (§10.4).
 */
export class MockProvider implements Provider {
  readonly name = 'mock';
  private readonly script: MockTurn[];
  private cursor = 0;
  private readonly limits: TokenLimits;

  constructor(options: MockProviderOptions = {}) {
    this.script = options.script ?? [];
    this.limits = options.limits ?? { contextWindow: 128_000, maxOutput: 4096 };
  }

  async *stream(request: StreamRequest): AsyncIterable<StreamChunk> {
    const turn = this.script[this.cursor];
    this.cursor++;

    if (turn) {
      if (turn.text) {
        for (const word of turn.text.split(/(\s+)/)) {
          if (word) yield { type: 'text-delta', text: word };
        }
      }
      if (turn.toolCalls) {
        for (const toolCall of turn.toolCalls) {
          yield { type: 'tool-call', toolCall };
        }
        yield { type: 'done', usage: this.usage(request), finishReason: 'tool_calls' };
        return;
      }
      yield { type: 'done', usage: this.usage(request), finishReason: 'stop' };
      return;
    }

    // Unscripted fallback: acknowledge the last user message.
    const lastUser = [...request.messages].reverse().find((m) => m.role === 'user');
    const reply = lastUser
      ? `Mock response: I received your message ("${truncate(lastUser.content, 60)}"). No live provider is configured, so this is a canned reply.`
      : 'Mock response: hello from the mock provider.';
    for (const word of reply.split(/(\s+)/)) {
      if (word) yield { type: 'text-delta', text: word };
    }
    yield { type: 'done', usage: this.usage(request), finishReason: 'stop' };
  }

  private usage(request: StreamRequest): { inputTokens: number; outputTokens: number } {
    return { inputTokens: heuristicCountTokens(request.messages), outputTokens: 24 };
  }

  countTokens(messages: LlmMessage[]): number {
    return heuristicCountTokens(messages);
  }

  tokenLimits(): TokenLimits {
    return this.limits;
  }
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max - 1) + '…';
}
