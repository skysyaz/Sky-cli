/**
 * The `agent/` module (§2.4.1). Orchestration: drives the conversation loop and
 * yields events. Depends on llm/tools/safety/session/logging.
 */
export { AgentLoop, type AgentLoopOptions } from './loop.js';
export type { AgentEvent } from './events.js';
export { buildSystemPrompt, modeHasTools, toolsForMode, filterToolsForMode } from './prompts.js';
