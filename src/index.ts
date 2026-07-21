/**
 * Sky — public library surface.
 *
 * Sky is primarily a CLI (`sky`), but its modules are exported here so it can be
 * embedded programmatically (e.g. behind the optional HTTP API, §3.9). The
 * module boundaries mirror the architecture in §2.3.
 */
export * as errors from './errors/index.js';
export * as logging from './logging/index.js';
export * as config from './config/index.js';
export * as session from './session/index.js';
export * as llm from './llm/index.js';
export * as safety from './safety/index.js';
export * as tools from './tools/index.js';
export * as agent from './agent/index.js';
export * as skills from './skills/index.js';
export * as mcp from './mcp/index.js';

// Commonly used entry points, re-exported flat for convenience.
export { SkyError, ErrorCode } from './errors/index.js';
export { loadConfig, defaultConfig } from './config/index.js';
export { SessionStore } from './session/index.js';
export { AgentLoop } from './agent/index.js';
export { createProvider, MockProvider } from './llm/index.js';
export { ToolRegistry } from './tools/index.js';
export { Policy, Approver, AuditLog } from './safety/index.js';
