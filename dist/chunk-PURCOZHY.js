#!/usr/bin/env node
import {
  SkyError,
  installedPluginsDir,
  marketplacesDir,
  nullLogger,
  pluginsStatePath
} from "./chunk-RSVWAUNV.js";

// src/plugins/manager.ts
import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  rmSync,
  cpSync,
  readdirSync,
  statSync
} from "fs";
import { join, basename, dirname } from "path";
import { execa } from "execa";

// src/plugins/types.ts
import { z } from "zod";
var marketplacePluginSchema = z.object({
  name: z.string(),
  /** Path to the plugin within the marketplace repo (default "./"). */
  source: z.string().default("./"),
  description: z.string().optional(),
  version: z.string().optional()
});
var marketplaceManifestSchema = z.object({
  name: z.string(),
  owner: z.union([z.string(), z.object({ name: z.string().optional() }).passthrough()]).optional(),
  plugins: z.array(marketplacePluginSchema).default([])
});
var pluginManifestSchema = z.object({
  name: z.string().optional(),
  version: z.string().optional(),
  description: z.string().optional()
});
var marketplaceRecordSchema = z.object({
  name: z.string(),
  /** The original ref the user added (owner/repo, url, or path). */
  source: z.string(),
  /** Local clone path. */
  path: z.string(),
  plugins: z.array(marketplacePluginSchema).default([]),
  addedAt: z.string()
});
var installedPluginSchema = z.object({
  name: z.string(),
  marketplace: z.string(),
  version: z.string().optional(),
  description: z.string().optional(),
  /** Local install path. */
  path: z.string(),
  enabled: z.boolean().default(true),
  installedAt: z.string()
});
var pluginStateSchema = z.object({
  marketplaces: z.record(marketplaceRecordSchema).default({}),
  plugins: z.record(installedPluginSchema).default({})
});

// src/plugins/manager.ts
var PluginManager = class {
  marketplacesDir;
  installedDir;
  statePath;
  logger;
  constructor(options = {}) {
    this.marketplacesDir = options.marketplacesDir ?? marketplacesDir();
    this.installedDir = options.installedDir ?? installedPluginsDir();
    this.statePath = options.statePath ?? pluginsStatePath();
    this.logger = options.logger ?? nullLogger;
  }
  // --- state -------------------------------------------------------------
  readState() {
    if (!existsSync(this.statePath)) return pluginStateSchema.parse({});
    try {
      return pluginStateSchema.parse(JSON.parse(readFileSync(this.statePath, "utf8")));
    } catch (cause) {
      this.logger.warn("plugins.state.corrupt", { detail: cause.message });
      return pluginStateSchema.parse({});
    }
  }
  writeState(state) {
    mkdirSync(dirname(this.statePath), { recursive: true });
    writeFileSync(this.statePath, JSON.stringify(pluginStateSchema.parse(state), null, 2) + "\n", "utf8");
  }
  // --- marketplaces ------------------------------------------------------
  /** Turn `owner/repo`, a URL, or a local path into a git-cloneable source. */
  resolveSource(ref) {
    if (ref.includes("://") || ref.startsWith("git@")) return ref;
    if (ref.startsWith(".") || ref.startsWith("/") || existsSync(ref)) return ref;
    return `https://github.com/${ref}.git`;
  }
  marketplaceName(ref) {
    const cleaned = ref.replace(/\.git$/, "").replace(/\/$/, "");
    return basename(cleaned);
  }
  /** `sky plugin marketplace add <ref>` — clone the repo and register it. */
  async addMarketplace(ref) {
    const source = this.resolveSource(ref);
    const name = this.marketplaceName(ref);
    const dest = join(this.marketplacesDir, name);
    mkdirSync(this.marketplacesDir, { recursive: true });
    rmSync(dest, { recursive: true, force: true });
    if (existsSync(source) && statSync(source).isDirectory() && !existsSync(join(source, ".git"))) {
      cpSync(source, dest, { recursive: true });
    } else {
      const result = await execa("git", ["clone", "--depth", "1", source, dest], { reject: false });
      if (result.exitCode !== 0) {
        throw new SkyError("SKY-E-8099" /* InternalError */, {
          detail: `failed to clone ${source}: ${result.stderr.slice(-300)}`
        });
      }
    }
    const manifest = this.readMarketplaceManifest(dest);
    const record = {
      name: manifest.name || name,
      source: ref,
      path: dest,
      plugins: manifest.plugins,
      addedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    const state = this.readState();
    state.marketplaces[record.name] = record;
    this.writeState(state);
    const lines = [
      `Added marketplace '${record.name}' from ${ref}`,
      `  ${record.plugins.length} plugin(s) available: ${record.plugins.map((p) => p.name).join(", ") || "(none)"}`
    ];
    return lines;
  }
  readMarketplaceManifest(dir) {
    const path = join(dir, ".claude-plugin", "marketplace.json");
    if (!existsSync(path)) {
      throw new SkyError("SKY-E-8099" /* InternalError */, {
        detail: `no .claude-plugin/marketplace.json found in ${basename(dir)}`
      });
    }
    try {
      return marketplaceManifestSchema.parse(JSON.parse(readFileSync(path, "utf8")));
    } catch (cause) {
      throw new SkyError("SKY-E-8099" /* InternalError */, { detail: `invalid marketplace.json: ${cause.message}` }, cause);
    }
  }
  listMarketplaces() {
    return Object.values(this.readState().marketplaces);
  }
  removeMarketplace(name) {
    const state = this.readState();
    if (!state.marketplaces[name]) throw new SkyError("SKY-E-8099" /* InternalError */, { detail: `unknown marketplace: ${name}` });
    rmSync(state.marketplaces[name].path, { recursive: true, force: true });
    delete state.marketplaces[name];
    this.writeState(state);
    return [`Removed marketplace '${name}'.`];
  }
  // --- plugins -----------------------------------------------------------
  /** `sky plugin install <plugin>@<marketplace>` — copy the plugin into place. */
  install(spec) {
    const { plugin: pluginName, marketplace: marketplaceName } = parseSpec(spec);
    const state = this.readState();
    const marketplace = state.marketplaces[marketplaceName];
    if (!marketplace) {
      throw new SkyError("SKY-E-8099" /* InternalError */, {
        detail: `marketplace '${marketplaceName}' is not registered \u2014 run \`sky plugin marketplace add \u2026\` first`
      });
    }
    const entry = marketplace.plugins.find((p) => p.name === pluginName);
    if (!entry) {
      throw new SkyError("SKY-E-8099" /* InternalError */, {
        detail: `plugin '${pluginName}' not found in marketplace '${marketplaceName}'`
      });
    }
    const srcDir = join(marketplace.path, entry.source);
    if (!existsSync(srcDir)) {
      throw new SkyError("SKY-E-8099" /* InternalError */, { detail: `plugin source missing: ${entry.source}` });
    }
    const dest = join(this.installedDir, pluginName);
    mkdirSync(this.installedDir, { recursive: true });
    rmSync(dest, { recursive: true, force: true });
    cpSync(srcDir, dest, { recursive: true });
    let version = entry.version;
    let description = entry.description;
    const manifestPath = join(dest, ".claude-plugin", "plugin.json");
    if (existsSync(manifestPath)) {
      try {
        const manifest = pluginManifestSchema.parse(JSON.parse(readFileSync(manifestPath, "utf8")));
        version = manifest.version ?? version;
        description = manifest.description ?? description;
      } catch {
      }
    }
    state.plugins[pluginName] = {
      name: pluginName,
      marketplace: marketplaceName,
      version,
      description,
      path: dest,
      enabled: true,
      installedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    this.writeState(state);
    const loaded = this.loadPlugin(pluginName, dest);
    return [
      `Installed '${pluginName}@${marketplaceName}'${version ? ` (v${version})` : ""}.`,
      `  commands: ${loaded.commands.map((c) => "/" + c.name).join(", ") || "(none)"}`,
      `  mcp servers: ${loaded.mcpServers.map((m) => m.name).join(", ") || "(none)"}`
    ];
  }
  uninstall(name) {
    const state = this.readState();
    const plugin = state.plugins[name];
    if (!plugin) throw new SkyError("SKY-E-8099" /* InternalError */, { detail: `plugin '${name}' is not installed` });
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
  load() {
    const state = this.readState();
    const loaded = [];
    for (const plugin of Object.values(state.plugins)) {
      if (!plugin.enabled) continue;
      if (!existsSync(plugin.path)) continue;
      loaded.push(this.loadPlugin(plugin.name, plugin.path));
    }
    return loaded;
  }
  loadPlugin(name, dir) {
    return { name, commands: this.loadCommands(name, dir), mcpServers: this.loadMcpServers(dir) };
  }
  loadCommands(pluginName, dir) {
    const commandsDir = join(dir, "commands");
    if (!existsSync(commandsDir)) return [];
    const out = [];
    for (const file of readdirSync(commandsDir)) {
      if (!file.endsWith(".md")) continue;
      const body = readFileSync(join(commandsDir, file), "utf8");
      const base = file.replace(/\.md$/, "");
      out.push({
        name: `${pluginName}:${base}`,
        description: extractDescription(body) ?? `${pluginName} command`,
        body: stripFrontmatter(body).trim()
      });
    }
    return out;
  }
  loadMcpServers(dir) {
    const mcpPath = join(dir, ".mcp.json");
    if (!existsSync(mcpPath)) return [];
    try {
      const parsed = JSON.parse(readFileSync(mcpPath, "utf8"));
      return Object.entries(parsed.mcpServers ?? {}).map(([serverName, cfg]) => ({
        name: serverName,
        command: cfg.command,
        args: cfg.args ?? [],
        env: cfg.env ?? {}
      }));
    } catch (cause) {
      this.logger.warn("plugins.mcp.invalid", { detail: cause.message });
      return [];
    }
  }
};
function parseSpec(spec) {
  const at = spec.indexOf("@");
  if (at === -1) {
    return { plugin: spec, marketplace: spec };
  }
  return { plugin: spec.slice(0, at), marketplace: spec.slice(at + 1) };
}
function extractDescription(markdown) {
  const fm = markdown.match(/^---\n([\s\S]*?)\n---/);
  if (fm) {
    const line = fm[1].split("\n").find((l) => /^description\s*:/i.test(l));
    if (line) return line.replace(/^description\s*:/i, "").trim().replace(/^["']|["']$/g, "");
  }
  const heading = stripFrontmatter(markdown).split("\n").map((l) => l.trim()).find((l) => l.length > 0);
  return heading?.replace(/^#+\s*/, "");
}
function stripFrontmatter(markdown) {
  return markdown.replace(/^---\n[\s\S]*?\n---\n?/, "");
}

// src/plugins/run.ts
async function runPluginCommand(args, manager) {
  const [action, ...rest] = args;
  switch (action) {
    case void 0:
    case "list": {
      const plugins = manager.listInstalled();
      if (plugins.length === 0) {
        return [
          "No plugins installed. Add a marketplace and install one:",
          "  /plugin marketplace add owner/repo",
          "  /plugin install name@marketplace"
        ];
      }
      return [
        "Installed plugins:",
        ...plugins.map(
          (p) => `  ${p.name}@${p.marketplace}${p.version ? ` (v${p.version})` : ""}${p.description ? ` \u2014 ${p.description}` : ""}`
        )
      ];
    }
    case "marketplace": {
      const [sub, ...marketArgs] = rest;
      switch (sub) {
        case "add": {
          const ref = marketArgs[0];
          if (!ref) throw new SkyError("SKY-E-8001" /* MissingArgument */, { name: "marketplace ref (owner/repo)" });
          return manager.addMarketplace(ref);
        }
        case void 0:
        case "list": {
          const markets = manager.listMarketplaces();
          if (markets.length === 0) return ["No marketplaces registered."];
          return [
            "Marketplaces:",
            ...markets.map(
              (m) => `  ${m.name} (${m.source}) \u2014 ${m.plugins.length} plugin(s): ${m.plugins.map((p) => p.name).join(", ")}`
            )
          ];
        }
        case "remove":
        case "rm": {
          const name = marketArgs[0];
          if (!name) throw new SkyError("SKY-E-8001" /* MissingArgument */, { name: "marketplace name" });
          return manager.removeMarketplace(name);
        }
        default:
          throw new SkyError("SKY-E-8000" /* UnknownCommand */, { name: `plugin marketplace ${sub}` });
      }
    }
    case "search": {
      const query = rest.join(" ").toLowerCase();
      const results = [];
      for (const m of manager.listMarketplaces()) {
        for (const p of m.plugins) {
          const hay = `${p.name} ${p.description ?? ""}`.toLowerCase();
          if (!query || hay.includes(query)) {
            results.push(`  ${p.name}@${m.name}${p.description ? ` \u2014 ${p.description}` : ""}`);
          }
        }
      }
      if (results.length === 0) {
        return manager.listMarketplaces().length === 0 ? ["No marketplaces registered. Add one first:", "  /plugin marketplace add owner/repo"] : [`No plugins match "${query}".`];
      }
      return ["Matching plugins:", ...results, "Install with: /plugin install <name>@<marketplace>"];
    }
    case "install": {
      const spec = rest[0];
      if (!spec) throw new SkyError("SKY-E-8001" /* MissingArgument */, { name: "plugin@marketplace or owner/repo" });
      if (spec.includes("/") && !spec.includes("@")) {
        const lines = await manager.addMarketplace(spec);
        const market = manager.listMarketplaces().find((m) => m.source === spec);
        if (!market) throw new SkyError("SKY-E-8099" /* InternalError */, { detail: `could not resolve marketplace for ${spec}` });
        if (market.plugins.length === 0) return [...lines, "No plugins listed in this marketplace."];
        const out = [...lines];
        for (const p of market.plugins) out.push(...manager.install(`${p.name}@${market.name}`));
        return out;
      }
      return manager.install(spec);
    }
    case "uninstall":
    case "remove": {
      const name = rest[0];
      if (!name) throw new SkyError("SKY-E-8001" /* MissingArgument */, { name: "plugin name" });
      return manager.uninstall(name);
    }
    default:
      throw new SkyError("SKY-E-8000" /* UnknownCommand */, { name: `plugin ${action}` });
  }
}

export {
  PluginManager,
  runPluginCommand
};
//# sourceMappingURL=chunk-PURCOZHY.js.map