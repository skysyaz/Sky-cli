import { describe, it, expect } from 'vitest';
import { withRetry } from '../src/llm/retry.js';
import { buildContext } from '../src/llm/context.js';
import { MockProvider } from '../src/llm/mock.js';
import { estimateCost } from '../src/llm/cost.js';
import { heuristicCountTokens } from '../src/llm/tokens.js';
import { ErrorCode, SkyError } from '../src/errors/index.js';
import type { LlmMessage, StreamChunk } from '../src/llm/types.js';

const noSleep = async () => {};

describe('withRetry (§8.7)', () => {
  it('retries a retryable error then succeeds', async () => {
    let attempts = 0;
    const result = await withRetry(
      async () => {
        attempts++;
        if (attempts < 3) throw new SkyError(ErrorCode.ProviderRateLimited);
        return 'ok';
      },
      { sleep: noSleep },
    );
    expect(result).toBe('ok');
    expect(attempts).toBe(3);
  });

  it('does not retry a non-retryable error', async () => {
    let attempts = 0;
    await expect(
      withRetry(
        async () => {
          attempts++;
          throw new SkyError(ErrorCode.ProviderAuthFailed);
        },
        { sleep: noSleep },
      ),
    ).rejects.toMatchObject({ code: ErrorCode.ProviderAuthFailed });
    expect(attempts).toBe(1);
  });

  it('gives up after the retry budget', async () => {
    let attempts = 0;
    await expect(
      withRetry(
        async () => {
          attempts++;
          throw new SkyError(ErrorCode.ProviderUnavailable);
        },
        { retries: 2, sleep: noSleep },
      ),
    ).rejects.toBeInstanceOf(SkyError);
    expect(attempts).toBe(3);
  });
});

describe('buildContext (§8.6)', () => {
  it('returns messages unchanged when under budget', () => {
    const messages: LlmMessage[] = [
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'hi' },
    ];
    expect(buildContext({ messages, limits: { contextWindow: 4000, maxOutput: 100 } })).toHaveLength(2);
  });

  it('never trims the system prompt or the last user message', () => {
    const big = 'x'.repeat(4000);
    const messages: LlmMessage[] = [
      { role: 'system', content: 'SYSTEM' },
      { role: 'assistant', content: big },
      { role: 'tool', content: big, toolCallId: 't' },
      { role: 'user', content: 'CURRENT' },
    ];
    const limits = { contextWindow: 600, maxOutput: 100 };
    const result = buildContext({ messages, limits, safetyMargin: 10, keepRecentTurns: 0 });
    expect(result[0].content).toBe('SYSTEM');
    expect(result[result.length - 1].content).toBe('CURRENT');
    expect(heuristicCountTokens(result)).toBeLessThanOrEqual(limits.contextWindow - limits.maxOutput - 10);
  });

  it('throws when the budget is impossibly small', () => {
    expect(() => buildContext({ messages: [], limits: { contextWindow: 50, maxOutput: 100 } })).toThrowError(
      expect.objectContaining({ code: ErrorCode.ContextWindowExceeded }),
    );
  });
});

describe('MockProvider', () => {
  it('replays a scripted turn with a tool call', async () => {
    const provider = new MockProvider({
      script: [{ text: 'working', toolCalls: [{ id: 'c1', name: 'read', input: { path: 'a' } }] }],
    });
    const chunks: StreamChunk[] = [];
    for await (const chunk of provider.stream({ messages: [{ role: 'user', content: 'go' }], model: 'm' })) {
      chunks.push(chunk);
    }
    expect(chunks.some((c) => c.type === 'tool-call')).toBe(true);
    const done = chunks.find((c) => c.type === 'done');
    expect(done && done.type === 'done' && done.finishReason).toBe('tool_calls');
  });

  it('echoes when unscripted', async () => {
    const provider = new MockProvider();
    let text = '';
    for await (const chunk of provider.stream({ messages: [{ role: 'user', content: 'hi there' }], model: 'm' })) {
      if (chunk.type === 'text-delta') text += chunk.text;
    }
    expect(text).toContain('hi there');
  });
});

describe('cost estimation (§8.9)', () => {
  it('prices a known model', () => {
    const cost = estimateCost('gpt-4o', { inputTokens: 1_000_000, outputTokens: 1_000_000 });
    expect(cost).toBeCloseTo(12.5, 5);
  });
  it('returns zero for an unknown model', () => {
    expect(estimateCost('mystery', { inputTokens: 100, outputTokens: 100 })).toBe(0);
  });
});

describe('createProvider web + custom', () => {
  it('builds qwen-web / zai-web / kimi-web adapters', async () => {
    const { createProvider } = await import('../src/llm/registry.js');
    const { defaultConfig } = await import('../src/config/index.js');
    const config = defaultConfig();
    const env = {
      DASHSCOPE_API_KEY: 'sk-qwen',
      ZAI_API_KEY: 'sk-zai',
      MOONSHOT_API_KEY: 'sk-kimi',
    };
    expect(createProvider({ config, provider: 'qwen-web', env }).name).toBe('qwen-web');
    expect(createProvider({ config, provider: 'zai-web', env }).name).toBe('zai-web');
    expect(createProvider({ config, provider: 'kimi-web', env }).name).toBe('kimi-web');
  });

  it('requires baseUrl for custom', async () => {
    const { createProvider } = await import('../src/llm/registry.js');
    const { defaultConfig } = await import('../src/config/index.js');
    expect(() => createProvider({ config: defaultConfig(), provider: 'custom', env: {} })).toThrowError(
      expect.objectContaining({ code: ErrorCode.UnknownProvider }),
    );
    const config = defaultConfig();
    config.providers.custom = { baseUrl: 'https://llm.example.com/v1' };
    expect(
      createProvider({ config, provider: 'custom', env: { SKY_CUSTOM_API_KEY: 'sk' } }).name,
    ).toBe('custom');
  });
});
