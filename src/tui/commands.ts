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

/** Model suggestions offered for `/model`. Merged with the active model at runtime. */
export const MODEL_SUGGESTIONS = [
  'gpt-4o',
  'gpt-4o-mini',
  'claude-3-5-sonnet',
  'x-ai/grok-4.5-free',
  'gpt-oss:120b',
  'qwen3-coder:480b',
];

export const SLASH_COMMANDS: SlashCommand[] = [
  { name: 'help', description: 'Show keybindings and commands' },
  { name: 'mode', description: 'Switch mode', args: ['agent', 'plan', 'ask'] },
  { name: 'model', description: 'Switch model', args: MODEL_SUGGESTIONS },
  { name: 'cost', description: 'Show token and estimated cost usage' },
  { name: 'diff', description: 'Show uncommitted changes this session' },
  { name: 'compact', description: 'Summarize old turns to reclaim context' },
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

/**
 * Compute palette suggestions for the current input. Returns command names while
 * the user is still typing the command, and argument values once a known command
 * with `args` is followed by a space (the two-level palette behaviour).
 */
export function getSuggestions(
  input: string,
  options: { modelSuggestions?: string[] } = {},
): Suggestion[] {
  const parsed = parseInput(input);
  if (!parsed.isSlash) return [];

  if (!parsed.hasSpace) {
    return SLASH_COMMANDS.filter((c) => matches(c.name, parsed.command)).map((c) => ({
      kind: 'command' as const,
      label: `/${c.name}`,
      description: c.description,
      value: c.name,
    }));
  }

  const command = SLASH_COMMANDS.find((c) => c.name === parsed.command);
  if (!command?.args) return [];
  const args = command.name === 'model' ? options.modelSuggestions ?? command.args : command.args;
  return args
    .filter((a) => matches(a, parsed.arg))
    .map((a) => ({ kind: 'arg' as const, label: a, description: `${command.name} → ${a}`, value: a }));
}
