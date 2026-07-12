import type { Usage } from './types.js';

/** Published per-model pricing in $/Mtok (§8.9). Unknown models cost nothing. */
export const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'gpt-4o': { input: 2.5, output: 10.0 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'claude-3-5-sonnet': { input: 3.0, output: 15.0 },
  'claude-3-haiku': { input: 0.25, output: 1.25 },
};

/** Estimate the USD cost of a single request's token usage. */
export function estimateCost(model: string, usage: Usage): number {
  const pricing = MODEL_PRICING[model];
  if (!pricing) return 0;
  return (usage.inputTokens * pricing.input + usage.outputTokens * pricing.output) / 1_000_000;
}
