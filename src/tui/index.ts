/**
 * The `tui/` module (§2.4.2). A React application rendered into the terminal via
 * Ink. Because the agent loop emits a provider-agnostic event stream, the TUI is
 * fully decoupled from orchestration — the headless renderer consumes the same
 * events without linking against Ink.
 *
 * The Ink components (`App`, `runTui`) are imported dynamically by the CLI so
 * that headless mode never loads React/Ink. The pure command-palette logic lives
 * in `./commands.ts` and is unit-tested directly.
 */
export {
  getSuggestions,
  parseInput,
  SLASH_COMMANDS,
  MODEL_SUGGESTIONS,
  OPENCODE_FREE_MODELS,
  MODELS_BY_PROVIDER,
  modelsForProvider,
  modelTag,
  paletteWindow,
  type Suggestion,
  type SlashCommand,
  type ParsedInput,
} from './commands.js';
export type { RunTuiOptions } from './run.js';
