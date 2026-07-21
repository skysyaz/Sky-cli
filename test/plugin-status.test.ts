import { describe, it, expect } from 'vitest';
import {
  pluginForCommand,
  pluginForMcpTool,
  formatPluginStatusLabel,
} from '../src/tui/plugin-status.js';
import type { LoadedPlugin } from '../src/plugins/types.js';

const plugins: LoadedPlugin[] = [
  {
    name: 'ponytail',
    commands: [
      { name: 'ponytail', description: 'mode', body: 'x' },
      { name: 'ponytail:ponytail', description: 'mode', body: 'x' },
    ],
    mcpServers: [{ name: 'ponytail', command: 'node', args: [], env: {} }],
  },
  {
    name: 'other',
    commands: [{ name: 'other:run', description: 'r', body: 'y' }],
    mcpServers: [],
  },
];

describe('plugin-status helpers', () => {
  it('resolves slash commands to their plugin', () => {
    expect(pluginForCommand(plugins, 'ponytail')).toBe('ponytail');
    expect(pluginForCommand(plugins, 'ponytail:ponytail')).toBe('ponytail');
    expect(pluginForCommand(plugins, 'other:run')).toBe('other');
    expect(pluginForCommand(plugins, 'missing')).toBeNull();
  });

  it('resolves mcp__server__tool to the owning plugin', () => {
    expect(pluginForMcpTool(plugins, 'mcp__ponytail__search')).toBe('ponytail');
    expect(pluginForMcpTool(plugins, 'mcp__unknown__x')).toBeNull();
    expect(pluginForMcpTool(plugins, 'shell')).toBeNull();
  });

  it('formats a compact status-bar label', () => {
    expect(formatPluginStatusLabel([])).toBe('pl:0');
    expect(formatPluginStatusLabel(['ponytail'])).toBe('pl:ponytail');
    expect(formatPluginStatusLabel(['a', 'b', 'c', 'd'], 3)).toBe('pl:a,b,c+1');
  });
});
