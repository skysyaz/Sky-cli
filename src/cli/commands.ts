import { createInterface } from 'node:readline/promises';
import chalk from 'chalk';
import { ErrorCode, SkyError } from '../errors/index.js';
import {
  configExists,
  configPath,
  loadConfig,
  writeConfig,
  scaffoldConfig,
  exportJsonSchema,
  getConfigKey,
  defaultConfig,
  type SkyConfig,
} from '../config/index.js';
import type { Mode, Session } from '../session/types.js';
import { runSession } from './session-runner.js';
import { buildRuntime, type GlobalOptions, type Runtime } from './runtime.js';

/** Default env-var name and model per provider, used by `sky init`. */
const PROVIDER_DEFAULTS: Record<string, { apiKeyEnv: string; model: string }> = {
  openai: { apiKeyEnv: 'OPENAI_API_KEY', model: 'gpt-4o' },
  anthropic: { apiKeyEnv: 'ANTHROPIC_API_KEY', model: 'claude-3-5-sonnet' },
  ollama: { apiKeyEnv: '', model: 'llama3.1' },
  'ollama-cloud': { apiKeyEnv: 'OLLAMA_API_KEY', model: 'gpt-oss:120b' },
  openrouter: { apiKeyEnv: 'OPENROUTER_API_KEY', model: 'openai/gpt-4o' },
  zenmux: { apiKeyEnv: 'ZENMUX_API_KEY', model: 'x-ai/grok-4.5-free' },
  opencode: { apiKeyEnv: 'OPENCODE_API_KEY', model: 'deepseek-v4-flash-free' },
  gemini: { apiKeyEnv: 'GEMINI_API_KEY', model: 'gemini-2.0-flash' },
  deepseek: { apiKeyEnv: 'DEEPSEEK_API_KEY', model: 'deepseek-chat' },
  groq: { apiKeyEnv: 'GROQ_API_KEY', model: 'llama-3.3-70b-versatile' },
  mock: { apiKeyEnv: '', model: 'mock-1' },
};

/** Resolve or create the session for a mode session command. */
function openSession(runtime: Runtime, global: GlobalOptions, mode: Mode): Session {
  const provider = global.provider ?? runtime.config.defaultProvider;
  const model = global.model ?? runtime.config.defaultModel;

  if (global.session) {
    const id = runtime.store.resolveId(global.session, runtime.cwd);
    const session = runtime.store.load(id);
    session.mode = mode;
    session.status = 'active';
    if (global.model) session.model = model;
    if (global.provider) session.provider = provider;
    runtime.store.save(session);
    return session;
  }
  return runtime.store.create({ mode, cwd: runtime.cwd, provider, model });
}

/** `sky` / `sky agent` / `sky plan` / `sky ask` (§4.3–4.5). */
export async function startModeSession(
  mode: Mode,
  initialPrompt: string | undefined,
  global: GlobalOptions,
): Promise<number> {
  const runtime = buildRuntime(global, true);
  const session = openSession(runtime, global, mode);
  return runSession({ runtime, global, mode, session, initialPrompt });
}

/** `sky resume [id]` (§4.6). */
export async function resumeCommand(
  id: string | undefined,
  followUp: string | undefined,
  view: boolean,
  global: GlobalOptions,
): Promise<number> {
  const runtime = buildRuntime(global, true);
  const c = runtime.color ? chalk : plainChalk();

  let sessionId = id;
  if (!sessionId) {
    const sessions = runtime.store.list({ cwd: runtime.cwd });
    if (sessions.length === 0) {
      process.stderr.write('No sessions to resume in this directory.\n');
      return 0;
    }
    sessionId = sessions[0].id; // pick most recent when non-interactive
    process.stdout.write(c.gray(`Resuming most recent session ${sessionId.slice(0, 5)}\n`));
  }

  const resolved = runtime.store.resolveId(sessionId, runtime.cwd);
  const session = runtime.store.load(resolved);

  if (view) {
    for (const message of session.messages) {
      const label = message.role.toUpperCase().padEnd(9);
      process.stdout.write(`${c.gray(label)} ${message.content.split('\n')[0].slice(0, 120)}\n`);
    }
    return 0;
  }

  session.status = 'active';
  runtime.store.save(session);
  return runSession({ runtime, global, mode: session.mode, session, initialPrompt: followUp });
}

/** `sky ls` (§4.7). */
export async function lsCommand(
  opts: { since?: string; all?: boolean },
  global: GlobalOptions,
): Promise<number> {
  const runtime = buildRuntime(global, true);
  const sinceMs = opts.since ? parseDuration(opts.since) : undefined;
  const sessions = runtime.store.list({ cwd: opts.all ? undefined : runtime.cwd, sinceMs });

  if (global.json) {
    process.stdout.write(JSON.stringify(sessions, null, 2) + '\n');
    return 0;
  }

  if (sessions.length === 0) {
    process.stdout.write('No sessions found.\n');
    return 0;
  }
  process.stdout.write(['ID', 'MODE', 'STARTED', 'MSGS', 'LAST ACTIVITY', 'CWD'].join('\t') + '\n');
  for (const s of sessions) {
    process.stdout.write(
      [s.id.slice(0, 6), s.mode, s.started.slice(0, 19), String(s.messages), s.lastActivity.slice(0, 19), s.cwd].join('\t') + '\n',
    );
  }
  return 0;
}

/** `sky init` (§4.10). */
export async function initCommand(global: GlobalOptions): Promise<number> {
  const path = global.config ?? configPath();
  const interactive = Boolean(process.stdin.isTTY) && !global.quiet;

  if (configExists(path)) {
    if (interactive) {
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      const answer = (await rl.question(`Config already exists at ${path}. Overwrite? [y/N] `)).trim().toLowerCase();
      rl.close();
      if (answer !== 'y' && answer !== 'yes') {
        process.stdout.write('Left existing config unchanged.\n');
        return 0;
      }
    } else {
      process.stdout.write(`Config already exists at ${path}. Re-run interactively to overwrite.\n`);
      return 0;
    }
  }

  let provider = global.provider ?? 'openai';
  if (interactive) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const p = (
      await rl.question(
        'Provider [openai/anthropic/ollama/ollama-cloud/openrouter/zenmux/opencode/gemini/deepseek/groq/mock] (openai): ',
      )
    ).trim();
    rl.close();
    if (p && PROVIDER_DEFAULTS[p]) provider = p;
  }

  const defaults = PROVIDER_DEFAULTS[provider] ?? PROVIDER_DEFAULTS.openai;
  const model = global.model ?? defaults.model;
  const config = scaffoldConfig(provider, model, defaults.apiKeyEnv || undefined);
  writeConfig(config, path);
  exportJsonSchema();
  process.stdout.write(`Created ${path} (provider: ${provider}, model: ${model}).\n`);
  if (defaults.apiKeyEnv) {
    process.stdout.write(`Set your API key: export ${defaults.apiKeyEnv}=...\n`);
  }
  return 0;
}

/** `sky config [get|set|list|validate]` (§4.8). */
export async function configCommand(
  action: string | undefined,
  key: string | undefined,
  value: string | undefined,
  global: GlobalOptions,
): Promise<number> {
  const path = global.config ?? configPath();

  switch (action) {
    case undefined:
      process.stdout.write(`Edit ${path} in your $EDITOR. (Interactive editing is not available here.)\n`);
      return 0;
    case 'get': {
      if (!key) throw new SkyError(ErrorCode.MissingArgument, { name: 'key' });
      const config = loadConfig({ cli: { configPath: path } });
      const result = getConfigKey(config, key);
      process.stdout.write((typeof result === 'string' ? result : JSON.stringify(result, null, 2)) + '\n');
      return 0;
    }
    case 'set': {
      if (!key) throw new SkyError(ErrorCode.MissingArgument, { name: 'key' });
      if (value === undefined) throw new SkyError(ErrorCode.MissingArgument, { name: 'value' });
      const config = configExists(path) ? loadConfig({ cli: { configPath: path } }) : defaultConfig();
      setDeep(config as unknown as Record<string, unknown>, key, coerce(value));
      writeConfig(config, path);
      process.stdout.write(`Set ${key} = ${value}\n`);
      return 0;
    }
    case 'list': {
      const config = loadConfig({ cli: { configPath: path } });
      process.stdout.write(JSON.stringify(config, null, 2) + '\n');
      return 0;
    }
    case 'validate': {
      const config = loadConfig({ cli: { configPath: path } });
      const providerCount = Object.keys(config.providers).length;
      process.stdout.write(`✓ Config is valid (${providerCount} provider(s) configured)\n`);
      return 0;
    }
    default:
      throw new SkyError(ErrorCode.UnknownCommand, { name: `config ${action}` });
  }
}

/** `sky mcp [add|list|remove|test]` (§4.9). */
export async function mcpCommand(
  action: string | undefined,
  name: string | undefined,
  opts: { command?: string; args?: string; env?: string[]; approval?: string },
  global: GlobalOptions,
): Promise<number> {
  const path = global.config ?? configPath();
  const config = configExists(path) ? loadConfig({ cli: { configPath: path } }) : defaultConfig();

  switch (action) {
    case 'list':
    case undefined: {
      const servers = config.mcp.servers;
      if (servers.length === 0) {
        process.stdout.write('No MCP servers registered.\n');
        return 0;
      }
      process.stdout.write(['NAME', 'COMMAND', 'APPROVAL'].join('\t') + '\n');
      for (const s of servers) process.stdout.write([s.name, `${s.command} ${s.args.join(' ')}`.trim(), s.approvalMode].join('\t') + '\n');
      return 0;
    }
    case 'add': {
      if (!name) throw new SkyError(ErrorCode.MissingArgument, { name: 'name' });
      if (!opts.command) throw new SkyError(ErrorCode.MissingArgument, { name: '--command' });
      const env: Record<string, string> = {};
      for (const pair of opts.env ?? []) {
        const idx = pair.indexOf('=');
        if (idx > 0) env[pair.slice(0, idx)] = pair.slice(idx + 1);
      }
      config.mcp.servers = config.mcp.servers.filter((s) => s.name !== name);
      config.mcp.servers.push({
        name,
        command: opts.command,
        args: opts.args ? opts.args.split(' ').filter(Boolean) : [],
        env,
        approvalMode: (opts.approval as 'auto' | 'manual' | 'deny') ?? 'manual',
      });
      writeConfig(config, path);
      process.stdout.write(`Registered MCP server '${name}'.\n`);
      return 0;
    }
    case 'remove': {
      if (!name) throw new SkyError(ErrorCode.MissingArgument, { name: 'name' });
      config.mcp.servers = config.mcp.servers.filter((s) => s.name !== name);
      writeConfig(config, path);
      process.stdout.write(`Removed MCP server '${name}'.\n`);
      return 0;
    }
    case 'test': {
      if (!name) throw new SkyError(ErrorCode.MissingArgument, { name: 'name' });
      const server = config.mcp.servers.find((s) => s.name === name);
      if (!server) throw new SkyError(ErrorCode.McpNotConnected, { name });
      const { testMcpServer } = await import('../mcp/index.js');
      const result = await testMcpServer(server);
      if (result.ok) {
        process.stdout.write(
          `✓ MCP server '${name}' connected. Tools: ${result.tools.length ? result.tools.join(', ') : '(none)'}\n`,
        );
        return 0;
      }
      process.stderr.write(`✗ MCP server '${name}' failed: ${result.error}\n`);
      return 1;
    }
    default:
      throw new SkyError(ErrorCode.UnknownCommand, { name: `mcp ${action}` });
  }
}

// --- helpers ---------------------------------------------------------------

function coerce(value: string): unknown {
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (/^-?\d+$/.test(value)) return Number(value);
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function setDeep(obj: Record<string, unknown>, key: string, value: unknown): void {
  const parts = key.split('.');
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (typeof current[part] !== 'object' || current[part] === null) current[part] = {};
    current = current[part] as Record<string, unknown>;
  }
  current[parts[parts.length - 1]] = value;
}

/** Parse a duration like `7d`, `24h`, `30m` into milliseconds. */
function parseDuration(input: string): number {
  const m = input.match(/^(\d+)([dhm])$/i);
  if (!m) {
    throw new SkyError(ErrorCode.InvalidFlagValue, { flag: '--since', value: input });
  }
  const n = Number(m[1]);
  const unit = m[2].toLowerCase();
  return unit === 'd' ? n * 86_400_000 : unit === 'h' ? n * 3_600_000 : n * 60_000;
}

function plainChalk(): typeof chalk {
  return new Proxy({}, { get: () => (s: string) => s }) as unknown as typeof chalk;
}

export type { SkyConfig };

/** `sky doctor` — diagnose config, keys, providers, MCP, and environment. */
export async function doctorCommand(global: GlobalOptions): Promise<number> {
  const c = global.color === false ? plainChalk() : chalk;
  const lines: string[] = [];
  let issues = 0;

  const check = (ok: boolean, label: string, detail?: string): void => {
    if (ok) lines.push(`${c.green('✓')} ${label}${detail ? c.gray(` — ${detail}`) : ''}`);
    else {
      issues++;
      lines.push(`${c.red('✗')} ${label}${detail ? c.gray(` — ${detail}`) : ''}`);
    }
  };

  lines.push(c.bold('Sky doctor'));
  lines.push('');

  // Node version
  const nodeMajor = Number(process.versions.node.split('.')[0]);
  check(nodeMajor >= 20, `Node.js ${process.versions.node}`, nodeMajor >= 20 ? 'ok' : 'need >= 20');

  // Config
  const path = global.config ?? configPath();
  const hasConfig = configExists(path);
  check(hasConfig, `Config at ${path}`, hasConfig ? 'found' : 'run `sky init`');

  let config = defaultConfig();
  if (hasConfig) {
    try {
      config = loadConfig({ cli: { configPath: path }, cwd: global.cwd ?? process.cwd() });
      check(true, 'Config schema', `provider=${config.defaultProvider} model=${config.defaultModel}`);
    } catch (error) {
      check(false, 'Config schema', SkyError.from(error).message);
    }
  }

  // API key for default provider
  const { hasApiKey } = await import('../config/index.js');
  const provider = global.provider ?? config.defaultProvider;
  const keyOk =
    provider === 'mock' || provider === 'ollama' || hasApiKey(provider, config.providers[provider]);
  check(keyOk, `API key for ${provider}`, keyOk ? 'resolved' : `set via /key or export ${provider.toUpperCase().replace(/-/g, '_')}_API_KEY`);

  // Optional SDKs
  try {
    await import('openai');
    check(true, 'openai SDK', 'installed');
  } catch {
    check(false, 'openai SDK', 'run `npm install openai`');
  }
  try {
    await import('@anthropic-ai/sdk');
    check(true, '@anthropic-ai/sdk', 'installed');
  } catch {
    check(provider !== 'anthropic', '@anthropic-ai/sdk', 'optional unless using anthropic');
  }

  // Plugins / skills / MCP
  try {
    const { PluginManager } = await import('../plugins/index.js');
    const plugins = new PluginManager().load();
    check(true, 'Plugins', `${plugins.length} loaded`);
  } catch (error) {
    check(false, 'Plugins', (error as Error).message);
  }

  try {
    const { loadSkills } = await import('../skills/index.js');
    const skills = loadSkills({ cwd: global.cwd ?? process.cwd() });
    check(true, 'Skills', `${skills.length} loaded (from ~/.sky/skills and .sky/skills)`);
  } catch (error) {
    check(false, 'Skills', (error as Error).message);
  }

  const mcpServers = config.mcp.servers;
  if (mcpServers.length === 0) {
    check(true, 'MCP servers', 'none registered (sky mcp add …)');
  } else {
    const { testMcpServer } = await import('../mcp/index.js');
    for (const server of mcpServers) {
      const result = await testMcpServer(server);
      check(result.ok, `MCP ${server.name}`, result.ok ? `${result.tools.length} tools` : result.error);
    }
  }

  lines.push('');
  if (issues === 0) {
    lines.push(c.green('All checks passed. Ready to fly.'));
  } else {
    lines.push(c.yellow(`${issues} issue(s) found. Fix the items marked ✗ above.`));
  }

  process.stdout.write(lines.join('\n') + '\n');
  return issues === 0 ? 0 : 1;
}
