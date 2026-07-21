/**
 * Slash-command catalog and the pure filtering logic behind the command palette
 * (§5.5). Kept free of Ink/React so it can be unit-tested directly.
 */

export interface SlashCommand {
  name: string;
  description: string;
  /** Argument suggestions shown as a second-level palette (e.g. mode names). */
  args?: string[];
}

/** OpenCode Zen free models (guest-token, no personal API key). */
export const OPENCODE_FREE_MODELS = [
  'deepseek-v4-flash-free',
  'mimo-v2.5-free',
  'north-mini-code-free',
  'nemotron-3-ultra-free',
  'big-pickle',
];

/** Model suggestions offered for `/model`. Merged with the active model at runtime. */
export const MODEL_SUGGESTIONS = [
  // OpenCode free first — commonly used without a key
  ...OPENCODE_FREE_MODELS,
  'gpt-4o',
  'gpt-4o-mini',
  'claude-3-5-sonnet',
  'claude-sonnet-4-5',
  'gemini-2.0-flash',
  'deepseek-chat',
  'deepseek-v4-flash',
  'llama-3.3-70b-versatile',
  'x-ai/grok-4.5-free',
  'gpt-oss:120b',
  'qwen3-coder:480b',
];

/** Models recommended per provider for the `/model` palette. */
export const MODELS_BY_PROVIDER: Record<string, string[]> = {
  opencode: [
    ...OPENCODE_FREE_MODELS,
    'deepseek-v4-flash',
    'deepseek-v4-pro',
    'minimax-m2.5',
    'glm-5',
    'kimi-k2.5',
    'big-pickle',
  ],
  openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'o4-mini'],
  anthropic: ['claude-3-5-sonnet', 'claude-sonnet-4-5', 'claude-opus-4-5', 'claude-haiku-4-5'],
  ollama: ['llama3.1', 'qwen2.5-coder', 'codellama', 'mistral'],
  'ollama-cloud': ['gpt-oss:120b', 'qwen3-coder:480b'],
  openrouter: ['openai/gpt-4o', 'anthropic/claude-3.5-sonnet', 'x-ai/grok-4.5-free'],
  zenmux: ['x-ai/grok-4.5-free', 'openai/gpt-4o'],
  gemini: ['gemini-2.0-flash', 'gemini-2.5-pro', 'gemini-2.5-flash'],
  deepseek: ['deepseek-chat', 'deepseek-reasoner'],
  groq: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'],
  mock: ['mock-1'],
};

/** The providers a user can switch to via `/provider`. */
export const PROVIDER_NAMES = [
  'openai',
  'anthropic',
  'ollama',
  'ollama-cloud',
  'openrouter',
  'zenmux',
  'opencode',
  'gemini',
  'deepseek',
  'groq',
  'mock',
];

export const SLASH_COMMANDS: SlashCommand[] = [
  { name: 'help', description: 'Show keybindings and commands' },
  { name: 'mode', description: 'Switch mode', args: ['agent', 'plan', 'ask'] },
  { name: 'model', description: 'Switch model', args: MODEL_SUGGESTIONS },
  { name: 'provider', description: 'Switch LLM provider', args: PROVIDER_NAMES },
  { name: 'key', description: 'Set API key for current provider (saved to secrets file)' },
  { name: 'status', description: 'Show session, provider, tools, skills, MCP status' },
  { name: 'cost', description: 'Show token and estimated cost usage' },
  { name: 'diff', description: 'Show uncommitted changes this session' },
  { name: 'compact', description: 'Summarize old turns to reclaim context' },
  {
    name: 'plugin',
    description: 'Manage plugins',
    args: ['marketplace', 'search', 'install', 'list', 'uninstall'],
  },
  { name: 'clear', description: 'Clear the screen (keeps session history)' },
  { name: 'exit', description: 'Save the session and quit' },
];

export interface ParsedInput {
  isSlash: boolean;
  /** The command token after the leading slash (before the first space). */
  command: string;
  /** True once a space has been typed after the command. */
  hasSpace: boolean;
  /** The partial argument being typed after the command. */
  arg: string;
}

/** Parse the raw input line into slash-command structure. */
export function parseInput(input: string): ParsedInput {
  if (!input.startsWith('/')) return { isSlash: false, command: '', hasSpace: false, arg: '' };
  const rest = input.slice(1);
  const spaceIdx = rest.indexOf(' ');
  if (spaceIdx === -1) return { isSlash: true, command: rest, hasSpace: false, arg: '' };
  return {
    isSlash: true,
    command: rest.slice(0, spaceIdx),
    hasSpace: true,
    arg: rest.slice(spaceIdx + 1),
  };
}

/** A palette suggestion, either a command or an argument value. */
export interface Suggestion {
  kind: 'command' | 'arg';
  label: string;
  description: string;
  /** Command name (for kind=command) or argument value (for kind=arg). */
  value: string;
}

/** Case-insensitive prefix-then-substring match. */
function matches(candidate: string, query: string): boolean {
  if (!query) return true;
  const c = candidate.toLowerCase();
  const q = query.toLowerCase();
  return c.startsWith(q) || c.includes(q);
}

/** Short tag for a model in the palette (avoids duplicating the long id). */
export function modelTag(model: string): string {
  if (model.endsWith('-free') || model === 'big-pickle' || model.includes('free')) return 'free';
  if (model.startsWith('claude')) return 'anthropic';
  if (model.startsWith('gpt') || model.startsWith('o')) return 'openai';
  if (model.startsWith('gemini')) return 'gemini';
  if (model.startsWith('deepseek')) return 'deepseek';
  if (model.includes('llama') || model.includes('groq')) return 'groq/llama';
  if (model.includes('/')) return model.split('/')[0]!;
  return 'model';
}

/**
 * Build the `/model` suggestion list for the active provider, always including
 * the current model first and de-duplicating.
 */
export function modelsForProvider(provider: string, currentModel?: string): string[] {
  const fromProvider = MODELS_BY_PROVIDER[provider] ?? MODEL_SUGGESTIONS;
  const ordered = [
    ...(currentModel ? [currentModel] : []),
    ...fromProvider,
    ...MODEL_SUGGESTIONS,
  ];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of ordered) {
    if (!m || seen.has(m)) continue;
    seen.add(m);
    out.push(m);
  }
  return out;
}

/**
 * Compute palette suggestions for the current input. Returns command names while
 * the user is still typing the command, and argument values once a known command
 * with `args` is followed by a space (the two-level palette behaviour).
 */
export function getSuggestions(
  input: string,
  options: {
    modelSuggestions?: string[];
    extraCommands?: { name: string; description: string }[];
    provider?: string;
  } = {},
): Suggestion[] {
  const parsed = parseInput(input);
  if (!parsed.isSlash) return [];

  if (!parsed.hasSpace) {
    const builtins = SLASH_COMMANDS.map((c) => ({ name: c.name, description: c.description }));
    // Plugin-contributed commands (e.g. `ponytail:create`) appear alongside builtins.
    const all = [...builtins, ...(options.extraCommands ?? [])];
    return all
      .filter((c) => matches(c.name, parsed.command))
      .map((c) => ({
        kind: 'command' as const,
        label: `/${c.name}`,
        description: c.description,
        value: c.name,
      }));
  }

  const command = SLASH_COMMANDS.find((c) => c.name === parsed.command);
  if (!command?.args) return [];

  if (command.name === 'model') {
    const args =
      options.modelSuggestions ??
      (options.provider ? modelsForProvider(options.provider) : command.args);
    return args
      .filter((a) => matches(a, parsed.arg))
      .map((a) => ({
        kind: 'arg' as const,
        // Label is the full model id; description is a short tag only —
        // duplicating the id caused wrap/overlap on narrow Termux screens.
        label: a,
        description: modelTag(a),
        value: a,
      }));
  }

  return command.args
    .filter((a) => matches(a, parsed.arg))
    .map((a) => ({ kind: 'arg' as const, label: a, description: '', value: a }));
}

/**
 * Compute a scrolling window into a palette list so arrow-key selection stays
 * visible. Returns the slice to render and the selected index within that slice.
 */
export function paletteWindow<T>(
  items: T[],
  selected: number,
  size = 10,
): { visible: T[]; localSelected: number; start: number; hasAbove: boolean; hasBelow: boolean } {
  if (items.length === 0) {
    return { visible: [], localSelected: 0, start: 0, hasAbove: false, hasBelow: false };
  }
  const windowSize = Math.max(1, Math.min(size, items.length));
  const sel = Math.max(0, Math.min(selected, items.length - 1));
  // Keep selection near the middle of the window when possible.
  let start = sel - Math.floor((windowSize - 1) / 2);
  start = Math.max(0, Math.min(start, items.length - windowSize));
  return {
    visible: items.slice(start, start + windowSize),
    localSelected: sel - start,
    start,
    hasAbove: start > 0,
    hasBelow: start + windowSize < items.length,
  };
}
