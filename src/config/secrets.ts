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
 * `mock` and `ollama` never require a key.
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
      hint: 'Prefer apiKeyEnv over a literal apiKey in config.json',
    });
    return providerConfig.apiKey;
  }

  if (providerConfig?.apiKeyEnv) {
    const fromEnv = env[providerConfig.apiKeyEnv];
    if (fromEnv) return fromEnv;
  }

  const conventional = env[`SKY_PROVIDERS_${providerName.toUpperCase()}_API_KEY`];
  if (conventional) return conventional;

  throw new SkyError(ErrorCode.NoApiKey, { name: providerName });
}
