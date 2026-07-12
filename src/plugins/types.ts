import { z } from 'zod';

/**
 * Plugin system data model. The on-disk marketplace format mirrors the
 * Claude Code convention: a git repo containing `.claude-plugin/marketplace.json`
 * that lists plugins, each of which may contribute slash commands, MCP servers,
 * and agents.
 */

/** A plugin entry as listed in a marketplace manifest. */
export const marketplacePluginSchema = z.object({
  name: z.string(),
  /** Path to the plugin within the marketplace repo (default "./"). */
  source: z.string().default('./'),
  description: z.string().optional(),
  version: z.string().optional(),
});
export type MarketplacePlugin = z.infer<typeof marketplacePluginSchema>;

/** `.claude-plugin/marketplace.json`. */
export const marketplaceManifestSchema = z.object({
  name: z.string(),
  owner: z.union([z.string(), z.object({ name: z.string().optional() }).passthrough()]).optional(),
  plugins: z.array(marketplacePluginSchema).default([]),
});
export type MarketplaceManifest = z.infer<typeof marketplaceManifestSchema>;

/** `.claude-plugin/plugin.json`. */
export const pluginManifestSchema = z.object({
  name: z.string().optional(),
  version: z.string().optional(),
  description: z.string().optional(),
});
export type PluginManifest = z.infer<typeof pluginManifestSchema>;

/** A registered marketplace in Sky's state. */
export const marketplaceRecordSchema = z.object({
  name: z.string(),
  /** The original ref the user added (owner/repo, url, or path). */
  source: z.string(),
  /** Local clone path. */
  path: z.string(),
  plugins: z.array(marketplacePluginSchema).default([]),
  addedAt: z.string(),
});
export type MarketplaceRecord = z.infer<typeof marketplaceRecordSchema>;

/** An installed plugin in Sky's state. */
export const installedPluginSchema = z.object({
  name: z.string(),
  marketplace: z.string(),
  version: z.string().optional(),
  description: z.string().optional(),
  /** Local install path. */
  path: z.string(),
  enabled: z.boolean().default(true),
  installedAt: z.string(),
});
export type InstalledPlugin = z.infer<typeof installedPluginSchema>;

/** Persisted plugin state (`~/.sky/plugins/plugins.json`). */
export const pluginStateSchema = z.object({
  marketplaces: z.record(marketplaceRecordSchema).default({}),
  plugins: z.record(installedPluginSchema).default({}),
});
export type PluginState = z.infer<typeof pluginStateSchema>;

/** A slash command contributed by a plugin. */
export interface PluginCommand {
  /** Namespaced name, e.g. `ponytail:create`. */
  name: string;
  description: string;
  /** The command prompt-template body (markdown). */
  body: string;
}

/** An MCP server contributed by a plugin. */
export interface PluginMcpServer {
  name: string;
  command: string;
  args: string[];
  env: Record<string, string>;
}

/** The result of loading an installed plugin from disk. */
export interface LoadedPlugin {
  name: string;
  commands: PluginCommand[];
  mcpServers: PluginMcpServer[];
}
