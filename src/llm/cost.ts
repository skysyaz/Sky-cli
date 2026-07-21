import type { Usage } from './types.js';

/** Published per-model pricing in $/Mtok (§8.9). */
export const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  // OpenAI
  'gpt-4o': { input: 2.5, output: 10.0 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'gpt-4.1': { input: 2.0, output: 8.0 },
  'gpt-4.1-mini': { input: 0.4, output: 1.6 },
  'gpt-4.1-nano': { input: 0.1, output: 0.4 },
  'o4-mini': { input: 1.1, output: 4.4 },
  'o3-mini': { input: 1.1, output: 4.4 },
  // Anthropic
  'claude-3-5-sonnet': { input: 3.0, output: 15.0 },
  'claude-3-haiku': { input: 0.25, output: 1.25 },
  'claude-sonnet-4-5': { input: 3.0, output: 15.0 },
  'claude-opus-4-5': { input: 15.0, output: 75.0 },
  'claude-haiku-4-5': { input: 1.0, output: 5.0 },
  'claude-3.5-sonnet': { input: 3.0, output: 15.0 },
  // Google
  'gemini-2.0-flash': { input: 0.1, output: 0.4 },
  'gemini-2.5-flash': { input: 0.15, output: 0.6 },
  'gemini-2.5-pro': { input: 1.25, output: 10.0 },
  // DeepSeek
  'deepseek-chat': { input: 0.28, output: 0.42 },
  'deepseek-reasoner': { input: 0.55, output: 2.19 },
  'deepseek-v4-flash': { input: 0.14, output: 0.28 },
  'deepseek-v4-pro': { input: 0.55, output: 2.19 },
  'deepseek-v4-flash-free': { input: 0, output: 0 },
  // Groq / Llama
  'llama-3.3-70b-versatile': { input: 0.59, output: 0.79 },
  'llama-3.1-8b-instant': { input: 0.05, output: 0.08 },
  // OpenRouter / Zenmux style ids (bare names also match via lookup)
  'openai/gpt-4o': { input: 2.5, output: 10.0 },
  'anthropic/claude-3.5-sonnet': { input: 3.0, output: 15.0 },
  'x-ai/grok-4.5-free': { input: 0, output: 0 },
};

/**
 * Resolve pricing for a model id, including provider-prefixed ids
 * (`openai/gpt-4o`) and common version suffixes.
 */
export function lookupPricing(model: string): { input: number; output: number } | undefined {
  if (MODEL_PRICING[model]) return MODEL_PRICING[model];
  const bare = model.includes('/') ? model.slice(model.lastIndexOf('/') + 1) : model;
  if (MODEL_PRICING[bare]) return MODEL_PRICING[bare];

  // Longest-prefix match so `claude-3-5-sonnet-20241022` → claude-3-5-sonnet.
  let best: { input: number; output: number } | undefined;
  let bestLen = 0;
  for (const [key, pricing] of Object.entries(MODEL_PRICING)) {
    if (bare.startsWith(key) && key.length > bestLen) {
      best = pricing;
      bestLen = key.length;
    }
  }
  return best;
}

/** Estimate the USD cost of a single request's token usage. */
export function estimateCost(model: string, usage: Usage): number {
  const pricing = lookupPricing(model);
  if (!pricing) return 0;
  return (usage.inputTokens * pricing.input + usage.outputTokens * pricing.output) / 1_000_000;
}
