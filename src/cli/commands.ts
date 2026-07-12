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
  opencode: { apiKeyEnv: '', model: 'deepseek-v4-flash-free' },
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
      await rl.question('Provider [openai/anthropic/ollama/ollama-cloud/openrouter/zenmux/opencode/mock] (openai): ')
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
      process.stdout.write(`MCP server '${name}' is registered (${server.command}). Live connection test requires @modelcontextprotocol/sdk.\n`);
      return 0;
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
  const m = input.match(/^(\d+)([dhm])$/);
  if (!m) return 0;
  const n = Number(m[1]);
  return m[2] === 'd' ? n * 86_400_000 : m[2] === 'h' ? n * 3_600_000 : n * 60_000;
}

function plainChalk(): typeof chalk {
  return new Proxy({}, { get: () => (s: string) => s }) as unknown as typeof chalk;
}

export type { SkyConfig };
