#!/usr/bin/env node
import {
  SessionStore,
  ToolRegistry,
  createProvider
} from "../chunk-SNADWOAV.js";
import {
  PluginManager,
  runPluginCommand
} from "../chunk-PURCOZHY.js";
import {
  AgentLoop,
  Approver,
  AuditLog,
  Policy,
  SkyError,
  colorizeDiff,
  configExists,
  configPath,
  createLogger,
  defaultConfig,
  exportJsonSchema,
  getConfigKey,
  loadConfig,
  logFilePath,
  nullLogger,
  requireConfig,
  scaffoldConfig,
  writeConfig
} from "../chunk-RSVWAUNV.js";

// src/cli/main.ts
import { Command } from "commander";
import chalk6 from "chalk";

// src/cli/commands.ts
import { createInterface as createInterface3 } from "readline/promises";
import chalk4 from "chalk";

// src/cli/session-runner.ts
import { createInterface as createInterface2 } from "readline/promises";
import chalk3 from "chalk";

// src/cli/render.ts
import chalk from "chalk";
var HEX = "\u2B22";
async function renderStream(events, options) {
  const c = options.color ? chalk : noColorChalk();
  let exitCode = 0;
  let streaming = false;
  for await (const event of events) {
    if (options.json) {
      process.stdout.write(JSON.stringify(serialize(event)) + "\n");
      if (event.type === "error") exitCode = event.error.exitCode;
      continue;
    }
    switch (event.type) {
      case "turn-start":
        break;
      case "text-delta":
        streaming = true;
        process.stdout.write(event.text);
        break;
      case "tool-call":
        if (streaming) {
          process.stdout.write("\n");
          streaming = false;
        }
        process.stdout.write(c.magenta(`${HEX} ${event.toolCall.name}`) + c.gray(` ${summarizeInput(event.toolCall.input)}
`));
        break;
      case "approval-resolved":
        if (event.autoApproved) {
          process.stdout.write(c.gray(`  ${HEX} auto-approved
`));
        }
        break;
      case "tool-result":
        process.stdout.write(
          (event.ok ? c.green(`  ${HEX} `) : c.red(`  ${HEX} `)) + c.gray(truncate(event.output.split("\n")[0], 100)) + "\n"
        );
        break;
      case "usage":
        break;
      case "turn-end":
        if (streaming) process.stdout.write("\n");
        process.stdout.write(c.green(`${HEX} Done
`));
        break;
      case "error":
        if (streaming) process.stdout.write("\n");
        process.stderr.write(c.red(`${HEX} ${event.error.toUserMessage()}
`));
        exitCode = event.error.exitCode;
        break;
    }
  }
  return exitCode;
}
function serialize(event) {
  if (event.type === "error") {
    return { type: "error", payload: event.error.toJSON() };
  }
  const { type, ...payload } = event;
  return { type, payload };
}
function summarizeInput(input) {
  if (typeof input.path === "string") return input.path;
  if (typeof input.command === "string") return truncate(input.command, 60);
  if (typeof input.pattern === "string") return `/${input.pattern}/`;
  if (typeof input.action === "string") return String(input.action);
  return "";
}
function truncate(text, max) {
  return text.length <= max ? text : text.slice(0, max - 1) + "\u2026";
}
function noColorChalk() {
  const identity = (s) => s;
  return new Proxy({}, { get: () => identity });
}

// src/cli/prompter.ts
import { createInterface } from "readline/promises";
import chalk2 from "chalk";
function createInteractivePrompter(color) {
  const c = color ? chalk2 : { green: (s) => s, red: (s) => s, gray: (s) => s, bold: (s) => s, yellow: (s) => s };
  return async (request) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try {
      process.stdout.write("\n" + c.yellow(`\u2B22 Approve ${request.toolName}?`) + c.gray(` (${request.reason})
`));
      if (request.diff) {
        process.stdout.write(colorizeDiff(request.diff.patch, c) + "\n");
        process.stdout.write(c.gray(`${request.diff.added} added, ${request.diff.removed} removed
`));
      } else {
        process.stdout.write(c.gray(JSON.stringify(request.input) + "\n"));
      }
      const answer = (await rl.question(c.bold("[y]es [n]o [a]lways [e]dit > "))).trim().toLowerCase();
      if (answer === "a" || answer === "always") return "always";
      if (answer === "e" || answer === "edit") return "edit";
      if (answer === "y" || answer === "yes" || answer === "") return "yes";
      return "no";
    } finally {
      rl.close();
    }
  };
}
var denyingPrompter = async () => "no";

// src/cli/runtime.ts
function resolveCwd(options) {
  return options.cwd ?? process.cwd();
}
function resolveColor(options) {
  if (options.color === false) return false;
  if (process.env.NO_COLOR || process.env.SKY_NO_COLOR) return false;
  if (process.env.SKY_FORCE_COLOR || process.env.FORCE_COLOR) return true;
  return process.stdout.isTTY ?? false;
}
function buildRuntime(options, requireExisting = true) {
  const level = options.verbose ? "debug" : options.quiet ? "error" : "info";
  const logger = options.quiet ? nullLogger : createLogger({ level, file: logFilePath(), stderr: options.verbose ?? false });
  const cli = { defaultProvider: options.provider, defaultModel: options.model, configPath: options.config };
  const config = requireExisting ? requireConfig({ cwd: resolveCwd(options), cli, logger }) : loadConfig({ cwd: resolveCwd(options), cli, logger });
  let plugins = [];
  try {
    plugins = new PluginManager({ logger }).load();
    for (const plugin of plugins) {
      for (const server of plugin.mcpServers) {
        if (!config.mcp.servers.some((s) => s.name === server.name)) {
          config.mcp.servers.push({ ...server, approvalMode: "manual" });
        }
      }
    }
    if (plugins.length) {
      logger.info("plugins.loaded", {
        count: plugins.length,
        names: plugins.map((p) => p.name)
      });
    }
  } catch (error) {
    logger.warn("plugins.loadFailed", { detail: error.message });
  }
  return {
    config,
    logger,
    store: new SessionStore({ logger }),
    registry: new ToolRegistry(),
    cwd: resolveCwd(options),
    color: resolveColor(options),
    json: options.json ?? false,
    plugins
  };
}
function makeProvider(runtime, options) {
  const providerName = options.provider ?? runtime.config.defaultProvider;
  return createProvider({ config: runtime.config, provider: providerName, logger: runtime.logger });
}
function makeProviderByName(runtime, providerName) {
  return createProvider({ config: runtime.config, provider: providerName, logger: runtime.logger });
}
function makeApprover(runtime, options, policy, prompter) {
  return new Approver({
    policy,
    audit: new AuditLog({ logger: runtime.logger }),
    prompter,
    logger: runtime.logger,
    force: options.force,
    yolo: options.yolo
  });
}

// src/cli/session-runner.ts
async function runTurn(options, prompt) {
  const { runtime, global, session } = options;
  const provider = makeProvider(runtime, global);
  const policy = new Policy(runtime.config, session.sessionAllowlist);
  const interactive = !options.oneShot && !global.json && Boolean(process.stdin.isTTY);
  const prompter = interactive ? createInteractivePrompter(runtime.color) : global.force || global.yolo ? void 0 : denyingPrompter;
  const approver = makeApprover(runtime, global, policy, prompter);
  const loop = new AgentLoop({
    provider,
    registry: runtime.registry,
    approver,
    policy,
    session,
    store: runtime.store,
    config: runtime.config,
    logger: runtime.logger
  });
  return renderStream(loop.run(prompt), { json: runtime.json, color: runtime.color });
}
async function runSession(options) {
  const { runtime, global, session } = options;
  const oneShot = options.oneShot || global.json || !process.stdin.isTTY;
  if (oneShot) {
    return runTurn(options, options.initialPrompt);
  }
  let runTui;
  try {
    ({ runTui } = await import("../run-7C6PEN76.js"));
  } catch (error) {
    runtime.logger.warn("tui.unavailable", { detail: error.message });
  }
  if (runTui) {
    await runTui({
      makeProvider: (name) => makeProviderByName(runtime, name),
      registry: runtime.registry,
      session,
      store: runtime.store,
      config: runtime.config,
      logger: runtime.logger,
      force: global.force,
      yolo: global.yolo,
      initialPrompt: options.initialPrompt,
      plugins: runtime.plugins
    });
    return 0;
  }
  const c = runtime.color ? chalk3 : { gray: (s) => s, cyan: (s) => s, bold: (s) => s };
  process.stdout.write(
    c.bold(`Sky \u2014 ${session.mode} mode`) + c.gray(` \xB7 ${session.provider}:${session.model} \xB7 session ${session.id.slice(0, 5)}
`)
  );
  process.stdout.write(c.gray("Type your request. /help for commands, /exit to quit.\n\n"));
  if (options.initialPrompt) {
    try {
      await runTurn(options, options.initialPrompt);
    } catch (error) {
      process.stderr.write(c.gray(`${SkyError.from(error).toUserMessage()}
`));
    }
  }
  const rl = createInterface2({ input: process.stdin, output: process.stdout });
  try {
    for (; ; ) {
      const line = (await rl.question(c.cyan("> "))).trim();
      if (!line) continue;
      if (line.startsWith("/")) {
        const done = handleSlashCommand(line, session, runtime);
        if (done) break;
        continue;
      }
      try {
        await runTurn(options, line);
      } catch (error) {
        const skyError = SkyError.from(error);
        process.stderr.write(c.gray(`${skyError.toUserMessage()}
`));
      }
      process.stdout.write("\n");
    }
  } finally {
    rl.close();
  }
  runtime.store.setStatus(session, "paused");
  return 0;
}
function handleSlashCommand(line, session, runtime) {
  const [command, ...rest] = line.slice(1).split(/\s+/);
  switch (command) {
    case "exit":
    case "quit":
      return true;
    case "help":
      process.stdout.write(
        [
          "/help                 show this help",
          "/mode [agent|plan|ask] switch mode",
          "/model <name>         switch model",
          "/cost                 show token & cost usage",
          "/diff                 (agent mode) show uncommitted changes",
          "/clear                clear the screen",
          "/exit                 save and quit",
          ""
        ].join("\n")
      );
      return false;
    case "mode": {
      const next = rest[0];
      if (next === "agent" || next === "plan" || next === "ask") {
        session.mode = next;
        runtime.store.save(session);
        process.stdout.write(`Switched to ${next} mode.
`);
      } else {
        process.stdout.write("Usage: /mode [agent|plan|ask]\n");
      }
      return false;
    }
    case "model":
      if (rest[0]) {
        session.model = rest[0];
        runtime.store.save(session);
        process.stdout.write(`Model set to ${rest[0]}.
`);
      }
      return false;
    case "cost":
      process.stdout.write(
        `Tokens: ${session.tokenUsage.input} in / ${session.tokenUsage.output} out \xB7 ~$${session.tokenUsage.estimatedCostUsd.toFixed(4)}
`
      );
      return false;
    case "clear":
      process.stdout.write("\x1B[2J\x1B[H");
      return false;
    default:
      process.stdout.write(`Unknown command: /${command}. Try /help.
`);
      return false;
  }
}

// src/cli/commands.ts
var PROVIDER_DEFAULTS = {
  openai: { apiKeyEnv: "OPENAI_API_KEY", model: "gpt-4o" },
  anthropic: { apiKeyEnv: "ANTHROPIC_API_KEY", model: "claude-3-5-sonnet" },
  ollama: { apiKeyEnv: "", model: "llama3.1" },
  "ollama-cloud": { apiKeyEnv: "OLLAMA_API_KEY", model: "gpt-oss:120b" },
  openrouter: { apiKeyEnv: "OPENROUTER_API_KEY", model: "openai/gpt-4o" },
  zenmux: { apiKeyEnv: "ZENMUX_API_KEY", model: "x-ai/grok-4.5-free" },
  opencode: { apiKeyEnv: "", model: "deepseek-v4-flash-free" },
  mock: { apiKeyEnv: "", model: "mock-1" }
};
function openSession(runtime, global, mode) {
  const provider = global.provider ?? runtime.config.defaultProvider;
  const model = global.model ?? runtime.config.defaultModel;
  if (global.session) {
    const id = runtime.store.resolveId(global.session, runtime.cwd);
    const session = runtime.store.load(id);
    session.mode = mode;
    session.status = "active";
    if (global.model) session.model = model;
    if (global.provider) session.provider = provider;
    runtime.store.save(session);
    return session;
  }
  return runtime.store.create({ mode, cwd: runtime.cwd, provider, model });
}
async function startModeSession(mode, initialPrompt, global) {
  const runtime = buildRuntime(global, true);
  const session = openSession(runtime, global, mode);
  return runSession({ runtime, global, mode, session, initialPrompt });
}
async function resumeCommand(id, followUp, view, global) {
  const runtime = buildRuntime(global, true);
  const c = runtime.color ? chalk4 : plainChalk();
  let sessionId = id;
  if (!sessionId) {
    const sessions = runtime.store.list({ cwd: runtime.cwd });
    if (sessions.length === 0) {
      process.stderr.write("No sessions to resume in this directory.\n");
      return 0;
    }
    sessionId = sessions[0].id;
    process.stdout.write(c.gray(`Resuming most recent session ${sessionId.slice(0, 5)}
`));
  }
  const resolved = runtime.store.resolveId(sessionId, runtime.cwd);
  const session = runtime.store.load(resolved);
  if (view) {
    for (const message of session.messages) {
      const label = message.role.toUpperCase().padEnd(9);
      process.stdout.write(`${c.gray(label)} ${message.content.split("\n")[0].slice(0, 120)}
`);
    }
    return 0;
  }
  session.status = "active";
  runtime.store.save(session);
  return runSession({ runtime, global, mode: session.mode, session, initialPrompt: followUp });
}
async function lsCommand(opts, global) {
  const runtime = buildRuntime(global, true);
  const sinceMs = opts.since ? parseDuration(opts.since) : void 0;
  const sessions = runtime.store.list({ cwd: opts.all ? void 0 : runtime.cwd, sinceMs });
  if (global.json) {
    process.stdout.write(JSON.stringify(sessions, null, 2) + "\n");
    return 0;
  }
  if (sessions.length === 0) {
    process.stdout.write("No sessions found.\n");
    return 0;
  }
  process.stdout.write(["ID", "MODE", "STARTED", "MSGS", "LAST ACTIVITY", "CWD"].join("	") + "\n");
  for (const s of sessions) {
    process.stdout.write(
      [s.id.slice(0, 6), s.mode, s.started.slice(0, 19), String(s.messages), s.lastActivity.slice(0, 19), s.cwd].join("	") + "\n"
    );
  }
  return 0;
}
async function initCommand(global) {
  const path = global.config ?? configPath();
  const interactive = Boolean(process.stdin.isTTY) && !global.quiet;
  if (configExists(path)) {
    if (interactive) {
      const rl = createInterface3({ input: process.stdin, output: process.stdout });
      const answer = (await rl.question(`Config already exists at ${path}. Overwrite? [y/N] `)).trim().toLowerCase();
      rl.close();
      if (answer !== "y" && answer !== "yes") {
        process.stdout.write("Left existing config unchanged.\n");
        return 0;
      }
    } else {
      process.stdout.write(`Config already exists at ${path}. Re-run interactively to overwrite.
`);
      return 0;
    }
  }
  let provider = global.provider ?? "openai";
  if (interactive) {
    const rl = createInterface3({ input: process.stdin, output: process.stdout });
    const p = (await rl.question("Provider [openai/anthropic/ollama/ollama-cloud/openrouter/zenmux/opencode/mock] (openai): ")).trim();
    rl.close();
    if (p && PROVIDER_DEFAULTS[p]) provider = p;
  }
  const defaults = PROVIDER_DEFAULTS[provider] ?? PROVIDER_DEFAULTS.openai;
  const model = global.model ?? defaults.model;
  const config = scaffoldConfig(provider, model, defaults.apiKeyEnv || void 0);
  writeConfig(config, path);
  exportJsonSchema();
  process.stdout.write(`Created ${path} (provider: ${provider}, model: ${model}).
`);
  if (defaults.apiKeyEnv) {
    process.stdout.write(`Set your API key: export ${defaults.apiKeyEnv}=...
`);
  }
  return 0;
}
async function configCommand(action, key, value, global) {
  const path = global.config ?? configPath();
  switch (action) {
    case void 0:
      process.stdout.write(`Edit ${path} in your $EDITOR. (Interactive editing is not available here.)
`);
      return 0;
    case "get": {
      if (!key) throw new SkyError("SKY-E-8001" /* MissingArgument */, { name: "key" });
      const config = loadConfig({ cli: { configPath: path } });
      const result = getConfigKey(config, key);
      process.stdout.write((typeof result === "string" ? result : JSON.stringify(result, null, 2)) + "\n");
      return 0;
    }
    case "set": {
      if (!key) throw new SkyError("SKY-E-8001" /* MissingArgument */, { name: "key" });
      if (value === void 0) throw new SkyError("SKY-E-8001" /* MissingArgument */, { name: "value" });
      const config = configExists(path) ? loadConfig({ cli: { configPath: path } }) : defaultConfig();
      setDeep(config, key, coerce(value));
      writeConfig(config, path);
      process.stdout.write(`Set ${key} = ${value}
`);
      return 0;
    }
    case "list": {
      const config = loadConfig({ cli: { configPath: path } });
      process.stdout.write(JSON.stringify(config, null, 2) + "\n");
      return 0;
    }
    case "validate": {
      const config = loadConfig({ cli: { configPath: path } });
      const providerCount = Object.keys(config.providers).length;
      process.stdout.write(`\u2713 Config is valid (${providerCount} provider(s) configured)
`);
      return 0;
    }
    default:
      throw new SkyError("SKY-E-8000" /* UnknownCommand */, { name: `config ${action}` });
  }
}
async function mcpCommand(action, name, opts, global) {
  const path = global.config ?? configPath();
  const config = configExists(path) ? loadConfig({ cli: { configPath: path } }) : defaultConfig();
  switch (action) {
    case "list":
    case void 0: {
      const servers = config.mcp.servers;
      if (servers.length === 0) {
        process.stdout.write("No MCP servers registered.\n");
        return 0;
      }
      process.stdout.write(["NAME", "COMMAND", "APPROVAL"].join("	") + "\n");
      for (const s of servers) process.stdout.write([s.name, `${s.command} ${s.args.join(" ")}`.trim(), s.approvalMode].join("	") + "\n");
      return 0;
    }
    case "add": {
      if (!name) throw new SkyError("SKY-E-8001" /* MissingArgument */, { name: "name" });
      if (!opts.command) throw new SkyError("SKY-E-8001" /* MissingArgument */, { name: "--command" });
      const env = {};
      for (const pair of opts.env ?? []) {
        const idx = pair.indexOf("=");
        if (idx > 0) env[pair.slice(0, idx)] = pair.slice(idx + 1);
      }
      config.mcp.servers = config.mcp.servers.filter((s) => s.name !== name);
      config.mcp.servers.push({
        name,
        command: opts.command,
        args: opts.args ? opts.args.split(" ").filter(Boolean) : [],
        env,
        approvalMode: opts.approval ?? "manual"
      });
      writeConfig(config, path);
      process.stdout.write(`Registered MCP server '${name}'.
`);
      return 0;
    }
    case "remove": {
      if (!name) throw new SkyError("SKY-E-8001" /* MissingArgument */, { name: "name" });
      config.mcp.servers = config.mcp.servers.filter((s) => s.name !== name);
      writeConfig(config, path);
      process.stdout.write(`Removed MCP server '${name}'.
`);
      return 0;
    }
    case "test": {
      if (!name) throw new SkyError("SKY-E-8001" /* MissingArgument */, { name: "name" });
      const server = config.mcp.servers.find((s) => s.name === name);
      if (!server) throw new SkyError("SKY-E-3061" /* McpNotConnected */, { name });
      process.stdout.write(`MCP server '${name}' is registered (${server.command}). Live connection test requires @modelcontextprotocol/sdk.
`);
      return 0;
    }
    default:
      throw new SkyError("SKY-E-8000" /* UnknownCommand */, { name: `mcp ${action}` });
  }
}
function coerce(value) {
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^-?\d+$/.test(value)) return Number(value);
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}
function setDeep(obj, key, value) {
  const parts = key.split(".");
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (typeof current[part] !== "object" || current[part] === null) current[part] = {};
    current = current[part];
  }
  current[parts[parts.length - 1]] = value;
}
function parseDuration(input) {
  const m = input.match(/^(\d+)([dhm])$/);
  if (!m) return 0;
  const n = Number(m[1]);
  return m[2] === "d" ? n * 864e5 : m[2] === "h" ? n * 36e5 : n * 6e4;
}
function plainChalk() {
  return new Proxy({}, { get: () => (s) => s });
}

// src/cli/update.ts
import { existsSync, readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { execa } from "execa";
import chalk5 from "chalk";
function findAppRoot(startDir) {
  let dir = startDir;
  for (let i = 0; i < 12; i++) {
    const pkgPath = join(dir, "package.json");
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
        if (pkg.name === "@sky/cli") return dir;
      } catch {
      }
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return void 0;
}
async function gitShortSha(cwd, ref = "HEAD") {
  try {
    const { stdout } = await execa("git", ["rev-parse", "--short", ref], { cwd, reject: false });
    return stdout.trim() || void 0;
  } catch {
    return void 0;
  }
}
async function updateCommand(opts, global) {
  const c = global.color === false ? plain() : chalk5;
  const ref = opts.ref ?? process.env.SKY_REF ?? "main";
  const root = findAppRoot(dirname(fileURLToPath(import.meta.url)));
  if (!root) {
    throw new SkyError("SKY-E-8099" /* InternalError */, { detail: "could not locate the Sky install directory" });
  }
  const isGit = existsSync(join(root, ".git"));
  if (!isGit) {
    process.stdout.write(
      c.yellow("This Sky install is not a git checkout, so `sky update` cannot pull in place.\n") + "Re-run the installer to update:\n" + c.bold("  curl -fsSL https://raw.githubusercontent.com/skysyaz/Sky-cli/main/install.sh | sh\n")
    );
    return 0;
  }
  process.stdout.write(c.dim(`sky: checking for updates on ${ref}\u2026
`));
  const before = await gitShortSha(root);
  await execa("git", ["fetch", "origin", ref], { cwd: root, reject: false });
  const remote = await gitShortSha(root, `origin/${ref}`);
  if (before && remote && before === remote) {
    process.stdout.write(c.green(`\u2713 Sky is already up to date (${before}).
`));
    return 0;
  }
  if (opts.check) {
    process.stdout.write(
      c.yellow(`\u2191 An update is available: ${before ?? "?"} \u2192 ${remote ?? "?"}.
`) + "Run `sky update` to install it.\n"
    );
    return 0;
  }
  process.stdout.write(c.dim(`sky: updating ${before ?? "?"} \u2192 ${remote ?? "?"}\u2026
`));
  await execa("git", ["reset", "--hard", `origin/${ref}`], { cwd: root });
  process.stdout.write(c.dim("sky: installing dependencies\u2026\n"));
  await run("npm", ["install", "--no-audit", "--no-fund"], root);
  process.stdout.write(c.dim("sky: building\u2026\n"));
  await run("npm", ["run", "build"], root);
  const after = await gitShortSha(root);
  process.stdout.write(c.green(`\u2713 Updated Sky to ${after ?? remote ?? "latest"}.
`));
  return 0;
}
async function run(command, args, cwd) {
  const result = await execa(command, args, { cwd, reject: false });
  if (result.exitCode !== 0) {
    throw new SkyError("SKY-E-8099" /* InternalError */, {
      detail: `\`${command} ${args.join(" ")}\` failed:
${(result.stderr || result.stdout).slice(-800)}`
    });
  }
}
function plain() {
  return new Proxy({}, { get: () => (s) => s });
}

// src/cli/plugin.ts
async function pluginCommand(args, _global) {
  const manager = new PluginManager();
  const lines = await runPluginCommand(args, manager);
  for (const line of lines) process.stdout.write(line + "\n");
  return 0;
}

// src/cli/main.ts
var VERSION = "1.0.0";
function globalOptions(program) {
  const o = program.opts();
  return {
    model: o.model,
    provider: o.provider,
    yolo: o.yolo,
    force: o.force || o.yolo,
    cwd: o.cwd,
    session: o.session,
    config: o.config,
    verbose: o.verbose,
    quiet: o.quiet,
    color: o.color,
    // Commander sets false for --no-color
    json: o.json
  };
}
async function run2(action) {
  try {
    const code = await action();
    process.exitCode = code;
  } catch (error) {
    const skyError = SkyError.from(error);
    process.stderr.write(chalk6.red(`${skyError.toUserMessage()}
`));
    process.exitCode = skyError.exitCode;
  }
}
function build() {
  const program = new Command();
  program.name("sky").description("Sky \u2014 a command-line AI agent with an interactive TUI and multi-provider LLM support.").version(VERSION, "-V, --version", "print version and exit").option("-m, --model <model>", "override the model for this run").option(
    "-p, --provider <provider>",
    "override the LLM provider (openai, anthropic, ollama, ollama-cloud, openrouter, zenmux, opencode, mock)"
  ).option("--yolo", "auto-approve every tool call (CI only); implies --force").option("--force", "skip interactive confirmations but respect the denylist").option("--cwd <path>", "run as if started in this directory").option("-s, --session <id>", "resume a specific session by id").option("-c, --config <path>", "path to an alternative config file").option("--verbose", "emit debug logs to stderr").option("--quiet", "suppress non-error stderr output").option("--no-color", "disable ANSI color").option("--json", "output events as NDJSON on stdout").allowExcessArguments(true);
  program.argument("[prompt]", "initial prompt for the agent").action((prompt) => run2(() => startModeSession("agent", prompt, globalOptions(program))));
  program.command("agent [prompt]").description("start an interactive agent session (default)").action((prompt) => run2(() => startModeSession("agent", prompt, globalOptions(program))));
  program.command("plan [prompt]").description("plan-first mode: clarify and design before any change").action((prompt) => run2(() => startModeSession("plan", prompt, globalOptions(program))));
  program.command("ask [prompt]").description("read-only Q&A; no tools, no file mutation").action((prompt) => run2(() => startModeSession("ask", prompt, globalOptions(program))));
  program.command("resume [id] [followUp]").description("resume an existing session by id or the most recent one").option("--view", "view-only: print history and exit").action(
    (id, followUp, opts) => run2(() => resumeCommand(id, followUp, opts.view ?? false, globalOptions(program)))
  );
  program.command("ls").description("list sessions for the current directory").option("--since <duration>", "only sessions since e.g. 7d, 24h, 30m").option("--all", "include sessions from all directories").action((opts) => run2(() => lsCommand(opts, globalOptions(program))));
  program.command("init").description("create ~/.sky/config.json with defaults").action(() => run2(() => initCommand(globalOptions(program))));
  program.command("plugin [args...]").description("manage plugins: marketplace add <owner/repo>, install <name@marketplace>, list, uninstall").action((args) => run2(() => pluginCommand(args ?? [], globalOptions(program))));
  program.command("update").alias("upgrade").description("update Sky to the latest version (pull + rebuild in place)").option("--check", "only check whether an update is available").option("--ref <ref>", "branch or tag to update to (default: main)").action(
    (opts) => run2(() => updateCommand(opts, globalOptions(program)))
  );
  program.command("config [action] [key] [value]").description("manage configuration: get, set, list, validate").action(
    (action, key, value) => run2(() => configCommand(action, key, value, globalOptions(program)))
  );
  program.command("mcp [action] [name]").description("manage MCP server registrations: add, list, remove, test").option("--command <command>", "executable to launch the MCP server").option("--args <args>", "space-separated arguments").option("--env <pair...>", "environment variables as KEY=VALUE").option("--approval <mode>", "approval mode: auto, manual, deny").action(
    (action, name, opts) => run2(() => mcpCommand(action, name, opts, globalOptions(program)))
  );
  return program;
}
async function main(argv = process.argv) {
  const program = build();
  await program.parseAsync(argv);
}
main().catch((error) => {
  const skyError = SkyError.from(error);
  process.stderr.write(`${skyError.toUserMessage()}
`);
  process.exitCode = skyError.exitCode;
});
export {
  main
};
//# sourceMappingURL=main.js.map