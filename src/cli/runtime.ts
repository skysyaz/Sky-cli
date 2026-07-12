import { createLogger, nullLogger, type Logger, type LogLevel } from '../logging/index.js';
import { loadConfig, requireConfig, logFilePath, type SkyConfig } from '../config/index.js';
import { SessionStore } from '../session/store.js';
import { createProvider } from '../llm/registry.js';
import type { Provider } from '../llm/types.js';
import { ToolRegistry } from '../tools/registry.js';
import { Policy } from '../safety/policy.js';
import { AuditLog } from '../safety/audit.js';
import { Approver, type Prompter } from '../safety/approver.js';

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
}

/** Everything a command needs, assembled once at startup. */
export interface Runtime {
  config: SkyConfig;
  logger: Logger;
  store: SessionStore;
  registry: ToolRegistry;
  cwd: string;
  color: boolean;
  json: boolean;
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
  const config = requireExisting
    ? requireConfig({ cwd: resolveCwd(options), cli, logger })
    : loadConfig({ cwd: resolveCwd(options), cli, logger });

  return {
    config,
    logger,
    store: new SessionStore({ logger }),
    registry: new ToolRegistry(),
    cwd: resolveCwd(options),
    color: resolveColor(options),
    json: options.json ?? false,
  };
}

/** Instantiate the configured provider. */
export function makeProvider(runtime: Runtime, options: GlobalOptions): Provider {
  const providerName = options.provider ?? runtime.config.defaultProvider;
  return createProvider({ config: runtime.config, provider: providerName, logger: runtime.logger });
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
