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
export enum ErrorCode {
  // 1xxx — Config
  ConfigNotFound = 'SKY-E-1000',
  ConfigParseFailed = 'SKY-E-1001',
  NoApiKey = 'SKY-E-1002',
  ConfigValidationFailed = 'SKY-E-1003',
  UnknownProvider = 'SKY-E-1004',
  UnknownModel = 'SKY-E-1005',
  ConfigKeyNotFound = 'SKY-E-1010',
  ConfigKeyWrongType = 'SKY-E-1011',
  ConfigMigrationFailed = 'SKY-E-1020',

  // 2xxx — Agent / Context
  AgentAborted = 'SKY-E-2000',
  ContextWindowExceeded = 'SKY-E-2001',
  NoToolDefinitions = 'SKY-E-2002',
  MaxIterations = 'SKY-E-2003',
  PlanModeRejectedTool = 'SKY-E-2010',
  AskModeReceivedTool = 'SKY-E-2011',

  // 3xxx — Tools
  UnknownTool = 'SKY-E-3000',
  ToolInputInvalid = 'SKY-E-3001',
  ToolOutputInvalid = 'SKY-E-3002',
  WritePathOutsideCwd = 'SKY-E-3010',
  EditOldTextNotFound = 'SKY-E-3020',
  EditOldTextAmbiguous = 'SKY-E-3021',
  SearchFailed = 'SKY-E-3030',
  ShellDenied = 'SKY-E-3040',
  ShellTimeout = 'SKY-E-3041',
  GitForcePushDenied = 'SKY-E-3050',
  McpDenyMode = 'SKY-E-3060',
  McpNotConnected = 'SKY-E-3061',
  ToolUnexpected = 'SKY-E-3999',

  // 4xxx — Session
  SessionNotFound = 'SKY-E-4000',
  SessionMigrationFailed = 'SKY-E-4001',
  SessionCorrupt = 'SKY-E-4002',
  SessionReadOnly = 'SKY-E-4010',
  SessionIndexCorrupt = 'SKY-E-4020',

  // 5xxx — Provider
  ProviderRequestFailed = 'SKY-E-5000',
  ProviderRateLimited = 'SKY-E-5001',
  ProviderUnavailable = 'SKY-E-5002',
  ProviderTimeout = 'SKY-E-5003',
  ProviderBadRequest = 'SKY-E-5010',
  ProviderAuthFailed = 'SKY-E-5011',
  ProviderForbidden = 'SKY-E-5012',
  ProviderContentFilter = 'SKY-E-5013',
  ProviderStreamInterrupted = 'SKY-E-5020',
  ProviderStreamParse = 'SKY-E-5030',
  ProviderBudgetExceeded = 'SKY-E-5040',
  ProviderUnknown = 'SKY-E-5099',

  // 6xxx — Safety
  ApprovalDenied = 'SKY-E-6000',
  ApprovalTimeout = 'SKY-E-6001',
  PolicyViolation = 'SKY-E-6010',
  AuditWriteFailed = 'SKY-E-6020',

  // 7xxx — TUI
  TerminalTooNarrow = 'SKY-E-7000',
  TerminalNoColor = 'SKY-E-7001',
  TuiRenderError = 'SKY-E-7010',

  // 8xxx — CLI
  UnknownCommand = 'SKY-E-8000',
  MissingArgument = 'SKY-E-8001',
  InvalidFlagValue = 'SKY-E-8002',
  InstanceLocked = 'SKY-E-8010',
  InternalError = 'SKY-E-8099',
}

/** Metadata attached to every code: default message, retryability, exit code. */
export interface ErrorMeta {
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
export const ERROR_CATALOG: Record<ErrorCode, ErrorMeta> = {
  // 1xxx
  [ErrorCode.ConfigNotFound]: { message: 'Config file not found. Run `sky init` to create one.', retryable: false, exitCode: 64 },
  [ErrorCode.ConfigParseFailed]: { message: 'Config file failed to parse: {detail}', retryable: false, exitCode: 64 },
  [ErrorCode.NoApiKey]: { message: 'No API key configured for provider {name}.', retryable: false, exitCode: 64 },
  [ErrorCode.ConfigValidationFailed]: { message: 'Config schema validation failed: {fields}', retryable: false, exitCode: 64 },
  [ErrorCode.UnknownProvider]: { message: 'Unknown provider: {name}', retryable: false, exitCode: 64 },
  [ErrorCode.UnknownModel]: { message: 'Unknown model: {name} for provider {provider}', retryable: false, exitCode: 64 },
  [ErrorCode.ConfigKeyNotFound]: { message: 'Config key not found: {key}', retryable: false, exitCode: 64 },
  [ErrorCode.ConfigKeyWrongType]: { message: 'Config key has wrong type: {key} expected {expected}', retryable: false, exitCode: 64 },
  [ErrorCode.ConfigMigrationFailed]: { message: 'Config migration failed: {detail}', retryable: false, exitCode: 64 },

  // 2xxx
  [ErrorCode.AgentAborted]: { message: 'Agent loop aborted by user (Ctrl-C)', retryable: false, exitCode: 130 },
  [ErrorCode.ContextWindowExceeded]: { message: 'Context window exceeded. Run `/compact` or start a new session.', retryable: false, exitCode: 68 },
  [ErrorCode.NoToolDefinitions]: { message: 'No tool definitions provided but agent requested tool call.', retryable: false, exitCode: 70 },
  [ErrorCode.MaxIterations]: { message: 'Agent turn exceeded max iterations ({n}).', retryable: false, exitCode: 70 },
  [ErrorCode.PlanModeRejectedTool]: { message: 'Plan mode rejected tool call: {name}.', retryable: false, exitCode: 0 },
  [ErrorCode.AskModeReceivedTool]: { message: 'Ask mode received tool call (should be filtered).', retryable: false, exitCode: 70 },

  // 3xxx
  [ErrorCode.UnknownTool]: { message: 'Unknown tool: {name}', retryable: false, exitCode: 70 },
  [ErrorCode.ToolInputInvalid]: { message: 'Tool input validation failed: {detail}', retryable: true, exitCode: 0 },
  [ErrorCode.ToolOutputInvalid]: { message: 'Tool output validation failed (internal bug)', retryable: false, exitCode: 70 },
  [ErrorCode.WritePathOutsideCwd]: { message: 'Write refused: path outside cwd ({path})', retryable: true, exitCode: 0 },
  [ErrorCode.EditOldTextNotFound]: { message: 'Edit failed: oldText not found in {path}', retryable: true, exitCode: 0 },
  [ErrorCode.EditOldTextAmbiguous]: { message: 'Edit failed: oldText ambiguous ({n} matches)', retryable: true, exitCode: 0 },
  [ErrorCode.SearchFailed]: { message: 'Search failed: ripgrep error: {detail}', retryable: false, exitCode: 0 },
  [ErrorCode.ShellDenied]: { message: 'Shell command denied (denylist): {command}', retryable: false, exitCode: 0 },
  [ErrorCode.ShellTimeout]: { message: 'Shell command timed out after {n}ms', retryable: false, exitCode: 0 },
  [ErrorCode.GitForcePushDenied]: { message: 'Git force push denied by policy', retryable: false, exitCode: 0 },
  [ErrorCode.McpDenyMode]: { message: 'MCP server {name} is in deny mode', retryable: false, exitCode: 0 },
  [ErrorCode.McpNotConnected]: { message: 'MCP server {name} not connected', retryable: false, exitCode: 0 },
  [ErrorCode.ToolUnexpected]: { message: 'Unexpected tool error: {detail}', retryable: false, exitCode: 70 },

  // 4xxx
  [ErrorCode.SessionNotFound]: { message: 'Session not found: {id}', retryable: false, exitCode: 65 },
  [ErrorCode.SessionMigrationFailed]: { message: 'Session schema migration failed: {detail}', retryable: false, exitCode: 65 },
  [ErrorCode.SessionCorrupt]: { message: 'Session file corrupt: {detail}', retryable: false, exitCode: 65 },
  [ErrorCode.SessionReadOnly]: { message: 'Session is read-only (--view mode)', retryable: false, exitCode: 2 },
  [ErrorCode.SessionIndexCorrupt]: { message: 'Session index corrupt; rebuilding', retryable: false, exitCode: 0 },

  // 5xxx
  [ErrorCode.ProviderRequestFailed]: { message: 'Provider request failed: {detail}', retryable: true, exitCode: 66 },
  [ErrorCode.ProviderRateLimited]: { message: 'Provider rate limited (429)', retryable: true, exitCode: 66 },
  [ErrorCode.ProviderUnavailable]: { message: 'Provider temporarily unavailable (503)', retryable: true, exitCode: 66 },
  [ErrorCode.ProviderTimeout]: { message: 'Provider timeout after {n}ms', retryable: true, exitCode: 66 },
  [ErrorCode.ProviderBadRequest]: { message: 'Provider bad request (400): {detail}', retryable: false, exitCode: 66 },
  [ErrorCode.ProviderAuthFailed]: { message: 'Provider authentication failed (401)', retryable: false, exitCode: 66 },
  [ErrorCode.ProviderForbidden]: { message: 'Provider forbidden (403): {detail}', retryable: false, exitCode: 66 },
  [ErrorCode.ProviderContentFilter]: { message: 'Provider requested content filter (451)', retryable: false, exitCode: 66 },
  [ErrorCode.ProviderStreamInterrupted]: { message: 'Provider response stream interrupted', retryable: true, exitCode: 66 },
  [ErrorCode.ProviderStreamParse]: { message: 'Provider stream parse error: {detail}', retryable: false, exitCode: 66 },
  [ErrorCode.ProviderBudgetExceeded]: { message: 'Provider cost budget exceeded ({spent} > {budget})', retryable: false, exitCode: 66 },
  [ErrorCode.ProviderUnknown]: { message: 'Unknown provider error: {detail}', retryable: false, exitCode: 66 },

  // 6xxx
  [ErrorCode.ApprovalDenied]: { message: 'User denied approval for tool call: {name}', retryable: false, exitCode: 67 },
  [ErrorCode.ApprovalTimeout]: { message: 'Approval timed out after {n}s', retryable: false, exitCode: 67 },
  [ErrorCode.PolicyViolation]: { message: 'Policy violation: {detail}', retryable: false, exitCode: 67 },
  [ErrorCode.AuditWriteFailed]: { message: 'Audit log write failed: {detail}', retryable: false, exitCode: 70 },

  // 7xxx
  [ErrorCode.TerminalTooNarrow]: { message: 'Terminal too narrow (min 60 cols)', retryable: false, exitCode: 70 },
  [ErrorCode.TerminalNoColor]: { message: 'Terminal does not support color (use --no-color)', retryable: false, exitCode: 70 },
  [ErrorCode.TuiRenderError]: { message: 'TUI render error: {detail}', retryable: false, exitCode: 70 },

  // 8xxx
  [ErrorCode.UnknownCommand]: { message: 'Unknown command: {name}', retryable: false, exitCode: 2 },
  [ErrorCode.MissingArgument]: { message: 'Missing required argument: {name}', retryable: false, exitCode: 2 },
  [ErrorCode.InvalidFlagValue]: { message: 'Invalid flag value: {flag}={value}', retryable: false, exitCode: 2 },
  [ErrorCode.InstanceLocked]: { message: 'Cannot start Sky: another instance holds the lock', retryable: false, exitCode: 1 },
  [ErrorCode.InternalError]: { message: 'Internal error (please file a bug): {detail}', retryable: false, exitCode: 70 },
};
