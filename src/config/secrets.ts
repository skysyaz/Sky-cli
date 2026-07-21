import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { ErrorCode, SkyError } from '../errors/index.js';
import type { Logger } from '../logging/index.js';
import { skyHome } from './paths.js';
import type { ProviderConfig } from './schema.js';

/**
 * Resolve a provider's API key following the precedence in §7.7:
 *   1. `providers.X.apiKey` literal (discouraged; logged as a warning)
 *   2. env var named by `providers.X.apiKeyEnv`
 *   3. secrets file `~/.sky/secrets.json` (mode 0600)
 *   4. `SKY_PROVIDERS_X_API_KEY` env var
 *   5. conventional provider env (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, …)
 *   6. OpenCode Zen guest token `"public"` (free models only; no account needed)
 *   7. otherwise fail with SKY-E-1002
 *
 * `mock` and local `ollama` never require a key. OpenCode Zen free models work
 * with the public guest token; set `OPENCODE_API_KEY` for paid Zen models.
 */
export function resolveApiKey(
  providerName: string,
  providerConfig: ProviderConfig | undefined,
  logger?: Logger,
  env: NodeJS.ProcessEnv = process.env,
): string {
  if (providerName === 'mock' || providerName === 'ollama') return '';

  if (providerConfig?.apiKey) {
    logger?.warn('config.apiKey.literal', {
      provider: providerName,
      hint: 'Prefer apiKeyEnv or /key (secrets file) over a literal apiKey in config.json',
    });
    return providerConfig.apiKey;
  }

  if (providerConfig?.apiKeyEnv) {
    const fromEnv = env[providerConfig.apiKeyEnv];
    if (fromEnv) return fromEnv;
  }

  const fromSecrets = readSecret(providerName);
  if (fromSecrets) return fromSecrets;

  // Normalize non-alphanumeric characters (e.g. the hyphen in `ollama-cloud`)
  // to underscores so the conventional env-var name is valid.
  const envName = providerName.toUpperCase().replace(/[^A-Z0-9]/g, '_');
  const conventional = env[`SKY_PROVIDERS_${envName}_API_KEY`];
  if (conventional) return conventional;

  const wellKnown = WELL_KNOWN_ENV[providerName];
  if (wellKnown && env[wellKnown]) return env[wellKnown]!;

  // OpenCode Zen free models (e.g. deepseek-v4-flash-free) accept the public
  // guest token with no account. Paid models still need OPENCODE_API_KEY.
  if (providerName === 'opencode') {
    logger?.info('config.apiKey.opencodePublic', {
      hint: 'Using OpenCode Zen public guest token for free models. Set OPENCODE_API_KEY (or /key) for paid models.',
    });
    return 'public';
  }

  throw new SkyError(ErrorCode.NoApiKey, { name: providerName });
}

/** Common provider → env var names users already export. */
const WELL_KNOWN_ENV: Record<string, string> = {
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
  zenmux: 'ZENMUX_API_KEY',
  'ollama-cloud': 'OLLAMA_API_KEY',
  opencode: 'OPENCODE_API_KEY',
  gemini: 'GEMINI_API_KEY',
  deepseek: 'DEEPSEEK_API_KEY',
  groq: 'GROQ_API_KEY',
};

/** Path to the chmod-0600 secrets file (never world-readable). */
export function secretsPath(): string {
  return process.env.SKY_SECRETS ?? join(skyHome(), 'secrets.json');
}

/** Read a single provider key from the secrets file. */
export function readSecret(providerName: string): string | undefined {
  const path = secretsPath();
  if (!existsSync(path)) return undefined;
  try {
    const data = JSON.parse(readFileSync(path, 'utf8')) as Record<string, string>;
    const value = data[providerName];
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Persist an API key to `~/.sky/secrets.json` with mode 0600.
 * Prefer this over writing `apiKey` into config.json.
 */
export function writeSecret(providerName: string, apiKey: string): void {
  const path = secretsPath();
  mkdirSync(dirname(path), { recursive: true });
  let data: Record<string, string> = {};
  if (existsSync(path)) {
    try {
      data = JSON.parse(readFileSync(path, 'utf8')) as Record<string, string>;
    } catch {
      data = {};
    }
  }
  data[providerName] = apiKey;
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n', { encoding: 'utf8', mode: 0o600 });
  try {
    chmodSync(path, 0o600);
  } catch {
    // Windows / restricted FS — best-effort.
  }
}

/** Remove a stored secret (e.g. `/key clear`). */
export function clearSecret(providerName: string): void {
  const path = secretsPath();
  if (!existsSync(path)) return;
  try {
    const data = JSON.parse(readFileSync(path, 'utf8')) as Record<string, string>;
    delete data[providerName];
    writeFileSync(path, JSON.stringify(data, null, 2) + '\n', { encoding: 'utf8', mode: 0o600 });
    try {
      chmodSync(path, 0o600);
    } catch {
      /* best-effort */
    }
  } catch {
    /* ignore */
  }
}

/** Whether a key is available for the provider without throwing. */
export function hasApiKey(
  providerName: string,
  providerConfig: ProviderConfig | undefined,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  try {
    const key = resolveApiKey(providerName, providerConfig, undefined, env);
    return providerName === 'mock' || providerName === 'ollama' || key.length > 0;
  } catch {
    return false;
  }
}

/** OpenCode Zen free models that work with the public guest token. */
export const OPENCODE_FREE_MODELS = [
  'deepseek-v4-flash-free',
  'mimo-v2.5-free',
  'north-mini-code-free',
  'nemotron-3-ultra-free',
  'big-pickle',
] as const;
