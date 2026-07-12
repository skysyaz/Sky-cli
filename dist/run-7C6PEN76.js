#!/usr/bin/env node
import {
  PluginManager,
  runPluginCommand
} from "./chunk-PURCOZHY.js";
import {
  AgentLoop,
  Approver,
  AuditLog,
  Policy,
  SkyError,
  writeConfig
} from "./chunk-RSVWAUNV.js";

// src/tui/run.tsx
import React2 from "react";
import { render } from "ink";

// src/tui/App.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { Box, Text, Static, useApp, useInput } from "ink";

// src/tui/commands.ts
var MODEL_SUGGESTIONS = [
  "gpt-4o",
  "gpt-4o-mini",
  "claude-3-5-sonnet",
  "x-ai/grok-4.5-free",
  "gpt-oss:120b",
  "qwen3-coder:480b"
];
var PROVIDER_NAMES = ["openai", "anthropic", "ollama", "ollama-cloud", "openrouter", "zenmux", "opencode", "mock"];
var SLASH_COMMANDS = [
  { name: "help", description: "Show keybindings and commands" },
  { name: "mode", description: "Switch mode", args: ["agent", "plan", "ask"] },
  { name: "model", description: "Switch model", args: MODEL_SUGGESTIONS },
  { name: "provider", description: "Switch LLM provider", args: PROVIDER_NAMES },
  { name: "key", description: "Set the API key for the current provider (saved + reloaded)" },
  { name: "cost", description: "Show token and estimated cost usage" },
  { name: "diff", description: "Show uncommitted changes this session" },
  { name: "compact", description: "Summarize old turns to reclaim context" },
  {
    name: "plugin",
    description: "Manage plugins",
    args: ["marketplace", "search", "install", "list", "uninstall"]
  },
  { name: "clear", description: "Clear the screen (keeps session history)" },
  { name: "exit", description: "Save the session and quit" }
];
function parseInput(input) {
  if (!input.startsWith("/")) return { isSlash: false, command: "", hasSpace: false, arg: "" };
  const rest = input.slice(1);
  const spaceIdx = rest.indexOf(" ");
  if (spaceIdx === -1) return { isSlash: true, command: rest, hasSpace: false, arg: "" };
  return {
    isSlash: true,
    command: rest.slice(0, spaceIdx),
    hasSpace: true,
    arg: rest.slice(spaceIdx + 1)
  };
}
function matches(candidate, query) {
  if (!query) return true;
  const c = candidate.toLowerCase();
  const q = query.toLowerCase();
  return c.startsWith(q) || c.includes(q);
}
function getSuggestions(input, options = {}) {
  const parsed = parseInput(input);
  if (!parsed.isSlash) return [];
  if (!parsed.hasSpace) {
    const builtins = SLASH_COMMANDS.map((c) => ({ name: c.name, description: c.description }));
    const all = [...builtins, ...options.extraCommands ?? []];
    return all.filter((c) => matches(c.name, parsed.command)).map((c) => ({
      kind: "command",
      label: `/${c.name}`,
      description: c.description,
      value: c.name
    }));
  }
  const command = SLASH_COMMANDS.find((c) => c.name === parsed.command);
  if (!command?.args) return [];
  const args = command.name === "model" ? options.modelSuggestions ?? command.args : command.args;
  return args.filter((a) => matches(a, parsed.arg)).map((a) => ({ kind: "arg", label: a, description: `${command.name} \u2192 ${a}`, value: a }));
}

// src/tui/App.tsx
import { jsx, jsxs } from "react/jsx-runtime";
var GLYPH = "\u2B22";
var MODE_COLOR = { agent: "cyan", plan: "magenta", ask: "green" };
function App(props) {
  const { exit } = useApp();
  const { registry, session, store, config } = props;
  const [provider, setProvider] = useState(null);
  const [log, setLog] = useState([]);
  const [streaming, setStreaming] = useState("");
  const [input, setInput] = useState("");
  const [selected, setSelected] = useState(0);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState(session.mode);
  const [model, setModel] = useState(session.model);
  const [tokenUsed, setTokenUsed] = useState(session.tokenUsage.input + session.tokenUsage.output);
  const [filesEdited, setFilesEdited] = useState(0);
  const [approval, setApproval] = useState(null);
  const idRef = useRef(0);
  const abortRef = useRef(null);
  const policyRef = useRef(new Policy(config, session.sessionAllowlist));
  const auditRef = useRef(new AuditLog({ logger: props.logger }));
  const pluginManagerRef = useRef(new PluginManager({ logger: props.logger }));
  const [plugins, setPlugins] = useState(props.plugins ?? []);
  const pluginCommands = useMemo(() => plugins.flatMap((p) => p.commands), [plugins]);
  const extraCommands = useMemo(
    () => pluginCommands.map((c) => ({ name: c.name, description: c.description })),
    [pluginCommands]
  );
  const tokenLimit = useMemo(
    () => provider ? provider.tokenLimits(model).contextWindow : 128e3,
    [provider, model]
  );
  const modelSuggestions = useMemo(() => [model, ...MODEL_SUGGESTIONS.filter((m) => m !== model)], [model]);
  const suggestions = busy || approval ? [] : getSuggestions(input, { modelSuggestions, extraCommands });
  const paletteOpen = suggestions.length > 0;
  const clampedSelected = suggestions.length ? Math.min(selected, suggestions.length - 1) : 0;
  const pushLog = (kind, text, ok) => {
    setLog((prev) => [...prev, { id: idRef.current++, kind, text, ok }]);
  };
  const prompter = (request) => new Promise((resolve) => setApproval({ request, resolve }));
  function buildProvider(name) {
    try {
      const created = props.makeProvider(name);
      setProvider(created);
      return created;
    } catch (error) {
      setProvider(null);
      const skyError = SkyError.from(error);
      pushLog("error", `${skyError.toUserMessage()} \u2014 set a key with /key <value> or switch with /provider.`);
      return null;
    }
  }
  function ensureProvider() {
    return provider ?? buildProvider(session.provider);
  }
  async function runAgent(prompt) {
    const activeProvider = ensureProvider();
    if (!activeProvider) return;
    setBusy(true);
    const abort = new AbortController();
    abortRef.current = abort;
    const approver = new Approver({
      policy: policyRef.current,
      audit: auditRef.current,
      prompter,
      logger: props.logger,
      force: props.force,
      yolo: props.yolo
    });
    const loop = new AgentLoop({
      provider: activeProvider,
      registry,
      approver,
      policy: policyRef.current,
      session,
      store,
      config,
      logger: props.logger,
      signal: abort.signal
    });
    let streamed = "";
    try {
      for await (const event of loop.run(prompt)) {
        switch (event.type) {
          case "text-delta":
            streamed += event.text;
            setStreaming(streamed);
            break;
          case "tool-call":
            pushLog("tool", `${GLYPH} ${event.toolCall.name} ${summarize(event.toolCall.input)}`);
            break;
          case "tool-result":
            pushLog("tool-result", firstLine(event.output), event.ok);
            if (event.ok && (event.toolName === "write" || event.toolName === "edit")) {
              setFilesEdited((n) => n + 1);
            }
            break;
          case "usage":
            setTokenUsed(session.tokenUsage.input + session.tokenUsage.output);
            break;
          case "turn-end":
            if (streamed.trim()) pushLog("assistant", streamed.trim());
            streamed = "";
            setStreaming("");
            break;
          case "error":
            if (streamed.trim()) {
              pushLog("assistant", streamed.trim());
              streamed = "";
              setStreaming("");
            }
            pushLog("error", event.error.toUserMessage());
            break;
          default:
            break;
        }
      }
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }
  function executeSlash(name, arg) {
    switch (name) {
      case "help":
        pushLog(
          "system",
          [
            "Commands: /help /mode /model /provider /key /cost /diff /plugin /clear /exit",
            "/provider <name>   switch LLM provider",
            "/key <api-key>     set + save the API key for the current provider (reloads live)",
            "/plugin marketplace add <owner/repo> \xB7 /plugin install <name@market> \xB7 /plugin search <q>",
            "Type / to open the palette \xB7 \u2191/\u2193 to move \xB7 Tab/Enter to select \xB7 Esc to clear",
            "Enter submits \xB7 Ctrl+C cancels a turn (twice to quit) \xB7 Ctrl+D quits"
          ].join("\n")
        );
        break;
      case "clear":
        setLog([]);
        break;
      case "exit":
        store.setStatus(session, "paused");
        exit();
        break;
      case "mode":
        if (arg === "agent" || arg === "plan" || arg === "ask") {
          session.mode = arg;
          store.save(session);
          setMode(arg);
          pushLog("system", `Mode \u2192 ${arg}`);
        } else {
          pushLog("system", "Usage: /mode [agent|plan|ask]");
        }
        break;
      case "model":
        if (arg) {
          session.model = arg;
          store.save(session);
          setModel(arg);
          buildProvider(session.provider);
          pushLog("system", `Model \u2192 ${arg}`);
        } else {
          pushLog("system", "Usage: /model <name>");
        }
        break;
      case "provider":
        if (arg && PROVIDER_NAMES.includes(arg)) {
          session.provider = arg;
          config.defaultProvider = arg;
          const providerDefaultModel = config.providers[arg]?.defaultModel;
          if (providerDefaultModel) {
            session.model = providerDefaultModel;
            setModel(providerDefaultModel);
          }
          store.save(session);
          const built = buildProvider(arg);
          pushLog("system", `Provider \u2192 ${arg}${built ? " (ready)" : " \u2014 set a key with /key <value>"}`);
        } else {
          pushLog("system", `Current provider: ${session.provider}. Usage: /provider <${PROVIDER_NAMES.join("|")}>`);
        }
        break;
      case "key": {
        const value = arg?.trim();
        if (!value) {
          pushLog("system", "Usage: /key <api-key>   (saved for the current provider and reloaded)");
          break;
        }
        const providerName = session.provider;
        config.providers[providerName] = { ...config.providers[providerName] ?? {}, apiKey: value };
        try {
          writeConfig(config);
        } catch (error) {
          pushLog("error", `Saved in-session but could not persist: ${error.message}`);
        }
        const built = buildProvider(providerName);
        pushLog(
          "system",
          built ? `API key saved for ${providerName}. Ready \u2014 send your message.` : `Key set but ${providerName} still failed to initialize.`
        );
        break;
      }
      case "cost":
        pushLog(
          "system",
          `Tokens: ${session.tokenUsage.input} in / ${session.tokenUsage.output} out \xB7 ~$${session.tokenUsage.estimatedCostUsd.toFixed(4)}`
        );
        break;
      case "diff":
        pushLog("system", `${filesEdited} file(s) edited this session. Run \`git diff\` to review.`);
        break;
      case "compact":
        pushLog("system", "Compaction runs automatically past the threshold; manual /compact is a no-op here.");
        break;
      case "plugin":
        void runPluginSlash(arg ?? "");
        break;
      default: {
        const pluginCommand = pluginCommands.find((c) => c.name === name);
        if (pluginCommand) {
          pushLog("system", `Running plugin command /${name}`);
          void runAgent(pluginCommand.body);
        } else {
          pushLog("error", `Unknown command: /${name}`);
        }
        break;
      }
    }
  }
  function reloadPlugins() {
    const loaded = pluginManagerRef.current.load();
    setPlugins(loaded);
    for (const plugin of loaded) {
      for (const server of plugin.mcpServers) {
        if (!config.mcp.servers.some((s) => s.name === server.name)) {
          config.mcp.servers.push({ ...server, approvalMode: "manual" });
        }
      }
    }
    try {
      writeConfig(config);
    } catch (error) {
      pushLog("error", `Could not persist plugin MCP servers: ${error.message}`);
    }
    return loaded;
  }
  async function runPluginSlash(argString) {
    const args = argString.trim().split(/\s+/).filter(Boolean);
    pushLog("system", `plugin ${args.join(" ")}\u2026`);
    try {
      const lines = await runPluginCommand(args, pluginManagerRef.current);
      for (const line of lines) pushLog("system", line);
      const action = args[0];
      if (action && ["install", "uninstall", "remove", "marketplace"].includes(action)) {
        const loaded = reloadPlugins();
        const commandList = loaded.flatMap((p) => p.commands.map((c) => `/${c.name}`)).join(", ") || "none";
        pushLog("system", `Reloaded \u2014 ${loaded.length} plugin(s). Commands: ${commandList}`);
      } else if (!action) {
        const loaded = reloadPlugins();
        const commandList = loaded.flatMap((p) => p.commands.map((c) => `/${c.name}`)).join(", ") || "none";
        pushLog("system", `Reloaded \u2014 ${loaded.length} plugin(s). Commands: ${commandList}`);
      }
    } catch (error) {
      pushLog("error", error instanceof Error ? error.message : String(error));
    }
  }
  function acceptSuggestion(suggestion) {
    if (suggestion.kind === "command") {
      const cmd = SLASH_COMMANDS.find((c) => c.name === suggestion.value);
      if (cmd?.args) {
        setInput(`/${suggestion.value} `);
        setSelected(0);
      } else {
        executeSlash(suggestion.value);
        setInput("");
      }
    } else {
      const parsed = parseInput(input);
      executeSlash(parsed.command, suggestion.value);
      setInput("");
    }
  }
  function submit() {
    const text = input.trim();
    if (!text) return;
    if (text.startsWith("/")) {
      const parsed = parseInput(text);
      executeSlash(parsed.command, parsed.hasSpace ? parsed.arg : void 0);
      setInput("");
      return;
    }
    pushLog("user", text);
    setInput("");
    void runAgent(text);
  }
  useInput((char, key) => {
    if (approval) {
      const answer = key.return ? "yes" : char?.toLowerCase();
      let resolved = null;
      if (answer === "y" || key.return) resolved = "yes";
      else if (answer === "n" || key.escape) resolved = "no";
      else if (answer === "a") resolved = "always";
      else if (answer === "e") resolved = "edit";
      if (resolved) {
        approval.resolve(resolved);
        setApproval(null);
      }
      return;
    }
    if (busy) {
      if (key.ctrl && char === "c") abortRef.current?.abort();
      return;
    }
    if (key.ctrl && char === "c") {
      if (input) setInput("");
      else {
        store.setStatus(session, "paused");
        exit();
      }
      return;
    }
    if (key.ctrl && char === "d") {
      store.setStatus(session, "paused");
      exit();
      return;
    }
    if (paletteOpen && key.upArrow) {
      setSelected((s) => (s - 1 + suggestions.length) % suggestions.length);
      return;
    }
    if (paletteOpen && key.downArrow) {
      setSelected((s) => (s + 1) % suggestions.length);
      return;
    }
    if (paletteOpen && key.tab) {
      acceptSuggestion(suggestions[clampedSelected]);
      return;
    }
    if (key.return) {
      if (paletteOpen) acceptSuggestion(suggestions[clampedSelected]);
      else submit();
      return;
    }
    if (key.escape) {
      setInput("");
      return;
    }
    if (key.backspace || key.delete) {
      setInput((v) => v.slice(0, -1));
      setSelected(0);
      return;
    }
    if (char && !key.ctrl && !key.meta) {
      setInput((v) => v + char);
      setSelected(0);
    }
  });
  useEffect(() => {
    ensureProvider();
    if (props.initialPrompt) {
      pushLog("user", props.initialPrompt);
      void runAgent(props.initialPrompt);
    }
  }, []);
  const pct = tokenLimit > 0 ? (tokenUsed / tokenLimit * 100).toFixed(1) : "0.0";
  return /* @__PURE__ */ jsxs(Box, { flexDirection: "column", children: [
    /* @__PURE__ */ jsx(Static, { items: log, children: (item) => /* @__PURE__ */ jsx(LogLine, { item }, item.id) }),
    streaming ? /* @__PURE__ */ jsx(Text, { children: streaming }) : null,
    busy ? /* @__PURE__ */ jsxs(Text, { color: "yellow", children: [
      GLYPH,
      " working\u2026 (Ctrl+C to cancel)"
    ] }) : null,
    approval ? /* @__PURE__ */ jsx(ApprovalModal, { request: approval.request }) : /* @__PURE__ */ jsxs(Box, { flexDirection: "column", children: [
      paletteOpen ? /* @__PURE__ */ jsx(Palette, { suggestions, selected: clampedSelected }) : null,
      /* @__PURE__ */ jsx(InputBox, { value: input, mode })
    ] }),
    /* @__PURE__ */ jsx(
      StatusBar,
      {
        mode,
        provider: provider?.name ?? session.provider,
        model,
        pct,
        files: filesEdited,
        sessionId: session.id
      }
    )
  ] });
}
function LogLine({ item }) {
  switch (item.kind) {
    case "user":
      return /* @__PURE__ */ jsx(Box, { marginTop: 1, children: /* @__PURE__ */ jsxs(Text, { color: "cyan", bold: true, children: [
        "\u203A ",
        item.text
      ] }) });
    case "assistant":
      return /* @__PURE__ */ jsx(Box, { marginTop: 1, children: /* @__PURE__ */ jsx(Text, { children: item.text }) });
    case "tool":
      return /* @__PURE__ */ jsx(Text, { color: "magenta", children: item.text });
    case "tool-result":
      return /* @__PURE__ */ jsxs(Text, { color: item.ok ? "green" : "red", children: [
        "  ",
        GLYPH,
        " ",
        item.text
      ] });
    case "system":
      return /* @__PURE__ */ jsx(Text, { color: "gray", children: item.text });
    case "error":
      return /* @__PURE__ */ jsxs(Text, { color: "red", children: [
        GLYPH,
        " ",
        item.text
      ] });
    default:
      return /* @__PURE__ */ jsx(Text, { children: item.text });
  }
}
function Palette({ suggestions, selected }) {
  return /* @__PURE__ */ jsx(Box, { flexDirection: "column", borderStyle: "round", borderColor: "gray", paddingX: 1, children: suggestions.slice(0, 8).map((s, i) => /* @__PURE__ */ jsxs(Box, { children: [
    /* @__PURE__ */ jsxs(Text, { color: i === selected ? "cyan" : void 0, bold: i === selected, children: [
      i === selected ? "\u276F " : "  ",
      s.label.padEnd(20)
    ] }),
    /* @__PURE__ */ jsxs(Text, { color: "gray", children: [
      " ",
      s.description
    ] })
  ] }, s.label)) });
}
function InputBox({ value, mode }) {
  return /* @__PURE__ */ jsxs(Box, { borderStyle: "round", borderColor: MODE_COLOR[mode], paddingX: 1, children: [
    /* @__PURE__ */ jsx(Text, { color: MODE_COLOR[mode], children: "\u203A " }),
    value ? /* @__PURE__ */ jsx(Text, { children: value }) : /* @__PURE__ */ jsx(Text, { color: "gray", children: "Ask, build, or type / for commands" }),
    /* @__PURE__ */ jsx(Text, { color: "gray", children: "\u2588" })
  ] });
}
function StatusBar({
  mode,
  provider,
  model,
  pct,
  files,
  sessionId
}) {
  const pctColor = Number(pct) >= 95 ? "red" : Number(pct) >= 90 ? "yellow" : "green";
  return /* @__PURE__ */ jsxs(Box, { children: [
    /* @__PURE__ */ jsxs(Text, { color: MODE_COLOR[mode], children: [
      GLYPH,
      " ",
      mode
    ] }),
    /* @__PURE__ */ jsxs(Text, { color: "gray", children: [
      " \xB7 ",
      provider,
      ":",
      model,
      " \xB7 "
    ] }),
    /* @__PURE__ */ jsxs(Text, { color: pctColor, children: [
      pct,
      "%"
    ] }),
    /* @__PURE__ */ jsxs(Text, { color: "gray", children: [
      " \xB7 ",
      files,
      " files \xB7 ",
      sessionId.slice(0, 5)
    ] })
  ] });
}
function ApprovalModal({ request }) {
  const diffLines = request.diff ? request.diff.patch.split("\n").slice(0, 24) : [];
  return /* @__PURE__ */ jsxs(Box, { flexDirection: "column", borderStyle: "round", borderColor: "yellow", paddingX: 1, children: [
    /* @__PURE__ */ jsxs(Text, { color: "yellow", bold: true, children: [
      GLYPH,
      " Approve ",
      request.toolName,
      "? ",
      /* @__PURE__ */ jsxs(Text, { color: "gray", children: [
        "(",
        request.reason,
        ")"
      ] })
    ] }),
    request.diff ? /* @__PURE__ */ jsxs(Box, { flexDirection: "column", marginTop: 1, children: [
      diffLines.map((line, i) => /* @__PURE__ */ jsx(
        Text,
        {
          color: line.startsWith("+") && !line.startsWith("+++") ? "green" : line.startsWith("-") && !line.startsWith("---") ? "red" : line.startsWith("@@") ? "cyan" : "gray",
          children: line
        },
        i
      )),
      /* @__PURE__ */ jsxs(Text, { color: "gray", children: [
        request.diff.added,
        " added, ",
        request.diff.removed,
        " removed"
      ] })
    ] }) : /* @__PURE__ */ jsx(Text, { color: "gray", children: summarize(request.input) }),
    /* @__PURE__ */ jsx(Box, { marginTop: 1, children: /* @__PURE__ */ jsx(Text, { bold: true, children: "[y]es [n]o [a]lways [e]dit" }) })
  ] });
}
function summarize(input) {
  if (typeof input.path === "string") return input.path;
  if (typeof input.command === "string") return input.command.slice(0, 80);
  if (typeof input.pattern === "string") return `/${input.pattern}/`;
  if (typeof input.action === "string") return String(input.action);
  return JSON.stringify(input).slice(0, 80);
}
function firstLine(text) {
  const line = text.split("\n")[0];
  return line.length > 100 ? line.slice(0, 99) + "\u2026" : line;
}

// src/tui/run.tsx
async function runTui(options) {
  const instance = render(React2.createElement(App, options), {
    exitOnCtrlC: false
    // App handles Ctrl+C (cancel turn, then quit)
  });
  await instance.waitUntilExit();
}
export {
  runTui
};
//# sourceMappingURL=run-7C6PEN76.js.map