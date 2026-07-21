import { readFileSync, existsSync, writeFileSync, mkdirSync, chmodSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { ZodError } from 'zod';
import { ErrorCode, SkyError } from '../errors/index.js';
import type { Logger } from '../logging/index.js';
import { configPath, configSchemaPath, skyHome } from './paths.js';
import { configSchema, parseConfig, defaultConfig, type SkyConfig } from './schema.js';

export * from './schema.js';
export * from './paths.js';
export {
  resolveApiKey,
  writeSecret,
  readSecret,
  clearSecret,
  hasApiKey,
  secretsPath,
  OPENCODE_FREE_MODELS,
  isOpenCodeFreeModel,
} from './secrets.js';
export {
  providerAuthTag,
  providerAuthSetupCard,
  providerAuthHint,
  isKeylessProvider,
  type ProviderAuthHelp,
} from './provider-auth.js';
export {
  listKeyRows,
  formatKeysDashboard,
  maskSecret,
  keysHelpForProvider,
  type KeyRow,
} from './keys-dashboard.js';

/** Overrides supplied from the command line (precedence level 5 — highest). */
export interface CliOverrides {
  defaultProvider?: string;
  defaultModel?: string;
  configPath?: string;
}

export interface LoadConfigOptions {
  /** Explicit config path (from `--config`); defaults to {@link configPath}. */
  path?: string;
  /** Working directory used to locate a `.skyrc` project override. */
  cwd?: string;
  /**
   * Skip merging cwd `.skyrc`. Use when writing global config so project
   * overrides are not persisted into `~/.sky/config.json`.
   */
  skipProject?: boolean;
  /** Environment used for `SKY_*` overrides (injectable for tests). */
  env?: NodeJS.ProcessEnv;
  /** Highest-precedence CLI overrides. */
  cli?: CliOverrides;
  logger?: Logger;
}

/** Deep-merge two plain objects; `source` wins. Arrays are replaced wholesale. */
function deepMerge<T extends Record<string, unknown>>(target: T, source: Record<string, unknown>): T {
  const out: Record<string, unknown> = { ...target };
  for (const [key, value] of Object.entries(source)) {
    if (value === undefined) continue;
    const existing = out[key];
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      existing &&
      typeof existing === 'object' &&
      !Array.isArray(existing)
    ) {
      out[key] = deepMerge(existing as Record<string, unknown>, value as Record<string, unknown>);
    } else {
      out[key] = value;
    }
  }
  return out as T;
}

function readJsonIfExists(path: string): Record<string, unknown> | undefined {
  if (!existsSync(path)) return undefined;
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (cause) {
    throw new SkyError(ErrorCode.ConfigParseFailed, { detail: `cannot read ${path}` }, cause);
  }
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch (cause) {
    throw new SkyError(
      ErrorCode.ConfigParseFailed,
      { detail: `${path}: ${(cause as Error).message}` },
      cause,
    );
  }
}

/**
 * Translate `SKY_*` environment variables into a nested override object
 * (precedence level 4). `SKY_DEFAULT_MODEL=gpt-4o` becomes
 * `{ default: { model: 'gpt-4o' } }`... but the spec uses a flat path convention
 * where the underscore separates path segments, so we map known keys explicitly
 * to avoid ambiguity between `defaultModel` and `default.model`.
 */
function envOverrides(env: NodeJS.ProcessEnv): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (env.SKY_DEFAULT_MODEL) out.defaultModel = env.SKY_DEFAULT_MODEL;
  if (env.SKY_DEFAULT_PROVIDER) out.defaultProvider = env.SKY_DEFAULT_PROVIDER;
  if (env.SKY_LOG_LEVEL) out.logging = { level: env.SKY_LOG_LEVEL };
  return out;
}

function cliOverrides(cli: CliOverrides | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (cli?.defaultProvider) out.defaultProvider = cli.defaultProvider;
  if (cli?.defaultModel) out.defaultModel = cli.defaultModel;
  return out;
}

/** Format a ZodError into the "field: reason" list surfaced to the user. */
function formatZodError(error: ZodError): string {
  return error.errors
    .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('; ');
}

/**
 * Load, merge, and validate the configuration (§7.5–7.6). Sources are merged in
 * fixed precedence order (defaults < config.json < .skyrc < SKY_* env < CLI),
 * then the result is validated against the Zod schema. Any validation failure
 * aborts with {@link ErrorCode.ConfigValidationFailed}.
 */
export function loadConfig(options: LoadConfigOptions = {}): SkyConfig {
  const env = options.env ?? process.env;
  const path = options.cli?.configPath ?? options.path ?? configPath();
  const cwd = options.cwd ?? process.cwd();

  // 1. schema defaults (applied last, by parseConfig)
  let merged: Record<string, unknown> = {};

  // 2. ~/.sky/config.json
  const fileConfig = readJsonIfExists(path);
  if (fileConfig) merged = deepMerge(merged, fileConfig);

  // 3. .skyrc in cwd (per-project override) — skipped when writing global config
  if (!options.skipProject) {
    const projectConfig = readJsonIfExists(join(cwd, '.skyrc'));
    if (projectConfig) merged = deepMerge(merged, projectConfig);
  }

  // 4. SKY_* environment variables
  merged = deepMerge(merged, envOverrides(env));

  // 5. CLI flags (highest precedence)
  merged = deepMerge(merged, cliOverrides(options.cli));

  try {
    return parseConfig(merged);
  } catch (cause) {
    if (cause instanceof ZodError) {
      throw new SkyError(ErrorCode.ConfigValidationFailed, { fields: formatZodError(cause) }, cause);
    }
    throw SkyError.from(cause, ErrorCode.ConfigValidationFailed);
  }
}

/** Whether a config file exists at the resolved location. */
export function configExists(path: string = configPath()): boolean {
  return existsSync(path);
}

/** Load config or throw {@link ErrorCode.ConfigNotFound} if the file is absent. */
export function requireConfig(options: LoadConfigOptions = {}): SkyConfig {
  const path = options.cli?.configPath ?? options.path ?? configPath();
  if (!configExists(path)) throw new SkyError(ErrorCode.ConfigNotFound);
  return loadConfig(options);
}

/** Read a dotted key path (`providers.openai.defaultModel`) from a config object. */
export function getConfigKey(config: SkyConfig, key: string): unknown {
  const parts = key.split('.');
  let current: unknown = config;
  for (const part of parts) {
    if (current && typeof current === 'object' && part in (current as object)) {
      current = (current as Record<string, unknown>)[part];
    } else {
      throw new SkyError(ErrorCode.ConfigKeyNotFound, { key });
    }
  }
  return current;
}

/**
 * Write a raw config object to disk (used by `sky init` / `sky config set`).
 * Validates before writing so a malformed value can never be persisted.
 */
export function writeConfig(config: SkyConfig, path: string = configPath()): void {
  const validated = configSchema.parse(config);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(validated, null, 2) + '\n', { encoding: 'utf8', mode: 0o600 });
  try {
    chmodSync(path, 0o600);
  } catch {
    // best-effort on platforms that ignore mode
  }
}

/** Export the JSON Schema so editors can offer autocomplete (§7.5). */
export function exportJsonSchema(path: string = configSchemaPath()): void {
  // A minimal JSON-schema-ish descriptor; the real build uses zod-to-json-schema.
  const descriptor = {
    $schema: 'http://json-schema.org/draft-07/schema#',
    title: 'Sky configuration',
    description: 'Generated from src/config/schema.ts',
    type: 'object',
  };
  mkdirSync(skyHome(), { recursive: true });
  writeFileSync(path, JSON.stringify(descriptor, null, 2) + '\n', 'utf8');
}

/** Build a fresh default config for `sky init`. */
export function scaffoldConfig(provider: string, model: string, apiKeyEnv?: string): SkyConfig {
  const base = defaultConfig();
  base.defaultProvider = provider as SkyConfig['defaultProvider'];
  base.defaultModel = model;
  if (apiKeyEnv) {
    base.providers[provider] = { apiKeyEnv, defaultModel: model };
  }
  return base;
}
