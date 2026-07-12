import { ErrorCode, SkyError } from '../errors/index.js';
import { nullLogger, type Logger } from '../logging/index.js';
import { resolveApiKey, type SkyConfig } from '../config/index.js';
import type { Provider } from './types.js';
import { OpenAiAdapter } from './openai.js';
import { AnthropicAdapter } from './anthropic.js';
import { MockProvider } from './mock.js';

export interface CreateProviderOptions {
  config: SkyConfig;
  provider: string;
  logger?: Logger;
  env?: NodeJS.ProcessEnv;
  /** Inject a provider directly (tests, `--provider mock`). */
  override?: Provider;
}

const OLLAMA_DEFAULT_BASE_URL = 'http://localhost:11434/v1';
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

/**
 * Instantiate the provider adapter named in config (§8.2). The four first-class
 * providers are OpenAI, Anthropic, Ollama, and OpenRouter; `mock` is always
 * available for offline use.
 */
export function createProvider(options: CreateProviderOptions): Provider {
  const { config, provider, logger = nullLogger, env } = options;
  if (options.override) return options.override;
  if (provider === 'mock') return new MockProvider();

  const providerConfig = config.providers[provider];

  switch (provider) {
    case 'openai':
      return new OpenAiAdapter({
        apiKey: resolveApiKey('openai', providerConfig, logger, env),
        baseUrl: providerConfig?.baseUrl,
        name: 'openai',
      });

    case 'anthropic':
      return new AnthropicAdapter({
        apiKey: resolveApiKey('anthropic', providerConfig, logger, env),
        baseUrl: providerConfig?.baseUrl,
      });

    case 'ollama':
      // Reuses the OpenAI adapter against Ollama's compatible endpoint (§8.5).
      return new OpenAiAdapter({
        apiKey: '',
        baseUrl: providerConfig?.baseUrl ?? OLLAMA_DEFAULT_BASE_URL,
        includeUsage: false, // Ollama does not support stream_options.include_usage
        name: 'ollama',
      });

    case 'openrouter':
      return new OpenAiAdapter({
        apiKey: resolveApiKey('openrouter', providerConfig, logger, env),
        baseUrl: providerConfig?.baseUrl ?? OPENROUTER_BASE_URL,
        defaultHeaders: { 'HTTP-Referer': 'https://github.com/sky-cli/sky' },
        name: 'openrouter',
      });

    default:
      throw new SkyError(ErrorCode.UnknownProvider, { name: provider });
  }
}
