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
const OLLAMA_CLOUD_BASE_URL = 'https://ollama.com/v1';
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
const ZENMUX_BASE_URL = 'https://zenmux.ai/api/v1';
const OPENCODE_BASE_URL = 'https://opencode.ai/zen/v1';
const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/';
const DEEPSEEK_BASE_URL = 'https://api.deepseek.com/v1';
const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';

/**
 * Instantiate the provider adapter named in config (§8.2). OpenAI-compatible
 * gateways (Ollama, OpenRouter, ZenMux, OpenCode, Gemini, DeepSeek, Groq)
 * reuse {@link OpenAiAdapter}.
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
      return new OpenAiAdapter({
        apiKey: '',
        baseUrl: providerConfig?.baseUrl ?? OLLAMA_DEFAULT_BASE_URL,
        includeUsage: false,
        name: 'ollama',
      });

    case 'ollama-cloud':
      return new OpenAiAdapter({
        apiKey: resolveApiKey('ollama-cloud', providerConfig, logger, env),
        baseUrl: providerConfig?.baseUrl ?? OLLAMA_CLOUD_BASE_URL,
        name: 'ollama-cloud',
      });

    case 'zenmux':
      return new OpenAiAdapter({
        apiKey: resolveApiKey('zenmux', providerConfig, logger, env),
        baseUrl: providerConfig?.baseUrl ?? ZENMUX_BASE_URL,
        name: 'zenmux',
      });

    case 'openrouter':
      return new OpenAiAdapter({
        apiKey: resolveApiKey('openrouter', providerConfig, logger, env),
        baseUrl: providerConfig?.baseUrl ?? OPENROUTER_BASE_URL,
        defaultHeaders: { 'HTTP-Referer': 'https://github.com/skysyaz/Sky-cli' },
        name: 'openrouter',
      });

    case 'opencode':
      // OpenCode Zen gateway. Free models work with the public guest token;
      // paid models need OPENCODE_API_KEY / /key. Endpoint is /zen/v1 (not /api/v1).
      // Free models stream long reasoning_content and stall on huge max_tokens /
      // include_usage — keep budgets modest and skip usage streaming.
      return new OpenAiAdapter({
        apiKey: resolveApiKey('opencode', providerConfig, logger, env),
        baseUrl: providerConfig?.baseUrl ?? OPENCODE_BASE_URL,
        defaultHeaders: { 'HTTP-Referer': 'https://github.com/skysyaz/Sky-cli', 'X-Title': 'Sky CLI' },
        name: 'opencode',
        includeUsage: false,
        maxOutputCap: 4_096,
      });

    case 'gemini':
      return new OpenAiAdapter({
        apiKey: resolveApiKey('gemini', providerConfig, logger, env),
        baseUrl: providerConfig?.baseUrl ?? GEMINI_BASE_URL,
        name: 'gemini',
      });

    case 'deepseek':
      return new OpenAiAdapter({
        apiKey: resolveApiKey('deepseek', providerConfig, logger, env),
        baseUrl: providerConfig?.baseUrl ?? DEEPSEEK_BASE_URL,
        name: 'deepseek',
      });

    case 'groq':
      return new OpenAiAdapter({
        apiKey: resolveApiKey('groq', providerConfig, logger, env),
        baseUrl: providerConfig?.baseUrl ?? GROQ_BASE_URL,
        name: 'groq',
      });

    default:
      // Custom OpenAI-compatible endpoint: providers.<name> with baseUrl + key.
      if (providerConfig?.baseUrl) {
        return new OpenAiAdapter({
          apiKey: resolveApiKey(provider, providerConfig, logger, env),
          baseUrl: providerConfig.baseUrl,
          name: provider,
        });
      }
      throw new SkyError(ErrorCode.UnknownProvider, { name: provider });
  }
}
