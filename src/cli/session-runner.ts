import { createInterface } from 'node:readline/promises';
import chalk from 'chalk';
import { SkyError } from '../errors/index.js';
import type { Mode, Session } from '../session/types.js';
import { AgentLoop } from '../agent/loop.js';
import { Policy } from '../safety/policy.js';
import { renderStream } from './render.js';
import { createInteractivePrompter, denyingPrompter } from './prompter.js';
import { makeApprover, makeProvider, makeProviderByName, attachMcp, type GlobalOptions, type Runtime } from './runtime.js';

export interface RunSessionOptions {
  runtime: Runtime;
  global: GlobalOptions;
  mode: Mode;
  session: Session;
  /** Initial prompt; when set and non-interactive, runs a single turn. */
  initialPrompt?: string;
  /** Force one-shot (no interactive loop) — true for --json/headless. */
  oneShot?: boolean;
}

/** Run a single agent turn, rendering its event stream. Returns the exit code. */
async function runTurn(options: RunSessionOptions, prompt: string | undefined): Promise<number> {
  const { runtime, global, session } = options;
  await attachMcp(runtime);
  const provider = makeProvider(runtime, global);
  const policy = new Policy(runtime.config, session.sessionAllowlist);
  const interactive = !options.oneShot && !global.json && Boolean(process.stdin.isTTY);
  const prompter = interactive
    ? createInteractivePrompter(runtime.color)
    : global.force || global.yolo
      ? undefined
      : denyingPrompter;
  const approver = makeApprover(runtime, global, policy, prompter);

  const loop = new AgentLoop({
    provider,
    registry: runtime.registry,
    approver,
    policy,
    session,
    store: runtime.store,
    config: runtime.config,
    logger: runtime.logger,
    skills: runtime.skills,
  });

  return renderStream(loop.run(prompt), { json: runtime.json, color: runtime.color });
}

/**
 * Drive a mode session. With an initial prompt in one-shot/headless mode it runs
 * a single turn and returns. Otherwise it enters the interactive TUI loop
 * (readline-based), reading user input and running a turn per submission until
 * the user exits (§4.3, §5.2).
 */
export async function runSession(options: RunSessionOptions): Promise<number> {
  const { runtime, global, session } = options;

  const oneShot = options.oneShot || global.json || !process.stdin.isTTY;
  if (oneShot) {
    return runTurn(options, options.initialPrompt);
  }

  // Interactive: prefer the Cursor-style Ink TUI (slash palette, status bar,
  // inline diff approvals). It is imported dynamically so headless mode never
  // loads React/Ink. Only fall back to readline if Ink itself cannot load —
  // NOT for provider/config errors, which the TUI surfaces in-UI. The provider
  // is created lazily by the TUI so a missing API key never blocks startup.
  let runTui: typeof import('../tui/run.js').runTui | undefined;
  try {
    ({ runTui } = await import('../tui/run.js'));
  } catch (error) {
    runtime.logger.warn('tui.unavailable', { detail: (error as Error).message });
  }
  if (runTui) {
    await attachMcp(runtime);
    await runTui({
      makeProvider: (name: string) => makeProviderByName(runtime, name),
      registry: runtime.registry,
      session,
      store: runtime.store,
      config: runtime.config,
      logger: runtime.logger,
      force: global.force,
      yolo: global.yolo,
      initialPrompt: options.initialPrompt,
      plugins: runtime.plugins,
      skills: runtime.skills,
    });
    return 0;
  }

  const c = runtime.color ? chalk : ({ gray: (s: string) => s, cyan: (s: string) => s, bold: (s: string) => s } as any);
  process.stdout.write(
    c.bold(`Sky — ${session.mode} mode`) +
      c.gray(` · ${session.provider}:${session.model} · session ${session.id.slice(0, 5)}\n`),
  );
  process.stdout.write(c.gray('Type your request. /help for commands, /exit to quit.\n\n'));

  // Run the initial prompt first if provided (errors stay in-session).
  if (options.initialPrompt) {
    try {
      await runTurn(options, options.initialPrompt);
    } catch (error) {
      process.stderr.write(c.gray(`${SkyError.from(error).toUserMessage()}\n`));
    }
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    for (;;) {
      const line = (await rl.question(c.cyan('> '))).trim();
      if (!line) continue;
      if (line.startsWith('/')) {
        const done = handleSlashCommand(line, session, runtime);
        if (done) break;
        continue;
      }
      // A turn error (bad key, provider down, …) must never exit the session.
      try {
        await runTurn(options, line);
      } catch (error) {
        const skyError = SkyError.from(error);
        process.stderr.write(c.gray(`${skyError.toUserMessage()}\n`));
      }
      process.stdout.write('\n');
    }
  } finally {
    rl.close();
  }
  runtime.store.setStatus(session, 'paused');
  return 0;
}

/** Handle a slash command (§5.5). Returns true if the loop should exit. */
function handleSlashCommand(line: string, session: Session, runtime: Runtime): boolean {
  const [command, ...rest] = line.slice(1).split(/\s+/);
  switch (command) {
    case 'exit':
    case 'quit':
      return true;
    case 'help':
      process.stdout.write(
        [
          '/help                 show this help',
          '/mode [agent|plan|ask] switch mode',
          '/model <name>         switch model',
          '/provider <name>      switch LLM provider',
          '/key <api-key>        save API key securely (secrets file)',
          '/status               show session status',
          '/cost                 show token & cost usage',
          '/diff                 (agent mode) show uncommitted changes',
          '/clear                clear the screen',
          '/exit                 save and quit',
          '',
        ].join('\n'),
      );
      return false;
    case 'mode': {
      const next = rest[0];
      if (next === 'agent' || next === 'plan' || next === 'ask') {
        session.mode = next;
        runtime.store.save(session);
        process.stdout.write(`Switched to ${next} mode.\n`);
      } else {
        process.stdout.write('Usage: /mode [agent|plan|ask]\n');
      }
      return false;
    }
    case 'model':
      if (rest[0]) {
        session.model = rest[0];
        runtime.store.save(session);
        process.stdout.write(`Model set to ${rest[0]}.\n`);
      }
      return false;
    case 'cost':
      process.stdout.write(
        `Tokens: ${session.tokenUsage.input} in / ${session.tokenUsage.output} out · ~$${session.tokenUsage.estimatedCostUsd.toFixed(4)}\n`,
      );
      return false;
    case 'clear':
      process.stdout.write('\x1b[2J\x1b[H');
      return false;
    default:
      process.stdout.write(`Unknown command: /${command}. Try /help.\n`);
      return false;
  }
}
