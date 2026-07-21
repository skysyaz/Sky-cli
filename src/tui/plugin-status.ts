/**
 * Resolve which loaded plugin owns a slash command or MCP tool call.
 * Used by the TUI status bar to highlight the active plugin in realtime.
 */

import type { LoadedPlugin } from '../plugins/types.js';

/** Find the plugin that contributed a slash command name. */
export function pluginForCommand(plugins: LoadedPlugin[], commandName: string): string | null {
  for (const plugin of plugins) {
    if (plugin.commands.some((c) => c.name === commandName)) return plugin.name;
  }
  // Namespaced fallback: ponytail:create → ponytail
  const colon = commandName.indexOf(':');
  if (colon > 0) {
    const prefix = commandName.slice(0, colon);
    if (plugins.some((p) => p.name === prefix)) return prefix;
  }
  return null;
}

/**
 * Map `mcp__server__tool` → plugin name when the MCP server was contributed
 * by an installed plugin.
 */
export function pluginForMcpTool(plugins: LoadedPlugin[], toolName: string): string | null {
  if (!toolName.startsWith('mcp__')) return null;
  const rest = toolName.slice('mcp__'.length);
  const sep = rest.indexOf('__');
  if (sep <= 0) return null;
  const server = rest.slice(0, sep);
  for (const plugin of plugins) {
    if (plugin.mcpServers.some((s) => s.name === server)) return plugin.name;
  }
  return null;
}

/** Compact label for the status bar: `pl:a,b` or `pl:0`. */
export function formatPluginStatusLabel(pluginNames: string[], max = 3): string {
  if (pluginNames.length === 0) return 'pl:0';
  if (pluginNames.length <= max) return `pl:${pluginNames.join(',')}`;
  return `pl:${pluginNames.slice(0, max).join(',')}+${pluginNames.length - max}`;
}

/**
 * Color for the plugin status chip.
 * - cyan + ● when a specific plugin owns the current tool/command
 * - cyan while the agent is working and plugins are loaded
 * - yellow briefly after a plugin reload
 * - gray when idle
 */
export function pluginStatusColor(options: {
  activePlugin: string | null;
  pluginsHighlight: boolean;
  busy: boolean;
  hasPlugins: boolean;
}): 'cyan' | 'yellow' | 'gray' {
  if (options.activePlugin) return 'cyan';
  if (options.pluginsHighlight) return 'yellow';
  if (options.busy && options.hasPlugins) return 'cyan';
  return 'gray';
}

/** Status-bar text for plugins (active gets a ● marker). */
export function pluginStatusText(pluginNames: string[], activePlugin: string | null): string {
  if (activePlugin) return `pl:${activePlugin}●`;
  return formatPluginStatusLabel(pluginNames);
}
