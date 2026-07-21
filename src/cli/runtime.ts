import { createLogger, nullLogger, type Logger, type LogLevel } from '../logging/index.js';
import { loadConfig, requireConfig, logFilePath, type SkyConfig } from '../config/index.js';
import { createSessionStore, type AnySessionStore } from '../session/create-store.js';
import { createProvider } from '../llm/registry.js';
import type { Provider } from '../llm/types.js';
import { ToolRegistry } from '../tools/registry.js';
import { Policy } from '../safety/policy.js';
import { AuditLog } from '../safety/audit.js';
import { Approver, type Prompter } from '../safety/approver.js';
import { PluginManager, type LoadedPlugin } from '../plugins/index.js';
import { loadSkills, type Skill } from '../skills/index.js';
import { connectAllMcp, type McpClient } from '../mcp/index.js';

/** Global flags shared by every command (§4.2). */
export interface GlobalOptions {
  model?: string;
  provider?: string;
  yolo?: boolean;
  force?: boolean;
  cwd?: string;
  session?: string;
  config?: string;
  verbose?: boolean;
  quiet?: boolean;
  color?: boolean; // false when --no-color
  json?: boolean;
  /** Attach Ink TUI / headless runner to a running daemon over SSE. */
  attach?: boolean;
  attachUrl?: string;
  attachToken?: string;
}

/** Everything a command needs, assembled once at startup. */
export interface Runtime {
  config: SkyConfig;
  logger: Logger;
  store: AnySessionStore;
  registry: ToolRegistry;
  cwd: string;
  color: boolean;
  json: boolean;
  /** Plugins loaded (auto-reloaded) on this invocation. */
  plugins: LoadedPlugin[];
  /** Skills loaded from ~/.sky/skills and project .sky/skills. */
  skills: Skill[];
  /** Live MCP clients (connected best-effort). */
  mcpClients: McpClient[];
  /** Set once `attachMcp` has run so it is not re-connected every turn. */
  mcpAttached?: boolean;
}

/** Resolve the effective working directory (§4.2 --cwd). */
export function resolveCwd(options: GlobalOptions): string {
  return options.cwd ?? process.cwd();
}

/** Whether ANSI color should be used (§5.7). */
export function resolveColor(options: GlobalOptions): boolean {
  if (options.color === false) return false;
  if (process.env.NO_COLOR || process.env.SKY_NO_COLOR) return false;
  if (process.env.SKY_FORCE_COLOR || process.env.FORCE_COLOR) return true;
  return process.stdout.isTTY ?? false;
}

/** Build the shared runtime. `requireExisting` enforces a config file exists. */
export function buildRuntime(options: GlobalOptions, requireExisting = true): Runtime {
  const level: LogLevel = options.verbose ? 'debug' : options.quiet ? 'error' : 'info';
  const logger = options.quiet
    ? nullLogger
    : createLogger({ level, file: logFilePath(), stderr: options.verbose ?? false });

  const cli = { defaultProvider: options.provider, defaultModel: options.model, configPath: options.config };
  const cwd = resolveCwd(options);
  const config = requireExisting
    ? requireConfig({ cwd, cli, logger })
    : loadConfig({ cwd, cli, logger });

  // Auto-load installed plugins on every invocation and merge their MCP servers
  // into the effective config so the agent can call them.
  let plugins: LoadedPlugin[] = [];
  const pluginSkillDirs: string[] = [];
  try {
    const pm = new PluginManager({ logger });
    plugins = pm.load();
    for (const plugin of plugins) {
      for (const server of plugin.mcpServers) {
        if (!config.mcp.servers.some((s) => s.name === server.name)) {
          config.mcp.servers.push({ ...server, approvalMode: 'manual' });
        }
      }
    }
    for (const installed of pm.listInstalled()) {
      if (installed.enabled) pluginSkillDirs.push(`${installed.path}/skills`);
    }
    if (plugins.length) {
      logger.info('plugins.loaded', {
        count: plugins.length,
        names: plugins.map((p) => p.name),
      });
    }
  } catch (error) {
    logger.warn('plugins.loadFailed', { detail: (error as Error).message });
  }

  const skills = loadSkills({ cwd, extraDirs: pluginSkillDirs });
  if (skills.length) {
    logger.info('skills.loaded', { count: skills.length, names: skills.map((s) => s.name) });
  }

  const registry = new ToolRegistry();

  return {
    config,
    logger,
    store: createSessionStore({ logger, backend: config.sessions.backend }),
    registry,
    cwd,
    color: resolveColor(options),
    json: options.json ?? false,
    plugins,
    skills,
    mcpClients: [],
  };
}

/**
 * Connect configured MCP servers and register their tools. Idempotent: the
 * interactive readline loop calls this once per turn, but re-spawning every
 * server on each submission would leak child processes and duplicate tool
 * registrations, so subsequent calls are no-ops (best-effort — failures are
 * logged, not thrown).
 */
export async function attachMcp(runtime: Runtime): Promise<void> {
  if (runtime.mcpAttached) return;
  runtime.mcpAttached = true;
  if (runtime.config.mcp.servers.length === 0) return;
  try {
    runtime.mcpClients = await connectAllMcp({
      servers: runtime.config.mcp.servers,
      registry: runtime.registry,
      logger: runtime.logger,
    });
  } catch (error) {
    runtime.logger.warn('mcp.attachFailed', { detail: (error as Error).message });
  }
}

/** Instantiate the configured provider. */
export function makeProvider(runtime: Runtime, options: GlobalOptions): Provider {
  const providerName = options.provider ?? runtime.config.defaultProvider;
  const model =
    options.model ?? runtime.config.providers[providerName]?.defaultModel ?? runtime.config.defaultModel;
  return createProvider({
    config: runtime.config,
    provider: providerName,
    logger: runtime.logger,
    model,
  });
}

/** Instantiate a provider by name (used by the TUI to switch providers live). */
export function makeProviderByName(runtime: Runtime, providerName: string, model?: string): Provider {
  return createProvider({
    config: runtime.config,
    provider: providerName,
    logger: runtime.logger,
    model: model ?? runtime.config.providers[providerName]?.defaultModel,
  });
}

/** Build the safety Approver for a run, wiring flags and the interactive prompter. */
export function makeApprover(
  runtime: Runtime,
  options: GlobalOptions,
  policy: Policy,
  prompter?: Prompter,
): Approver {
  return new Approver({
    policy,
    audit: new AuditLog({ logger: runtime.logger }),
    prompter,
    logger: runtime.logger,
    force: options.force,
    yolo: options.yolo,
  });
}
