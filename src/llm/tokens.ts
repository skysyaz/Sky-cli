import type { LlmMessage } from './types.js';

/**
 * A provider-agnostic heuristic token counter (4 chars ≈ 1 token, §8.5). The
 * OpenAI/Anthropic adapters can override this with their real tokenizers; the
 * heuristic is used by Ollama and as a safe default everywhere else.
 */
export function heuristicCountTokens(messages: LlmMessage[]): number {
  let chars = 0;
  for (const message of messages) {
    chars += message.content.length;
    if (message.toolCalls) {
      for (const call of message.toolCalls) {
        chars += call.name.length + JSON.stringify(call.input).length;
      }
    }
    // A small per-message overhead approximating role/format framing.
    chars += 8;
  }
  return Math.ceil(chars / 4);
}
