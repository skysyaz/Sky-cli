#!/usr/bin/env node
var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/errors/codes.ts
var ErrorCode = /* @__PURE__ */ ((ErrorCode2) => {
  ErrorCode2["ConfigNotFound"] = "SKY-E-1000";
  ErrorCode2["ConfigParseFailed"] = "SKY-E-1001";
  ErrorCode2["NoApiKey"] = "SKY-E-1002";
  ErrorCode2["ConfigValidationFailed"] = "SKY-E-1003";
  ErrorCode2["UnknownProvider"] = "SKY-E-1004";
  ErrorCode2["UnknownModel"] = "SKY-E-1005";
  ErrorCode2["ConfigKeyNotFound"] = "SKY-E-1010";
  ErrorCode2["ConfigKeyWrongType"] = "SKY-E-1011";
  ErrorCode2["ConfigMigrationFailed"] = "SKY-E-1020";
  ErrorCode2["AgentAborted"] = "SKY-E-2000";
  ErrorCode2["ContextWindowExceeded"] = "SKY-E-2001";
  ErrorCode2["NoToolDefinitions"] = "SKY-E-2002";
  ErrorCode2["MaxIterations"] = "SKY-E-2003";
  ErrorCode2["PlanModeRejectedTool"] = "SKY-E-2010";
  ErrorCode2["AskModeReceivedTool"] = "SKY-E-2011";
  ErrorCode2["UnknownTool"] = "SKY-E-3000";
  ErrorCode2["ToolInputInvalid"] = "SKY-E-3001";
  ErrorCode2["ToolOutputInvalid"] = "SKY-E-3002";
  ErrorCode2["WritePathOutsideCwd"] = "SKY-E-3010";
  ErrorCode2["EditOldTextNotFound"] = "SKY-E-3020";
  ErrorCode2["EditOldTextAmbiguous"] = "SKY-E-3021";
  ErrorCode2["SearchFailed"] = "SKY-E-3030";
  ErrorCode2["ShellDenied"] = "SKY-E-3040";
  ErrorCode2["ShellTimeout"] = "SKY-E-3041";
  ErrorCode2["GitForcePushDenied"] = "SKY-E-3050";
  ErrorCode2["McpDenyMode"] = "SKY-E-3060";
  ErrorCode2["McpNotConnected"] = "SKY-E-3061";
  ErrorCode2["ToolUnexpected"] = "SKY-E-3999";
  ErrorCode2["SessionNotFound"] = "SKY-E-4000";
  ErrorCode2["SessionMigrationFailed"] = "SKY-E-4001";
  ErrorCode2["SessionCorrupt"] = "SKY-E-4002";
  ErrorCode2["SessionReadOnly"] = "SKY-E-4010";
  ErrorCode2["SessionIndexCorrupt"] = "SKY-E-4020";
  ErrorCode2["ProviderRequestFailed"] = "SKY-E-5000";
  ErrorCode2["ProviderRateLimited"] = "SKY-E-5001";
  ErrorCode2["ProviderUnavailable"] = "SKY-E-5002";
  ErrorCode2["ProviderTimeout"] = "SKY-E-5003";
  ErrorCode2["ProviderBadRequest"] = "SKY-E-5010";
  ErrorCode2["ProviderAuthFailed"] = "SKY-E-5011";
  ErrorCode2["ProviderForbidden"] = "SKY-E-5012";
  ErrorCode2["ProviderContentFilter"] = "SKY-E-5013";
  ErrorCode2["ProviderStreamInterrupted"] = "SKY-E-5020";
  ErrorCode2["ProviderStreamParse"] = "SKY-E-5030";
  ErrorCode2["ProviderBudgetExceeded"] = "SKY-E-5040";
  ErrorCode2["ProviderUnknown"] = "SKY-E-5099";
  ErrorCode2["ApprovalDenied"] = "SKY-E-6000";
  ErrorCode2["ApprovalTimeout"] = "SKY-E-6001";
  ErrorCode2["PolicyViolation"] = "SKY-E-6010";
  ErrorCode2["AuditWriteFailed"] = "SKY-E-6020";
  ErrorCode2["TerminalTooNarrow"] = "SKY-E-7000";
  ErrorCode2["TerminalNoColor"] = "SKY-E-7001";
  ErrorCode2["TuiRenderError"] = "SKY-E-7010";
  ErrorCode2["UnknownCommand"] = "SKY-E-8000";
  ErrorCode2["MissingArgument"] = "SKY-E-8001";
  ErrorCode2["InvalidFlagValue"] = "SKY-E-8002";
  ErrorCode2["InstanceLocked"] = "SKY-E-8010";
  ErrorCode2["InternalError"] = "SKY-E-8099";
  return ErrorCode2;
})(ErrorCode || {});
var ERROR_CATALOG = {
  // 1xxx
  ["SKY-E-1000" /* ConfigNotFound */]: { message: "Config file not found. Run `sky init` to create one.", retryable: false, exitCode: 64 },
  ["SKY-E-1001" /* ConfigParseFailed */]: { message: "Config file failed to parse: {detail}", retryable: false, exitCode: 64 },
  ["SKY-E-1002" /* NoApiKey */]: { message: "No API key configured for provider {name}.", retryable: false, exitCode: 64 },
  ["SKY-E-1003" /* ConfigValidationFailed */]: { message: "Config schema validation failed: {fields}", retryable: false, exitCode: 64 },
  ["SKY-E-1004" /* UnknownProvider */]: { message: "Unknown provider: {name}", retryable: false, exitCode: 64 },
  ["SKY-E-1005" /* UnknownModel */]: { message: "Unknown model: {name} for provider {provider}", retryable: false, exitCode: 64 },
  ["SKY-E-1010" /* ConfigKeyNotFound */]: { message: "Config key not found: {key}", retryable: false, exitCode: 64 },
  ["SKY-E-1011" /* ConfigKeyWrongType */]: { message: "Config key has wrong type: {key} expected {expected}", retryable: false, exitCode: 64 },
  ["SKY-E-1020" /* ConfigMigrationFailed */]: { message: "Config migration failed: {detail}", retryable: false, exitCode: 64 },
  // 2xxx
  ["SKY-E-2000" /* AgentAborted */]: { message: "Agent loop aborted by user (Ctrl-C)", retryable: false, exitCode: 130 },
  ["SKY-E-2001" /* ContextWindowExceeded */]: { message: "Context window exceeded. Run `/compact` or start a new session.", retryable: false, exitCode: 68 },
  ["SKY-E-2002" /* NoToolDefinitions */]: { message: "No tool definitions provided but agent requested tool call.", retryable: false, exitCode: 70 },
  ["SKY-E-2003" /* MaxIterations */]: { message: "Agent turn exceeded max iterations ({n}).", retryable: false, exitCode: 70 },
  ["SKY-E-2010" /* PlanModeRejectedTool */]: { message: "Plan mode rejected tool call: {name}.", retryable: false, exitCode: 0 },
  ["SKY-E-2011" /* AskModeReceivedTool */]: { message: "Ask mode received tool call (should be filtered).", retryable: false, exitCode: 70 },
  // 3xxx
  ["SKY-E-3000" /* UnknownTool */]: { message: "Unknown tool: {name}", retryable: false, exitCode: 70 },
  ["SKY-E-3001" /* ToolInputInvalid */]: { message: "Tool input validation failed: {detail}", retryable: true, exitCode: 0 },
  ["SKY-E-3002" /* ToolOutputInvalid */]: { message: "Tool output validation failed (internal bug)", retryable: false, exitCode: 70 },
  ["SKY-E-3010" /* WritePathOutsideCwd */]: { message: "Write refused: path outside cwd ({path})", retryable: true, exitCode: 0 },
  ["SKY-E-3020" /* EditOldTextNotFound */]: { message: "Edit failed: oldText not found in {path}", retryable: true, exitCode: 0 },
  ["SKY-E-3021" /* EditOldTextAmbiguous */]: { message: "Edit failed: oldText ambiguous ({n} matches)", retryable: true, exitCode: 0 },
  ["SKY-E-3030" /* SearchFailed */]: { message: "Search failed: ripgrep error: {detail}", retryable: false, exitCode: 0 },
  ["SKY-E-3040" /* ShellDenied */]: { message: "Shell command denied (denylist): {command}", retryable: false, exitCode: 0 },
  ["SKY-E-3041" /* ShellTimeout */]: { message: "Shell command timed out after {n}ms", retryable: false, exitCode: 0 },
  ["SKY-E-3050" /* GitForcePushDenied */]: { message: "Git force push denied by policy", retryable: false, exitCode: 0 },
  ["SKY-E-3060" /* McpDenyMode */]: { message: "MCP server {name} is in deny mode", retryable: false, exitCode: 0 },
  ["SKY-E-3061" /* McpNotConnected */]: { message: "MCP server {name} not connected", retryable: false, exitCode: 0 },
  ["SKY-E-3999" /* ToolUnexpected */]: { message: "Unexpected tool error: {detail}", retryable: false, exitCode: 70 },
  // 4xxx
  ["SKY-E-4000" /* SessionNotFound */]: { message: "Session not found: {id}", retryable: false, exitCode: 65 },
  ["SKY-E-4001" /* SessionMigrationFailed */]: { message: "Session schema migration failed: {detail}", retryable: false, exitCode: 65 },
  ["SKY-E-4002" /* SessionCorrupt */]: { message: "Session file corrupt: {detail}", retryable: false, exitCode: 65 },
  ["SKY-E-4010" /* SessionReadOnly */]: { message: "Session is read-only (--view mode)", retryable: false, exitCode: 2 },
  ["SKY-E-4020" /* SessionIndexCorrupt */]: { message: "Session index corrupt; rebuilding", retryable: false, exitCode: 0 },
  // 5xxx
  ["SKY-E-5000" /* ProviderRequestFailed */]: { message: "Provider request failed: {detail}", retryable: true, exitCode: 66 },
  ["SKY-E-5001" /* ProviderRateLimited */]: { message: "Provider rate limited (429)", retryable: true, exitCode: 66 },
  ["SKY-E-5002" /* ProviderUnavailable */]: { message: "Provider temporarily unavailable (503)", retryable: true, exitCode: 66 },
  ["SKY-E-5003" /* ProviderTimeout */]: { message: "Provider timeout after {n}ms", retryable: true, exitCode: 66 },
  ["SKY-E-5010" /* ProviderBadRequest */]: { message: "Provider bad request (400): {detail}", retryable: false, exitCode: 66 },
  ["SKY-E-5011" /* ProviderAuthFailed */]: { message: "Provider authentication failed (401)", retryable: false, exitCode: 66 },
  ["SKY-E-5012" /* ProviderForbidden */]: { message: "Provider forbidden (403): {detail}", retryable: false, exitCode: 66 },
  ["SKY-E-5013" /* ProviderContentFilter */]: { message: "Provider requested content filter (451)", retryable: false, exitCode: 66 },
  ["SKY-E-5020" /* ProviderStreamInterrupted */]: { message: "Provider response stream interrupted", retryable: true, exitCode: 66 },
  ["SKY-E-5030" /* ProviderStreamParse */]: { message: "Provider stream parse error: {detail}", retryable: false, exitCode: 66 },
  ["SKY-E-5040" /* ProviderBudgetExceeded */]: { message: "Provider cost budget exceeded ({spent} > {budget})", retryable: false, exitCode: 66 },
  ["SKY-E-5099" /* ProviderUnknown */]: { message: "Unknown provider error: {detail}", retryable: false, exitCode: 66 },
  // 6xxx
  ["SKY-E-6000" /* ApprovalDenied */]: { message: "User denied approval for tool call: {name}", retryable: false, exitCode: 67 },
  ["SKY-E-6001" /* ApprovalTimeout */]: { message: "Approval timed out after {n}s", retryable: false, exitCode: 67 },
  ["SKY-E-6010" /* PolicyViolation */]: { message: "Policy violation: {detail}", retryable: false, exitCode: 67 },
  ["SKY-E-6020" /* AuditWriteFailed */]: { message: "Audit log write failed: {detail}", retryable: false, exitCode: 70 },
  // 7xxx
  ["SKY-E-7000" /* TerminalTooNarrow */]: { message: "Terminal too narrow (min 60 cols)", retryable: false, exitCode: 70 },
  ["SKY-E-7001" /* TerminalNoColor */]: { message: "Terminal does not support color (use --no-color)", retryable: false, exitCode: 70 },
  ["SKY-E-7010" /* TuiRenderError */]: { message: "TUI render error: {detail}", retryable: false, exitCode: 70 },
  // 8xxx
  ["SKY-E-8000" /* UnknownCommand */]: { message: "Unknown command: {name}", retryable: false, exitCode: 2 },
  ["SKY-E-8001" /* MissingArgument */]: { message: "Missing required argument: {name}", retryable: false, exitCode: 2 },
  ["SKY-E-8002" /* InvalidFlagValue */]: { message: "Invalid flag value: {flag}={value}", retryable: false, exitCode: 2 },
  ["SKY-E-8010" /* InstanceLocked */]: { message: "Cannot start Sky: another instance holds the lock", retryable: false, exitCode: 1 },
  ["SKY-E-8099" /* InternalError */]: { message: "Internal error (please file a bug): {detail}", retryable: false, exitCode: 70 }
};

// src/errors/SkyError.ts
var SkyError = class _SkyError extends Error {
  /** The stable code, e.g. `SKY-E-1002`. */
  code;
  /** Whether the operation that produced this error may be retried. */
  retryable;
  /** Process exit code to use if this error terminates the process. */
  exitCode;
  /** The originating error, if this wraps a lower-level failure. */
  cause;
  /** The interpolation context used to render the message. */
  context;
  constructor(code, context = {}, cause) {
    const meta = ERROR_CATALOG[code];
    super(_SkyError.render(meta.message, context));
    this.name = "SkyError";
    this.code = code;
    this.retryable = meta.retryable;
    this.exitCode = meta.exitCode;
    this.context = context;
    if (cause !== void 0) this.cause = cause;
    Object.setPrototypeOf(this, _SkyError.prototype);
  }
  /** Fill `{placeholders}` in a template from the supplied context. */
  static render(template, context) {
    return template.replace(/\{(\w+)\}/g, (_, key) => {
      const value = context[key];
      return value === void 0 ? `{${key}}` : String(value);
    });
  }
  /** Type guard for narrowing an unknown thrown value to a {@link SkyError}. */
  static is(value) {
    return value instanceof _SkyError;
  }
  /**
   * Wrap an arbitrary thrown value in a SkyError. If it is already a SkyError it
   * is returned unchanged; otherwise it becomes an {@link ErrorCode.InternalError}.
   */
  static from(value, fallback = "SKY-E-8099" /* InternalError */) {
    if (_SkyError.is(value)) return value;
    const detail = value instanceof Error ? value.message : String(value);
    return new _SkyError(fallback, { detail }, value);
  }
  /** A structured, log-friendly representation. */
  toJSON() {
    return {
      code: this.code,
      message: this.message,
      retryable: this.retryable,
      exitCode: this.exitCode
    };
  }
  /**
   * A user-facing message in the "what / why / what to do" style of §11.8,
   * prefixed with the bracketed code for bug reports.
   */
  toUserMessage() {
    return `[${this.code}] ${this.message}`;
  }
};

// src/errors/index.ts
var errors_exports = {};
__export(errors_exports, {
  ERROR_CATALOG: () => ERROR_CATALOG,
  ErrorCode: () => ErrorCode,
  SkyError: () => SkyError
});

// src/config/schema.ts
import { z } from "zod";
var providerNameSchema = z.enum([
  "openai",
  "anthropic",
  "ollama",
  "ollama-cloud",
  "openrouter",
  "zenmux",
  "opencode",
  "mock"
]);
var modelMetaSchema = z.object({
  contextWindow: z.number().int().positive().optional(),
  maxOutput: z.number().int().positive().optional(),
  inputCostPerMTok: z.number().nonnegative().optional(),
  outputCostPerMTok: z.number().nonnegative().optional()
});
var fallbackSchema = z.object({
  provider: providerNameSchema,
  model: z.string(),
  triggerAfter: z.number().int().nonnegative().default(4)
});
var providerConfigSchema = z.object({
  apiKeyEnv: z.string().optional(),
  apiKey: z.string().optional(),
  baseUrl: z.string().url().optional(),
  defaultModel: z.string().optional(),
  models: z.record(modelMetaSchema).optional(),
  fallback: fallbackSchema.optional()
});
var toolsSchema = z.object({
  read: z.object({
    autoApprove: z.array(z.string()).default([]),
    deny: z.array(z.string()).default([".env*", "credentials*", "*.pem", "*.key"])
  }).default({}),
  write: z.object({
    allowOutsideCwd: z.boolean().default(false),
    autoApprove: z.array(z.string()).default([])
  }).default({}),
  edit: z.object({
    autoApprove: z.array(z.string()).default([])
  }).default({}),
  shell: z.object({
    autoApprove: z.array(z.string()).default([]),
    deny: z.array(z.string()).default(["rm -rf /", "mkfs.*", "dd of=/dev/*", "shutdown", "reboot"]),
    env: z.record(z.string()).default({}),
    timeoutMs: z.number().int().positive().default(12e4)
  }).default({}),
  git: z.object({
    allowForcePush: z.boolean().default(false),
    autoApproveReads: z.boolean().default(true)
  }).default({})
}).default({});
var tuiSchema = z.object({
  theme: z.object({
    colors: z.object({
      accent: z.string().default("cyan"),
      success: z.string().default("green"),
      error: z.string().default("red"),
      warning: z.string().default("yellow"),
      info: z.string().default("blue"),
      planning: z.string().default("magenta")
    }).default({}),
    glyphs: z.object({
      indicator: z.string().default("\u2B22"),
      bullet: z.string().default("\u2022"),
      arrow: z.string().default("\u2192")
    }).default({}),
    layout: z.object({
      submitOnEnter: z.boolean().default(true),
      showTokenBar: z.boolean().default(true),
      compactMode: z.boolean().default(false)
    }).default({})
  }).default({})
}).default({});
var sessionsSchema = z.object({
  autoCompact: z.boolean().default(true),
  autoCompactThreshold: z.number().int().positive().default(5e4),
  retentionDays: z.number().int().positive().default(90),
  budgetUsd: z.number().nonnegative().optional()
}).default({});
var loggingSchema = z.object({
  level: z.enum(["trace", "debug", "info", "warn", "error"]).default("info"),
  fileRetentionDays: z.number().int().positive().default(30)
}).default({});
var mcpServerSchema = z.object({
  name: z.string(),
  command: z.string(),
  args: z.array(z.string()).default([]),
  env: z.record(z.string()).default({}),
  approvalMode: z.enum(["auto", "manual", "deny"]).default("manual")
});
var mcpSchema = z.object({
  servers: z.array(mcpServerSchema).default([])
}).default({});
var observabilitySchema = z.object({
  otlpEndpoint: z.string().url().optional(),
  metricsPort: z.number().int().positive().optional(),
  webhook: z.object({ url: z.string().url() }).optional(),
  sentryDsn: z.string().optional()
}).default({});
var configSchema = z.object({
  schemaVersion: z.literal(1).default(1),
  defaultProvider: providerNameSchema.default("openai"),
  defaultModel: z.string().default("gpt-4o"),
  providers: z.record(providerConfigSchema).default({}),
  tools: toolsSchema,
  tui: tuiSchema,
  sessions: sessionsSchema,
  logging: loggingSchema,
  mcp: mcpSchema,
  observability: observabilitySchema
});
function parseConfig(input) {
  return configSchema.parse(input ?? {});
}
function defaultConfig() {
  return configSchema.parse({});
}

// src/config/index.ts
var config_exports = {};
__export(config_exports, {
  auditDir: () => auditDir,
  auditLogPath: () => auditLogPath,
  configExists: () => configExists,
  configPath: () => configPath,
  configSchema: () => configSchema,
  configSchemaPath: () => configSchemaPath,
  defaultConfig: () => defaultConfig,
  exportJsonSchema: () => exportJsonSchema,
  getConfigKey: () => getConfigKey,
  installedPluginsDir: () => installedPluginsDir,
  loadConfig: () => loadConfig,
  logFilePath: () => logFilePath,
  logsDir: () => logsDir,
  marketplacesDir: () => marketplacesDir,
  parseConfig: () => parseConfig,
  pluginsDir: () => pluginsDir,
  pluginsStatePath: () => pluginsStatePath,
  providerNameSchema: () => providerNameSchema,
  requireConfig: () => requireConfig,
  resolveApiKey: () => resolveApiKey,
  scaffoldConfig: () => scaffoldConfig,
  sessionsDir: () => sessionsDir,
  sessionsIndexPath: () => sessionsIndexPath,
  skyHome: () => skyHome,
  writeConfig: () => writeConfig
});
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "fs";
import { join as join2, dirname } from "path";
import { ZodError } from "zod";

// src/config/paths.ts
import { homedir } from "os";
import { join } from "path";
function skyHome() {
  return process.env.SKY_HOME ?? join(homedir(), ".sky");
}
function configPath() {
  return process.env.SKY_CONFIG ?? join(skyHome(), "config.json");
}
function configSchemaPath() {
  return join(skyHome(), "config.schema.json");
}
function sessionsDir() {
  return join(skyHome(), "sessions");
}
function sessionsIndexPath() {
  return join(skyHome(), "sessions.index");
}
function logsDir() {
  return join(skyHome(), "logs");
}
function logFilePath() {
  return join(logsDir(), "sky.log");
}
function auditDir() {
  return join(skyHome(), "audit");
}
function auditLogPath() {
  return join(auditDir(), "audit.log");
}
function pluginsDir() {
  return join(skyHome(), "plugins");
}
function marketplacesDir() {
  return join(pluginsDir(), "marketplaces");
}
function installedPluginsDir() {
  return join(pluginsDir(), "installed");
}
function pluginsStatePath() {
  return join(pluginsDir(), "plugins.json");
}

// src/config/secrets.ts
function resolveApiKey(providerName, providerConfig, logger, env = process.env) {
  if (providerName === "mock" || providerName === "ollama" || providerName === "opencode") return "";
  if (providerConfig?.apiKey) {
    logger?.warn("config.apiKey.literal", {
      provider: providerName,
      hint: "Prefer apiKeyEnv over a literal apiKey in config.json"
    });
    return providerConfig.apiKey;
  }
  if (providerConfig?.apiKeyEnv) {
    const fromEnv = env[providerConfig.apiKeyEnv];
    if (fromEnv) return fromEnv;
  }
  const envName = providerName.toUpperCase().replace(/[^A-Z0-9]/g, "_");
  const conventional = env[`SKY_PROVIDERS_${envName}_API_KEY`];
  if (conventional) return conventional;
  throw new SkyError("SKY-E-1002" /* NoApiKey */, { name: providerName });
}

// src/config/index.ts
function deepMerge(target, source) {
  const out = { ...target };
  for (const [key, value] of Object.entries(source)) {
    if (value === void 0) continue;
    const existing = out[key];
    if (value && typeof value === "object" && !Array.isArray(value) && existing && typeof existing === "object" && !Array.isArray(existing)) {
      out[key] = deepMerge(existing, value);
    } else {
      out[key] = value;
    }
  }
  return out;
}
function readJsonIfExists(path) {
  if (!existsSync(path)) return void 0;
  let raw;
  try {
    raw = readFileSync(path, "utf8");
  } catch (cause) {
    throw new SkyError("SKY-E-1001" /* ConfigParseFailed */, { detail: `cannot read ${path}` }, cause);
  }
  try {
    return JSON.parse(raw);
  } catch (cause) {
    throw new SkyError(
      "SKY-E-1001" /* ConfigParseFailed */,
      { detail: `${path}: ${cause.message}` },
      cause
    );
  }
}
function envOverrides(env) {
  const out = {};
  if (env.SKY_DEFAULT_MODEL) out.defaultModel = env.SKY_DEFAULT_MODEL;
  if (env.SKY_DEFAULT_PROVIDER) out.defaultProvider = env.SKY_DEFAULT_PROVIDER;
  if (env.SKY_LOG_LEVEL) out.logging = { level: env.SKY_LOG_LEVEL };
  return out;
}
function cliOverrides(cli) {
  const out = {};
  if (cli?.defaultProvider) out.defaultProvider = cli.defaultProvider;
  if (cli?.defaultModel) out.defaultModel = cli.defaultModel;
  return out;
}
function formatZodError(error) {
  return error.errors.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`).join("; ");
}
function loadConfig(options = {}) {
  const env = options.env ?? process.env;
  const path = options.cli?.configPath ?? options.path ?? configPath();
  const cwd = options.cwd ?? process.cwd();
  let merged = {};
  const fileConfig = readJsonIfExists(path);
  if (fileConfig) merged = deepMerge(merged, fileConfig);
  const projectConfig = readJsonIfExists(join2(cwd, ".skyrc"));
  if (projectConfig) merged = deepMerge(merged, projectConfig);
  merged = deepMerge(merged, envOverrides(env));
  merged = deepMerge(merged, cliOverrides(options.cli));
  try {
    return parseConfig(merged);
  } catch (cause) {
    if (cause instanceof ZodError) {
      throw new SkyError("SKY-E-1003" /* ConfigValidationFailed */, { fields: formatZodError(cause) }, cause);
    }
    throw SkyError.from(cause, "SKY-E-1003" /* ConfigValidationFailed */);
  }
}
function configExists(path = configPath()) {
  return existsSync(path);
}
function requireConfig(options = {}) {
  const path = options.cli?.configPath ?? options.path ?? configPath();
  if (!configExists(path)) throw new SkyError("SKY-E-1000" /* ConfigNotFound */);
  return loadConfig(options);
}
function getConfigKey(config, key) {
  const parts = key.split(".");
  let current = config;
  for (const part of parts) {
    if (current && typeof current === "object" && part in current) {
      current = current[part];
    } else {
      throw new SkyError("SKY-E-1010" /* ConfigKeyNotFound */, { key });
    }
  }
  return current;
}
function writeConfig(config, path = configPath()) {
  const validated = configSchema.parse(config);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(validated, null, 2) + "\n", "utf8");
}
function exportJsonSchema(path = configSchemaPath()) {
  const descriptor = {
    $schema: "http://json-schema.org/draft-07/schema#",
    title: "Sky configuration",
    description: "Generated from src/config/schema.ts",
    type: "object"
  };
  mkdirSync(skyHome(), { recursive: true });
  writeFileSync(path, JSON.stringify(descriptor, null, 2) + "\n", "utf8");
}
function scaffoldConfig(provider, model, apiKeyEnv) {
  const base = defaultConfig();
  base.defaultProvider = provider;
  base.defaultModel = model;
  if (apiKeyEnv) {
    base.providers[provider] = { apiKeyEnv, defaultModel: model };
  }
  return base;
}

// src/logging/index.ts
var logging_exports = {};
__export(logging_exports, {
  createLogger: () => createLogger,
  nullLogger: () => nullLogger,
  redact: () => redact
});
import { mkdirSync as mkdirSync2, createWriteStream } from "fs";
import { dirname as dirname2 } from "path";
var LEVEL_ORDER = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60
};
var SECRET_KEY_PATTERN = /(api[_-]?key|secret|token|password|authorization|bearer)/i;
var SECRET_VALUE_PATTERNS = [
  /sk-[A-Za-z0-9]{16,}/g,
  // OpenAI-style keys
  /sk-ant-[A-Za-z0-9-]{16,}/g,
  // Anthropic-style keys
  /Bearer\s+[A-Za-z0-9._-]{8,}/gi
  // bearer tokens
];
var REDACTED = "[redacted]";
function redact(value) {
  if (typeof value === "string") {
    let out = value;
    for (const pattern of SECRET_VALUE_PATTERNS) out = out.replace(pattern, REDACTED);
    return out;
  }
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    const out = {};
    for (const [key, v] of Object.entries(value)) {
      out[key] = SECRET_KEY_PATTERN.test(key) ? REDACTED : redact(v);
    }
    return out;
  }
  return value;
}
var StructuredLogger = class _StructuredLogger {
  level;
  bindings;
  stream;
  toStderr;
  version;
  constructor(options, bindings = {}, stream) {
    this.level = options.level ?? "info";
    this.bindings = bindings;
    this.toStderr = options.stderr ?? false;
    this.version = options.version ?? "1.0.0";
    if (stream) {
      this.stream = stream;
    } else if (options.file) {
      try {
        mkdirSync2(dirname2(options.file), { recursive: true });
        this.stream = createWriteStream(options.file, { flags: "a" });
      } catch {
        this.stream = void 0;
      }
    }
  }
  write(level, msg, data) {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[this.level]) return;
    const line = {
      level,
      time: (/* @__PURE__ */ new Date()).toISOString(),
      pid: process.pid,
      version: this.version,
      ...this.bindings,
      msg,
      ...data ? { data: redact(data) } : {}
    };
    const serialized = JSON.stringify(line);
    this.stream?.write(serialized + "\n");
    if (this.toStderr || level === "fatal") {
      process.stderr.write(serialized + "\n");
    }
  }
  trace(msg, data) {
    this.write("trace", msg, data);
  }
  debug(msg, data) {
    this.write("debug", msg, data);
  }
  info(msg, data) {
    this.write("info", msg, data);
  }
  warn(msg, data) {
    this.write("warn", msg, data);
  }
  error(msg, data) {
    this.write("error", msg, data);
  }
  fatal(msg, data) {
    this.write("fatal", msg, data);
  }
  child(bindings) {
    return new _StructuredLogger(
      { level: this.level, stderr: this.toStderr, version: this.version },
      { ...this.bindings, ...bindings },
      this.stream
    );
  }
};
function createLogger(options = {}) {
  return new StructuredLogger(options);
}
var nullLogger = {
  trace() {
  },
  debug() {
  },
  info() {
  },
  warn() {
  },
  error() {
  },
  fatal() {
  },
  child() {
    return nullLogger;
  },
  level: "error"
};

// src/llm/tokens.ts
function heuristicCountTokens(messages) {
  let chars = 0;
  for (const message of messages) {
    chars += message.content.length;
    if (message.toolCalls) {
      for (const call of message.toolCalls) {
        chars += call.name.length + JSON.stringify(call.input).length;
      }
    }
    chars += 8;
  }
  return Math.ceil(chars / 4);
}

// src/llm/context.ts
function buildContext(options) {
  const { messages, limits } = options;
  const safetyMargin = options.safetyMargin ?? 2048;
  const keepRecent = options.keepRecentTurns ?? 6;
  const count = options.countTokens ?? heuristicCountTokens;
  const budget = limits.contextWindow - limits.maxOutput - safetyMargin;
  if (budget <= 0) {
    throw new SkyError("SKY-E-2001" /* ContextWindowExceeded */, {});
  }
  const working = messages.map((m) => ({ ...m }));
  if (count(working) <= budget) return working;
  const systemIdx = working.findIndex((m) => m.role === "system");
  const lastUserIdx = findLastIndex(working, (m) => m.role === "user");
  const protectedFrom = Math.max(0, working.length - keepRecent * 2);
  const isProtected = (idx) => idx === systemIdx || idx === lastUserIdx || idx >= protectedFrom;
  for (let i = 0; i < working.length && count(working) > budget; i++) {
    if (isProtected(i)) continue;
    if (working[i].role === "tool" && working[i].content.length > 40) {
      const bytes = Buffer.byteLength(working[i].content);
      working[i] = { ...working[i], content: `[tool result trimmed] (${bytes} bytes)` };
    }
  }
  const kept = [];
  const dropped = /* @__PURE__ */ new Set();
  for (let i = 0; i < working.length && count(filter(working, dropped)) > budget; i++) {
    if (isProtected(i)) continue;
    dropped.add(i);
  }
  for (let i = 0; i < working.length; i++) {
    if (!dropped.has(i)) kept.push(working[i]);
  }
  if (count(kept) > budget) {
    throw new SkyError("SKY-E-2001" /* ContextWindowExceeded */, {});
  }
  return kept;
}
function filter(messages, dropped) {
  return messages.filter((_, i) => !dropped.has(i));
}
function findLastIndex(arr, predicate) {
  for (let i = arr.length - 1; i >= 0; i--) {
    if (predicate(arr[i])) return i;
  }
  return -1;
}

// src/llm/cost.ts
var MODEL_PRICING = {
  "gpt-4o": { input: 2.5, output: 10 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "claude-3-5-sonnet": { input: 3, output: 15 },
  "claude-3-haiku": { input: 0.25, output: 1.25 }
};
function estimateCost(model, usage) {
  const pricing = MODEL_PRICING[model];
  if (!pricing) return 0;
  return (usage.inputTokens * pricing.input + usage.outputTokens * pricing.output) / 1e6;
}

// src/safety/diff.ts
import { createTwoFilesPatch } from "diff";
import { createHash } from "crypto";
function generateDiff(path, oldContent, newContent) {
  const patch = createTwoFilesPatch(path, path, oldContent, newContent, void 0, void 0, {
    context: 3
  });
  let added = 0;
  let removed = 0;
  for (const line of patch.split("\n")) {
    if (line.startsWith("+") && !line.startsWith("+++")) added++;
    else if (line.startsWith("-") && !line.startsWith("---")) removed++;
  }
  const sha256 = createHash("sha256").update(newContent).digest("hex");
  return { patch, added, removed, sha256 };
}
function colorizeDiff(patch, chalk) {
  return patch.split("\n").map((line) => {
    if (line.startsWith("+") && !line.startsWith("+++")) return chalk.green(line);
    if (line.startsWith("-") && !line.startsWith("---")) return chalk.red(line);
    if (line.startsWith("@@")) return chalk.gray(line);
    return line;
  }).join("\n");
}

// src/agent/prompts.ts
function modeHasTools(mode) {
  return mode === "agent";
}
function buildSystemPrompt(mode, cwd) {
  const shared = `You are Sky, a command-line AI coding agent operating in the directory ${cwd}. You are precise, safe, and concise. Prefer the smallest change that solves the problem.`;
  switch (mode) {
    case "agent":
      return `${shared}

You have access to tools (read, write, edit, search, shell, git). Use them to inspect and modify the workspace. Every mutating action requires user approval, so explain what you intend to do. When the task is complete, summarize the changes and stop calling tools.`;
    case "plan":
      return `${shared}

You are in PLAN mode. Do NOT modify anything. Ask clarifying questions if the request is ambiguous, then produce a clear, step-by-step implementation plan. The user will review and approve the plan before any execution begins.`;
    case "ask":
      return `${shared}

You are in ASK mode. This is read-only. Answer the user's question about the codebase using only the context provided. Do not propose to modify files.`;
    default:
      return shared;
  }
}

// src/agent/loop.ts
var AgentLoop = class {
  opts;
  logger;
  constructor(options) {
    this.opts = options;
    this.logger = options.logger ?? nullLogger;
    this.opts.policy.setAllowlist(options.session.sessionAllowlist);
  }
  async *run(userMessage) {
    const { session, store } = this.opts;
    if (userMessage !== void 0) {
      store.appendMessage(session, { role: "user", content: userMessage });
    }
    session.lastTurnInterrupted = true;
    store.save(session);
    yield { type: "turn-start", mode: session.mode, model: session.model, provider: session.provider };
    const maxIterations = this.opts.maxIterations ?? 25;
    let finishReason = "stop";
    try {
      for (let iteration = 0; iteration < maxIterations; iteration++) {
        if (this.opts.signal?.aborted) throw new SkyError("SKY-E-2000" /* AgentAborted */, {});
        const { assistantText, toolCalls, reason } = yield* this.streamTurn(session);
        finishReason = reason;
        const assistantMessage = {
          role: "assistant",
          content: assistantText,
          ...toolCalls.length ? { toolCalls } : {}
        };
        store.appendMessage(session, assistantMessage);
        if (toolCalls.length === 0) break;
        if (!modeHasTools(session.mode)) {
          throw new SkyError(
            session.mode === "plan" ? "SKY-E-2010" /* PlanModeRejectedTool */ : "SKY-E-2011" /* AskModeReceivedTool */,
            { name: toolCalls[0].name }
          );
        }
        for (const toolCall of toolCalls) {
          yield* this.handleToolCall(session, toolCall);
        }
        if (iteration === maxIterations - 1) {
          throw new SkyError("SKY-E-2003" /* MaxIterations */, { n: maxIterations });
        }
      }
      session.lastTurnInterrupted = false;
      store.save(session);
      yield { type: "turn-end", finishReason };
    } catch (error) {
      const skyError = SkyError.from(error);
      session.lastTurnInterrupted = false;
      store.save(session);
      this.logger.error("agent.turn.failed", { code: skyError.code });
      yield { type: "error", error: skyError };
    }
  }
  /** Stream one provider response, yielding text/tool-call events. */
  async *streamTurn(session) {
    const { provider, registry, config } = this.opts;
    const limits = provider.tokenLimits(session.model);
    const system = { role: "system", content: buildSystemPrompt(session.mode, session.cwd) };
    const history = session.messages;
    const messages = buildContext({ messages: [system, ...history], limits });
    const request = {
      messages,
      model: session.model,
      tools: modeHasTools(session.mode) ? registry.definitions() : void 0,
      maxOutputTokens: limits.maxOutput,
      signal: this.opts.signal
    };
    const retries = 4;
    for (let attempt = 0; ; attempt++) {
      let assistantText = "";
      const toolCalls = [];
      let reason = "stop";
      let emitted = false;
      try {
        for await (const chunk of provider.stream(request)) {
          if (chunk.type === "text-delta") {
            emitted = true;
            assistantText += chunk.text;
            yield { type: "text-delta", text: chunk.text };
          } else if (chunk.type === "tool-call") {
            emitted = true;
            toolCalls.push(chunk.toolCall);
          } else if (chunk.type === "done") {
            reason = chunk.finishReason;
            const cost = estimateCost(session.model, chunk.usage);
            session.tokenUsage.input += chunk.usage.inputTokens;
            session.tokenUsage.output += chunk.usage.outputTokens;
            session.tokenUsage.estimatedCostUsd += cost;
            yield { type: "usage", usage: chunk.usage, estimatedCostUsd: session.tokenUsage.estimatedCostUsd };
            this.checkBudget(config, session);
          }
        }
        return { assistantText, toolCalls, reason };
      } catch (error) {
        const skyError = SkyError.from(error, "SKY-E-5000" /* ProviderRequestFailed */);
        if (skyError.retryable && !emitted && attempt < retries) {
          const delay = Math.min(3e4, 1e3 * 2 ** attempt);
          this.logger.warn("provider.retry", { attempt: attempt + 1, code: skyError.code });
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
        throw skyError;
      }
    }
  }
  checkBudget(config, session) {
    const budget = config.sessions.budgetUsd;
    if (budget !== void 0 && session.tokenUsage.estimatedCostUsd > budget) {
      throw new SkyError("SKY-E-5040" /* ProviderBudgetExceeded */, {
        spent: session.tokenUsage.estimatedCostUsd.toFixed(4),
        budget: budget.toFixed(4)
      });
    }
  }
  /** Validate → approve (with diff) → execute a single tool call. */
  async *handleToolCall(session, toolCall) {
    const { registry, approver, policy, store, config } = this.opts;
    yield { type: "tool-call", toolCall };
    const tool = registry.get(toolCall.name);
    const ctx = { cwd: session.cwd, config, logger: this.logger, signal: this.opts.signal };
    try {
      registry.validate(toolCall.name, toolCall.input);
    } catch (error) {
      const skyError = SkyError.from(error, "SKY-E-3001" /* ToolInputInvalid */);
      const output = skyError.message;
      store.appendMessage(session, { role: "tool", content: output, toolCallId: toolCall.id, name: toolCall.name });
      yield { type: "tool-result", toolCallId: toolCall.id, toolName: toolCall.name, ok: false, output };
      return;
    }
    let diff;
    if (tool?.preview) {
      const preview = await tool.preview(toolCall.input, ctx);
      if (preview) {
        const d = generateDiff(preview.path, preview.oldContent, preview.newContent);
        diff = { path: preview.path, patch: d.patch, added: d.added, removed: d.removed, sha256: d.sha256 };
      }
    }
    const requiresApproval = tool ? tool.requiresApproval(toolCall.input) : true;
    yield { type: "approval-request", toolCall, reason: "policy check" };
    const result = await approver.request({
      sessionId: session.id,
      toolCallId: toolCall.id,
      toolName: toolCall.name,
      input: toolCall.input,
      requiresApproval,
      diff
    });
    if (result.allowlistAdded) {
      session.sessionAllowlist.push(result.allowlistAdded);
      policy.setAllowlist(session.sessionAllowlist);
      store.save(session);
    }
    yield {
      type: "approval-resolved",
      toolCallId: toolCall.id,
      granted: result.granted,
      autoApproved: result.autoApproved
    };
    if (!result.granted) {
      const output = result.decision === "deny" ? `Denied by policy: ${toolCall.name} is not permitted.` : `User declined the ${toolCall.name} action.`;
      store.appendMessage(session, { role: "tool", content: output, toolCallId: toolCall.id, name: toolCall.name });
      yield { type: "tool-result", toolCallId: toolCall.id, toolName: toolCall.name, ok: false, output };
      return;
    }
    const execResult = await registry.execute(toolCall.name, toolCall.input, ctx);
    store.appendMessage(session, {
      role: "tool",
      content: execResult.output,
      toolCallId: toolCall.id,
      name: toolCall.name
    });
    yield {
      type: "tool-result",
      toolCallId: toolCall.id,
      toolName: toolCall.name,
      ok: execResult.ok,
      output: execResult.output
    };
  }
};

// src/safety/glob.ts
function globToRegExp(glob) {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        re += ".*";
        i++;
        if (glob[i + 1] === "/") i++;
      } else {
        re += "[^/]*";
      }
    } else if (c === "?") {
      re += "[^/]";
    } else if (".+^${}()|[]\\".includes(c)) {
      re += "\\" + c;
    } else {
      re += c;
    }
  }
  return new RegExp(`^${re}$`);
}
function matchGlob(path, glob) {
  const normalized = path.replace(/^\.\//, "");
  return globToRegExp(glob).test(normalized) || globToRegExp(glob).test(path);
}
function matchAnyGlob(path, globs) {
  return globs.some((g) => matchGlob(path, g));
}
function matchCommandPattern(command, pattern, anchored) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  const re = anchored ? new RegExp(`^${escaped}`) : new RegExp(escaped);
  return re.test(command.trim());
}
function matchAnyCommand(command, patterns, anchored) {
  return patterns.some((p) => matchCommandPattern(command, p, anchored));
}

// src/safety/shell.ts
var HARDCODED_SHELL_DENY = [
  "rm -rf /",
  "rm -rf /*",
  "mkfs",
  "dd of=/dev/",
  "shutdown",
  "reboot",
  ":(){ :|:& };:"
];
var TIER1 = [/^ls\b/, /^cat\b/, /^head\b/, /^tail\b/, /^wc\b/, /^git\s+status\b/, /^git\s+log\b/, /^pwd\b/, /^echo\b/, /^grep\b/, /^rg\b/, /^find\b/];
var TIER2 = [/^curl\s+(-[A-Za-z]*\s+)*(--request\s+GET|-X\s+GET|https?:\/\/)/, /^wget\b/, /^dig\b/, /^nslookup\b/, /^ping\b/];
var TIER4 = [/\brm\s+-[a-z]*r[a-z]*f/, /\brm\s+-[a-z]*f[a-z]*r/, /\bgit\s+push\s+.*--force/, /\bgit\s+reset\s+--hard/, /\bmkfs\b/, /\bdd\s+of=/, /\bshutdown\b/, /\breboot\b/, /\b:\(\)\s*\{/];
function classifyShellCommand(command) {
  const cmd = command.trim();
  if (TIER4.some((re) => re.test(cmd))) {
    return { tier: 4, defaultAction: "prompt", reason: "mutating, irreversible or destructive" };
  }
  if (TIER2.some((re) => re.test(cmd))) {
    return { tier: 2, defaultAction: "prompt", reason: "read-only network side effect" };
  }
  if (TIER1.some((re) => re.test(cmd))) {
    return { tier: 1, defaultAction: "auto", reason: "read-only, in-workspace" };
  }
  return { tier: 3, defaultAction: "prompt", reason: "mutating, reversible" };
}

// src/safety/policy.ts
var Policy = class {
  constructor(config, sessionAllowlist = []) {
    this.config = config;
    this.sessionAllowlist = sessionAllowlist;
  }
  config;
  sessionAllowlist;
  setAllowlist(entries) {
    this.sessionAllowlist = entries;
  }
  tools() {
    return this.config.tools;
  }
  classify(request) {
    const { tool, input } = request;
    if (tool === "shell") {
      const command = String(input.command ?? "");
      const shell = classifyShellCommand(command);
      if (matchAnyCommand(command, HARDCODED_SHELL_DENY, false) || matchAnyCommand(command, this.tools().shell.deny, false)) {
        return { decision: "deny", reason: "matches shell denylist", shell };
      }
      if (this.matchesSessionAllowlist(tool, command)) {
        return { decision: "allow", reason: "session allowlist", shell };
      }
      if (matchAnyCommand(command, this.tools().shell.autoApprove, true)) {
        return { decision: "allow", reason: "config shell.autoApprove", shell };
      }
      if (shell.tier === 1 && shell.defaultAction === "auto") {
        return { decision: "prompt", reason: "tier-1 not allowlisted", shell };
      }
      return { decision: "prompt", reason: `shell tier-${shell.tier}: ${shell.reason}`, shell };
    }
    if (tool === "read") {
      const path = String(input.path ?? "");
      if (matchAnyGlob(path, this.tools().read.deny)) {
        return { decision: "deny", reason: "matches read denylist" };
      }
      if (this.matchesSessionAllowlist(tool, path)) {
        return { decision: "allow", reason: "session allowlist" };
      }
      if (matchAnyGlob(path, this.tools().read.autoApprove)) {
        return { decision: "allow", reason: "config read.autoApprove" };
      }
      return this.fromPredicate(request);
    }
    if (tool === "write" || tool === "edit") {
      const path = String(input.path ?? "");
      if (this.matchesSessionAllowlist(tool, path)) {
        return { decision: "allow", reason: "session allowlist" };
      }
      const autoApprove = tool === "write" ? this.tools().write.autoApprove : this.tools().edit.autoApprove;
      if (matchAnyGlob(path, autoApprove)) {
        return { decision: "allow", reason: `config ${tool}.autoApprove` };
      }
      return { decision: "prompt", reason: `${tool} requires approval` };
    }
    if (tool === "git") {
      const action = String(input.action ?? "");
      const flags = Array.isArray(input.flags) ? input.flags : [];
      if (action === "push" && flags.some((f) => f === "--force" || f === "-f")) {
        if (!this.tools().git.allowForcePush) {
          return { decision: "deny", reason: "git force push denied by policy" };
        }
      }
      if (this.tools().git.autoApproveReads && ["status", "diff", "log", "branch"].includes(action)) {
        return { decision: "allow", reason: "git read auto-approved" };
      }
      return { decision: "prompt", reason: `git ${action} requires approval` };
    }
    if (tool === "search") {
      return this.fromPredicate(request);
    }
    return this.fromPredicate(request);
  }
  fromPredicate(request) {
    return request.requiresApproval ? { decision: "prompt", reason: "tool requires approval" } : { decision: "allow", reason: "tool predicate: safe" };
  }
  matchesSessionAllowlist(tool, target) {
    return this.sessionAllowlist.some((entry) => {
      if (entry.tool !== tool) return false;
      return tool === "shell" ? matchCommandPattern(target, entry.pattern, true) : matchGlob(target, entry.pattern);
    });
  }
  /**
   * Derive the most specific pattern that would auto-approve this call, for the
   * "always" (a) decision (§9.8).
   */
  static deriveAllowlistPattern(tool, input) {
    if (tool === "shell") {
      const command = String(input.command ?? "").trim();
      const prefix = command.split(/\s+/).slice(0, 2).join(" ");
      return { tool, pattern: `${prefix}*` };
    }
    const path = String(input.path ?? "");
    const dir = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : ".";
    const ext = path.includes(".") ? `*.${path.split(".").pop()}` : "*";
    return { tool, pattern: `${dir}/**/${ext}` };
  }
};

// src/safety/audit.ts
import { appendFileSync, mkdirSync as mkdirSync3 } from "fs";
import { dirname as dirname3 } from "path";
var AuditLog = class {
  path;
  logger;
  constructor(options = {}) {
    this.path = options.path ?? auditLogPath();
    this.logger = options.logger ?? nullLogger;
  }
  write(entry) {
    const line = JSON.stringify({ ...entry, input: redact(entry.input) }) + "\n";
    try {
      mkdirSync3(dirname3(this.path), { recursive: true });
      appendFileSync(this.path, line, "utf8");
    } catch (cause) {
      this.logger.error("audit.writeFailed", { detail: cause.message });
      throw new SkyError("SKY-E-6020" /* AuditWriteFailed */, { detail: cause.message }, cause);
    }
  }
};

// src/safety/approver.ts
var Approver = class {
  policy;
  audit;
  prompter;
  logger;
  force;
  yolo;
  constructor(options) {
    this.policy = options.policy;
    this.audit = options.audit;
    this.prompter = options.prompter;
    this.logger = options.logger ?? nullLogger;
    this.force = options.force ?? options.yolo ?? false;
    this.yolo = options.yolo ?? false;
  }
  async request(req) {
    const classification = this.policy.classify({
      tool: req.toolName,
      input: req.input,
      // In --yolo mode the tool's own predicate is bypassed (treated as safe).
      requiresApproval: this.yolo ? false : req.requiresApproval
    });
    const base = {
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      sessionId: req.sessionId,
      toolCallId: req.toolCallId,
      toolName: req.toolName,
      input: req.input,
      reason: classification.reason,
      ...req.diff ? { diff: { path: req.diff.path, added: req.diff.added, removed: req.diff.removed, sha256: req.diff.sha256 } } : {}
    };
    if (classification.decision === "deny") {
      this.record({ ...base, decision: "deny", granted: false, autoApproved: false });
      return { granted: false, decision: "deny", autoApproved: false };
    }
    if (classification.decision === "allow") {
      this.record({ ...base, decision: "allow", granted: true, autoApproved: true });
      return { granted: true, decision: "allow", autoApproved: true };
    }
    if (this.force || this.yolo) {
      this.record({ ...base, decision: "prompt", granted: true, autoApproved: true });
      return { granted: true, decision: "prompt", autoApproved: true };
    }
    if (!this.prompter) {
      this.record({ ...base, decision: "prompt", granted: false, autoApproved: false });
      throw new SkyError("SKY-E-6000" /* ApprovalDenied */, { name: req.toolName });
    }
    const answer = await this.prompter({
      toolName: req.toolName,
      input: req.input,
      reason: classification.reason,
      diff: req.diff
    });
    if (answer === "no") {
      this.record({ ...base, decision: "prompt", granted: false, autoApproved: false });
      return { granted: false, decision: "prompt", autoApproved: false };
    }
    let allowlistAdded;
    if (answer === "always") {
      allowlistAdded = Policy.deriveAllowlistPattern(req.toolName, req.input);
    }
    this.record({ ...base, decision: "prompt", granted: true, autoApproved: false });
    return { granted: true, decision: "prompt", autoApproved: false, allowlistAdded };
  }
  record(entry) {
    try {
      this.audit.write(entry);
    } catch (error) {
      this.logger.error("approver.auditFailed", { code: SkyError.from(error).code });
      throw error;
    }
  }
};

export {
  __export,
  ErrorCode,
  SkyError,
  errors_exports,
  configPath,
  sessionsDir,
  sessionsIndexPath,
  logFilePath,
  marketplacesDir,
  installedPluginsDir,
  pluginsStatePath,
  defaultConfig,
  resolveApiKey,
  loadConfig,
  configExists,
  requireConfig,
  getConfigKey,
  writeConfig,
  exportJsonSchema,
  scaffoldConfig,
  config_exports,
  createLogger,
  nullLogger,
  logging_exports,
  heuristicCountTokens,
  buildContext,
  MODEL_PRICING,
  estimateCost,
  generateDiff,
  colorizeDiff,
  modeHasTools,
  buildSystemPrompt,
  AgentLoop,
  globToRegExp,
  matchGlob,
  matchAnyGlob,
  matchCommandPattern,
  matchAnyCommand,
  HARDCODED_SHELL_DENY,
  classifyShellCommand,
  Policy,
  AuditLog,
  Approver
};
//# sourceMappingURL=chunk-RSVWAUNV.js.map