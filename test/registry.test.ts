import { describe, it, expect } from 'vitest';
import { createProvider } from '../src/llm/registry.js';
import { defaultConfig } from '../src/config/index.js';
import { ErrorCode } from '../src/errors/index.js';

const config = defaultConfig();

describe('provider registry (§8.2)', () => {
  it('creates the local ollama provider without a key', () => {
    const provider = createProvider({ config, provider: 'ollama', env: {} });
    expect(provider.name).toBe('ollama');
  });

  it('creates the mock provider', () => {
    expect(createProvider({ config, provider: 'mock' }).name).toBe('mock');
  });

  it('creates ollama-cloud when a key is present', () => {
    const provider = createProvider({
      config,
      provider: 'ollama-cloud',
      env: { SKY_PROVIDERS_OLLAMA_CLOUD_API_KEY: 'sk-test' },
    });
    expect(provider.name).toBe('ollama-cloud');
  });

  it('creates zenmux when a key is present', () => {
    const provider = createProvider({
      config,
      provider: 'zenmux',
      env: { ZENMUX_API_KEY: 'sk-test', SKY_PROVIDERS_ZENMUX_API_KEY: 'sk-test' },
    });
    expect(provider.name).toBe('zenmux');
  });

  it('fails with SKY-E-1002 when a hosted provider has no key', () => {
    expect(() => createProvider({ config, provider: 'ollama-cloud', env: {} })).toThrowError(
      expect.objectContaining({ code: ErrorCode.NoApiKey }),
    );
    expect(() => createProvider({ config, provider: 'zenmux', env: {} })).toThrowError(
      expect.objectContaining({ code: ErrorCode.NoApiKey }),
    );
  });

  it('rejects an unknown provider with SKY-E-1004', () => {
    expect(() => createProvider({ config, provider: 'nope', env: {} })).toThrowError(
      expect.objectContaining({ code: ErrorCode.UnknownProvider }),
    );
  });
});
