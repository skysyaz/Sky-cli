#!/usr/bin/env node
import {
  AgentLoop,
  AnthropicAdapter,
  Approver,
  AuditLog,
  CURRENT_SESSION_VERSION,
  ErrorCode,
  HARDCODED_SHELL_DENY,
  MODEL_PRICING,
  MockProvider,
  OpenAiAdapter,
  Policy,
  SessionStore,
  SkyError,
  ToolRegistry,
  __export,
  allowlistEntrySchema,
  buildContext,
  buildSystemPrompt,
  classifyShellCommand,
  colorizeDiff,
  config_exports,
  createProvider,
  defaultConfig,
  defaultTools,
  editTool,
  errors_exports,
  estimateCost,
  generateDiff,
  generateSessionId,
  gitTool,
  globToRegExp,
  heuristicCountTokens,
  isInsideCwd,
  loadConfig,
  logging_exports,
  matchAnyCommand,
  matchAnyGlob,
  matchCommandPattern,
  matchGlob,
  messageSchema,
  migrateSession,
  modeHasTools,
  nullLogger,
  providerErrorFromStatus,
  readTool,
  resolveInCwd,
  searchTool,
  sessionIndexEntrySchema,
  sessionSchema,
  shellTool,
  tokenUsageSchema,
  toolCallSchema,
  writeTool
} from "./chunk-4EQUB47F.js";

// src/session/index.ts
var session_exports = {};
__export(session_exports, {
  CURRENT_SESSION_VERSION: () => CURRENT_SESSION_VERSION,
  SessionStore: () => SessionStore,
  allowlistEntrySchema: () => allowlistEntrySchema,
  generateSessionId: () => generateSessionId,
  messageSchema: () => messageSchema,
  migrateSession: () => migrateSession,
  sessionIndexEntrySchema: () => sessionIndexEntrySchema,
  sessionSchema: () => sessionSchema,
  tokenUsageSchema: () => tokenUsageSchema,
  toolCallSchema: () => toolCallSchema
});

// src/llm/index.ts
var llm_exports = {};
__export(llm_exports, {
  AnthropicAdapter: () => AnthropicAdapter,
  MODEL_PRICING: () => MODEL_PRICING,
  MockProvider: () => MockProvider,
  OpenAiAdapter: () => OpenAiAdapter,
  buildContext: () => buildContext,
  createProvider: () => createProvider,
  estimateCost: () => estimateCost,
  heuristicCountTokens: () => heuristicCountTokens,
  providerErrorFromStatus: () => providerErrorFromStatus,
  withRetry: () => withRetry
});

// src/llm/retry.ts
var defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function withRetry(fn, options = {}) {
  const retries = options.retries ?? 4;
  const baseDelay = options.baseDelayMs ?? 1e3;
  const maxDelay = options.maxDelayMs ?? 3e4;
  const logger = options.logger ?? nullLogger;
  const sleep = options.sleep ?? defaultSleep;
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const skyError = SkyError.from(error, "SKY-E-5000" /* ProviderRequestFailed */);
      if (!skyError.retryable || attempt === retries) throw skyError;
      const backoff = Math.min(maxDelay, baseDelay * 2 ** attempt);
      const jitter = Math.random() * backoff * 0.25;
      const delay = Math.round(backoff + jitter);
      logger.warn("provider.retry", { attempt: attempt + 1, code: skyError.code, delayMs: delay });
      await sleep(delay);
    }
  }
  throw SkyError.from(lastError, "SKY-E-5000" /* ProviderRequestFailed */);
}

// src/safety/index.ts
var safety_exports = {};
__export(safety_exports, {
  Approver: () => Approver,
  AuditLog: () => AuditLog,
  HARDCODED_SHELL_DENY: () => HARDCODED_SHELL_DENY,
  Policy: () => Policy,
  classifyShellCommand: () => classifyShellCommand,
  colorizeDiff: () => colorizeDiff,
  generateDiff: () => generateDiff,
  globToRegExp: () => globToRegExp,
  matchAnyCommand: () => matchAnyCommand,
  matchAnyGlob: () => matchAnyGlob,
  matchCommandPattern: () => matchCommandPattern,
  matchGlob: () => matchGlob
});

// src/tools/index.ts
var tools_exports = {};
__export(tools_exports, {
  ToolRegistry: () => ToolRegistry,
  defaultTools: () => defaultTools,
  editTool: () => editTool,
  gitTool: () => gitTool,
  isInsideCwd: () => isInsideCwd,
  readTool: () => readTool,
  resolveInCwd: () => resolveInCwd,
  searchTool: () => searchTool,
  shellTool: () => shellTool,
  writeTool: () => writeTool
});

// src/agent/index.ts
var agent_exports = {};
__export(agent_exports, {
  AgentLoop: () => AgentLoop,
  buildSystemPrompt: () => buildSystemPrompt,
  modeHasTools: () => modeHasTools
});
export {
  AgentLoop,
  Approver,
  AuditLog,
  ErrorCode,
  MockProvider,
  Policy,
  SessionStore,
  SkyError,
  ToolRegistry,
  agent_exports as agent,
  config_exports as config,
  createProvider,
  defaultConfig,
  errors_exports as errors,
  llm_exports as llm,
  loadConfig,
  logging_exports as logging,
  safety_exports as safety,
  session_exports as session,
  tools_exports as tools
};
//# sourceMappingURL=index.js.map