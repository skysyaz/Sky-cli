#!/usr/bin/env node
import {
  PluginManager,
  configCommand,
  initCommand,
  lsCommand,
  mcpCommand,
  resumeCommand,
  runPluginCommand,
  startModeSession
} from "../chunk-C6ADV6RZ.js";
import {
  SkyError
} from "../chunk-4EQUB47F.js";

// src/cli/main.ts
import { Command } from "commander";
import chalk2 from "chalk";

// src/cli/update.ts
import { existsSync, readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { execa } from "execa";
import chalk from "chalk";
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
  const c = global.color === false ? plain() : chalk;
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
    process.stderr.write(chalk2.red(`${skyError.toUserMessage()}
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