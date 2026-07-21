import { z } from 'zod';

/**
 * The canonical configuration schema (Appendix A). Types are inferred from the
 * schema so the schema and the static type can never drift (§3.7). Defaults
 * defined here are precedence level 1 — the lowest — in the merge order of §7.6.
 */

export const providerNameSchema = z.enum([
  'openai',
  'anthropic',
  'ollama',
  'ollama-cloud',
  'openrouter',
  'zenmux',
  'opencode',
  'gemini',
  'deepseek',
  'groq',
  'qwen-web',
  'zai-web',
  'kimi-web',
  'custom',
  'mock',
]);
export type ProviderName = z.infer<typeof providerNameSchema>;

/** Any provider id: built-in enum names, or a user-defined OpenAI-compatible name. */
export const providerIdSchema = z
  .string()
  .min(1)
  .regex(/^[a-z][a-z0-9_-]*$/i, 'Provider id must be alphanumeric (plus - _)');
export type ProviderId = z.infer<typeof providerIdSchema>;

const modelMetaSchema = z.object({
  contextWindow: z.number().int().positive().optional(),
  maxOutput: z.number().int().positive().optional(),
  inputCostPerMTok: z.number().nonnegative().optional(),
  outputCostPerMTok: z.number().nonnegative().optional(),
});

const fallbackSchema = z.object({
  provider: providerIdSchema,
  model: z.string(),
  triggerAfter: z.number().int().nonnegative().default(4),
});

// A.2 providers.*
const providerConfigSchema = z.object({
  apiKeyEnv: z.string().optional(),
  apiKey: z.string().optional(),
  baseUrl: z.string().url().optional(),
  defaultModel: z.string().optional(),
  models: z.record(modelMetaSchema).optional(),
  fallback: fallbackSchema.optional(),
});
export type ProviderConfig = z.infer<typeof providerConfigSchema>;

// A.3 tools.*
const toolsSchema = z
  .object({
    read: z
      .object({
        // Empty by default — in-cwd reads are auto-safe via the tool predicate;
        // denylist for secrets still wins.
        autoApprove: z.array(z.string()).default([]),
        // Use `**/`-prefixed globs so secrets are denied in subdirectories too,
        // not only at the cwd root (`**/` also matches root-level paths).
        deny: z
          .array(z.string())
          .default(['**/.env*', '**/credentials*', '**/*.pem', '**/*.key', '**/id_rsa*', '**/id_ed25519*']),
      })
      .default({}),
    write: z
      .object({
        allowOutsideCwd: z.boolean().default(false),
        autoApprove: z.array(z.string()).default([]),
      })
      .default({}),
    edit: z
      .object({
        autoApprove: z.array(z.string()).default([]),
      })
      .default({}),
    shell: z
      .object({
        autoApprove: z.array(z.string()).default([]),
        deny: z
          .array(z.string())
          .default(['rm -rf /', 'mkfs.*', 'dd of=/dev/*', 'shutdown', 'reboot']),
        env: z.record(z.string()).default({}),
        timeoutMs: z.number().int().positive().default(120_000),
      })
      .default({}),
    git: z
      .object({
        allowForcePush: z.boolean().default(false),
        autoApproveReads: z.boolean().default(true),
      })
      .default({}),
  })
  .default({});
export type ToolsConfig = z.infer<typeof toolsSchema>;

// A.4 tui.*
const tuiSchema = z
  .object({
    theme: z
      .object({
        colors: z
          .object({
            accent: z.string().default('cyan'),
            success: z.string().default('green'),
            error: z.string().default('red'),
            warning: z.string().default('yellow'),
            info: z.string().default('blue'),
            planning: z.string().default('magenta'),
          })
          .default({}),
        glyphs: z
          .object({
            indicator: z.string().default('⬢'),
            bullet: z.string().default('•'),
            arrow: z.string().default('→'),
          })
          .default({}),
        layout: z
          .object({
            submitOnEnter: z.boolean().default(true),
            showTokenBar: z.boolean().default(true),
            /** When true, estimated session cost is always shown in the status bar. */
            showCost: z.boolean().default(false),
            compactMode: z.boolean().default(false),
          })
          .default({}),
      })
      .default({}),
  })
  .default({});
export type TuiConfig = z.infer<typeof tuiSchema>;

// A.5 sessions.*
const sessionsSchema = z
  .object({
    /** Proactively compact history before / on context overflow (default on). */
    autoCompact: z.boolean().default(true),
    /**
     * Estimated **current history** tokens that trigger a compact (absolute).
     * Not lifetime usage — lifetime never resets and caused re-compact loops.
     */
    autoCompactThreshold: z.number().int().positive().default(30_000),
    /**
     * Compact when estimated history tokens reach this fraction of the model's
     * usable context budget (contextWindow − maxOutput − margin).
     */
    autoCompactRatio: z.number().min(0.2).max(0.95).default(0.7),
    retentionDays: z.number().int().positive().default(90),
    budgetUsd: z.number().nonnegative().optional(),
  })
  .default({});

// A.6 logging.*
const loggingSchema = z
  .object({
    level: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),
    fileRetentionDays: z.number().int().positive().default(30),
  })
  .default({});

// A.7 mcp.servers[]
const mcpServerSchema = z.object({
  name: z.string(),
  command: z.string(),
  args: z.array(z.string()).default([]),
  env: z.record(z.string()).default({}),
  approvalMode: z.enum(['auto', 'manual', 'deny']).default('manual'),
});
export type McpServerConfig = z.infer<typeof mcpServerSchema>;

const mcpSchema = z
  .object({
    servers: z.array(mcpServerSchema).default([]),
  })
  .default({});

/** Connected git forges (GitHub / Gitea self-hosted). Tokens live in secrets. */
const forgeRemoteSchema = z.object({
  type: z.enum(['github', 'gitea']),
  /** Web/API base URL, e.g. https://github.com or https://gitea.example.com */
  baseUrl: z.string().url(),
  /** Optional display username for HTTPS remotes. */
  username: z.string().optional(),
});
export type ForgeRemote = z.infer<typeof forgeRemoteSchema>;

const forgeSchema = z
  .object({
    /** Default forge id used for git push/pull auth. */
    default: z.string().optional(),
    remotes: z.record(forgeRemoteSchema).default({}),
  })
  .default({});
export type ForgeConfig = z.infer<typeof forgeSchema>;

// A.8 observability.*
const observabilitySchema = z
  .object({
    otlpEndpoint: z.string().url().optional(),
    metricsPort: z.number().int().positive().optional(),
    webhook: z.object({ url: z.string().url() }).optional(),
    sentryDsn: z.string().optional(),
  })
  .default({});

/** A.1 top-level configuration schema. */
export const configSchema = z.object({
  schemaVersion: z.literal(1).default(1),
  defaultProvider: providerIdSchema.default('openai'),
  defaultModel: z.string().default('gpt-4o'),
  providers: z.record(providerConfigSchema).default({}),
  tools: toolsSchema,
  tui: tuiSchema,
  sessions: sessionsSchema,
  logging: loggingSchema,
  mcp: mcpSchema,
  forge: forgeSchema,
  observability: observabilitySchema,
});

/** The fully-resolved, validated configuration object. */
export type SkyConfig = z.infer<typeof configSchema>;

/** Parse an arbitrary object into a fully-defaulted config (throws on failure). */
export function parseConfig(input: unknown): SkyConfig {
  return configSchema.parse(input ?? {});
}

/** The default configuration (every default applied to an empty object). */
export function defaultConfig(): SkyConfig {
  return configSchema.parse({});
}
