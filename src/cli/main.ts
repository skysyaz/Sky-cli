import { Command } from 'commander';
import chalk from 'chalk';
import { SkyError } from '../errors/index.js';
import type { GlobalOptions } from './runtime.js';
import {
  startModeSession,
  resumeCommand,
  lsCommand,
  initCommand,
  configCommand,
  mcpCommand,
  doctorCommand,
} from './commands.js';
import { updateCommand } from './update.js';
import { pluginCommand } from './plugin.js';

const VERSION = '1.1.0';

/** Extract merged global options from the root program (§4.2). */
function globalOptions(program: Command): GlobalOptions {
  const o = program.opts();
  return {
    model: o.model,
    provider: o.provider,
    yolo: o.yolo,
    force: o.force || o.yolo,
    cwd: o.cwd,
    session: o.session,
    config: o.config,
    verbose: o.verbose,
    quiet: o.quiet,
    color: o.color, // Commander sets false for --no-color
    json: o.json,
  };
}

/** Run a command action, mapping thrown errors to the BSD exit codes (§4.11). */
async function run(action: () => Promise<number>): Promise<void> {
  try {
    const code = await action();
    process.exitCode = code;
  } catch (error) {
    const skyError = SkyError.from(error);
    process.stderr.write(chalk.red(`${skyError.toUserMessage()}\n`));
    process.exitCode = skyError.exitCode;
  }
}

function build(): Command {
  const program = new Command();

  program
    .name('sky')
    .description('Sky — a command-line AI agent with an interactive TUI and multi-provider LLM support.')
    .version(VERSION, '-V, --version', 'print version and exit')
    .option('-m, --model <model>', 'override the model for this run')
    .option(
      '-p, --provider <provider>',
      'override the LLM provider (openai, anthropic, ollama, ollama-cloud, openrouter, zenmux, opencode, gemini, deepseek, groq, qwen-web, zai-web, kimi-web, custom, mock)',
    )
    .option('--yolo', 'auto-approve every tool call (CI only); implies --force')
    .option('--force', 'skip interactive confirmations but respect the denylist')
    .option('--cwd <path>', 'run as if started in this directory')
    .option('-s, --session <id>', 'resume a specific session by id')
    .option('-c, --config <path>', 'path to an alternative config file')
    .option('--verbose', 'emit debug logs to stderr')
    .option('--quiet', 'suppress non-error stderr output')
    .option('--no-color', 'disable ANSI color')
    .option('--json', 'output events as NDJSON on stdout')
    .allowExcessArguments(true);

  // Default command: `sky [prompt]` / `sky agent [prompt]`
  program
    .argument('[prompt]', 'initial prompt for the agent')
    .action((prompt: string | undefined) => run(() => startModeSession('agent', prompt, globalOptions(program))));

  program
    .command('agent [prompt]')
    .description('start an interactive agent session (default)')
    .action((prompt: string | undefined) => run(() => startModeSession('agent', prompt, globalOptions(program))));

  program
    .command('plan [prompt]')
    .description('plan-first mode: clarify and design before any change')
    .action((prompt: string | undefined) => run(() => startModeSession('plan', prompt, globalOptions(program))));

  program
    .command('ask [prompt]')
    .description('read-only Q&A with read/search tools; no file mutation')
    .action((prompt: string | undefined) => run(() => startModeSession('ask', prompt, globalOptions(program))));

  program
    .command('doctor')
    .alias('status')
    .description('diagnose config, API keys, providers, skills, and MCP servers')
    .action(() => run(() => doctorCommand(globalOptions(program))));

  program
    .command('resume [id] [followUp]')
    .description('resume an existing session by id or the most recent one')
    .option('--view', 'view-only: print history and exit')
    .action((id: string | undefined, followUp: string | undefined, opts: { view?: boolean }) =>
      run(() => resumeCommand(id, followUp, opts.view ?? false, globalOptions(program))),
    );

  program
    .command('ls')
    .description('list sessions for the current directory')
    .option('--since <duration>', 'only sessions since e.g. 7d, 24h, 30m')
    .option('--all', 'include sessions from all directories')
    .action((opts: { since?: string; all?: boolean }) => run(() => lsCommand(opts, globalOptions(program))));

  program
    .command('init')
    .description('create ~/.sky/config.json with defaults')
    .action(() => run(() => initCommand(globalOptions(program))));

  program
    .command('plugin [args...]')
    .description('manage plugins: marketplace add <owner/repo>, install <name@marketplace>, list, uninstall')
    .action((args: string[]) => run(() => pluginCommand(args ?? [], globalOptions(program))));

  program
    .command('update')
    .alias('upgrade')
    .description('update Sky to the latest version (pull + rebuild in place)')
    .option('--check', 'only check whether an update is available')
    .option('--ref <ref>', 'branch or tag to update to (default: main)')
    .action((opts: { check?: boolean; ref?: string }) =>
      run(() => updateCommand(opts, globalOptions(program))),
    );

  program
    .command('config [action] [key] [value]')
    .description('manage configuration: get, set, list, validate')
    .action((action: string | undefined, key: string | undefined, value: string | undefined) =>
      run(() => configCommand(action, key, value, globalOptions(program))),
    );

  program
    .command('mcp [action] [name]')
    .description('manage MCP server registrations: add, list, remove, test')
    .option('--command <command>', 'executable to launch the MCP server')
    .option('--args <args>', 'space-separated arguments')
    .option('--env <pair...>', 'environment variables as KEY=VALUE')
    .option('--approval <mode>', 'approval mode: auto, manual, deny')
    .action((action: string | undefined, name: string | undefined, opts: { command?: string; args?: string; env?: string[]; approval?: string }) =>
      run(() => mcpCommand(action, name, opts, globalOptions(program))),
    );

  return program;
}

export async function main(argv: string[] = process.argv): Promise<void> {
  const program = build();
  await program.parseAsync(argv);
}

// Execute when invoked as the CLI binary.
main().catch((error) => {
  const skyError = SkyError.from(error);
  process.stderr.write(`${skyError.toUserMessage()}\n`);
  process.exitCode = skyError.exitCode;
});
