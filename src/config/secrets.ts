import { ErrorCode, SkyError } from '../errors/index.js';
import type { Logger } from '../logging/index.js';
import type { ProviderConfig } from './schema.js';

/**
 * Resolve a provider's API key following the precedence in §7.7:
 *   1. `providers.X.apiKey` literal (discouraged; logged as a warning)
 *   2. env var named by `providers.X.apiKeyEnv`
 *   3. system keychain entry (not available in this build → skipped)
 *   4. `SKY_PROVIDERS_X_API_KEY` env var
 *   5. otherwise fail with SKY-E-1002
 *
 * `mock`, `ollama`, and `opencode` never require a key.
 */
export function resolveApiKey(
  providerName: string,
  providerConfig: ProviderConfig | undefined,
  logger?: Logger,
  env: NodeJS.ProcessEnv = process.env,
): string {
  // Only the mock provider, local Ollama server, and OpenCode Zen need no key.
  // `ollama-cloud`, `zenmux`, and `openrouter` are hosted and require an API key.
  if (providerName === 'mock' || providerName === 'ollama' || providerName === 'opencode') return '';

  if (providerConfig?.apiKey) {
    logger?.warn('config.apiKey.literal', {
      provider: providerName,
      hint: 'Prefer apiKeyEnv over a literal apiKey in config.json',
    });
    return providerConfig.apiKey;
  }

  if (providerConfig?.apiKeyEnv) {
    const fromEnv = env[providerConfig.apiKeyEnv];
    if (fromEnv) return fromEnv;
  }

  // Normalize non-alphanumeric characters (e.g. the hyphen in `ollama-cloud`)
  // to underscores so the conventional env-var name is valid.
  const envName = providerName.toUpperCase().replace(/[^A-Z0-9]/g, '_');
  const conventional = env[`SKY_PROVIDERS_${envName}_API_KEY`];
  if (conventional) return conventional;

  throw new SkyError(ErrorCode.NoApiKey, { name: providerName });
}
