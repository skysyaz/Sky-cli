/**
 * The `plugins/` module. Marketplace registration, plugin install/uninstall,
 * and startup loading of plugin-contributed slash commands and MCP servers.
 *
 * Note: the base specification (§1.5) lists a plugin marketplace as a non-goal;
 * this module is an explicit, opt-in extension added on top of that baseline.
 */
export { PluginManager, parseSpec, type PluginManagerOptions } from './manager.js';
export { runPluginCommand } from './run.js';
export * from './types.js';
