import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  rmSync,
  cpSync,
  readdirSync,
  statSync,
} from 'node:fs';
import { join, basename, dirname } from 'node:path';
import { execa } from 'execa';
import { ErrorCode, SkyError } from '../errors/index.js';
import { nullLogger, type Logger } from '../logging/index.js';
import {
  marketplacesDir as defaultMarketplacesDir,
  installedPluginsDir as defaultInstalledDir,
  pluginsStatePath as defaultStatePath,
} from '../config/paths.js';
import {
  pluginStateSchema,
  marketplaceManifestSchema,
  pluginManifestSchema,
  type PluginState,
  type MarketplaceRecord,
  type LoadedPlugin,
  type PluginCommand,
  type PluginMcpServer,
} from './types.js';

export interface PluginManagerOptions {
  marketplacesDir?: string;
  installedDir?: string;
  statePath?: string;
  logger?: Logger;
}

/**
 * Manages plugin marketplaces and installed plugins. Marketplaces are git repos
 * containing `.claude-plugin/marketplace.json`; plugins contribute slash
 * commands (`commands/*.md`) and MCP servers (`.mcp.json`). State is persisted
 * to `~/.sky/plugins/plugins.json` and re-loaded on every CLI start.
 *
 * Operations return human-readable message lines so both the CLI and the TUI
 * can present results without the manager touching stdout.
 */
export class PluginManager {
  private readonly marketplacesDir: string;
  private readonly installedDir: string;
  private readonly statePath: string;
  private readonly logger: Logger;

  constructor(options: PluginManagerOptions = {}) {
    this.marketplacesDir = options.marketplacesDir ?? defaultMarketplacesDir();
    this.installedDir = options.installedDir ?? defaultInstalledDir();
    this.statePath = options.statePath ?? defaultStatePath();
    this.logger = options.logger ?? nullLogger;
  }

  // --- state -------------------------------------------------------------

  readState(): PluginState {
    if (!existsSync(this.statePath)) return pluginStateSchema.parse({});
    try {
      return pluginStateSchema.parse(JSON.parse(readFileSync(this.statePath, 'utf8')));
    } catch (cause) {
      this.logger.warn('plugins.state.corrupt', { detail: (cause as Error).message });
      return pluginStateSchema.parse({});
    }
  }

  private writeState(state: PluginState): void {
    mkdirSync(dirname(this.statePath), { recursive: true });
    writeFileSync(this.statePath, JSON.stringify(pluginStateSchema.parse(state), null, 2) + '\n', 'utf8');
  }

  // --- marketplaces ------------------------------------------------------

  /** Turn `owner/repo`, a URL, or a local path into a git-cloneable source. */
  private resolveSource(ref: string): string {
    if (ref.includes('://') || ref.startsWith('git@')) return ref;
    if (ref.startsWith('.') || ref.startsWith('/') || existsSync(ref)) return ref; // local path
    return `https://github.com/${ref}.git`;
  }

  private marketplaceName(ref: string): string {
    const cleaned = ref.replace(/\.git$/, '').replace(/\/$/, '');
    return basename(cleaned);
  }

  /** `sky plugin marketplace add <ref>` — clone the repo and register it. */
  async addMarketplace(ref: string): Promise<string[]> {
    const source = this.resolveSource(ref);
    const name = this.marketplaceName(ref);
    const dest = join(this.marketplacesDir, name);

    mkdirSync(this.marketplacesDir, { recursive: true });
    rmSync(dest, { recursive: true, force: true });

    // Prefer git clone; fall back to copying a local directory.
    if (existsSync(source) && statSync(source).isDirectory() && !existsSync(join(source, '.git'))) {
      cpSync(source, dest, { recursive: true });
    } else {
      const result = await execa('git', ['clone', '--depth', '1', source, dest], { reject: false });
      if (result.exitCode !== 0) {
        throw new SkyError(ErrorCode.InternalError, {
          detail: `failed to clone ${source}: ${result.stderr.slice(-300)}`,
        });
      }
    }

    const manifest = this.readMarketplaceManifest(dest);
    const record: MarketplaceRecord = {
      name: manifest.name || name,
      source: ref,
      path: dest,
      plugins: manifest.plugins,
      addedAt: new Date().toISOString(),
    };

    const state = this.readState();
    state.marketplaces[record.name] = record;
    this.writeState(state);

    const lines = [
      `Added marketplace '${record.name}' from ${ref}`,
      `  ${record.plugins.length} plugin(s) available: ${record.plugins.map((p) => p.name).join(', ') || '(none)'}`,
    ];
    return lines;
  }

  private readMarketplaceManifest(dir: string) {
    const path = join(dir, '.claude-plugin', 'marketplace.json');
    if (!existsSync(path)) {
      throw new SkyError(ErrorCode.InternalError, {
        detail: `no .claude-plugin/marketplace.json found in ${basename(dir)}`,
      });
    }
    try {
      return marketplaceManifestSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
    } catch (cause) {
      throw new SkyError(ErrorCode.InternalError, { detail: `invalid marketplace.json: ${(cause as Error).message}` }, cause);
    }
  }

  listMarketplaces(): MarketplaceRecord[] {
    return Object.values(this.readState().marketplaces);
  }

  removeMarketplace(name: string): string[] {
    const state = this.readState();
    if (!state.marketplaces[name]) throw new SkyError(ErrorCode.InternalError, { detail: `unknown marketplace: ${name}` });
    rmSync(state.marketplaces[name].path, { recursive: true, force: true });
    delete state.marketplaces[name];
    this.writeState(state);
    return [`Removed marketplace '${name}'.`];
  }

  // --- plugins -----------------------------------------------------------

  /** `sky plugin install <plugin>@<marketplace>` — copy the plugin into place. */
  install(spec: string): string[] {
    const { plugin: pluginName, marketplace: marketplaceName } = parseSpec(spec);
    const state = this.readState();
    const marketplace = state.marketplaces[marketplaceName];
    if (!marketplace) {
      throw new SkyError(ErrorCode.InternalError, {
        detail: `marketplace '${marketplaceName}' is not registered — run \`sky plugin marketplace add …\` first`,
      });
    }
    const entry = marketplace.plugins.find((p) => p.name === pluginName);
    if (!entry) {
      throw new SkyError(ErrorCode.InternalError, {
        detail: `plugin '${pluginName}' not found in marketplace '${marketplaceName}'`,
      });
    }

    const srcDir = join(marketplace.path, entry.source);
    if (!existsSync(srcDir)) {
      throw new SkyError(ErrorCode.InternalError, { detail: `plugin source missing: ${entry.source}` });
    }

    const dest = join(this.installedDir, pluginName);
    mkdirSync(this.installedDir, { recursive: true });
    rmSync(dest, { recursive: true, force: true });
    cpSync(srcDir, dest, { recursive: true });

    // Prefer the plugin's own manifest for version/description.
    let version = entry.version;
    let description = entry.description;
    const manifestPath = join(dest, '.claude-plugin', 'plugin.json');
    if (existsSync(manifestPath)) {
      try {
        const manifest = pluginManifestSchema.parse(JSON.parse(readFileSync(manifestPath, 'utf8')));
        version = manifest.version ?? version;
        description = manifest.description ?? description;
      } catch {
        // ignore a malformed plugin.json; the marketplace entry still applies
      }
    }

    state.plugins[pluginName] = {
      name: pluginName,
      marketplace: marketplaceName,
      version,
      description,
      path: dest,
      enabled: true,
      installedAt: new Date().toISOString(),
    };
    this.writeState(state);

    const loaded = this.loadPlugin(pluginName, dest);
    return [
      `Installed '${pluginName}@${marketplaceName}'${version ? ` (v${version})` : ''}.`,
      `  commands: ${loaded.commands.map((c) => '/' + c.name).join(', ') || '(none)'}`,
      `  mcp servers: ${loaded.mcpServers.map((m) => m.name).join(', ') || '(none)'}`,
    ];
  }

  uninstall(name: string): string[] {
    const state = this.readState();
    const plugin = state.plugins[name];
    if (!plugin) throw new SkyError(ErrorCode.InternalError, { detail: `plugin '${name}' is not installed` });
    rmSync(plugin.path, { recursive: true, force: true });
    delete state.plugins[name];
    this.writeState(state);
    return [`Uninstalled plugin '${name}'.`];
  }

  listInstalled() {
    return Object.values(this.readState().plugins);
  }

  // --- loading (auto-reload on startup) ----------------------------------

  /** Load every enabled plugin's contributed commands and MCP servers. */
  load(): LoadedPlugin[] {
    const state = this.readState();
    const loaded: LoadedPlugin[] = [];
    for (const plugin of Object.values(state.plugins)) {
      if (!plugin.enabled) continue;
      if (!existsSync(plugin.path)) continue;
      loaded.push(this.loadPlugin(plugin.name, plugin.path));
    }
    return loaded;
  }

  private loadPlugin(name: string, dir: string): LoadedPlugin {
    return { name, commands: this.loadCommands(name, dir), mcpServers: this.loadMcpServers(dir) };
  }

  private loadCommands(pluginName: string, dir: string): PluginCommand[] {
    const commandsDir = join(dir, 'commands');
    if (!existsSync(commandsDir)) return [];
    const out: PluginCommand[] = [];
    const seen = new Set<string>();

    const add = (name: string, description: string, body: string): void => {
      if (!name || seen.has(name)) return;
      seen.add(name);
      out.push({ name, description, body });
    };

    for (const file of readdirSync(commandsDir)) {
      const full = join(commandsDir, file);
      let base = '';
      let description = `${pluginName} command`;
      let body = '';

      if (file.endsWith('.md')) {
        base = file.replace(/\.md$/, '');
        const raw = readFileSync(full, 'utf8');
        description = extractDescription(raw) ?? description;
        body = stripFrontmatter(raw).trim();
      } else if (file.endsWith('.toml')) {
        // Claude Code / Copilot-style command files (e.g. ponytail's commands/*.toml).
        base = file.replace(/\.toml$/, '');
        const parsed = parseCommandToml(readFileSync(full, 'utf8'));
        if (!parsed.prompt) continue;
        description = parsed.description || description;
        body = parsed.prompt;
      } else {
        continue;
      }

      // Namespaced form always: /ponytail:ponytail-review
      add(`${pluginName}:${base}`, description, body);
      // Short Claude-style form when it doesn't collide: /ponytail, /ponytail-review
      if (!RESERVED_SLASH_NAMES.has(base)) {
        add(base, description, body);
      }
    }
    return out;
  }

  private loadMcpServers(dir: string): PluginMcpServer[] {
    const mcpPath = join(dir, '.mcp.json');
    if (!existsSync(mcpPath)) return [];
    try {
      const parsed = JSON.parse(readFileSync(mcpPath, 'utf8')) as {
        mcpServers?: Record<string, { command: string; args?: string[]; env?: Record<string, string> }>;
      };
      return Object.entries(parsed.mcpServers ?? {}).map(([serverName, cfg]) => ({
        name: serverName,
        command: cfg.command,
        args: cfg.args ?? [],
        env: cfg.env ?? {},
      }));
    } catch (cause) {
      this.logger.warn('plugins.mcp.invalid', { detail: (cause as Error).message });
      return [];
    }
  }
}

/** Builtin slash names that plugin short-aliases must not override. */
const RESERVED_SLASH_NAMES = new Set([
  'help',
  'mode',
  'model',
  'provider',
  'key',
  'keys',
  'auth',
  'status',
  'cost',
  'diff',
  'compact',
  'new',
  'reset',
  'yolo',
  'plugin',
  'clear',
  'exit',
]);

/**
 * Minimal TOML reader for Claude-style command files:
 *   description = "..."
 *   prompt = "..."
 * Supports basic escaped quotes; enough for marketplace command.toml files.
 */
export function parseCommandToml(raw: string): { description?: string; prompt?: string } {
  const out: { description?: string; prompt?: string } = {};
  const re = /^(description|prompt)\s*=\s*("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')\s*$/gm;
  let match: RegExpExecArray | null;
  while ((match = re.exec(raw)) !== null) {
    const key = match[1] as 'description' | 'prompt';
    const quoted = match[2]!;
    const unquoted = quoted.slice(1, -1).replace(/\\([\\'"n])/g, (_, ch: string) => {
      if (ch === 'n') return '\n';
      return ch;
    });
    out[key] = unquoted;
  }
  return out;
}

/** Substitute `{{args}}` / `$ARGUMENTS` placeholders in a plugin command body. */
export function applyCommandArgs(body: string, args = ''): string {
  return body
    .replace(/\{\{\s*args\s*\}\}/gi, args)
    .replace(/\$ARGUMENTS/g, args)
    .trim();
}

/** Parse a `plugin@marketplace` install spec. */
export function parseSpec(spec: string): { plugin: string; marketplace: string } {
  const at = spec.indexOf('@');
  if (at === -1) {
    // No marketplace given — the plugin name doubles as the marketplace.
    return { plugin: spec, marketplace: spec };
  }
  return { plugin: spec.slice(0, at), marketplace: spec.slice(at + 1) };
}

/** Read a `description:` field from YAML frontmatter, or fall back to the first heading. */
function extractDescription(markdown: string): string | undefined {
  const fm = markdown.match(/^---\n([\s\S]*?)\n---/);
  if (fm) {
    const line = fm[1].split('\n').find((l) => /^description\s*:/i.test(l));
    if (line) return line.replace(/^description\s*:/i, '').trim().replace(/^["']|["']$/g, '');
  }
  const heading = stripFrontmatter(markdown)
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  return heading?.replace(/^#+\s*/, '');
}

function stripFrontmatter(markdown: string): string {
  return markdown.replace(/^---\n[\s\S]*?\n---\n?/, '');
}
