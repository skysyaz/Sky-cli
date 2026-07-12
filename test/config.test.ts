import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig, defaultConfig, getConfigKey, resolveApiKey } from '../src/config/index.js';
import { ErrorCode } from '../src/errors/index.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'sky-config-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('config precedence (§7.6)', () => {
  it('applies schema defaults', () => {
    const config = defaultConfig();
    expect(config.defaultProvider).toBe('openai');
    expect(config.tui.theme.colors.accent).toBe('cyan');
    expect(config.tools.read.deny).toContain('.env*');
  });

  it('config.json overrides defaults', () => {
    const path = join(dir, 'config.json');
    writeFileSync(path, JSON.stringify({ defaultModel: 'gpt-4o-custom' }));
    const config = loadConfig({ path, cwd: dir });
    expect(config.defaultModel).toBe('gpt-4o-custom');
  });

  it('.skyrc overrides config.json', () => {
    const path = join(dir, 'config.json');
    writeFileSync(path, JSON.stringify({ defaultModel: 'from-config' }));
    writeFileSync(join(dir, '.skyrc'), JSON.stringify({ defaultModel: 'from-skyrc' }));
    const config = loadConfig({ path, cwd: dir });
    expect(config.defaultModel).toBe('from-skyrc');
  });

  it('SKY_* env overrides .skyrc', () => {
    const path = join(dir, 'config.json');
    writeFileSync(join(dir, '.skyrc'), JSON.stringify({ defaultModel: 'from-skyrc' }));
    const config = loadConfig({ path, cwd: dir, env: { SKY_DEFAULT_MODEL: 'from-env' } });
    expect(config.defaultModel).toBe('from-env');
  });

  it('CLI flags win over everything', () => {
    const path = join(dir, 'config.json');
    writeFileSync(path, JSON.stringify({ defaultModel: 'from-config' }));
    const config = loadConfig({
      path,
      cwd: dir,
      env: { SKY_DEFAULT_MODEL: 'from-env' },
      cli: { defaultModel: 'from-flag' },
    });
    expect(config.defaultModel).toBe('from-flag');
  });

  it('rejects an invalid config with SKY-E-1003', () => {
    const path = join(dir, 'config.json');
    writeFileSync(path, JSON.stringify({ defaultProvider: 'not-a-provider' }));
    expect(() => loadConfig({ path, cwd: dir })).toThrowError(
      expect.objectContaining({ code: ErrorCode.ConfigValidationFailed }),
    );
  });

  it('reports a parse failure with SKY-E-1001', () => {
    const path = join(dir, 'config.json');
    writeFileSync(path, '{ not json');
    expect(() => loadConfig({ path, cwd: dir })).toThrowError(
      expect.objectContaining({ code: ErrorCode.ConfigParseFailed }),
    );
  });
});

describe('getConfigKey', () => {
  it('reads a dotted path', () => {
    const config = defaultConfig();
    expect(getConfigKey(config, 'tui.theme.colors.accent')).toBe('cyan');
  });
  it('throws SKY-E-1010 on a missing key', () => {
    expect(() => getConfigKey(defaultConfig(), 'nope.nope')).toThrowError(
      expect.objectContaining({ code: ErrorCode.ConfigKeyNotFound }),
    );
  });
});

describe('secret resolution (§7.7)', () => {
  it('prefers a literal apiKey', () => {
    expect(resolveApiKey('openai', { apiKey: 'sk-literal' }, undefined, {})).toBe('sk-literal');
  });
  it('reads apiKeyEnv', () => {
    expect(resolveApiKey('openai', { apiKeyEnv: 'MY_KEY' }, undefined, { MY_KEY: 'sk-env' })).toBe('sk-env');
  });
  it('falls back to the conventional SKY_PROVIDERS_X_API_KEY', () => {
    expect(resolveApiKey('openai', undefined, undefined, { SKY_PROVIDERS_OPENAI_API_KEY: 'sk-conv' })).toBe('sk-conv');
  });
  it('fails with SKY-E-1002 when nothing is set', () => {
    expect(() => resolveApiKey('openai', undefined, undefined, {})).toThrowError(
      expect.objectContaining({ code: ErrorCode.NoApiKey }),
    );
  });
  it('returns empty for ollama and mock without a key', () => {
    expect(resolveApiKey('ollama', undefined, undefined, {})).toBe('');
    expect(resolveApiKey('mock', undefined, undefined, {})).toBe('');
  });
});
