import { z } from 'zod';

/**
 * Stable error-code catalog for Sky.
 *
 * Every error carries a code in the format `SKY-E-XXXX`, partitioned by module
 * prefix: 1xxx config, 2xxx agent/context, 3xxx tools, 4xxx session,
 * 5xxx llm/provider, 6xxx safety, 7xxx tui, 8xxx cli. Codes never change
 * meaning across minor/patch releases (see Appendix B of the specification).
 *
 * @packageDocumentation
 */
/** Every known Sky error code. */
declare enum ErrorCode {
    ConfigNotFound = "SKY-E-1000",
    ConfigParseFailed = "SKY-E-1001",
    NoApiKey = "SKY-E-1002",
    ConfigValidationFailed = "SKY-E-1003",
    UnknownProvider = "SKY-E-1004",
    UnknownModel = "SKY-E-1005",
    ConfigKeyNotFound = "SKY-E-1010",
    ConfigKeyWrongType = "SKY-E-1011",
    ConfigMigrationFailed = "SKY-E-1020",
    AgentAborted = "SKY-E-2000",
    ContextWindowExceeded = "SKY-E-2001",
    NoToolDefinitions = "SKY-E-2002",
    MaxIterations = "SKY-E-2003",
    PlanModeRejectedTool = "SKY-E-2010",
    AskModeReceivedTool = "SKY-E-2011",
    UnknownTool = "SKY-E-3000",
    ToolInputInvalid = "SKY-E-3001",
    ToolOutputInvalid = "SKY-E-3002",
    WritePathOutsideCwd = "SKY-E-3010",
    EditOldTextNotFound = "SKY-E-3020",
    EditOldTextAmbiguous = "SKY-E-3021",
    SearchFailed = "SKY-E-3030",
    ShellDenied = "SKY-E-3040",
    ShellTimeout = "SKY-E-3041",
    GitForcePushDenied = "SKY-E-3050",
    McpDenyMode = "SKY-E-3060",
    McpNotConnected = "SKY-E-3061",
    ToolUnexpected = "SKY-E-3999",
    SessionNotFound = "SKY-E-4000",
    SessionMigrationFailed = "SKY-E-4001",
    SessionCorrupt = "SKY-E-4002",
    SessionReadOnly = "SKY-E-4010",
    SessionIndexCorrupt = "SKY-E-4020",
    ProviderRequestFailed = "SKY-E-5000",
    ProviderRateLimited = "SKY-E-5001",
    ProviderUnavailable = "SKY-E-5002",
    ProviderTimeout = "SKY-E-5003",
    ProviderBadRequest = "SKY-E-5010",
    ProviderAuthFailed = "SKY-E-5011",
    ProviderForbidden = "SKY-E-5012",
    ProviderContentFilter = "SKY-E-5013",
    ProviderStreamInterrupted = "SKY-E-5020",
    ProviderStreamParse = "SKY-E-5030",
    ProviderBudgetExceeded = "SKY-E-5040",
    ProviderUnknown = "SKY-E-5099",
    ApprovalDenied = "SKY-E-6000",
    ApprovalTimeout = "SKY-E-6001",
    PolicyViolation = "SKY-E-6010",
    AuditWriteFailed = "SKY-E-6020",
    TerminalTooNarrow = "SKY-E-7000",
    TerminalNoColor = "SKY-E-7001",
    TuiRenderError = "SKY-E-7010",
    UnknownCommand = "SKY-E-8000",
    MissingArgument = "SKY-E-8001",
    InvalidFlagValue = "SKY-E-8002",
    InstanceLocked = "SKY-E-8010",
    InternalError = "SKY-E-8099"
}
/** Metadata attached to every code: default message, retryability, exit code. */
interface ErrorMeta {
    /** Message template. `{placeholders}` are filled from `SkyError.context`. */
    readonly message: string;
    /** Whether the agent may retry the operation that produced this error. */
    readonly retryable: boolean;
    /** Process exit code to use when this error is fatal (BSD sysexits range). */
    readonly exitCode: number;
}
/**
 * The complete catalog. Kept as a plain record so it can be validated in tests
 * (every {@link ErrorCode} member must have an entry).
 */
declare const ERROR_CATALOG: Record<ErrorCode, ErrorMeta>;

/** Values that can be interpolated into an error message template. */
type ErrorContext = Record<string, string | number | boolean | undefined>;
/**
 * The single error type used across Sky. It carries a stable {@link ErrorCode},
 * a rendered human-readable message, an optional cause, and a `retryable` flag
 * so that the agent loop, the TUI, and the CLI exit-code handler can all switch
 * on the same discriminant (§11.1).
 *
 * @example
 * ```ts
 * throw new SkyError(ErrorCode.NoApiKey, { name: 'openai' });
 * ```
 */
declare class SkyError extends Error {
    /** The stable code, e.g. `SKY-E-1002`. */
    readonly code: ErrorCode;
    /** Whether the operation that produced this error may be retried. */
    readonly retryable: boolean;
    /** Process exit code to use if this error terminates the process. */
    readonly exitCode: number;
    /** The originating error, if this wraps a lower-level failure. */
    readonly cause?: unknown;
    /** The interpolation context used to render the message. */
    readonly context: ErrorContext;
    constructor(code: ErrorCode, context?: ErrorContext, cause?: unknown);
    /** Fill `{placeholders}` in a template from the supplied context. */
    static render(template: string, context: ErrorContext): string;
    /** Type guard for narrowing an unknown thrown value to a {@link SkyError}. */
    static is(value: unknown): value is SkyError;
    /**
     * Wrap an arbitrary thrown value in a SkyError. If it is already a SkyError it
     * is returned unchanged; otherwise it becomes an {@link ErrorCode.InternalError}.
     */
    static from(value: unknown, fallback?: ErrorCode): SkyError;
    /** A structured, log-friendly representation. */
    toJSON(): Record<string, unknown>;
    /**
     * A user-facing message in the "what / why / what to do" style of §11.8,
     * prefixed with the bracketed code for bug reports.
     */
    toUserMessage(): string;
}

/**
 * The `errors/` module — the root of the dependency graph (§2.3). It depends on
 * nothing and is depended on by every other module.
 */

declare const index$7_ERROR_CATALOG: typeof ERROR_CATALOG;
type index$7_ErrorCode = ErrorCode;
declare const index$7_ErrorCode: typeof ErrorCode;
type index$7_ErrorContext = ErrorContext;
type index$7_ErrorMeta = ErrorMeta;
type index$7_SkyError = SkyError;
declare const index$7_SkyError: typeof SkyError;
declare namespace index$7 {
  export { index$7_ERROR_CATALOG as ERROR_CATALOG, index$7_ErrorCode as ErrorCode, type index$7_ErrorContext as ErrorContext, type index$7_ErrorMeta as ErrorMeta, index$7_SkyError as SkyError };
}

/**
 * The `logging/` module (§2.4.8). Structured JSON logging with secret
 * redaction, injected into every other module via the {@link Logger} interface.
 *
 * The implementation is a thin, dependency-light structured logger. In the full
 * build this is backed by `pino`; here we keep a compatible shape so the rest of
 * the codebase depends only on the interface, never on the concrete logger.
 */
type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
/** Structured payload attached to a log line. */
type LogData = Record<string, unknown>;
/**
 * The logging surface every module receives. Methods take a message and an
 * optional structured payload (§11.5). `child()` returns a logger with bound
 * context (e.g. a module name or session id) merged into every line.
 */
interface Logger {
    trace(msg: string, data?: LogData): void;
    debug(msg: string, data?: LogData): void;
    info(msg: string, data?: LogData): void;
    warn(msg: string, data?: LogData): void;
    error(msg: string, data?: LogData): void;
    fatal(msg: string, data?: LogData): void;
    child(bindings: LogData): Logger;
    readonly level: LogLevel;
}
/** Redact known secret shapes from a structured payload before it is written. */
declare function redact(value: unknown): unknown;
interface LoggerOptions {
    level?: LogLevel;
    /** File sink path (`~/.sky/logs/sky.log`). Omit to disable the file sink. */
    file?: string;
    /** When true, also write to stderr (the `--verbose` behaviour). */
    stderr?: boolean;
    version?: string;
}
/** Create the root logger. Call once at startup and inject the result. */
declare function createLogger(options?: LoggerOptions): Logger;
/** A logger that swallows everything — handy in tests and library embedding. */
declare const nullLogger: Logger;

type index$6_LogData = LogData;
type index$6_LogLevel = LogLevel;
type index$6_Logger = Logger;
type index$6_LoggerOptions = LoggerOptions;
declare const index$6_createLogger: typeof createLogger;
declare const index$6_nullLogger: typeof nullLogger;
declare const index$6_redact: typeof redact;
declare namespace index$6 {
  export { type index$6_LogData as LogData, type index$6_LogLevel as LogLevel, type index$6_Logger as Logger, type index$6_LoggerOptions as LoggerOptions, index$6_createLogger as createLogger, index$6_nullLogger as nullLogger, index$6_redact as redact };
}

/**
 * The canonical configuration schema (Appendix A). Types are inferred from the
 * schema so the schema and the static type can never drift (§3.7). Defaults
 * defined here are precedence level 1 — the lowest — in the merge order of §7.6.
 */
declare const providerNameSchema: z.ZodEnum<["openai", "anthropic", "ollama", "ollama-cloud", "openrouter", "zenmux", "opencode", "mock"]>;
type ProviderName = z.infer<typeof providerNameSchema>;
declare const providerConfigSchema: z.ZodObject<{
    apiKeyEnv: z.ZodOptional<z.ZodString>;
    apiKey: z.ZodOptional<z.ZodString>;
    baseUrl: z.ZodOptional<z.ZodString>;
    defaultModel: z.ZodOptional<z.ZodString>;
    models: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodObject<{
        contextWindow: z.ZodOptional<z.ZodNumber>;
        maxOutput: z.ZodOptional<z.ZodNumber>;
        inputCostPerMTok: z.ZodOptional<z.ZodNumber>;
        outputCostPerMTok: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        contextWindow?: number | undefined;
        maxOutput?: number | undefined;
        inputCostPerMTok?: number | undefined;
        outputCostPerMTok?: number | undefined;
    }, {
        contextWindow?: number | undefined;
        maxOutput?: number | undefined;
        inputCostPerMTok?: number | undefined;
        outputCostPerMTok?: number | undefined;
    }>>>;
    fallback: z.ZodOptional<z.ZodObject<{
        provider: z.ZodEnum<["openai", "anthropic", "ollama", "ollama-cloud", "openrouter", "zenmux", "opencode", "mock"]>;
        model: z.ZodString;
        triggerAfter: z.ZodDefault<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        model: string;
        provider: "openai" | "anthropic" | "ollama" | "ollama-cloud" | "openrouter" | "zenmux" | "opencode" | "mock";
        triggerAfter: number;
    }, {
        model: string;
        provider: "openai" | "anthropic" | "ollama" | "ollama-cloud" | "openrouter" | "zenmux" | "opencode" | "mock";
        triggerAfter?: number | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    apiKeyEnv?: string | undefined;
    apiKey?: string | undefined;
    baseUrl?: string | undefined;
    defaultModel?: string | undefined;
    models?: Record<string, {
        contextWindow?: number | undefined;
        maxOutput?: number | undefined;
        inputCostPerMTok?: number | undefined;
        outputCostPerMTok?: number | undefined;
    }> | undefined;
    fallback?: {
        model: string;
        provider: "openai" | "anthropic" | "ollama" | "ollama-cloud" | "openrouter" | "zenmux" | "opencode" | "mock";
        triggerAfter: number;
    } | undefined;
}, {
    apiKeyEnv?: string | undefined;
    apiKey?: string | undefined;
    baseUrl?: string | undefined;
    defaultModel?: string | undefined;
    models?: Record<string, {
        contextWindow?: number | undefined;
        maxOutput?: number | undefined;
        inputCostPerMTok?: number | undefined;
        outputCostPerMTok?: number | undefined;
    }> | undefined;
    fallback?: {
        model: string;
        provider: "openai" | "anthropic" | "ollama" | "ollama-cloud" | "openrouter" | "zenmux" | "opencode" | "mock";
        triggerAfter?: number | undefined;
    } | undefined;
}>;
type ProviderConfig = z.infer<typeof providerConfigSchema>;
declare const toolsSchema: z.ZodDefault<z.ZodObject<{
    read: z.ZodDefault<z.ZodObject<{
        autoApprove: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        deny: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    }, "strip", z.ZodTypeAny, {
        autoApprove: string[];
        deny: string[];
    }, {
        autoApprove?: string[] | undefined;
        deny?: string[] | undefined;
    }>>;
    write: z.ZodDefault<z.ZodObject<{
        allowOutsideCwd: z.ZodDefault<z.ZodBoolean>;
        autoApprove: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    }, "strip", z.ZodTypeAny, {
        autoApprove: string[];
        allowOutsideCwd: boolean;
    }, {
        autoApprove?: string[] | undefined;
        allowOutsideCwd?: boolean | undefined;
    }>>;
    edit: z.ZodDefault<z.ZodObject<{
        autoApprove: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    }, "strip", z.ZodTypeAny, {
        autoApprove: string[];
    }, {
        autoApprove?: string[] | undefined;
    }>>;
    shell: z.ZodDefault<z.ZodObject<{
        autoApprove: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        deny: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        env: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodString>>;
        timeoutMs: z.ZodDefault<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        autoApprove: string[];
        deny: string[];
        env: Record<string, string>;
        timeoutMs: number;
    }, {
        autoApprove?: string[] | undefined;
        deny?: string[] | undefined;
        env?: Record<string, string> | undefined;
        timeoutMs?: number | undefined;
    }>>;
    git: z.ZodDefault<z.ZodObject<{
        allowForcePush: z.ZodDefault<z.ZodBoolean>;
        autoApproveReads: z.ZodDefault<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        allowForcePush: boolean;
        autoApproveReads: boolean;
    }, {
        allowForcePush?: boolean | undefined;
        autoApproveReads?: boolean | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    write: {
        autoApprove: string[];
        allowOutsideCwd: boolean;
    };
    read: {
        autoApprove: string[];
        deny: string[];
    };
    edit: {
        autoApprove: string[];
    };
    shell: {
        autoApprove: string[];
        deny: string[];
        env: Record<string, string>;
        timeoutMs: number;
    };
    git: {
        allowForcePush: boolean;
        autoApproveReads: boolean;
    };
}, {
    write?: {
        autoApprove?: string[] | undefined;
        allowOutsideCwd?: boolean | undefined;
    } | undefined;
    read?: {
        autoApprove?: string[] | undefined;
        deny?: string[] | undefined;
    } | undefined;
    edit?: {
        autoApprove?: string[] | undefined;
    } | undefined;
    shell?: {
        autoApprove?: string[] | undefined;
        deny?: string[] | undefined;
        env?: Record<string, string> | undefined;
        timeoutMs?: number | undefined;
    } | undefined;
    git?: {
        allowForcePush?: boolean | undefined;
        autoApproveReads?: boolean | undefined;
    } | undefined;
}>>;
type ToolsConfig = z.infer<typeof toolsSchema>;
declare const tuiSchema: z.ZodDefault<z.ZodObject<{
    theme: z.ZodDefault<z.ZodObject<{
        colors: z.ZodDefault<z.ZodObject<{
            accent: z.ZodDefault<z.ZodString>;
            success: z.ZodDefault<z.ZodString>;
            error: z.ZodDefault<z.ZodString>;
            warning: z.ZodDefault<z.ZodString>;
            info: z.ZodDefault<z.ZodString>;
            planning: z.ZodDefault<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            info: string;
            error: string;
            accent: string;
            success: string;
            warning: string;
            planning: string;
        }, {
            info?: string | undefined;
            error?: string | undefined;
            accent?: string | undefined;
            success?: string | undefined;
            warning?: string | undefined;
            planning?: string | undefined;
        }>>;
        glyphs: z.ZodDefault<z.ZodObject<{
            indicator: z.ZodDefault<z.ZodString>;
            bullet: z.ZodDefault<z.ZodString>;
            arrow: z.ZodDefault<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            indicator: string;
            bullet: string;
            arrow: string;
        }, {
            indicator?: string | undefined;
            bullet?: string | undefined;
            arrow?: string | undefined;
        }>>;
        layout: z.ZodDefault<z.ZodObject<{
            submitOnEnter: z.ZodDefault<z.ZodBoolean>;
            showTokenBar: z.ZodDefault<z.ZodBoolean>;
            compactMode: z.ZodDefault<z.ZodBoolean>;
        }, "strip", z.ZodTypeAny, {
            submitOnEnter: boolean;
            showTokenBar: boolean;
            compactMode: boolean;
        }, {
            submitOnEnter?: boolean | undefined;
            showTokenBar?: boolean | undefined;
            compactMode?: boolean | undefined;
        }>>;
    }, "strip", z.ZodTypeAny, {
        colors: {
            info: string;
            error: string;
            accent: string;
            success: string;
            warning: string;
            planning: string;
        };
        glyphs: {
            indicator: string;
            bullet: string;
            arrow: string;
        };
        layout: {
            submitOnEnter: boolean;
            showTokenBar: boolean;
            compactMode: boolean;
        };
    }, {
        colors?: {
            info?: string | undefined;
            error?: string | undefined;
            accent?: string | undefined;
            success?: string | undefined;
            warning?: string | undefined;
            planning?: string | undefined;
        } | undefined;
        glyphs?: {
            indicator?: string | undefined;
            bullet?: string | undefined;
            arrow?: string | undefined;
        } | undefined;
        layout?: {
            submitOnEnter?: boolean | undefined;
            showTokenBar?: boolean | undefined;
            compactMode?: boolean | undefined;
        } | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    theme: {
        colors: {
            info: string;
            error: string;
            accent: string;
            success: string;
            warning: string;
            planning: string;
        };
        glyphs: {
            indicator: string;
            bullet: string;
            arrow: string;
        };
        layout: {
            submitOnEnter: boolean;
            showTokenBar: boolean;
            compactMode: boolean;
        };
    };
}, {
    theme?: {
        colors?: {
            info?: string | undefined;
            error?: string | undefined;
            accent?: string | undefined;
            success?: string | undefined;
            warning?: string | undefined;
            planning?: string | undefined;
        } | undefined;
        glyphs?: {
            indicator?: string | undefined;
            bullet?: string | undefined;
            arrow?: string | undefined;
        } | undefined;
        layout?: {
            submitOnEnter?: boolean | undefined;
            showTokenBar?: boolean | undefined;
            compactMode?: boolean | undefined;
        } | undefined;
    } | undefined;
}>>;
type TuiConfig = z.infer<typeof tuiSchema>;
declare const mcpServerSchema: z.ZodObject<{
    name: z.ZodString;
    command: z.ZodString;
    args: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    env: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodString>>;
    approvalMode: z.ZodDefault<z.ZodEnum<["auto", "manual", "deny"]>>;
}, "strip", z.ZodTypeAny, {
    env: Record<string, string>;
    name: string;
    command: string;
    args: string[];
    approvalMode: "deny" | "auto" | "manual";
}, {
    name: string;
    command: string;
    env?: Record<string, string> | undefined;
    args?: string[] | undefined;
    approvalMode?: "deny" | "auto" | "manual" | undefined;
}>;
type McpServerConfig = z.infer<typeof mcpServerSchema>;
/** A.1 top-level configuration schema. */
declare const configSchema: z.ZodObject<{
    schemaVersion: z.ZodDefault<z.ZodLiteral<1>>;
    defaultProvider: z.ZodDefault<z.ZodEnum<["openai", "anthropic", "ollama", "ollama-cloud", "openrouter", "zenmux", "opencode", "mock"]>>;
    defaultModel: z.ZodDefault<z.ZodString>;
    providers: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodObject<{
        apiKeyEnv: z.ZodOptional<z.ZodString>;
        apiKey: z.ZodOptional<z.ZodString>;
        baseUrl: z.ZodOptional<z.ZodString>;
        defaultModel: z.ZodOptional<z.ZodString>;
        models: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodObject<{
            contextWindow: z.ZodOptional<z.ZodNumber>;
            maxOutput: z.ZodOptional<z.ZodNumber>;
            inputCostPerMTok: z.ZodOptional<z.ZodNumber>;
            outputCostPerMTok: z.ZodOptional<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            contextWindow?: number | undefined;
            maxOutput?: number | undefined;
            inputCostPerMTok?: number | undefined;
            outputCostPerMTok?: number | undefined;
        }, {
            contextWindow?: number | undefined;
            maxOutput?: number | undefined;
            inputCostPerMTok?: number | undefined;
            outputCostPerMTok?: number | undefined;
        }>>>;
        fallback: z.ZodOptional<z.ZodObject<{
            provider: z.ZodEnum<["openai", "anthropic", "ollama", "ollama-cloud", "openrouter", "zenmux", "opencode", "mock"]>;
            model: z.ZodString;
            triggerAfter: z.ZodDefault<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            model: string;
            provider: "openai" | "anthropic" | "ollama" | "ollama-cloud" | "openrouter" | "zenmux" | "opencode" | "mock";
            triggerAfter: number;
        }, {
            model: string;
            provider: "openai" | "anthropic" | "ollama" | "ollama-cloud" | "openrouter" | "zenmux" | "opencode" | "mock";
            triggerAfter?: number | undefined;
        }>>;
    }, "strip", z.ZodTypeAny, {
        apiKeyEnv?: string | undefined;
        apiKey?: string | undefined;
        baseUrl?: string | undefined;
        defaultModel?: string | undefined;
        models?: Record<string, {
            contextWindow?: number | undefined;
            maxOutput?: number | undefined;
            inputCostPerMTok?: number | undefined;
            outputCostPerMTok?: number | undefined;
        }> | undefined;
        fallback?: {
            model: string;
            provider: "openai" | "anthropic" | "ollama" | "ollama-cloud" | "openrouter" | "zenmux" | "opencode" | "mock";
            triggerAfter: number;
        } | undefined;
    }, {
        apiKeyEnv?: string | undefined;
        apiKey?: string | undefined;
        baseUrl?: string | undefined;
        defaultModel?: string | undefined;
        models?: Record<string, {
            contextWindow?: number | undefined;
            maxOutput?: number | undefined;
            inputCostPerMTok?: number | undefined;
            outputCostPerMTok?: number | undefined;
        }> | undefined;
        fallback?: {
            model: string;
            provider: "openai" | "anthropic" | "ollama" | "ollama-cloud" | "openrouter" | "zenmux" | "opencode" | "mock";
            triggerAfter?: number | undefined;
        } | undefined;
    }>>>;
    tools: z.ZodDefault<z.ZodObject<{
        read: z.ZodDefault<z.ZodObject<{
            autoApprove: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            deny: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        }, "strip", z.ZodTypeAny, {
            autoApprove: string[];
            deny: string[];
        }, {
            autoApprove?: string[] | undefined;
            deny?: string[] | undefined;
        }>>;
        write: z.ZodDefault<z.ZodObject<{
            allowOutsideCwd: z.ZodDefault<z.ZodBoolean>;
            autoApprove: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        }, "strip", z.ZodTypeAny, {
            autoApprove: string[];
            allowOutsideCwd: boolean;
        }, {
            autoApprove?: string[] | undefined;
            allowOutsideCwd?: boolean | undefined;
        }>>;
        edit: z.ZodDefault<z.ZodObject<{
            autoApprove: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        }, "strip", z.ZodTypeAny, {
            autoApprove: string[];
        }, {
            autoApprove?: string[] | undefined;
        }>>;
        shell: z.ZodDefault<z.ZodObject<{
            autoApprove: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            deny: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            env: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodString>>;
            timeoutMs: z.ZodDefault<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            autoApprove: string[];
            deny: string[];
            env: Record<string, string>;
            timeoutMs: number;
        }, {
            autoApprove?: string[] | undefined;
            deny?: string[] | undefined;
            env?: Record<string, string> | undefined;
            timeoutMs?: number | undefined;
        }>>;
        git: z.ZodDefault<z.ZodObject<{
            allowForcePush: z.ZodDefault<z.ZodBoolean>;
            autoApproveReads: z.ZodDefault<z.ZodBoolean>;
        }, "strip", z.ZodTypeAny, {
            allowForcePush: boolean;
            autoApproveReads: boolean;
        }, {
            allowForcePush?: boolean | undefined;
            autoApproveReads?: boolean | undefined;
        }>>;
    }, "strip", z.ZodTypeAny, {
        write: {
            autoApprove: string[];
            allowOutsideCwd: boolean;
        };
        read: {
            autoApprove: string[];
            deny: string[];
        };
        edit: {
            autoApprove: string[];
        };
        shell: {
            autoApprove: string[];
            deny: string[];
            env: Record<string, string>;
            timeoutMs: number;
        };
        git: {
            allowForcePush: boolean;
            autoApproveReads: boolean;
        };
    }, {
        write?: {
            autoApprove?: string[] | undefined;
            allowOutsideCwd?: boolean | undefined;
        } | undefined;
        read?: {
            autoApprove?: string[] | undefined;
            deny?: string[] | undefined;
        } | undefined;
        edit?: {
            autoApprove?: string[] | undefined;
        } | undefined;
        shell?: {
            autoApprove?: string[] | undefined;
            deny?: string[] | undefined;
            env?: Record<string, string> | undefined;
            timeoutMs?: number | undefined;
        } | undefined;
        git?: {
            allowForcePush?: boolean | undefined;
            autoApproveReads?: boolean | undefined;
        } | undefined;
    }>>;
    tui: z.ZodDefault<z.ZodObject<{
        theme: z.ZodDefault<z.ZodObject<{
            colors: z.ZodDefault<z.ZodObject<{
                accent: z.ZodDefault<z.ZodString>;
                success: z.ZodDefault<z.ZodString>;
                error: z.ZodDefault<z.ZodString>;
                warning: z.ZodDefault<z.ZodString>;
                info: z.ZodDefault<z.ZodString>;
                planning: z.ZodDefault<z.ZodString>;
            }, "strip", z.ZodTypeAny, {
                info: string;
                error: string;
                accent: string;
                success: string;
                warning: string;
                planning: string;
            }, {
                info?: string | undefined;
                error?: string | undefined;
                accent?: string | undefined;
                success?: string | undefined;
                warning?: string | undefined;
                planning?: string | undefined;
            }>>;
            glyphs: z.ZodDefault<z.ZodObject<{
                indicator: z.ZodDefault<z.ZodString>;
                bullet: z.ZodDefault<z.ZodString>;
                arrow: z.ZodDefault<z.ZodString>;
            }, "strip", z.ZodTypeAny, {
                indicator: string;
                bullet: string;
                arrow: string;
            }, {
                indicator?: string | undefined;
                bullet?: string | undefined;
                arrow?: string | undefined;
            }>>;
            layout: z.ZodDefault<z.ZodObject<{
                submitOnEnter: z.ZodDefault<z.ZodBoolean>;
                showTokenBar: z.ZodDefault<z.ZodBoolean>;
                compactMode: z.ZodDefault<z.ZodBoolean>;
            }, "strip", z.ZodTypeAny, {
                submitOnEnter: boolean;
                showTokenBar: boolean;
                compactMode: boolean;
            }, {
                submitOnEnter?: boolean | undefined;
                showTokenBar?: boolean | undefined;
                compactMode?: boolean | undefined;
            }>>;
        }, "strip", z.ZodTypeAny, {
            colors: {
                info: string;
                error: string;
                accent: string;
                success: string;
                warning: string;
                planning: string;
            };
            glyphs: {
                indicator: string;
                bullet: string;
                arrow: string;
            };
            layout: {
                submitOnEnter: boolean;
                showTokenBar: boolean;
                compactMode: boolean;
            };
        }, {
            colors?: {
                info?: string | undefined;
                error?: string | undefined;
                accent?: string | undefined;
                success?: string | undefined;
                warning?: string | undefined;
                planning?: string | undefined;
            } | undefined;
            glyphs?: {
                indicator?: string | undefined;
                bullet?: string | undefined;
                arrow?: string | undefined;
            } | undefined;
            layout?: {
                submitOnEnter?: boolean | undefined;
                showTokenBar?: boolean | undefined;
                compactMode?: boolean | undefined;
            } | undefined;
        }>>;
    }, "strip", z.ZodTypeAny, {
        theme: {
            colors: {
                info: string;
                error: string;
                accent: string;
                success: string;
                warning: string;
                planning: string;
            };
            glyphs: {
                indicator: string;
                bullet: string;
                arrow: string;
            };
            layout: {
                submitOnEnter: boolean;
                showTokenBar: boolean;
                compactMode: boolean;
            };
        };
    }, {
        theme?: {
            colors?: {
                info?: string | undefined;
                error?: string | undefined;
                accent?: string | undefined;
                success?: string | undefined;
                warning?: string | undefined;
                planning?: string | undefined;
            } | undefined;
            glyphs?: {
                indicator?: string | undefined;
                bullet?: string | undefined;
                arrow?: string | undefined;
            } | undefined;
            layout?: {
                submitOnEnter?: boolean | undefined;
                showTokenBar?: boolean | undefined;
                compactMode?: boolean | undefined;
            } | undefined;
        } | undefined;
    }>>;
    sessions: z.ZodDefault<z.ZodObject<{
        autoCompact: z.ZodDefault<z.ZodBoolean>;
        autoCompactThreshold: z.ZodDefault<z.ZodNumber>;
        retentionDays: z.ZodDefault<z.ZodNumber>;
        budgetUsd: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        autoCompact: boolean;
        autoCompactThreshold: number;
        retentionDays: number;
        budgetUsd?: number | undefined;
    }, {
        autoCompact?: boolean | undefined;
        autoCompactThreshold?: number | undefined;
        retentionDays?: number | undefined;
        budgetUsd?: number | undefined;
    }>>;
    logging: z.ZodDefault<z.ZodObject<{
        level: z.ZodDefault<z.ZodEnum<["trace", "debug", "info", "warn", "error"]>>;
        fileRetentionDays: z.ZodDefault<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        level: "trace" | "debug" | "info" | "warn" | "error";
        fileRetentionDays: number;
    }, {
        level?: "trace" | "debug" | "info" | "warn" | "error" | undefined;
        fileRetentionDays?: number | undefined;
    }>>;
    mcp: z.ZodDefault<z.ZodObject<{
        servers: z.ZodDefault<z.ZodArray<z.ZodObject<{
            name: z.ZodString;
            command: z.ZodString;
            args: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            env: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodString>>;
            approvalMode: z.ZodDefault<z.ZodEnum<["auto", "manual", "deny"]>>;
        }, "strip", z.ZodTypeAny, {
            env: Record<string, string>;
            name: string;
            command: string;
            args: string[];
            approvalMode: "deny" | "auto" | "manual";
        }, {
            name: string;
            command: string;
            env?: Record<string, string> | undefined;
            args?: string[] | undefined;
            approvalMode?: "deny" | "auto" | "manual" | undefined;
        }>, "many">>;
    }, "strip", z.ZodTypeAny, {
        servers: {
            env: Record<string, string>;
            name: string;
            command: string;
            args: string[];
            approvalMode: "deny" | "auto" | "manual";
        }[];
    }, {
        servers?: {
            name: string;
            command: string;
            env?: Record<string, string> | undefined;
            args?: string[] | undefined;
            approvalMode?: "deny" | "auto" | "manual" | undefined;
        }[] | undefined;
    }>>;
    observability: z.ZodDefault<z.ZodObject<{
        otlpEndpoint: z.ZodOptional<z.ZodString>;
        metricsPort: z.ZodOptional<z.ZodNumber>;
        webhook: z.ZodOptional<z.ZodObject<{
            url: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            url: string;
        }, {
            url: string;
        }>>;
        sentryDsn: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        otlpEndpoint?: string | undefined;
        metricsPort?: number | undefined;
        webhook?: {
            url: string;
        } | undefined;
        sentryDsn?: string | undefined;
    }, {
        otlpEndpoint?: string | undefined;
        metricsPort?: number | undefined;
        webhook?: {
            url: string;
        } | undefined;
        sentryDsn?: string | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    sessions: {
        autoCompact: boolean;
        autoCompactThreshold: number;
        retentionDays: number;
        budgetUsd?: number | undefined;
    };
    defaultModel: string;
    schemaVersion: 1;
    defaultProvider: "openai" | "anthropic" | "ollama" | "ollama-cloud" | "openrouter" | "zenmux" | "opencode" | "mock";
    providers: Record<string, {
        apiKeyEnv?: string | undefined;
        apiKey?: string | undefined;
        baseUrl?: string | undefined;
        defaultModel?: string | undefined;
        models?: Record<string, {
            contextWindow?: number | undefined;
            maxOutput?: number | undefined;
            inputCostPerMTok?: number | undefined;
            outputCostPerMTok?: number | undefined;
        }> | undefined;
        fallback?: {
            model: string;
            provider: "openai" | "anthropic" | "ollama" | "ollama-cloud" | "openrouter" | "zenmux" | "opencode" | "mock";
            triggerAfter: number;
        } | undefined;
    }>;
    tools: {
        write: {
            autoApprove: string[];
            allowOutsideCwd: boolean;
        };
        read: {
            autoApprove: string[];
            deny: string[];
        };
        edit: {
            autoApprove: string[];
        };
        shell: {
            autoApprove: string[];
            deny: string[];
            env: Record<string, string>;
            timeoutMs: number;
        };
        git: {
            allowForcePush: boolean;
            autoApproveReads: boolean;
        };
    };
    tui: {
        theme: {
            colors: {
                info: string;
                error: string;
                accent: string;
                success: string;
                warning: string;
                planning: string;
            };
            glyphs: {
                indicator: string;
                bullet: string;
                arrow: string;
            };
            layout: {
                submitOnEnter: boolean;
                showTokenBar: boolean;
                compactMode: boolean;
            };
        };
    };
    logging: {
        level: "trace" | "debug" | "info" | "warn" | "error";
        fileRetentionDays: number;
    };
    mcp: {
        servers: {
            env: Record<string, string>;
            name: string;
            command: string;
            args: string[];
            approvalMode: "deny" | "auto" | "manual";
        }[];
    };
    observability: {
        otlpEndpoint?: string | undefined;
        metricsPort?: number | undefined;
        webhook?: {
            url: string;
        } | undefined;
        sentryDsn?: string | undefined;
    };
}, {
    sessions?: {
        autoCompact?: boolean | undefined;
        autoCompactThreshold?: number | undefined;
        retentionDays?: number | undefined;
        budgetUsd?: number | undefined;
    } | undefined;
    defaultModel?: string | undefined;
    schemaVersion?: 1 | undefined;
    defaultProvider?: "openai" | "anthropic" | "ollama" | "ollama-cloud" | "openrouter" | "zenmux" | "opencode" | "mock" | undefined;
    providers?: Record<string, {
        apiKeyEnv?: string | undefined;
        apiKey?: string | undefined;
        baseUrl?: string | undefined;
        defaultModel?: string | undefined;
        models?: Record<string, {
            contextWindow?: number | undefined;
            maxOutput?: number | undefined;
            inputCostPerMTok?: number | undefined;
            outputCostPerMTok?: number | undefined;
        }> | undefined;
        fallback?: {
            model: string;
            provider: "openai" | "anthropic" | "ollama" | "ollama-cloud" | "openrouter" | "zenmux" | "opencode" | "mock";
            triggerAfter?: number | undefined;
        } | undefined;
    }> | undefined;
    tools?: {
        write?: {
            autoApprove?: string[] | undefined;
            allowOutsideCwd?: boolean | undefined;
        } | undefined;
        read?: {
            autoApprove?: string[] | undefined;
            deny?: string[] | undefined;
        } | undefined;
        edit?: {
            autoApprove?: string[] | undefined;
        } | undefined;
        shell?: {
            autoApprove?: string[] | undefined;
            deny?: string[] | undefined;
            env?: Record<string, string> | undefined;
            timeoutMs?: number | undefined;
        } | undefined;
        git?: {
            allowForcePush?: boolean | undefined;
            autoApproveReads?: boolean | undefined;
        } | undefined;
    } | undefined;
    tui?: {
        theme?: {
            colors?: {
                info?: string | undefined;
                error?: string | undefined;
                accent?: string | undefined;
                success?: string | undefined;
                warning?: string | undefined;
                planning?: string | undefined;
            } | undefined;
            glyphs?: {
                indicator?: string | undefined;
                bullet?: string | undefined;
                arrow?: string | undefined;
            } | undefined;
            layout?: {
                submitOnEnter?: boolean | undefined;
                showTokenBar?: boolean | undefined;
                compactMode?: boolean | undefined;
            } | undefined;
        } | undefined;
    } | undefined;
    logging?: {
        level?: "trace" | "debug" | "info" | "warn" | "error" | undefined;
        fileRetentionDays?: number | undefined;
    } | undefined;
    mcp?: {
        servers?: {
            name: string;
            command: string;
            env?: Record<string, string> | undefined;
            args?: string[] | undefined;
            approvalMode?: "deny" | "auto" | "manual" | undefined;
        }[] | undefined;
    } | undefined;
    observability?: {
        otlpEndpoint?: string | undefined;
        metricsPort?: number | undefined;
        webhook?: {
            url: string;
        } | undefined;
        sentryDsn?: string | undefined;
    } | undefined;
}>;
/** The fully-resolved, validated configuration object. */
type SkyConfig = z.infer<typeof configSchema>;
/** Parse an arbitrary object into a fully-defaulted config (throws on failure). */
declare function parseConfig(input: unknown): SkyConfig;
/** The default configuration (every default applied to an empty object). */
declare function defaultConfig(): SkyConfig;

/**
 * Canonical locations under `~/.sky/` (§7.1). The base directory can be
 * overridden with `SKY_HOME`, which is what the test-suite uses to sandbox the
 * filesystem without touching a real home directory.
 */
declare function skyHome(): string;
declare function configPath(): string;
declare function configSchemaPath(): string;
declare function sessionsDir(): string;
declare function sessionsIndexPath(): string;
declare function logsDir(): string;
declare function logFilePath(): string;
declare function auditDir(): string;
declare function auditLogPath(): string;
/** Plugin storage roots (§ plugin marketplace extension). */
declare function pluginsDir(): string;
declare function marketplacesDir(): string;
declare function installedPluginsDir(): string;
declare function pluginsStatePath(): string;

/**
 * Resolve a provider's API key following the precedence in §7.7:
 *   1. `providers.X.apiKey` literal (discouraged; logged as a warning)
 *   2. env var named by `providers.X.apiKeyEnv`
 *   3. system keychain entry (not available in this build → skipped)
 *   4. `SKY_PROVIDERS_X_API_KEY` env var
 *   5. otherwise fail with SKY-E-1002
 *
 * `mock`, `ollama`, and `opencode` never require a key.
 */
declare function resolveApiKey(providerName: string, providerConfig: ProviderConfig | undefined, logger?: Logger, env?: NodeJS.ProcessEnv): string;

/** Overrides supplied from the command line (precedence level 5 — highest). */
interface CliOverrides {
    defaultProvider?: string;
    defaultModel?: string;
    configPath?: string;
}
interface LoadConfigOptions {
    /** Explicit config path (from `--config`); defaults to {@link configPath}. */
    path?: string;
    /** Working directory used to locate a `.skyrc` project override. */
    cwd?: string;
    /** Environment used for `SKY_*` overrides (injectable for tests). */
    env?: NodeJS.ProcessEnv;
    /** Highest-precedence CLI overrides. */
    cli?: CliOverrides;
    logger?: Logger;
}
/**
 * Load, merge, and validate the configuration (§7.5–7.6). Sources are merged in
 * fixed precedence order (defaults < config.json < .skyrc < SKY_* env < CLI),
 * then the result is validated against the Zod schema. Any validation failure
 * aborts with {@link ErrorCode.ConfigValidationFailed}.
 */
declare function loadConfig(options?: LoadConfigOptions): SkyConfig;
/** Whether a config file exists at the resolved location. */
declare function configExists(path?: string): boolean;
/** Load config or throw {@link ErrorCode.ConfigNotFound} if the file is absent. */
declare function requireConfig(options?: LoadConfigOptions): SkyConfig;
/** Read a dotted key path (`providers.openai.defaultModel`) from a config object. */
declare function getConfigKey(config: SkyConfig, key: string): unknown;
/**
 * Write a raw config object to disk (used by `sky init` / `sky config set`).
 * Validates before writing so a malformed value can never be persisted.
 */
declare function writeConfig(config: SkyConfig, path?: string): void;
/** Export the JSON Schema so editors can offer autocomplete (§7.5). */
declare function exportJsonSchema(path?: string): void;
/** Build a fresh default config for `sky init`. */
declare function scaffoldConfig(provider: string, model: string, apiKeyEnv?: string): SkyConfig;

type index$5_CliOverrides = CliOverrides;
type index$5_LoadConfigOptions = LoadConfigOptions;
type index$5_McpServerConfig = McpServerConfig;
type index$5_ProviderConfig = ProviderConfig;
type index$5_ProviderName = ProviderName;
type index$5_SkyConfig = SkyConfig;
type index$5_ToolsConfig = ToolsConfig;
type index$5_TuiConfig = TuiConfig;
declare const index$5_auditDir: typeof auditDir;
declare const index$5_auditLogPath: typeof auditLogPath;
declare const index$5_configExists: typeof configExists;
declare const index$5_configPath: typeof configPath;
declare const index$5_configSchema: typeof configSchema;
declare const index$5_configSchemaPath: typeof configSchemaPath;
declare const index$5_defaultConfig: typeof defaultConfig;
declare const index$5_exportJsonSchema: typeof exportJsonSchema;
declare const index$5_getConfigKey: typeof getConfigKey;
declare const index$5_installedPluginsDir: typeof installedPluginsDir;
declare const index$5_loadConfig: typeof loadConfig;
declare const index$5_logFilePath: typeof logFilePath;
declare const index$5_logsDir: typeof logsDir;
declare const index$5_marketplacesDir: typeof marketplacesDir;
declare const index$5_parseConfig: typeof parseConfig;
declare const index$5_pluginsDir: typeof pluginsDir;
declare const index$5_pluginsStatePath: typeof pluginsStatePath;
declare const index$5_providerNameSchema: typeof providerNameSchema;
declare const index$5_requireConfig: typeof requireConfig;
declare const index$5_resolveApiKey: typeof resolveApiKey;
declare const index$5_scaffoldConfig: typeof scaffoldConfig;
declare const index$5_sessionsDir: typeof sessionsDir;
declare const index$5_sessionsIndexPath: typeof sessionsIndexPath;
declare const index$5_skyHome: typeof skyHome;
declare const index$5_writeConfig: typeof writeConfig;
declare namespace index$5 {
  export { type index$5_CliOverrides as CliOverrides, type index$5_LoadConfigOptions as LoadConfigOptions, type index$5_McpServerConfig as McpServerConfig, type index$5_ProviderConfig as ProviderConfig, type index$5_ProviderName as ProviderName, type index$5_SkyConfig as SkyConfig, type index$5_ToolsConfig as ToolsConfig, type index$5_TuiConfig as TuiConfig, index$5_auditDir as auditDir, index$5_auditLogPath as auditLogPath, index$5_configExists as configExists, index$5_configPath as configPath, index$5_configSchema as configSchema, index$5_configSchemaPath as configSchemaPath, index$5_defaultConfig as defaultConfig, index$5_exportJsonSchema as exportJsonSchema, index$5_getConfigKey as getConfigKey, index$5_installedPluginsDir as installedPluginsDir, index$5_loadConfig as loadConfig, index$5_logFilePath as logFilePath, index$5_logsDir as logsDir, index$5_marketplacesDir as marketplacesDir, index$5_parseConfig as parseConfig, index$5_pluginsDir as pluginsDir, index$5_pluginsStatePath as pluginsStatePath, index$5_providerNameSchema as providerNameSchema, index$5_requireConfig as requireConfig, index$5_resolveApiKey as resolveApiKey, index$5_scaffoldConfig as scaffoldConfig, index$5_sessionsDir as sessionsDir, index$5_sessionsIndexPath as sessionsIndexPath, index$5_skyHome as skyHome, index$5_writeConfig as writeConfig };
}

/** The agent operating mode a session was started in (§4.1). */
type Mode = 'agent' | 'plan' | 'ask';
/** Session lifecycle state (§7.3). */
type SessionStatus = 'active' | 'paused' | 'compacted' | 'archived';
/** A single tool call requested by the assistant. */
declare const toolCallSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    input: z.ZodRecord<z.ZodString, z.ZodUnknown>;
}, "strip", z.ZodTypeAny, {
    name: string;
    id: string;
    input: Record<string, unknown>;
}, {
    name: string;
    id: string;
    input: Record<string, unknown>;
}>;
type ToolCall = z.infer<typeof toolCallSchema>;
/**
 * A conversation message. This is the persisted, canonical shape (§2.4.5). The
 * llm module defines a structurally-compatible `LlmMessage` so the two peer
 * modules need not import one another (see §2.3 dependency graph).
 */
declare const messageSchema: z.ZodObject<{
    role: z.ZodEnum<["system", "user", "assistant", "tool"]>;
    content: z.ZodString;
    /** Tool calls requested by an assistant message. */
    toolCalls: z.ZodOptional<z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
        input: z.ZodRecord<z.ZodString, z.ZodUnknown>;
    }, "strip", z.ZodTypeAny, {
        name: string;
        id: string;
        input: Record<string, unknown>;
    }, {
        name: string;
        id: string;
        input: Record<string, unknown>;
    }>, "many">>;
    /** For a tool-result message, the id of the call it answers. */
    toolCallId: z.ZodOptional<z.ZodString>;
    /** For a tool-result message, the tool name (aids provider translation). */
    name: z.ZodOptional<z.ZodString>;
    /** Wall-clock time the message was appended. */
    timestamp: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    role: "system" | "user" | "assistant" | "tool";
    content: string;
    name?: string | undefined;
    toolCalls?: {
        name: string;
        id: string;
        input: Record<string, unknown>;
    }[] | undefined;
    toolCallId?: string | undefined;
    timestamp?: string | undefined;
}, {
    role: "system" | "user" | "assistant" | "tool";
    content: string;
    name?: string | undefined;
    toolCalls?: {
        name: string;
        id: string;
        input: Record<string, unknown>;
    }[] | undefined;
    toolCallId?: string | undefined;
    timestamp?: string | undefined;
}>;
type Message = z.infer<typeof messageSchema>;
/** Cumulative token accounting for cost tracking (§8.9). */
declare const tokenUsageSchema: z.ZodObject<{
    input: z.ZodDefault<z.ZodNumber>;
    output: z.ZodDefault<z.ZodNumber>;
    estimatedCostUsd: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    input: number;
    output: number;
    estimatedCostUsd: number;
}, {
    input?: number | undefined;
    output?: number | undefined;
    estimatedCostUsd?: number | undefined;
}>;
type TokenUsage = z.infer<typeof tokenUsageSchema>;
/** A session-scoped auto-approval pattern added via an "always" decision (§9.8). */
declare const allowlistEntrySchema: z.ZodObject<{
    tool: z.ZodString;
    pattern: z.ZodString;
}, "strip", z.ZodTypeAny, {
    tool: string;
    pattern: string;
}, {
    tool: string;
    pattern: string;
}>;
type AllowlistEntry = z.infer<typeof allowlistEntrySchema>;
/** The current on-disk session schema version. */
declare const CURRENT_SESSION_VERSION: 1;
declare const sessionSchema: z.ZodObject<{
    schemaVersion: z.ZodDefault<z.ZodNumber>;
    id: z.ZodString;
    cwd: z.ZodString;
    mode: z.ZodEnum<["agent", "plan", "ask"]>;
    status: z.ZodDefault<z.ZodEnum<["active", "paused", "compacted", "archived"]>>;
    model: z.ZodString;
    provider: z.ZodString;
    started: z.ZodString;
    lastActivity: z.ZodString;
    messages: z.ZodDefault<z.ZodArray<z.ZodObject<{
        role: z.ZodEnum<["system", "user", "assistant", "tool"]>;
        content: z.ZodString;
        /** Tool calls requested by an assistant message. */
        toolCalls: z.ZodOptional<z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            name: z.ZodString;
            input: z.ZodRecord<z.ZodString, z.ZodUnknown>;
        }, "strip", z.ZodTypeAny, {
            name: string;
            id: string;
            input: Record<string, unknown>;
        }, {
            name: string;
            id: string;
            input: Record<string, unknown>;
        }>, "many">>;
        /** For a tool-result message, the id of the call it answers. */
        toolCallId: z.ZodOptional<z.ZodString>;
        /** For a tool-result message, the tool name (aids provider translation). */
        name: z.ZodOptional<z.ZodString>;
        /** Wall-clock time the message was appended. */
        timestamp: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        role: "system" | "user" | "assistant" | "tool";
        content: string;
        name?: string | undefined;
        toolCalls?: {
            name: string;
            id: string;
            input: Record<string, unknown>;
        }[] | undefined;
        toolCallId?: string | undefined;
        timestamp?: string | undefined;
    }, {
        role: "system" | "user" | "assistant" | "tool";
        content: string;
        name?: string | undefined;
        toolCalls?: {
            name: string;
            id: string;
            input: Record<string, unknown>;
        }[] | undefined;
        toolCallId?: string | undefined;
        timestamp?: string | undefined;
    }>, "many">>;
    tokenUsage: z.ZodDefault<z.ZodObject<{
        input: z.ZodDefault<z.ZodNumber>;
        output: z.ZodDefault<z.ZodNumber>;
        estimatedCostUsd: z.ZodDefault<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        input: number;
        output: number;
        estimatedCostUsd: number;
    }, {
        input?: number | undefined;
        output?: number | undefined;
        estimatedCostUsd?: number | undefined;
    }>>;
    sessionAllowlist: z.ZodDefault<z.ZodArray<z.ZodObject<{
        tool: z.ZodString;
        pattern: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        tool: string;
        pattern: string;
    }, {
        tool: string;
        pattern: string;
    }>, "many">>;
    /** Set at turn start, cleared at turn end; drives crash recovery (§11.7). */
    lastTurnInterrupted: z.ZodDefault<z.ZodBoolean>;
    /** Friendly name set via `/save`. */
    name: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    model: string;
    provider: string;
    cwd: string;
    status: "active" | "paused" | "compacted" | "archived";
    schemaVersion: number;
    id: string;
    mode: "agent" | "plan" | "ask";
    started: string;
    lastActivity: string;
    messages: {
        role: "system" | "user" | "assistant" | "tool";
        content: string;
        name?: string | undefined;
        toolCalls?: {
            name: string;
            id: string;
            input: Record<string, unknown>;
        }[] | undefined;
        toolCallId?: string | undefined;
        timestamp?: string | undefined;
    }[];
    tokenUsage: {
        input: number;
        output: number;
        estimatedCostUsd: number;
    };
    sessionAllowlist: {
        tool: string;
        pattern: string;
    }[];
    lastTurnInterrupted: boolean;
    name?: string | undefined;
}, {
    model: string;
    provider: string;
    cwd: string;
    id: string;
    mode: "agent" | "plan" | "ask";
    started: string;
    lastActivity: string;
    status?: "active" | "paused" | "compacted" | "archived" | undefined;
    name?: string | undefined;
    schemaVersion?: number | undefined;
    messages?: {
        role: "system" | "user" | "assistant" | "tool";
        content: string;
        name?: string | undefined;
        toolCalls?: {
            name: string;
            id: string;
            input: Record<string, unknown>;
        }[] | undefined;
        toolCallId?: string | undefined;
        timestamp?: string | undefined;
    }[] | undefined;
    tokenUsage?: {
        input?: number | undefined;
        output?: number | undefined;
        estimatedCostUsd?: number | undefined;
    } | undefined;
    sessionAllowlist?: {
        tool: string;
        pattern: string;
    }[] | undefined;
    lastTurnInterrupted?: boolean | undefined;
}>;
type Session = z.infer<typeof sessionSchema>;
/** One line of the append-only session index (§7.4). */
declare const sessionIndexEntrySchema: z.ZodObject<{
    id: z.ZodString;
    cwd: z.ZodString;
    started: z.ZodString;
    lastActivity: z.ZodString;
    mode: z.ZodEnum<["agent", "plan", "ask"]>;
    messages: z.ZodNumber;
    status: z.ZodDefault<z.ZodEnum<["active", "paused", "compacted", "archived"]>>;
}, "strip", z.ZodTypeAny, {
    cwd: string;
    status: "active" | "paused" | "compacted" | "archived";
    id: string;
    mode: "agent" | "plan" | "ask";
    started: string;
    lastActivity: string;
    messages: number;
}, {
    cwd: string;
    id: string;
    mode: "agent" | "plan" | "ask";
    started: string;
    lastActivity: string;
    messages: number;
    status?: "active" | "paused" | "compacted" | "archived" | undefined;
}>;
type SessionIndexEntry = z.infer<typeof sessionIndexEntrySchema>;

interface SessionStoreOptions {
    dir?: string;
    indexPath?: string;
    logger?: Logger;
}
/** Generate a short, url-safe session id. */
declare function generateSessionId(): string;
/**
 * The persistence layer (§2.4.5, §7). Every state change is written atomically
 * (temp file + rename) so a crash never leaves a partial file. An append-only
 * index makes `sky ls` fast without reading every session.
 */
declare class SessionStore {
    private readonly dir;
    private readonly indexPath;
    private readonly logger;
    constructor(options?: SessionStoreOptions);
    private filePath;
    /** Create a new active session and persist it. */
    create(params: {
        mode: Mode;
        cwd: string;
        provider: string;
        model: string;
        id?: string;
    }): Session;
    /** Whether a session file exists. */
    exists(id: string): boolean;
    /**
     * Load a session, running migrations and validation. A parse failure is
     * SKY-E-4002; an unmigratable file is SKY-E-4001. On corruption a `.bak` of
     * the original is preserved before throwing.
     */
    load(id: string): Session;
    private backup;
    /**
     * Persist a session with the atomic temp-file + rename strategy (§11.7).
     * Updates `lastActivity` and refreshes the index entry.
     */
    save(session: Session): void;
    /** Append a message and persist atomically. */
    appendMessage(session: Session, message: Message): void;
    /** Move a session to a new lifecycle state (§7.3) and persist. */
    setStatus(session: Session, status: Session['status']): void;
    private updateIndex;
    /**
     * Read the index, collapsing to the latest entry per id. If the index is
     * missing or a line is corrupt, it is rebuilt from the sessions directory.
     */
    list(filter?: {
        cwd?: string;
        sinceMs?: number;
    }): SessionIndexEntry[];
    private readIndex;
    /** Rebuild the index by scanning every session file. */
    rebuildIndex(): SessionIndexEntry[];
    /** Resolve `latest` or a concrete id to a session id for the given cwd. */
    resolveId(idOrLatest: string, cwd?: string): string;
}

/**
 * A migration is a pure function: given an old-version object it returns the
 * next-version object. It never mutates in place, never reads from disk, and
 * never fails silently (§7.8).
 */
type Migration = (input: Record<string, unknown>) => Record<string, unknown>;
/**
 * Bring a loaded session object up to {@link CURRENT_SESSION_VERSION} by running
 * each migration in sequence. An unmigratable file throws
 * {@link ErrorCode.SessionMigrationFailed} (the caller preserves a `.bak`).
 */
declare function migrateSession(input: Record<string, unknown>): Record<string, unknown>;

/**
 * The `session/` module (§2.4.5). Single source of truth for conversation
 * state; depends only on config/logging/errors.
 */

type index$4_AllowlistEntry = AllowlistEntry;
declare const index$4_CURRENT_SESSION_VERSION: typeof CURRENT_SESSION_VERSION;
type index$4_Message = Message;
type index$4_Migration = Migration;
type index$4_Mode = Mode;
type index$4_Session = Session;
type index$4_SessionIndexEntry = SessionIndexEntry;
type index$4_SessionStatus = SessionStatus;
type index$4_SessionStore = SessionStore;
declare const index$4_SessionStore: typeof SessionStore;
type index$4_SessionStoreOptions = SessionStoreOptions;
type index$4_TokenUsage = TokenUsage;
type index$4_ToolCall = ToolCall;
declare const index$4_allowlistEntrySchema: typeof allowlistEntrySchema;
declare const index$4_generateSessionId: typeof generateSessionId;
declare const index$4_messageSchema: typeof messageSchema;
declare const index$4_migrateSession: typeof migrateSession;
declare const index$4_sessionIndexEntrySchema: typeof sessionIndexEntrySchema;
declare const index$4_sessionSchema: typeof sessionSchema;
declare const index$4_tokenUsageSchema: typeof tokenUsageSchema;
declare const index$4_toolCallSchema: typeof toolCallSchema;
declare namespace index$4 {
  export { type index$4_AllowlistEntry as AllowlistEntry, index$4_CURRENT_SESSION_VERSION as CURRENT_SESSION_VERSION, type index$4_Message as Message, type index$4_Migration as Migration, type index$4_Mode as Mode, type index$4_Session as Session, type index$4_SessionIndexEntry as SessionIndexEntry, type index$4_SessionStatus as SessionStatus, index$4_SessionStore as SessionStore, type index$4_SessionStoreOptions as SessionStoreOptions, type index$4_TokenUsage as TokenUsage, type index$4_ToolCall as ToolCall, index$4_allowlistEntrySchema as allowlistEntrySchema, index$4_generateSessionId as generateSessionId, index$4_messageSchema as messageSchema, index$4_migrateSession as migrateSession, index$4_sessionIndexEntrySchema as sessionIndexEntrySchema, index$4_sessionSchema as sessionSchema, index$4_tokenUsageSchema as tokenUsageSchema, index$4_toolCallSchema as toolCallSchema };
}

/**
 * The provider abstraction (§8.1). This is the only module that knows about
 * vendor SDKs; the rest of Sky is vendor-agnostic. `LlmMessage` is structurally
 * identical to the session module's `Message`, so the two peer modules do not
 * import one another (§2.3).
 */
interface LlmToolCall {
    id: string;
    name: string;
    input: Record<string, unknown>;
}
interface LlmMessage {
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string;
    toolCalls?: LlmToolCall[];
    toolCallId?: string;
    name?: string;
}
/** A tool definition passed to the provider for function/tool calling. */
interface ToolDefinition {
    name: string;
    description: string;
    /** JSON-schema parameters object. */
    parameters: Record<string, unknown>;
}
/** Token accounting returned at the end of a stream. */
interface Usage {
    inputTokens: number;
    outputTokens: number;
}
/** A single streamed event from a provider (§5.10 / §8). */
type StreamChunk = {
    type: 'text-delta';
    text: string;
} | {
    type: 'tool-call';
    toolCall: LlmToolCall;
} | {
    type: 'done';
    usage: Usage;
    finishReason: 'stop' | 'tool_calls' | 'length';
};
interface StreamRequest {
    messages: LlmMessage[];
    tools?: ToolDefinition[];
    model: string;
    maxOutputTokens?: number;
    temperature?: number;
    signal?: AbortSignal;
}
/** Context-window limits for a model (§8.1). */
interface TokenLimits {
    contextWindow: number;
    maxOutput: number;
}
/**
 * Every adapter implements this interface. It is deliberately small: streaming,
 * token counting, and the model's limits.
 */
interface Provider {
    readonly name: string;
    stream(request: StreamRequest): AsyncIterable<StreamChunk>;
    countTokens(messages: LlmMessage[], model: string): number;
    tokenLimits(model: string): TokenLimits;
}

interface RetryOptions {
    retries?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
    logger?: Logger;
    /** Injectable sleep so tests need not wait real time. */
    sleep?: (ms: number) => Promise<void>;
}
/**
 * Retry a provider call with exponential backoff and jitter (§8.7). Only
 * retryable {@link SkyError}s (429, 503, timeouts, transient network) are
 * retried; everything else fails fast. Defaults: 4 retries, 1s base, 30s max.
 */
declare function withRetry<T>(fn: () => Promise<T>, options?: RetryOptions): Promise<T>;

interface BuildContextOptions {
    messages: LlmMessage[];
    limits: TokenLimits;
    /** Tokens reserved for tokenizer drift (§8.6). */
    safetyMargin?: number;
    /** How many recent assistant turns are protected from trimming (default 6). */
    keepRecentTurns?: number;
    countTokens?: (messages: LlmMessage[]) => number;
}
/**
 * Assemble the message array so its token count fits the model's budget
 * (§8.6). The budget is `contextWindow - maxOutput - safetyMargin`. Messages are
 * trimmed from the lowest-priority end: the system prompt (index 0) and the
 * current user message (last) are never trimmed; older tool results are stubbed
 * first, then older assistant turns are dropped.
 */
declare function buildContext(options: BuildContextOptions): LlmMessage[];

/**
 * A provider-agnostic heuristic token counter (4 chars ≈ 1 token, §8.5). The
 * OpenAI/Anthropic adapters can override this with their real tokenizers; the
 * heuristic is used by Ollama and as a safe default everywhere else.
 */
declare function heuristicCountTokens(messages: LlmMessage[]): number;

/** Published per-model pricing in $/Mtok (§8.9). Unknown models cost nothing. */
declare const MODEL_PRICING: Record<string, {
    input: number;
    output: number;
}>;
/** Estimate the USD cost of a single request's token usage. */
declare function estimateCost(model: string, usage: Usage): number;

/** A scripted turn: either streamed prose, tool calls, or both. */
interface MockTurn {
    text?: string;
    toolCalls?: LlmToolCall[];
}
interface MockProviderOptions {
    /** Scripted turns replayed in order. When exhausted, falls back to an echo. */
    script?: MockTurn[];
    limits?: TokenLimits;
}
/**
 * A deterministic, network-free provider used for tests, offline runs, and
 * `sky ... --provider mock`. It replays a script if given one, otherwise it
 * echoes a short acknowledgement of the last user message. This is the same
 * mechanism the E2E fixtures use (§10.4).
 */
declare class MockProvider implements Provider {
    readonly name = "mock";
    private readonly script;
    private cursor;
    private readonly limits;
    constructor(options?: MockProviderOptions);
    stream(request: StreamRequest): AsyncIterable<StreamChunk>;
    private usage;
    countTokens(messages: LlmMessage[]): number;
    tokenLimits(): TokenLimits;
}

interface OpenAiAdapterOptions {
    apiKey: string;
    baseUrl?: string;
    /** OpenRouter requires an HTTP-Referer header (§3.8). */
    defaultHeaders?: Record<string, string>;
    /** Feature flags Ollama does not support are disabled by the caller. */
    includeUsage?: boolean;
    name?: string;
    limits?: Record<string, TokenLimits>;
}
/**
 * The OpenAI adapter (§8.3). Also backs the Ollama and OpenRouter adapters via
 * a base-URL override, since both expose OpenAI-compatible endpoints (§3.8).
 * The `openai` SDK is imported dynamically so it remains an optional dependency.
 */
declare class OpenAiAdapter implements Provider {
    readonly name: string;
    private client;
    private readonly options;
    constructor(options: OpenAiAdapterOptions);
    private getClient;
    private toOpenAiMessages;
    private toOpenAiTools;
    stream(request: StreamRequest): AsyncIterable<StreamChunk>;
    countTokens(messages: LlmMessage[]): number;
    tokenLimits(model: string): TokenLimits;
}

interface AnthropicAdapterOptions {
    apiKey: string;
    baseUrl?: string;
    limits?: Record<string, TokenLimits>;
}
/**
 * The Anthropic adapter (§8.4). Anthropic's messages API differs from OpenAI's:
 * the system prompt is passed out-of-band, tool calls arrive as `tool_use`
 * content blocks, and tool results are `tool_result` blocks inside a user
 * message. The `@anthropic-ai/sdk` package is imported dynamically.
 */
declare class AnthropicAdapter implements Provider {
    readonly name = "anthropic";
    private client;
    private readonly options;
    constructor(options: AnthropicAdapterOptions);
    private getClient;
    /** Split out the system prompt and translate messages into Anthropic blocks. */
    private translate;
    private toAnthropicTools;
    stream(request: StreamRequest): AsyncIterable<StreamChunk>;
    countTokens(messages: LlmMessage[]): number;
    tokenLimits(model: string): TokenLimits;
}

interface CreateProviderOptions {
    config: SkyConfig;
    provider: string;
    logger?: Logger;
    env?: NodeJS.ProcessEnv;
    /** Inject a provider directly (tests, `--provider mock`). */
    override?: Provider;
}
/**
 * Instantiate the provider adapter named in config (§8.2). The four first-class
 * providers are OpenAI, Anthropic, Ollama, and OpenRouter; `mock` is always
 * available for offline use.
 */
declare function createProvider(options: CreateProviderOptions): Provider;

/** Map a provider HTTP status (and message) onto the 5xxx error catalog (§B.5). */
declare function providerErrorFromStatus(status: number | undefined, detail: string, cause?: unknown): SkyError;

/**
 * The `llm/` module (§2.4.7, §8). The only module that imports vendor SDKs; the
 * rest of Sky talks to the {@link Provider} interface.
 */

type index$3_AnthropicAdapter = AnthropicAdapter;
declare const index$3_AnthropicAdapter: typeof AnthropicAdapter;
type index$3_BuildContextOptions = BuildContextOptions;
type index$3_CreateProviderOptions = CreateProviderOptions;
type index$3_LlmMessage = LlmMessage;
type index$3_LlmToolCall = LlmToolCall;
declare const index$3_MODEL_PRICING: typeof MODEL_PRICING;
type index$3_MockProvider = MockProvider;
declare const index$3_MockProvider: typeof MockProvider;
type index$3_MockProviderOptions = MockProviderOptions;
type index$3_MockTurn = MockTurn;
type index$3_OpenAiAdapter = OpenAiAdapter;
declare const index$3_OpenAiAdapter: typeof OpenAiAdapter;
type index$3_Provider = Provider;
type index$3_RetryOptions = RetryOptions;
type index$3_StreamChunk = StreamChunk;
type index$3_StreamRequest = StreamRequest;
type index$3_TokenLimits = TokenLimits;
type index$3_ToolDefinition = ToolDefinition;
type index$3_Usage = Usage;
declare const index$3_buildContext: typeof buildContext;
declare const index$3_createProvider: typeof createProvider;
declare const index$3_estimateCost: typeof estimateCost;
declare const index$3_heuristicCountTokens: typeof heuristicCountTokens;
declare const index$3_providerErrorFromStatus: typeof providerErrorFromStatus;
declare const index$3_withRetry: typeof withRetry;
declare namespace index$3 {
  export { index$3_AnthropicAdapter as AnthropicAdapter, type index$3_BuildContextOptions as BuildContextOptions, type index$3_CreateProviderOptions as CreateProviderOptions, type index$3_LlmMessage as LlmMessage, type index$3_LlmToolCall as LlmToolCall, index$3_MODEL_PRICING as MODEL_PRICING, index$3_MockProvider as MockProvider, type index$3_MockProviderOptions as MockProviderOptions, type index$3_MockTurn as MockTurn, index$3_OpenAiAdapter as OpenAiAdapter, type index$3_Provider as Provider, type index$3_RetryOptions as RetryOptions, type index$3_StreamChunk as StreamChunk, type index$3_StreamRequest as StreamRequest, type index$3_TokenLimits as TokenLimits, type index$3_ToolDefinition as ToolDefinition, type index$3_Usage as Usage, index$3_buildContext as buildContext, index$3_createProvider as createProvider, index$3_estimateCost as estimateCost, index$3_heuristicCountTokens as heuristicCountTokens, index$3_providerErrorFromStatus as providerErrorFromStatus, index$3_withRetry as withRetry };
}

/**
 * Shell command classification (§9.4). Every command is assigned one of four
 * risk tiers before any policy rule is evaluated. The tier sets the default
 * behaviour; user policy can tighten it but never loosen it.
 */
type ShellTier = 1 | 2 | 3 | 4;
/**
 * Patterns that are ALWAYS denied, regardless of user config or `--yolo`
 * (§9.5). These are enforced in addition to the user's configurable denylist.
 */
declare const HARDCODED_SHELL_DENY: string[];
interface ShellClassification {
    tier: ShellTier;
    /** The default action implied by the tier. */
    defaultAction: 'auto' | 'prompt';
    reason: string;
}
/** Classify a shell command into its risk tier. */
declare function classifyShellCommand(command: string): ShellClassification;

/** The outcome of classifying a tool call (§9.2). */
type Decision = 'allow' | 'deny' | 'prompt';
interface PolicyRequest {
    tool: string;
    input: Record<string, unknown>;
    /** The tool's own `requiresApproval` verdict for these inputs. */
    requiresApproval: boolean;
}
interface Classification {
    decision: Decision;
    reason: string;
    /** Present for shell calls. */
    shell?: ShellClassification;
}
/**
 * The policy engine (§9.2). Combines static rules from config with dynamic
 * session-allowlist state. Rules are evaluated in a fixed order: denylist first
 * (always wins), then session allowlist, then config allowlist, then the tool's
 * own `requiresApproval` predicate. If nothing is definitive, the default is
 * `prompt`.
 */
declare class Policy {
    private readonly config;
    private sessionAllowlist;
    constructor(config: SkyConfig, sessionAllowlist?: AllowlistEntry[]);
    setAllowlist(entries: AllowlistEntry[]): void;
    private tools;
    classify(request: PolicyRequest): Classification;
    private fromPredicate;
    private matchesSessionAllowlist;
    /**
     * Derive the most specific pattern that would auto-approve this call, for the
     * "always" (a) decision (§9.8).
     */
    static deriveAllowlistPattern(tool: string, input: Record<string, unknown>): AllowlistEntry;
}

interface DiffResult {
    /** Unified diff text (empty when there is no change). */
    patch: string;
    added: number;
    removed: number;
    /** sha256 of the proposed new content, stored in the audit log (§9.6). */
    sha256: string;
}
/**
 * Generate a unified diff between current and proposed file content (§9.3). Used
 * both to render the approval prompt and to record the change in the audit log.
 */
declare function generateDiff(path: string, oldContent: string, newContent: string): DiffResult;
/** Colorize a unified diff for the TUI (§9.3): green add, red delete, gray context. */
declare function colorizeDiff(patch: string, chalk: {
    green: (s: string) => string;
    red: (s: string) => string;
    gray: (s: string) => string;
}): string;

/** One append-only audit record (§9.6). */
interface AuditEntry {
    timestamp: string;
    sessionId: string;
    toolCallId: string;
    toolName: string;
    input: Record<string, unknown>;
    decision: Decision;
    reason: string;
    granted: boolean;
    autoApproved: boolean;
    diff?: {
        path: string;
        added: number;
        removed: number;
        sha256: string;
    };
}
/**
 * The audit log (§9.6). Append-only, one JSON object per line. Every approval
 * decision — granted or denied, auto or interactive — is written before the
 * tool executes. Secret patterns in the input are redacted.
 */
declare class AuditLog {
    private readonly path;
    private readonly logger;
    constructor(options?: {
        path?: string;
        logger?: Logger;
    });
    write(entry: AuditEntry): void;
}

/** The user's choice at an interactive approval prompt (§5.6). */
type ApprovalAnswer = 'yes' | 'no' | 'edit' | 'always';
interface ApprovalPromptRequest {
    toolName: string;
    input: Record<string, unknown>;
    reason: string;
    /** A rendered diff to show, when the call is a file mutation. */
    diff?: {
        path: string;
        patch: string;
        added: number;
        removed: number;
        sha256: string;
    };
}
/** Async prompter injected by the TUI/CLI; headless mode supplies none. */
type Prompter = (request: ApprovalPromptRequest) => Promise<ApprovalAnswer>;
interface ApproverOptions {
    policy: Policy;
    audit: AuditLog;
    prompter?: Prompter;
    logger?: Logger;
    /** `--force`: bypass interactive prompts (still respects denylist). */
    force?: boolean;
    /** `--yolo`: implies force and bypasses tool predicates. */
    yolo?: boolean;
}
interface ApprovalRequest {
    sessionId: string;
    toolCallId: string;
    toolName: string;
    input: Record<string, unknown>;
    requiresApproval: boolean;
    diff?: ApprovalPromptRequest['diff'];
}
interface ApprovalResult {
    granted: boolean;
    decision: Decision;
    autoApproved: boolean;
    /** Replacement content when the user chose "edit". */
    edited?: string;
    /** A session-allowlist entry to persist when the user chose "always". */
    allowlistAdded?: AllowlistEntry;
}
/**
 * The Approver (§9.1). Every tool call passes through `request()`, which
 * classifies via the {@link Policy}, resolves the decision (auto or interactive),
 * and writes an {@link AuditLog} entry before returning. The tool only executes
 * if the result is `granted`.
 */
declare class Approver {
    private readonly policy;
    private readonly audit;
    private readonly prompter?;
    private readonly logger;
    private readonly force;
    private readonly yolo;
    constructor(options: ApproverOptions);
    request(req: ApprovalRequest): Promise<ApprovalResult>;
    private record;
}

/**
 * Minimal glob / command-pattern matching for the policy engine. Not a full
 * globbing implementation — just enough for the allowlist/denylist patterns in
 * Appendix A (globs like "src slash-star-star slash-star.ts", `npm test*`,
 * `rm -rf /`, `dd of=/dev/*`).
 */
/** Convert a glob into a RegExp. `**` matches across path separators, `*` does not. */
declare function globToRegExp(glob: string): RegExp;
/** Match a filesystem path against a glob. */
declare function matchGlob(path: string, glob: string): boolean;
/** True if the path matches any glob in the list. */
declare function matchAnyGlob(path: string, globs: string[]): boolean;
/**
 * Match a shell command against a pattern where `*` is a wildcard.
 * `anchored` controls whether the pattern must match from the start of the
 * command (allowlist semantics) or may match anywhere (denylist semantics —
 * so `shutdown` blocks `sudo shutdown now`).
 */
declare function matchCommandPattern(command: string, pattern: string, anchored: boolean): boolean;
declare function matchAnyCommand(command: string, patterns: string[], anchored: boolean): boolean;

/**
 * The `safety/` module (§2.4.4, §9). Sits between the agent loop and the tool
 * registry: classify → authorize → audit. Depends only on config/logging/errors
 * (and the session `AllowlistEntry` type, which is a pure data shape).
 */

type index$2_ApprovalAnswer = ApprovalAnswer;
type index$2_ApprovalPromptRequest = ApprovalPromptRequest;
type index$2_ApprovalRequest = ApprovalRequest;
type index$2_ApprovalResult = ApprovalResult;
type index$2_Approver = Approver;
declare const index$2_Approver: typeof Approver;
type index$2_ApproverOptions = ApproverOptions;
type index$2_AuditEntry = AuditEntry;
type index$2_AuditLog = AuditLog;
declare const index$2_AuditLog: typeof AuditLog;
type index$2_Classification = Classification;
type index$2_Decision = Decision;
type index$2_DiffResult = DiffResult;
declare const index$2_HARDCODED_SHELL_DENY: typeof HARDCODED_SHELL_DENY;
type index$2_Policy = Policy;
declare const index$2_Policy: typeof Policy;
type index$2_PolicyRequest = PolicyRequest;
type index$2_Prompter = Prompter;
type index$2_ShellClassification = ShellClassification;
type index$2_ShellTier = ShellTier;
declare const index$2_classifyShellCommand: typeof classifyShellCommand;
declare const index$2_colorizeDiff: typeof colorizeDiff;
declare const index$2_generateDiff: typeof generateDiff;
declare const index$2_globToRegExp: typeof globToRegExp;
declare const index$2_matchAnyCommand: typeof matchAnyCommand;
declare const index$2_matchAnyGlob: typeof matchAnyGlob;
declare const index$2_matchCommandPattern: typeof matchCommandPattern;
declare const index$2_matchGlob: typeof matchGlob;
declare namespace index$2 {
  export { type index$2_ApprovalAnswer as ApprovalAnswer, type index$2_ApprovalPromptRequest as ApprovalPromptRequest, type index$2_ApprovalRequest as ApprovalRequest, type index$2_ApprovalResult as ApprovalResult, index$2_Approver as Approver, type index$2_ApproverOptions as ApproverOptions, type index$2_AuditEntry as AuditEntry, index$2_AuditLog as AuditLog, type index$2_Classification as Classification, type index$2_Decision as Decision, type index$2_DiffResult as DiffResult, index$2_HARDCODED_SHELL_DENY as HARDCODED_SHELL_DENY, index$2_Policy as Policy, type index$2_PolicyRequest as PolicyRequest, type index$2_Prompter as Prompter, type index$2_ShellClassification as ShellClassification, type index$2_ShellTier as ShellTier, index$2_classifyShellCommand as classifyShellCommand, index$2_colorizeDiff as colorizeDiff, index$2_generateDiff as generateDiff, index$2_globToRegExp as globToRegExp, index$2_matchAnyCommand as matchAnyCommand, index$2_matchAnyGlob as matchAnyGlob, index$2_matchCommandPattern as matchCommandPattern, index$2_matchGlob as matchGlob };
}

/** Runtime context handed to every tool execution. */
interface ToolContext {
    /** The session's working directory; all relative paths resolve against it. */
    cwd: string;
    config: SkyConfig;
    logger: Logger;
    signal?: AbortSignal;
}
/** The structured result every tool returns (§6.9). */
interface ToolResult {
    ok: boolean;
    /** Text handed back to the model. */
    output: string;
    /** Error code when `ok` is false. */
    code?: ErrorCode;
    /** Whether the agent may retry with different inputs. */
    retryable?: boolean;
    /** Structured data for the TUI (e.g. search matches). */
    data?: Record<string, unknown>;
}
/** A proposed file mutation, used to build the approval diff (§9.3). */
interface ToolDiffPreview {
    path: string;
    oldContent: string;
    newContent: string;
}
/**
 * The Tool interface (§6.1). Deliberately minimal: metadata, a Zod input schema,
 * an approval predicate, and an execute method. Tools are pure functions of
 * their inputs — they do not read the session, call the LLM, or render the TUI.
 */
interface Tool<TInput = Record<string, unknown>> {
    readonly name: string;
    readonly description: string;
    /** Zod schema validating the tool input. */
    readonly schema: z.ZodType<TInput>;
    /** JSON-schema parameters advertised to the provider. */
    readonly parameters: Record<string, unknown>;
    /** Whether these specific inputs require user approval. */
    requiresApproval(input: TInput): boolean;
    /** For mutating tools: the current/proposed content for a diff. */
    preview?(input: TInput, ctx: ToolContext): Promise<ToolDiffPreview | undefined>;
    execute(input: TInput, ctx: ToolContext): Promise<ToolResult>;
}

/**
 * The tool registry (§2.4.3). Discovers tools, validates their inputs against
 * their Zod schema, and exposes them to the agent loop by name. Tool side
 * effects are mediated by the safety layer, which the loop invokes before
 * calling {@link ToolRegistry.execute}.
 */
declare class ToolRegistry {
    private readonly tools;
    constructor(tools?: Tool<any>[]);
    register(tool: Tool<any>): void;
    get(name: string): Tool<any> | undefined;
    has(name: string): boolean;
    list(): Tool<any>[];
    /** Tool definitions advertised to the provider for function calling. */
    definitions(): ToolDefinition[];
    /** Validate the input against the tool's schema (SKY-E-3001 on failure). */
    validate(name: string, input: unknown): Record<string, unknown>;
    /** Validate then execute. Never throws for a tool-level failure — returns a ToolResult. */
    execute(name: string, input: unknown, ctx: ToolContext): Promise<ToolResult>;
}
/** The six built-in tools (§6). */
declare function defaultTools(): Tool<any>[];

declare const schema$5: z.ZodObject<{
    path: z.ZodString;
    offset: z.ZodOptional<z.ZodNumber>;
    limit: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    path: string;
    offset?: number | undefined;
    limit?: number | undefined;
}, {
    path: string;
    offset?: number | undefined;
    limit?: number | undefined;
}>;
type Input$5 = z.infer<typeof schema$5>;
/**
 * The `read` tool (§6.2). Reads a file relative to cwd. Binary files return a
 * metadata placeholder; large files are truncated with a notice; `offset`/`limit`
 * select a line range.
 */
declare const readTool: Tool<Input$5>;

declare const schema$4: z.ZodObject<{
    path: z.ZodString;
    content: z.ZodString;
}, "strip", z.ZodTypeAny, {
    path: string;
    content: string;
}, {
    path: string;
    content: string;
}>;
type Input$4 = z.infer<typeof schema$4>;
/**
 * The `write` tool (§6.3). The most dangerous tool — it can destroy existing
 * content — so it always requires approval unless allowlisted. Refuses to write
 * outside cwd unless `tools.write.allowOutsideCwd` is set.
 */
declare const writeTool: Tool<Input$4>;

declare const schema$3: z.ZodObject<{
    path: z.ZodString;
    oldText: z.ZodString;
    newText: z.ZodString;
    /** 'all' or a positive count; default fails if oldText appears more than once. */
    occurrences: z.ZodOptional<z.ZodUnion<[z.ZodLiteral<"all">, z.ZodNumber]>>;
}, "strip", z.ZodTypeAny, {
    path: string;
    oldText: string;
    newText: string;
    occurrences?: number | "all" | undefined;
}, {
    path: string;
    oldText: string;
    newText: string;
    occurrences?: number | "all" | undefined;
}>;
type Input$3 = z.infer<typeof schema$3>;
/**
 * The `edit` tool (§6.4). Preferred over `write` for targeted changes: it fails
 * loudly if `oldText` is not found (drift) and, by default, if it appears more
 * than once (ambiguity), forcing the agent to disambiguate.
 */
declare const editTool: Tool<Input$3>;

declare const schema$2: z.ZodObject<{
    pattern: z.ZodString;
    path: z.ZodOptional<z.ZodString>;
    glob: z.ZodOptional<z.ZodString>;
    caseSensitive: z.ZodOptional<z.ZodBoolean>;
    maxResults: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    pattern: string;
    path?: string | undefined;
    glob?: string | undefined;
    caseSensitive?: boolean | undefined;
    maxResults?: number | undefined;
}, {
    pattern: string;
    path?: string | undefined;
    glob?: string | undefined;
    caseSensitive?: boolean | undefined;
    maxResults?: number | undefined;
}>;
type Input$2 = z.infer<typeof schema$2>;
/**
 * The `search` tool (§6.5). Uses ripgrep when available, falling back to a
 * pure-JS scan. Read-only; auto-approved within cwd, requires approval outside.
 */
declare const searchTool: Tool<Input$2>;

declare const schema$1: z.ZodObject<{
    command: z.ZodString;
    timeoutMs: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    command: string;
    timeoutMs?: number | undefined;
}, {
    command: string;
    timeoutMs?: number | undefined;
}>;
type Input$1 = z.infer<typeof schema$1>;
/**
 * The `shell` tool (§6.6). The highest-risk tool: every invocation is subject to
 * the strictest policy (classification + denylist, enforced in the safety layer
 * before execute is ever called). This module only runs the command.
 */
declare const shellTool: Tool<Input$1>;

declare const schema: z.ZodObject<{
    action: z.ZodEnum<["status", "diff", "log", "branch", "add", "commit", "checkout", "push"]>;
    args: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    flags: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    message: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    action: "push" | "status" | "diff" | "log" | "branch" | "add" | "commit" | "checkout";
    message?: string | undefined;
    flags?: string[] | undefined;
    args?: string[] | undefined;
}, {
    action: "push" | "status" | "diff" | "log" | "branch" | "add" | "commit" | "checkout";
    message?: string | undefined;
    flags?: string[] | undefined;
    args?: string[] | undefined;
}>;
type Input = z.infer<typeof schema>;
/**
 * The `git` tool (§6.7). A typed wrapper so the safety layer can apply targeted
 * rules: reads (status/log/diff/branch) are auto-approved; commit requires
 * approval; `push --force` is denied unless `tools.git.allowForcePush`.
 */
declare const gitTool: Tool<Input>;

/** Resolve a possibly-relative path against the session cwd. */
declare function resolveInCwd(cwd: string, path: string): string;
/** True if `path` is inside `cwd` (used to enforce the write sandbox, §6.3). */
declare function isInsideCwd(cwd: string, path: string): boolean;

/**
 * The `tools/` module (§2.4.3, §6). The agent's capability layer. Depends on
 * safety/config/logging/errors.
 */

type index$1_Tool<TInput = Record<string, unknown>> = Tool<TInput>;
type index$1_ToolContext = ToolContext;
type index$1_ToolDiffPreview = ToolDiffPreview;
type index$1_ToolRegistry = ToolRegistry;
declare const index$1_ToolRegistry: typeof ToolRegistry;
type index$1_ToolResult = ToolResult;
declare const index$1_defaultTools: typeof defaultTools;
declare const index$1_editTool: typeof editTool;
declare const index$1_gitTool: typeof gitTool;
declare const index$1_isInsideCwd: typeof isInsideCwd;
declare const index$1_readTool: typeof readTool;
declare const index$1_resolveInCwd: typeof resolveInCwd;
declare const index$1_searchTool: typeof searchTool;
declare const index$1_shellTool: typeof shellTool;
declare const index$1_writeTool: typeof writeTool;
declare namespace index$1 {
  export { type index$1_Tool as Tool, type index$1_ToolContext as ToolContext, type index$1_ToolDiffPreview as ToolDiffPreview, index$1_ToolRegistry as ToolRegistry, type index$1_ToolResult as ToolResult, index$1_defaultTools as defaultTools, index$1_editTool as editTool, index$1_gitTool as gitTool, index$1_isInsideCwd as isInsideCwd, index$1_readTool as readTool, index$1_resolveInCwd as resolveInCwd, index$1_searchTool as searchTool, index$1_shellTool as shellTool, index$1_writeTool as writeTool };
}

/**
 * The discriminated union of events the agent loop yields (§2.4.1). The TUI and
 * the headless JSON renderer both consume this same stream — the only
 * difference is whether it is rendered or serialized (§5.10).
 */
type AgentEvent = {
    type: 'turn-start';
    mode: string;
    model: string;
    provider: string;
} | {
    type: 'text-delta';
    text: string;
} | {
    type: 'tool-call';
    toolCall: ToolCall;
} | {
    type: 'approval-request';
    toolCall: ToolCall;
    reason: string;
} | {
    type: 'approval-resolved';
    toolCallId: string;
    granted: boolean;
    autoApproved: boolean;
} | {
    type: 'tool-result';
    toolCallId: string;
    toolName: string;
    ok: boolean;
    output: string;
} | {
    type: 'usage';
    usage: Usage;
    estimatedCostUsd: number;
} | {
    type: 'turn-end';
    finishReason: string;
} | {
    type: 'error';
    error: SkyError;
};

interface AgentLoopOptions {
    provider: Provider;
    registry: ToolRegistry;
    approver: Approver;
    policy: Policy;
    session: Session;
    store: SessionStore;
    config: SkyConfig;
    logger?: Logger;
    signal?: AbortSignal;
    maxIterations?: number;
}
/**
 * The agent loop (§2.4.1). Given a user message and a session, it produces a
 * stream of {@link AgentEvent}s. It is a generator so the TUI can render events
 * incrementally and the headless runner can serialize them — the same loop
 * drives both.
 */
declare class AgentLoop {
    private readonly opts;
    private readonly logger;
    constructor(options: AgentLoopOptions);
    run(userMessage?: string): AsyncGenerator<AgentEvent>;
    /** Stream one provider response, yielding text/tool-call events. */
    private streamTurn;
    private checkBudget;
    /** Validate → approve (with diff) → execute a single tool call. */
    private handleToolCall;
}

/** Whether a mode grants the agent tools (§4.4–4.5). */
declare function modeHasTools(mode: Mode): boolean;
/** Build the system prompt for a mode (§2.4.1). */
declare function buildSystemPrompt(mode: Mode, cwd: string): string;

/**
 * The `agent/` module (§2.4.1). Orchestration: drives the conversation loop and
 * yields events. Depends on llm/tools/safety/session/logging.
 */

type index_AgentEvent = AgentEvent;
type index_AgentLoop = AgentLoop;
declare const index_AgentLoop: typeof AgentLoop;
type index_AgentLoopOptions = AgentLoopOptions;
declare const index_buildSystemPrompt: typeof buildSystemPrompt;
declare const index_modeHasTools: typeof modeHasTools;
declare namespace index {
  export { type index_AgentEvent as AgentEvent, index_AgentLoop as AgentLoop, type index_AgentLoopOptions as AgentLoopOptions, index_buildSystemPrompt as buildSystemPrompt, index_modeHasTools as modeHasTools };
}

export { AgentLoop, Approver, AuditLog, ErrorCode, MockProvider, Policy, SessionStore, SkyError, ToolRegistry, index as agent, index$5 as config, createProvider, defaultConfig, index$7 as errors, index$3 as llm, loadConfig, index$6 as logging, index$2 as safety, index$4 as session, index$1 as tools };
