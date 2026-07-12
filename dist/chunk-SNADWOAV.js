#!/usr/bin/env node
import {
  SkyError,
  heuristicCountTokens,
  nullLogger,
  resolveApiKey,
  sessionsDir,
  sessionsIndexPath
} from "./chunk-RSVWAUNV.js";

// src/session/store.ts
import {
  readFileSync,
  writeFileSync,
  renameSync,
  existsSync,
  mkdirSync,
  readdirSync,
  appendFileSync,
  copyFileSync
} from "fs";
import { join } from "path";
import { randomBytes } from "crypto";

// src/session/types.ts
import { z } from "zod";
var toolCallSchema = z.object({
  id: z.string(),
  name: z.string(),
  input: z.record(z.unknown())
});
var messageSchema = z.object({
  role: z.enum(["system", "user", "assistant", "tool"]),
  content: z.string(),
  /** Tool calls requested by an assistant message. */
  toolCalls: z.array(toolCallSchema).optional(),
  /** For a tool-result message, the id of the call it answers. */
  toolCallId: z.string().optional(),
  /** For a tool-result message, the tool name (aids provider translation). */
  name: z.string().optional(),
  /** Wall-clock time the message was appended. */
  timestamp: z.string().optional()
});
var tokenUsageSchema = z.object({
  input: z.number().int().nonnegative().default(0),
  output: z.number().int().nonnegative().default(0),
  estimatedCostUsd: z.number().nonnegative().default(0)
});
var allowlistEntrySchema = z.object({
  tool: z.string(),
  pattern: z.string()
});
var CURRENT_SESSION_VERSION = 1;
var sessionSchema = z.object({
  schemaVersion: z.number().int().positive().default(CURRENT_SESSION_VERSION),
  id: z.string(),
  cwd: z.string(),
  mode: z.enum(["agent", "plan", "ask"]),
  status: z.enum(["active", "paused", "compacted", "archived"]).default("active"),
  model: z.string(),
  provider: z.string(),
  started: z.string(),
  lastActivity: z.string(),
  messages: z.array(messageSchema).default([]),
  tokenUsage: tokenUsageSchema.default({}),
  sessionAllowlist: z.array(allowlistEntrySchema).default([]),
  /** Set at turn start, cleared at turn end; drives crash recovery (§11.7). */
  lastTurnInterrupted: z.boolean().default(false),
  /** Friendly name set via `/save`. */
  name: z.string().optional()
});
var sessionIndexEntrySchema = z.object({
  id: z.string(),
  cwd: z.string(),
  started: z.string(),
  lastActivity: z.string(),
  mode: z.enum(["agent", "plan", "ask"]),
  messages: z.number().int().nonnegative(),
  status: z.enum(["active", "paused", "compacted", "archived"]).default("paused")
});

// src/session/migrations.ts
var SESSION_MIGRATIONS = {
  // Example scaffold for the first schema bump. No real migrations exist yet at
  // v1; the entry documents the shape a future migration would take.
  // 1: (s) => ({ ...s, schemaVersion: 2, newField: defaultValue }),
};
function migrateSession(input) {
  let current = input;
  let version = typeof current.schemaVersion === "number" ? current.schemaVersion : 1;
  while (version < CURRENT_SESSION_VERSION) {
    const migration = SESSION_MIGRATIONS[version];
    if (!migration) {
      throw new SkyError("SKY-E-4001" /* SessionMigrationFailed */, {
        detail: `no migration from schemaVersion ${version}`
      });
    }
    current = migration(current);
    const next = typeof current.schemaVersion === "number" ? current.schemaVersion : version + 1;
    if (next <= version) {
      throw new SkyError("SKY-E-4001" /* SessionMigrationFailed */, {
        detail: `migration from ${version} did not advance the version`
      });
    }
    version = next;
  }
  return current;
}

// src/session/store.ts
function generateSessionId() {
  return randomBytes(6).toString("hex");
}
var SessionStore = class {
  dir;
  indexPath;
  logger;
  constructor(options = {}) {
    this.dir = options.dir ?? sessionsDir();
    this.indexPath = options.indexPath ?? sessionsIndexPath();
    this.logger = options.logger ?? nullLogger;
    mkdirSync(this.dir, { recursive: true });
  }
  filePath(id) {
    return join(this.dir, `${id}.json`);
  }
  /** Create a new active session and persist it. */
  create(params) {
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const session = sessionSchema.parse({
      schemaVersion: CURRENT_SESSION_VERSION,
      id: params.id ?? generateSessionId(),
      cwd: params.cwd,
      mode: params.mode,
      status: "active",
      provider: params.provider,
      model: params.model,
      started: now,
      lastActivity: now,
      messages: []
    });
    this.save(session);
    this.logger.info("session.started", { id: session.id, mode: session.mode });
    return session;
  }
  /** Whether a session file exists. */
  exists(id) {
    return existsSync(this.filePath(id));
  }
  /**
   * Load a session, running migrations and validation. A parse failure is
   * SKY-E-4002; an unmigratable file is SKY-E-4001. On corruption a `.bak` of
   * the original is preserved before throwing.
   */
  load(id) {
    const path = this.filePath(id);
    if (!existsSync(path)) throw new SkyError("SKY-E-4000" /* SessionNotFound */, { id });
    let raw;
    try {
      raw = readFileSync(path, "utf8");
    } catch (cause) {
      throw new SkyError("SKY-E-4002" /* SessionCorrupt */, { detail: `cannot read ${id}` }, cause);
    }
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (cause) {
      this.backup(path);
      throw new SkyError("SKY-E-4002" /* SessionCorrupt */, { detail: cause.message }, cause);
    }
    const migrated = migrateSession(parsed);
    const result = sessionSchema.safeParse(migrated);
    if (!result.success) {
      this.backup(path);
      throw new SkyError("SKY-E-4002" /* SessionCorrupt */, {
        detail: result.error.errors.map((e) => e.path.join(".")).join(", ")
      });
    }
    return result.data;
  }
  backup(path) {
    try {
      copyFileSync(path, `${path}.bak`);
    } catch {
    }
  }
  /**
   * Persist a session with the atomic temp-file + rename strategy (§11.7).
   * Updates `lastActivity` and refreshes the index entry.
   */
  save(session) {
    session.lastActivity = (/* @__PURE__ */ new Date()).toISOString();
    const validated = sessionSchema.parse(session);
    const path = this.filePath(session.id);
    const tmp = `${path}.tmp`;
    writeFileSync(tmp, JSON.stringify(validated, null, 2), "utf8");
    renameSync(tmp, path);
    this.updateIndex(validated);
  }
  /** Append a message and persist atomically. */
  appendMessage(session, message) {
    session.messages.push({ ...message, timestamp: message.timestamp ?? (/* @__PURE__ */ new Date()).toISOString() });
    this.save(session);
  }
  /** Move a session to a new lifecycle state (§7.3) and persist. */
  setStatus(session, status) {
    session.status = status;
    this.save(session);
  }
  // --- Index (§7.4) -------------------------------------------------------
  updateIndex(session) {
    const entry = {
      id: session.id,
      cwd: session.cwd,
      started: session.started,
      lastActivity: session.lastActivity,
      mode: session.mode,
      messages: session.messages.length,
      status: session.status
    };
    try {
      appendFileSync(this.indexPath, JSON.stringify(entry) + "\n", "utf8");
    } catch (cause) {
      this.logger.warn("session.index.appendFailed", { detail: cause.message });
    }
  }
  /**
   * Read the index, collapsing to the latest entry per id. If the index is
   * missing or a line is corrupt, it is rebuilt from the sessions directory.
   */
  list(filter) {
    let entries = this.readIndex();
    if (entries === void 0) entries = this.rebuildIndex();
    const latest = /* @__PURE__ */ new Map();
    entries.forEach((entry, seq) => latest.set(entry.id, { entry, seq }));
    let result = [...latest.values()].filter((x) => x.entry.status !== "archived");
    if (filter?.cwd) result = result.filter((x) => x.entry.cwd === filter.cwd);
    if (filter?.sinceMs !== void 0) {
      const cutoff = Date.now() - filter.sinceMs;
      result = result.filter((x) => Date.parse(x.entry.lastActivity) >= cutoff);
    }
    return result.sort((a, b) => {
      const byTime = Date.parse(b.entry.lastActivity) - Date.parse(a.entry.lastActivity);
      return byTime !== 0 ? byTime : b.seq - a.seq;
    }).map((x) => x.entry);
  }
  readIndex() {
    if (!existsSync(this.indexPath)) return void 0;
    const raw = readFileSync(this.indexPath, "utf8");
    const out = [];
    const lines = raw.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      try {
        const parsed = sessionIndexEntrySchema.parse(JSON.parse(line));
        out.push(parsed);
      } catch {
        if (i < lines.length - 2) return void 0;
      }
    }
    return out;
  }
  /** Rebuild the index by scanning every session file. */
  rebuildIndex() {
    this.logger.info("session.index.rebuild", {});
    const entries = [];
    for (const file of readdirSync(this.dir)) {
      if (!file.endsWith(".json") || file.endsWith(".tmp")) continue;
      const id = file.replace(/\.json$/, "");
      try {
        const session = this.load(id);
        entries.push({
          id: session.id,
          cwd: session.cwd,
          started: session.started,
          lastActivity: session.lastActivity,
          mode: session.mode,
          messages: session.messages.length,
          status: session.status
        });
      } catch {
      }
    }
    const tmp = `${this.indexPath}.tmp`;
    writeFileSync(tmp, entries.map((e) => JSON.stringify(e)).join("\n") + (entries.length ? "\n" : ""), "utf8");
    renameSync(tmp, this.indexPath);
    return entries;
  }
  /** Resolve `latest` or a concrete id to a session id for the given cwd. */
  resolveId(idOrLatest, cwd) {
    if (idOrLatest !== "latest") return idOrLatest;
    const sessions = this.list(cwd ? { cwd } : void 0);
    if (sessions.length === 0) throw new SkyError("SKY-E-4000" /* SessionNotFound */, { id: "latest" });
    return sessions[0].id;
  }
};

// src/llm/mock.ts
var MockProvider = class {
  name = "mock";
  script;
  cursor = 0;
  limits;
  constructor(options = {}) {
    this.script = options.script ?? [];
    this.limits = options.limits ?? { contextWindow: 128e3, maxOutput: 4096 };
  }
  async *stream(request) {
    const turn = this.script[this.cursor];
    this.cursor++;
    if (turn) {
      if (turn.text) {
        for (const word of turn.text.split(/(\s+)/)) {
          if (word) yield { type: "text-delta", text: word };
        }
      }
      if (turn.toolCalls) {
        for (const toolCall of turn.toolCalls) {
          yield { type: "tool-call", toolCall };
        }
        yield { type: "done", usage: this.usage(request), finishReason: "tool_calls" };
        return;
      }
      yield { type: "done", usage: this.usage(request), finishReason: "stop" };
      return;
    }
    const lastUser = [...request.messages].reverse().find((m) => m.role === "user");
    const reply = lastUser ? `Mock response: I received your message ("${truncate(lastUser.content, 60)}"). No live provider is configured, so this is a canned reply.` : "Mock response: hello from the mock provider.";
    for (const word of reply.split(/(\s+)/)) {
      if (word) yield { type: "text-delta", text: word };
    }
    yield { type: "done", usage: this.usage(request), finishReason: "stop" };
  }
  usage(request) {
    return { inputTokens: heuristicCountTokens(request.messages), outputTokens: 24 };
  }
  countTokens(messages) {
    return heuristicCountTokens(messages);
  }
  tokenLimits() {
    return this.limits;
  }
};
function truncate(text, max) {
  return text.length <= max ? text : text.slice(0, max - 1) + "\u2026";
}

// src/llm/errors.ts
function providerErrorFromStatus(status, detail, cause) {
  switch (status) {
    case 429:
      return new SkyError("SKY-E-5001" /* ProviderRateLimited */, {}, cause);
    case 503:
      return new SkyError("SKY-E-5002" /* ProviderUnavailable */, {}, cause);
    case 400:
      return new SkyError("SKY-E-5010" /* ProviderBadRequest */, { detail }, cause);
    case 401:
      return new SkyError("SKY-E-5011" /* ProviderAuthFailed */, {}, cause);
    case 403:
      return new SkyError("SKY-E-5012" /* ProviderForbidden */, { detail }, cause);
    case 451:
      return new SkyError("SKY-E-5013" /* ProviderContentFilter */, {}, cause);
    default:
      if (status && status >= 500) return new SkyError("SKY-E-5002" /* ProviderUnavailable */, {}, cause);
      return new SkyError("SKY-E-5000" /* ProviderRequestFailed */, { detail }, cause);
  }
}

// src/llm/openai.ts
var DEFAULT_LIMITS = { contextWindow: 128e3, maxOutput: 16384 };
var OpenAiAdapter = class {
  name;
  client;
  options;
  constructor(options) {
    this.options = options;
    this.name = options.name ?? "openai";
  }
  async getClient() {
    if (this.client) return this.client;
    let OpenAI;
    try {
      ({ default: OpenAI } = await import("openai"));
    } catch (cause) {
      throw new SkyError(
        "SKY-E-5000" /* ProviderRequestFailed */,
        { detail: "the `openai` package is not installed; run `npm install openai`" },
        cause
      );
    }
    this.client = new OpenAI({
      apiKey: this.options.apiKey || "not-needed",
      baseURL: this.options.baseUrl,
      defaultHeaders: this.options.defaultHeaders
    });
    return this.client;
  }
  toOpenAiMessages(messages) {
    return messages.map((m) => {
      if (m.role === "tool") {
        return { role: "tool", tool_call_id: m.toolCallId, content: m.content };
      }
      if (m.role === "assistant" && m.toolCalls?.length) {
        return {
          role: "assistant",
          content: m.content || null,
          tool_calls: m.toolCalls.map((tc) => ({
            id: tc.id,
            type: "function",
            function: { name: tc.name, arguments: JSON.stringify(tc.input) }
          }))
        };
      }
      return { role: m.role, content: m.content };
    });
  }
  toOpenAiTools(tools) {
    if (!tools?.length) return void 0;
    return tools.map((t) => ({
      type: "function",
      function: { name: t.name, description: t.description, parameters: t.parameters }
    }));
  }
  async *stream(request) {
    const client = await this.getClient();
    let stream;
    try {
      stream = await client.chat.completions.create({
        model: request.model,
        messages: this.toOpenAiMessages(request.messages),
        tools: this.toOpenAiTools(request.tools),
        max_tokens: request.maxOutputTokens,
        temperature: request.temperature,
        stream: true,
        ...this.options.includeUsage === false ? {} : { stream_options: { include_usage: true } }
      });
    } catch (error) {
      throw providerErrorFromStatus(error.status, error.message, error);
    }
    const toolAcc = /* @__PURE__ */ new Map();
    let usage = { inputTokens: 0, outputTokens: 0 };
    let finish = "stop";
    try {
      for await (const part of stream) {
        if (request.signal?.aborted) throw new SkyError("SKY-E-2000" /* AgentAborted */, {});
        const choice = part.choices?.[0];
        const delta = choice?.delta;
        if (delta?.content) yield { type: "text-delta", text: delta.content };
        if (delta?.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index ?? 0;
            const acc = toolAcc.get(idx) ?? { id: tc.id ?? `call_${idx}`, name: "", args: "" };
            if (tc.id) acc.id = tc.id;
            if (tc.function?.name) acc.name = tc.function.name;
            if (tc.function?.arguments) acc.args += tc.function.arguments;
            toolAcc.set(idx, acc);
          }
        }
        if (choice?.finish_reason) {
          finish = choice.finish_reason === "tool_calls" ? "tool_calls" : choice.finish_reason === "length" ? "length" : "stop";
        }
        if (part.usage) {
          usage = { inputTokens: part.usage.prompt_tokens ?? 0, outputTokens: part.usage.completion_tokens ?? 0 };
        }
      }
    } catch (error) {
      if (SkyError.is(error)) throw error;
      throw new SkyError("SKY-E-5020" /* ProviderStreamInterrupted */, {}, error);
    }
    for (const acc of toolAcc.values()) {
      let input = {};
      try {
        input = acc.args ? JSON.parse(acc.args) : {};
      } catch (error) {
        throw new SkyError("SKY-E-5030" /* ProviderStreamParse */, { detail: `bad tool args: ${error.message}` }, error);
      }
      yield { type: "tool-call", toolCall: { id: acc.id, name: acc.name, input } };
    }
    yield { type: "done", usage, finishReason: toolAcc.size > 0 ? "tool_calls" : finish };
  }
  countTokens(messages) {
    return heuristicCountTokens(messages);
  }
  tokenLimits(model) {
    return this.options.limits?.[model] ?? DEFAULT_LIMITS;
  }
};

// src/llm/anthropic.ts
var DEFAULT_LIMITS2 = { contextWindow: 2e5, maxOutput: 8192 };
var AnthropicAdapter = class {
  name = "anthropic";
  client;
  options;
  constructor(options) {
    this.options = options;
  }
  async getClient() {
    if (this.client) return this.client;
    let Anthropic;
    try {
      ({ default: Anthropic } = await import("@anthropic-ai/sdk"));
    } catch (cause) {
      throw new SkyError(
        "SKY-E-5000" /* ProviderRequestFailed */,
        { detail: "the `@anthropic-ai/sdk` package is not installed; run `npm install @anthropic-ai/sdk`" },
        cause
      );
    }
    this.client = new Anthropic({ apiKey: this.options.apiKey, baseURL: this.options.baseUrl });
    return this.client;
  }
  /** Split out the system prompt and translate messages into Anthropic blocks. */
  translate(messages) {
    const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
    const out = [];
    for (const m of messages) {
      if (m.role === "system") continue;
      if (m.role === "tool") {
        out.push({
          role: "user",
          content: [{ type: "tool_result", tool_use_id: m.toolCallId, content: m.content }]
        });
        continue;
      }
      if (m.role === "assistant" && m.toolCalls?.length) {
        const content = [];
        if (m.content) content.push({ type: "text", text: m.content });
        for (const tc of m.toolCalls) {
          content.push({ type: "tool_use", id: tc.id, name: tc.name, input: tc.input });
        }
        out.push({ role: "assistant", content });
        continue;
      }
      out.push({ role: m.role, content: m.content });
    }
    return { system, messages: out };
  }
  toAnthropicTools(tools) {
    if (!tools?.length) return void 0;
    return tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters }));
  }
  async *stream(request) {
    const client = await this.getClient();
    const { system, messages } = this.translate(request.messages);
    let stream;
    try {
      stream = await client.messages.stream({
        model: request.model,
        system: system || void 0,
        messages,
        tools: this.toAnthropicTools(request.tools),
        max_tokens: request.maxOutputTokens ?? DEFAULT_LIMITS2.maxOutput,
        temperature: request.temperature
      });
    } catch (error) {
      throw providerErrorFromStatus(error.status, error.message, error);
    }
    const toolAcc = /* @__PURE__ */ new Map();
    let usage = { inputTokens: 0, outputTokens: 0 };
    try {
      for await (const event of stream) {
        if (request.signal?.aborted) throw new SkyError("SKY-E-2000" /* AgentAborted */, {});
        if (event.type === "content_block_start" && event.content_block?.type === "tool_use") {
          toolAcc.set(event.index, { id: event.content_block.id, name: event.content_block.name, json: "" });
        } else if (event.type === "content_block_delta") {
          if (event.delta?.type === "text_delta") {
            yield { type: "text-delta", text: event.delta.text };
          } else if (event.delta?.type === "input_json_delta") {
            const acc = toolAcc.get(event.index);
            if (acc) acc.json += event.delta.partial_json;
          }
        } else if (event.type === "message_delta" && event.usage) {
          usage.outputTokens = event.usage.output_tokens ?? usage.outputTokens;
        } else if (event.type === "message_start" && event.message?.usage) {
          usage.inputTokens = event.message.usage.input_tokens ?? 0;
        }
      }
    } catch (error) {
      if (SkyError.is(error)) throw error;
      throw new SkyError("SKY-E-5020" /* ProviderStreamInterrupted */, {}, error);
    }
    for (const acc of toolAcc.values()) {
      let input = {};
      try {
        input = acc.json ? JSON.parse(acc.json) : {};
      } catch (error) {
        throw new SkyError("SKY-E-5030" /* ProviderStreamParse */, { detail: error.message }, error);
      }
      yield { type: "tool-call", toolCall: { id: acc.id, name: acc.name, input } };
    }
    yield { type: "done", usage, finishReason: toolAcc.size > 0 ? "tool_calls" : "stop" };
  }
  countTokens(messages) {
    return heuristicCountTokens(messages);
  }
  tokenLimits(model) {
    return this.options.limits?.[model] ?? DEFAULT_LIMITS2;
  }
};

// src/llm/registry.ts
var OLLAMA_DEFAULT_BASE_URL = "http://localhost:11434/v1";
var OLLAMA_CLOUD_BASE_URL = "https://ollama.com/v1";
var OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
var ZENMUX_BASE_URL = "https://zenmux.ai/api/v1";
var OPENCODE_BASE_URL = "https://opencode.ai/api/v1";
function createProvider(options) {
  const { config, provider, logger = nullLogger, env } = options;
  if (options.override) return options.override;
  if (provider === "mock") return new MockProvider();
  const providerConfig = config.providers[provider];
  switch (provider) {
    case "openai":
      return new OpenAiAdapter({
        apiKey: resolveApiKey("openai", providerConfig, logger, env),
        baseUrl: providerConfig?.baseUrl,
        name: "openai"
      });
    case "anthropic":
      return new AnthropicAdapter({
        apiKey: resolveApiKey("anthropic", providerConfig, logger, env),
        baseUrl: providerConfig?.baseUrl
      });
    case "ollama":
      return new OpenAiAdapter({
        apiKey: "",
        baseUrl: providerConfig?.baseUrl ?? OLLAMA_DEFAULT_BASE_URL,
        includeUsage: false,
        // Ollama does not support stream_options.include_usage
        name: "ollama"
      });
    case "ollama-cloud":
      return new OpenAiAdapter({
        apiKey: resolveApiKey("ollama-cloud", providerConfig, logger, env),
        baseUrl: providerConfig?.baseUrl ?? OLLAMA_CLOUD_BASE_URL,
        name: "ollama-cloud"
      });
    case "zenmux":
      return new OpenAiAdapter({
        apiKey: resolveApiKey("zenmux", providerConfig, logger, env),
        baseUrl: providerConfig?.baseUrl ?? ZENMUX_BASE_URL,
        name: "zenmux"
      });
    case "openrouter":
      return new OpenAiAdapter({
        apiKey: resolveApiKey("openrouter", providerConfig, logger, env),
        baseUrl: providerConfig?.baseUrl ?? OPENROUTER_BASE_URL,
        defaultHeaders: { "HTTP-Referer": "https://github.com/sky-cli/sky" },
        name: "openrouter"
      });
    case "opencode":
      return new OpenAiAdapter({
        apiKey: resolveApiKey("opencode", providerConfig, logger, env),
        baseUrl: providerConfig?.baseUrl ?? OPENCODE_BASE_URL,
        name: "opencode"
      });
    default:
      throw new SkyError("SKY-E-1004" /* UnknownProvider */, { name: provider });
  }
}

// src/tools/read.ts
import { readFileSync as readFileSync2, statSync, existsSync as existsSync2 } from "fs";
import { z as z2 } from "zod";

// src/tools/paths.ts
import { resolve, relative, isAbsolute } from "path";
function resolveInCwd(cwd, path) {
  return isAbsolute(path) ? path : resolve(cwd, path);
}
function isInsideCwd(cwd, path) {
  const rel = relative(resolve(cwd), resolveInCwd(cwd, path));
  return rel === "" || !rel.startsWith("..") && !isAbsolute(rel);
}

// src/tools/read.ts
var schema = z2.object({
  path: z2.string(),
  offset: z2.number().int().nonnegative().optional(),
  limit: z2.number().int().positive().optional()
});
var MAX_BYTES = 256 * 1024;
function looksBinary(buffer) {
  const sample = buffer.subarray(0, 8e3);
  return sample.includes(0);
}
var readTool = {
  name: "read",
  description: "Read the contents of a file. Supports line offset/limit for large files.",
  schema,
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "File path relative to the working directory" },
      offset: { type: "integer", description: "0-based line to start from" },
      limit: { type: "integer", description: "Maximum number of lines to return" }
    },
    required: ["path"]
  },
  requiresApproval() {
    return true;
  },
  async execute(input, ctx) {
    const abs = resolveInCwd(ctx.cwd, input.path);
    if (!existsSync2(abs)) {
      return { ok: false, output: `File not found: ${input.path}`, code: "SKY-E-3001" /* ToolInputInvalid */, retryable: true };
    }
    const stat = statSync(abs);
    const buffer = readFileSync2(abs);
    if (looksBinary(buffer)) {
      return {
        ok: true,
        output: `[binary file: ${input.path}, ${stat.size} bytes \u2014 contents omitted]`,
        data: { binary: true, size: stat.size }
      };
    }
    let text = buffer.toString("utf8");
    let truncated = false;
    if (buffer.byteLength > MAX_BYTES && input.offset === void 0 && input.limit === void 0) {
      text = buffer.subarray(0, MAX_BYTES).toString("utf8");
      truncated = true;
    }
    if (input.offset !== void 0 || input.limit !== void 0) {
      const lines = text.split("\n");
      const start = input.offset ?? 0;
      const end = input.limit !== void 0 ? start + input.limit : lines.length;
      text = lines.slice(start, end).join("\n");
    }
    const notice = truncated ? `
[truncated at ${MAX_BYTES} bytes; use offset/limit for more]` : "";
    return { ok: true, output: text + notice, data: { size: stat.size, truncated } };
  }
};

// src/tools/write.ts
import { readFileSync as readFileSync3, existsSync as existsSync3, mkdirSync as mkdirSync2, writeFileSync as writeFileSync2 } from "fs";
import { dirname } from "path";
import { z as z3 } from "zod";
var schema2 = z3.object({
  path: z3.string(),
  content: z3.string()
});
var writeTool = {
  name: "write",
  description: "Write content to a file, creating or overwriting it.",
  schema: schema2,
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "File path relative to the working directory" },
      content: { type: "string", description: "Full file content to write" }
    },
    required: ["path", "content"]
  },
  requiresApproval() {
    return true;
  },
  async preview(input, ctx) {
    const abs = resolveInCwd(ctx.cwd, input.path);
    const oldContent = existsSync3(abs) ? readFileSync3(abs, "utf8") : "";
    return { path: input.path, oldContent, newContent: input.content };
  },
  async execute(input, ctx) {
    const abs = resolveInCwd(ctx.cwd, input.path);
    if (!ctx.config.tools.write.allowOutsideCwd && !isInsideCwd(ctx.cwd, abs)) {
      return {
        ok: false,
        output: `Write refused: ${input.path} is outside the working directory.`,
        code: "SKY-E-3010" /* WritePathOutsideCwd */,
        retryable: true
      };
    }
    mkdirSync2(dirname(abs), { recursive: true });
    const existed = existsSync3(abs);
    writeFileSync2(abs, input.content, "utf8");
    return {
      ok: true,
      output: `${existed ? "Overwrote" : "Created"} ${input.path} (${Buffer.byteLength(input.content)} bytes).`,
      data: { created: !existed }
    };
  }
};

// src/tools/edit.ts
import { readFileSync as readFileSync4, existsSync as existsSync4, writeFileSync as writeFileSync3 } from "fs";
import { z as z4 } from "zod";
var schema3 = z4.object({
  path: z4.string(),
  oldText: z4.string(),
  newText: z4.string(),
  /** 'all' or a positive count; default fails if oldText appears more than once. */
  occurrences: z4.union([z4.literal("all"), z4.number().int().positive()]).optional()
});
function countOccurrences(haystack, needle) {
  if (needle === "") return 0;
  let count = 0;
  let idx = haystack.indexOf(needle);
  while (idx !== -1) {
    count++;
    idx = haystack.indexOf(needle, idx + needle.length);
  }
  return count;
}
function applyEdit(content, input) {
  const count = countOccurrences(content, input.oldText);
  if (input.occurrences === "all") {
    return { result: content.split(input.oldText).join(input.newText), count };
  }
  const limit = typeof input.occurrences === "number" ? input.occurrences : 1;
  let replaced = 0;
  let result = content;
  let searchFrom = 0;
  while (replaced < limit) {
    const idx = result.indexOf(input.oldText, searchFrom);
    if (idx === -1) break;
    result = result.slice(0, idx) + input.newText + result.slice(idx + input.oldText.length);
    searchFrom = idx + input.newText.length;
    replaced++;
  }
  return { result, count };
}
var editTool = {
  name: "edit",
  description: "Replace an exact string in a file with a new string.",
  schema: schema3,
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "File path relative to the working directory" },
      oldText: { type: "string", description: "Exact text to replace (must be unique unless occurrences is set)" },
      newText: { type: "string", description: "Replacement text" },
      occurrences: { description: "'all' or a positive integer", type: ["string", "integer"] }
    },
    required: ["path", "oldText", "newText"]
  },
  requiresApproval() {
    return true;
  },
  async preview(input, ctx) {
    const abs = resolveInCwd(ctx.cwd, input.path);
    if (!existsSync4(abs)) return void 0;
    const oldContent = readFileSync4(abs, "utf8");
    if (countOccurrences(oldContent, input.oldText) === 0) return void 0;
    const { result } = applyEdit(oldContent, input);
    return { path: input.path, oldContent, newContent: result };
  },
  async execute(input, ctx) {
    const abs = resolveInCwd(ctx.cwd, input.path);
    if (!existsSync4(abs)) {
      return { ok: false, output: `File not found: ${input.path}`, code: "SKY-E-3020" /* EditOldTextNotFound */, retryable: true };
    }
    const content = readFileSync4(abs, "utf8");
    const count = countOccurrences(content, input.oldText);
    if (count === 0) {
      return {
        ok: false,
        output: `oldText not found in ${input.path}. Re-read the file and try again.`,
        code: "SKY-E-3020" /* EditOldTextNotFound */,
        retryable: true
      };
    }
    if (count > 1 && input.occurrences === void 0) {
      return {
        ok: false,
        output: `oldText appears ${count} times in ${input.path}; add more context or set occurrences.`,
        code: "SKY-E-3021" /* EditOldTextAmbiguous */,
        retryable: true
      };
    }
    const { result } = applyEdit(content, input);
    writeFileSync3(abs, result, "utf8");
    return { ok: true, output: `Edited ${input.path} (${count} occurrence${count === 1 ? "" : "s"}).`, data: { count } };
  }
};

// src/tools/search.ts
import { readFileSync as readFileSync5, existsSync as existsSync5, statSync as statSync2, readdirSync as readdirSync2 } from "fs";
import { join as join2, relative as relative2 } from "path";
import { z as z5 } from "zod";
import { execa } from "execa";
var schema4 = z5.object({
  pattern: z5.string(),
  path: z5.string().optional(),
  glob: z5.string().optional(),
  caseSensitive: z5.boolean().optional(),
  maxResults: z5.number().int().positive().optional()
});
var IGNORE_DIRS = /* @__PURE__ */ new Set(["node_modules", ".git", "dist", "coverage", ".sky-test"]);
function jsSearch(root, input, cwd) {
  const flags = input.caseSensitive ? "g" : "gi";
  let re;
  try {
    re = new RegExp(input.pattern, flags);
  } catch {
    re = new RegExp(input.pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), flags);
  }
  const max = input.maxResults ?? 200;
  const matches = [];
  const walk = (dir) => {
    if (matches.length >= max) return;
    let entries;
    try {
      entries = readdirSync2(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (matches.length >= max) return;
      if (IGNORE_DIRS.has(entry)) continue;
      const full = join2(dir, entry);
      let stat2;
      try {
        stat2 = statSync2(full);
      } catch {
        continue;
      }
      if (stat2.isDirectory()) {
        walk(full);
      } else if (stat2.isFile() && stat2.size < 2 * 1024 * 1024) {
        let content;
        try {
          content = readFileSync5(full, "utf8");
        } catch {
          continue;
        }
        const lines = content.split("\n");
        for (let i = 0; i < lines.length; i++) {
          re.lastIndex = 0;
          if (re.test(lines[i])) {
            matches.push({ file: relative2(cwd, full) || full, line: i + 1, text: lines[i].trim().slice(0, 200) });
            if (matches.length >= max) return;
          }
        }
      }
    }
  };
  const stat = statSync2(root);
  if (stat.isFile()) {
    const content = readFileSync5(root, "utf8").split("\n");
    for (let i = 0; i < content.length; i++) {
      re.lastIndex = 0;
      if (re.test(content[i])) matches.push({ file: relative2(cwd, root) || root, line: i + 1, text: content[i].trim().slice(0, 200) });
    }
  } else {
    walk(root);
  }
  return matches;
}
var searchTool = {
  name: "search",
  description: "Search file contents for a regex pattern (ripgrep, JS fallback).",
  schema: schema4,
  parameters: {
    type: "object",
    properties: {
      pattern: { type: "string", description: "Regular expression to search for" },
      path: { type: "string", description: "File or directory to search (default: cwd)" },
      glob: { type: "string", description: "Glob filter, e.g. **/*.ts" },
      caseSensitive: { type: "boolean" },
      maxResults: { type: "integer" }
    },
    required: ["pattern"]
  },
  requiresApproval(input) {
    return input.path !== void 0 && input.path.startsWith("..");
  },
  async execute(input, ctx) {
    const searchRoot = resolveInCwd(ctx.cwd, input.path ?? ".");
    if (!existsSync5(searchRoot)) {
      return { ok: false, output: `Path not found: ${input.path}`, code: "SKY-E-3001" /* ToolInputInvalid */, retryable: true };
    }
    let matches = [];
    try {
      const args = ["--line-number", "--no-heading", "--color=never"];
      if (!input.caseSensitive) args.push("--ignore-case");
      if (input.glob) args.push("--glob", input.glob);
      if (input.maxResults) args.push("--max-count", String(input.maxResults));
      args.push(input.pattern, searchRoot);
      const { stdout } = await execa("rg", args, { cwd: ctx.cwd, reject: false });
      matches = stdout.split("\n").filter(Boolean).slice(0, input.maxResults ?? 200).map((line) => {
        const m = line.match(/^(.*?):(\d+):(.*)$/);
        if (!m) return void 0;
        return { file: relative2(ctx.cwd, m[1]) || m[1], line: Number(m[2]), text: m[3].trim().slice(0, 200) };
      }).filter((x) => x !== void 0);
    } catch {
      if (!isInsideCwd(ctx.cwd, searchRoot) && !this.requiresApproval(input)) {
      }
      matches = jsSearch(searchRoot, input, ctx.cwd);
    }
    if (matches.length === 0) return { ok: true, output: `No matches for /${input.pattern}/.`, data: { matches: [] } };
    const rendered = matches.map((m) => `${m.file}:${m.line}: ${m.text}`).join("\n");
    return { ok: true, output: rendered, data: { matches } };
  }
};

// src/tools/shell.ts
import { z as z6 } from "zod";
import { execa as execa2 } from "execa";
var schema5 = z6.object({
  command: z6.string(),
  timeoutMs: z6.number().int().positive().optional()
});
var MAX_OUTPUT = 3e4;
var shellTool = {
  name: "shell",
  description: "Execute a shell command in the working directory.",
  schema: schema5,
  parameters: {
    type: "object",
    properties: {
      command: { type: "string", description: "The shell command to run" },
      timeoutMs: { type: "integer", description: "Timeout in milliseconds" }
    },
    required: ["command"]
  },
  requiresApproval() {
    return true;
  },
  async execute(input, ctx) {
    const timeout = input.timeoutMs ?? ctx.config.tools.shell.timeoutMs;
    try {
      const result = await execa2(input.command, {
        cwd: ctx.cwd,
        shell: true,
        timeout,
        reject: false,
        env: { ...process.env, ...ctx.config.tools.shell.env },
        signal: ctx.signal
      });
      if (result.timedOut) {
        return { ok: false, output: `Command timed out after ${timeout}ms.`, code: "SKY-E-3041" /* ShellTimeout */ };
      }
      const out = [result.stdout, result.stderr].filter(Boolean).join("\n").slice(0, MAX_OUTPUT);
      const status = `
[exit code ${result.exitCode}]`;
      return {
        ok: result.exitCode === 0,
        output: (out || "(no output)") + status,
        data: { exitCode: result.exitCode }
      };
    } catch (error) {
      return { ok: false, output: `Shell execution failed: ${error.message}`, code: "SKY-E-3999" /* ToolUnexpected */ };
    }
  }
};

// src/tools/git.ts
import { z as z7 } from "zod";
import { simpleGit } from "simple-git";
var schema6 = z7.object({
  action: z7.enum(["status", "diff", "log", "branch", "add", "commit", "checkout", "push"]),
  args: z7.array(z7.string()).optional(),
  flags: z7.array(z7.string()).optional(),
  message: z7.string().optional()
});
var READ_ACTIONS = /* @__PURE__ */ new Set(["status", "diff", "log", "branch"]);
var gitTool = {
  name: "git",
  description: "Run a typed git operation (status, diff, log, branch, add, commit, checkout, push).",
  schema: schema6,
  parameters: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["status", "diff", "log", "branch", "add", "commit", "checkout", "push"]
      },
      args: { type: "array", items: { type: "string" } },
      flags: { type: "array", items: { type: "string" } },
      message: { type: "string", description: "Commit message (for action=commit)" }
    },
    required: ["action"]
  },
  requiresApproval(input) {
    return !READ_ACTIONS.has(input.action);
  },
  async execute(input, ctx) {
    const git = simpleGit({ baseDir: ctx.cwd });
    const args = input.args ?? [];
    const flags = input.flags ?? [];
    try {
      switch (input.action) {
        case "status": {
          const status = await git.status();
          return { ok: true, output: JSON.stringify({ current: status.current, files: status.files }, null, 2) };
        }
        case "diff": {
          const diff = await git.diff(args);
          return { ok: true, output: diff || "(no changes)" };
        }
        case "log": {
          const log = await git.log(["-n", args[0] ?? "10"]);
          return { ok: true, output: log.all.map((c) => `${c.hash.slice(0, 8)} ${c.message}`).join("\n") };
        }
        case "branch": {
          const branches = await git.branchLocal();
          return { ok: true, output: branches.all.join("\n") };
        }
        case "add": {
          await git.add(args.length ? args : ["."]);
          return { ok: true, output: `Staged ${args.length ? args.join(", ") : "all changes"}.` };
        }
        case "commit": {
          if (!input.message) {
            return { ok: false, output: "commit requires a message.", code: "SKY-E-3001" /* ToolInputInvalid */, retryable: true };
          }
          const result = await git.commit(input.message, args);
          return { ok: true, output: `Committed ${result.commit} (${result.summary.changes} changes).` };
        }
        case "checkout": {
          await git.checkout(args);
          return { ok: true, output: `Checked out ${args.join(" ")}.` };
        }
        case "push": {
          if (flags.includes("--force") || flags.includes("-f")) {
            if (!ctx.config.tools.git.allowForcePush) {
              return { ok: false, output: "Force push denied by policy.", code: "SKY-E-3050" /* GitForcePushDenied */ };
            }
          }
          await git.push(args.concat(flags));
          return { ok: true, output: "Pushed." };
        }
        default:
          return { ok: false, output: `Unsupported git action.`, code: "SKY-E-3001" /* ToolInputInvalid */, retryable: true };
      }
    } catch (error) {
      return { ok: false, output: `git ${input.action} failed: ${error.message}`, code: "SKY-E-3999" /* ToolUnexpected */ };
    }
  }
};

// src/tools/registry.ts
var ToolRegistry = class {
  tools = /* @__PURE__ */ new Map();
  constructor(tools = defaultTools()) {
    for (const tool of tools) this.register(tool);
  }
  register(tool) {
    this.tools.set(tool.name, tool);
  }
  get(name) {
    return this.tools.get(name);
  }
  has(name) {
    return this.tools.has(name);
  }
  list() {
    return [...this.tools.values()];
  }
  /** Tool definitions advertised to the provider for function calling. */
  definitions() {
    return this.list().map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters
    }));
  }
  /** Validate the input against the tool's schema (SKY-E-3001 on failure). */
  validate(name, input) {
    const tool = this.tools.get(name);
    if (!tool) throw new SkyError("SKY-E-3000" /* UnknownTool */, { name });
    const result = tool.schema.safeParse(input);
    if (!result.success) {
      throw new SkyError("SKY-E-3001" /* ToolInputInvalid */, {
        detail: result.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join("; ")
      });
    }
    return result.data;
  }
  /** Validate then execute. Never throws for a tool-level failure — returns a ToolResult. */
  async execute(name, input, ctx) {
    const tool = this.tools.get(name);
    if (!tool) return { ok: false, output: `Unknown tool: ${name}`, code: "SKY-E-3000" /* UnknownTool */ };
    let validated;
    try {
      validated = this.validate(name, input);
    } catch (error) {
      const skyError = SkyError.from(error, "SKY-E-3001" /* ToolInputInvalid */);
      return { ok: false, output: skyError.message, code: skyError.code, retryable: skyError.retryable };
    }
    try {
      return await tool.execute(validated, ctx);
    } catch (error) {
      const skyError = SkyError.from(error, "SKY-E-3999" /* ToolUnexpected */);
      return { ok: false, output: skyError.message, code: skyError.code, retryable: skyError.retryable };
    }
  }
};
function defaultTools() {
  return [readTool, writeTool, editTool, searchTool, shellTool, gitTool];
}

export {
  toolCallSchema,
  messageSchema,
  tokenUsageSchema,
  allowlistEntrySchema,
  CURRENT_SESSION_VERSION,
  sessionSchema,
  sessionIndexEntrySchema,
  migrateSession,
  generateSessionId,
  SessionStore,
  providerErrorFromStatus,
  OpenAiAdapter,
  AnthropicAdapter,
  MockProvider,
  createProvider,
  resolveInCwd,
  isInsideCwd,
  readTool,
  writeTool,
  editTool,
  searchTool,
  shellTool,
  gitTool,
  ToolRegistry,
  defaultTools
};
//# sourceMappingURL=chunk-SNADWOAV.js.map