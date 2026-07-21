/**
 * Human-facing auth guidance per provider.
 *
 * "*-web" providers are official OpenAI-compatible APIs with free-tier keys —
 * they are not browser-cookie / keyless chat scrapers. True keyless free models
 * go through OpenCode Zen's public guest token.
 */

export interface ProviderAuthHelp {
  /** Short label for the palette. */
  tag: string;
  /** Env var users commonly export. */
  envVar?: string;
  /** Where to create a free-tier (or paid) key. */
  signupUrl?: string;
  /** One-line truth for the provider. */
  summary: string;
  /** Extra lines shown when a key is missing. */
  setupLines: string[];
}

const OPENCODE_FREE = '/provider opencode   # keyless free models (guest token)';

const HELP: Record<string, ProviderAuthHelp> = {
  opencode: {
    tag: 'keyless free',
    envVar: 'OPENCODE_API_KEY',
    signupUrl: 'https://opencode.ai/auth',
    summary: 'Free Zen models need no key (guest). Paid Zen models need OPENCODE_API_KEY.',
    setupLines: [
      'Free models work immediately — no /key needed.',
      'Paid Zen models: set OPENCODE_API_KEY or /key <value>',
      'Auth: https://opencode.ai/auth',
    ],
  },
  'qwen-web': {
    tag: 'needs free key',
    envVar: 'DASHSCOPE_API_KEY',
    signupUrl: 'https://modelstudio.console.alibabacloud.com/',
    summary: 'Official DashScope API (not chat.qwen.ai cookies). Free-tier key required.',
    setupLines: [
      'qwen-web is DashScope’s OpenAI-compatible API — not the Qwen website chat.',
      '1. Create a free key: https://modelstudio.console.alibabacloud.com/',
      '2. Paste it: /key sk-…',
      '3. Or export DASHSCOPE_API_KEY=sk-…',
      `Keyless alternative: ${OPENCODE_FREE}`,
    ],
  },
  'zai-web': {
    tag: 'needs free key',
    envVar: 'ZAI_API_KEY',
    signupUrl: 'https://z.ai/',
    summary: 'Official Z.AI / GLM API (not chat.z.ai cookies). Free-tier key required.',
    setupLines: [
      'zai-web is Z.AI’s OpenAI-compatible API — not the z.ai website chat.',
      '1. Create a free key: https://z.ai/ (API / console)',
      '2. Paste it: /key …',
      '3. Or export ZAI_API_KEY=…',
      `Keyless alternative: ${OPENCODE_FREE}`,
    ],
  },
  'kimi-web': {
    tag: 'needs free key',
    envVar: 'MOONSHOT_API_KEY',
    signupUrl: 'https://platform.moonshot.ai/',
    summary: 'Official Moonshot / Kimi API (not kimi.com cookies). Free-tier key required.',
    setupLines: [
      'kimi-web is Moonshot’s OpenAI-compatible API — not the Kimi website chat.',
      '1. Create a free key: https://platform.moonshot.ai/',
      '2. Paste it: /key …',
      '3. Or export MOONSHOT_API_KEY=…',
      `Keyless alternative: ${OPENCODE_FREE}`,
    ],
  },
  custom: {
    tag: 'your baseUrl',
    envVar: 'SKY_CUSTOM_API_KEY',
    summary: 'Any OpenAI-compatible endpoint you configure.',
    setupLines: [
      'sky config set providers.custom.baseUrl https://…/v1',
      'Then /provider custom and /key <api-key>',
      `Keyless alternative: ${OPENCODE_FREE}`,
    ],
  },
  ollama: {
    tag: 'local',
    summary: 'Local Ollama — no cloud API key.',
    setupLines: ['Start Ollama locally, then /model <name>.'],
  },
  mock: {
    tag: 'offline',
    summary: 'Offline mock provider for tests.',
    setupLines: [],
  },
};

/** Palette / status tag for a provider. */
export function providerAuthTag(name: string): string {
  return HELP[name]?.tag ?? '';
}

/** Full setup card when a key is missing (or on first switch). */
export function providerAuthSetupCard(name: string): string {
  const help = HELP[name];
  if (!help) {
    return [
      `No API key for provider "${name}".`,
      'Set one with /key <value>, or switch: /provider opencode (keyless free).',
    ].join('\n');
  }
  return [`${name}: ${help.summary}`, ...help.setupLines].join('\n');
}

/** Short hint appended to SKY-E-1002. */
export function providerAuthHint(name: string): string {
  const help = HELP[name];
  if (!help) return ' Use /key <value> or /provider opencode for keyless free models.';
  if (name === 'opencode') return '';
  if (help.signupUrl) {
    return ` Get a free key at ${help.signupUrl} then /key <value>. Or /provider opencode for keyless free.`;
  }
  return ' Use /key <value> or /provider opencode for keyless free models.';
}

export function isKeylessProvider(name: string): boolean {
  return name === 'opencode' || name === 'ollama' || name === 'mock';
}
