/**
 * The `tools/` module (§2.4.3, §6). The agent's capability layer. Depends on
 * safety/config/logging/errors.
 */
export type { Tool, ToolContext, ToolResult, ToolDiffPreview } from './types.js';
export { ToolRegistry, defaultTools } from './registry.js';
export { readTool } from './read.js';
export { writeTool } from './write.js';
export { editTool } from './edit.js';
export { searchTool } from './search.js';
export { shellTool } from './shell.js';
export { gitTool } from './git.js';
export { forgeTool } from './forge.js';
export { resolveInCwd, isInsideCwd } from './paths.js';
