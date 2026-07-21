import { ErrorCode, SkyError } from '../errors/index.js';
import { nullLogger, type Logger } from '../logging/index.js';
import { resolveApiKey, type SkyConfig } from '../config/index.js';
import { isOpenCodeFreeModel } from '../config/secrets.js';
import type { Provider } from './types.js';
import { OpenAiAdapter } from './openai.js';
import { AnthropicAdapter } from './anthropic.js';
import { MockProvider } from './mock.js';

export interface CreateProviderOptions {
  config: SkyConfig;
  provider: string;
  logger?: Logger;
  env?: NodeJS.ProcessEnv;
  /** Active model — used so OpenCode free models ignore a stale API key. */
  model?: string;
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
/** DashScope OpenAI-compatible (intl). Override with providers.qwen-web.baseUrl for CN. */
const QWEN_WEB_BASE_URL = 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';
/** Z.AI (GLM) OpenAI-compatible. */
const ZAI_WEB_BASE_URL = 'https://api.z.ai/api/paas/v4';
/** Moonshot / Kimi OpenAI-compatible (global). */
const KIMI_WEB_BASE_URL = 'https://api.moonshot.ai/v1';

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
  const model = options.model ?? providerConfig?.defaultModel;

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

    case 'opencode': {
      // OpenCode Zen gateway. Free models use guest auth with 401 retry
      // (Bearer public → no Authorization). Paid models use OPENCODE_API_KEY.
      const resolvedModel = model ?? 'deepseek-v4-flash-free';
      const apiKey = resolveApiKey('opencode', providerConfig, logger, env, { model: resolvedModel });
      const guest = apiKey === 'public' || isOpenCodeFreeModel(resolvedModel);
      return new OpenAiAdapter({
        apiKey,
        baseUrl: providerConfig?.baseUrl ?? OPENCODE_BASE_URL,
        defaultHeaders: { 'HTTP-Referer': 'https://github.com/skysyaz/Sky-cli', 'X-Title': 'Sky CLI' },
        name: 'opencode',
        includeUsage: false,
        maxOutputCap: 4_096,
        opencodeGuest: guest,
      });
    }

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

    case 'qwen-web':
      // Alibaba DashScope compatible-mode (Qwen). Free-tier key from Model Studio.
      return new OpenAiAdapter({
        apiKey: resolveApiKey('qwen-web', providerConfig, logger, env),
        baseUrl: providerConfig?.baseUrl ?? QWEN_WEB_BASE_URL,
        name: 'qwen-web',
      });

    case 'zai-web':
      // Z.AI / GLM OpenAI-compatible API (free-tier key from z.ai).
      return new OpenAiAdapter({
        apiKey: resolveApiKey('zai-web', providerConfig, logger, env),
        baseUrl: providerConfig?.baseUrl ?? ZAI_WEB_BASE_URL,
        name: 'zai-web',
      });

    case 'kimi-web':
      // Moonshot Kimi OpenAI-compatible API (free-tier key from platform.moonshot.ai).
      return new OpenAiAdapter({
        apiKey: resolveApiKey('kimi-web', providerConfig, logger, env),
        baseUrl: providerConfig?.baseUrl ?? KIMI_WEB_BASE_URL,
        name: 'kimi-web',
      });

    case 'custom':
      // User-defined OpenAI-compatible endpoint — requires providers.custom.baseUrl.
      if (!providerConfig?.baseUrl) {
      throw new SkyError(ErrorCode.UnknownProvider, {
          name: 'custom',
          hint: ' — set providers.custom.baseUrl first (sky config set providers.custom.baseUrl https://…/v1)',
        });
      }
      return new OpenAiAdapter({
        apiKey: resolveApiKey('custom', providerConfig, logger, env),
        baseUrl: providerConfig.baseUrl,
        name: 'custom',
      });

    default:
      // Named OpenAI-compatible endpoint: providers.<name> with baseUrl + key.
      if (providerConfig?.baseUrl) {
        return new OpenAiAdapter({
          apiKey: resolveApiKey(provider, providerConfig, logger, env),
          baseUrl: providerConfig.baseUrl,
          name: provider,
        });
      }
      throw new SkyError(ErrorCode.UnknownProvider, { name: provider, hint: '' });
  }
}
