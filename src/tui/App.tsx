import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Text, Static, useApp, useInput } from 'ink';
import type { SkyConfig } from '../config/index.js';
import type { Logger } from '../logging/index.js';
import type { Session, Mode } from '../session/types.js';
import type { SessionStore } from '../session/store.js';
import type { AnySessionStore } from '../session/create-store.js';
import {
  compactSessionMessages,
  estimateMessageTokens,
  contextBudget,
} from '../session/compact.js';
import type { Provider } from '../llm/types.js';
import type { ToolRegistry } from '../tools/index.js';
import { Policy } from '../safety/policy.js';
import { AuditLog } from '../safety/audit.js';
import { Approver, type Prompter, type ApprovalAnswer, type ApprovalPromptRequest } from '../safety/approver.js';
import { AgentLoop } from '../agent/loop.js';
import { SkyError } from '../errors/index.js';
import { writeConfig, writeSecret, clearSecret, providerAuthSetupCard, hasApiKey, formatKeysDashboard, isKeylessProvider } from '../config/index.js';
import { PluginManager, runPluginCommand, applyCommandArgs, type LoadedPlugin, type PluginCommand } from '../plugins/index.js';
import type { Skill } from '../skills/index.js';
import {
  getSuggestions,
  parseInput,
  SLASH_COMMANDS,
  modelsForProvider,
  paletteWindow,
  providersForPalette,
  type Suggestion,
} from './commands.js';
import { pluginForCommand, pluginForMcpTool, pluginStatusColor, pluginStatusText } from './plugin-status.js';
import {
  resolveDaemonTransport,
  createDaemonSession,
  streamDaemonMessage,
  abortDaemonSession,
} from '../cli/client.js';
import { applyTextDelta, supportsLiveStreamRewrite } from './stream.js';

export interface AppProps {
  /** Lazily create a provider by name so a config error (e.g. missing API key)
   *  shows as an in-UI error instead of preventing the TUI from mounting, and so
   *  `/provider` can switch providers live. */
  makeProvider: (providerName: string, model?: string) => Provider;
  registry: ToolRegistry;
  session: Session;
  store: SessionStore | AnySessionStore;
  config: SkyConfig;
  logger: Logger;
  force?: boolean;
  yolo?: boolean;
  initialPrompt?: string;
  /** Plugins auto-loaded at startup; their commands appear in the palette. */
  plugins?: LoadedPlugin[];
  /** Skills loaded from ~/.sky/skills and project paths. */
  skills?: Skill[];
  /** Run turns against a Sky daemon over SSE instead of in-process AgentLoop. */
  attach?: boolean;
  attachUrl?: string;
  attachToken?: string;
}

type LogKind = 'user' | 'assistant' | 'tool' | 'tool-result' | 'system' | 'error';
interface LogItem {
  id: number;
  kind: LogKind;
  text: string;
  ok?: boolean;
}

const GLYPH = '⬢';
const MODE_COLOR: Record<Mode, string> = { agent: 'cyan', plan: 'magenta', ask: 'green' };

export function App(props: AppProps): React.ReactElement {
  const { exit } = useApp();
  const { registry, store, config } = props;
  /** Mutable current session — replaced by `/new` without remounting the TUI. */
  const sessionRef = useRef<Session>(props.session);
  const session = sessionRef.current;
  const [sessionId, setSessionId] = useState(props.session.id);
  const [provider, setProvider] = useState<Provider | null>(null);
  /** Display name — must not rely on adapter.name (stale after failed switches). */
  const [providerName, setProviderName] = useState(session.provider);

  const [log, setLog] = useState<LogItem[]>([]);
  const [streaming, setStreaming] = useState('');
  const [input, setInput] = useState('');
  const [selected, setSelected] = useState(0);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<Mode>(session.mode);
  const [model, setModel] = useState(session.model);
  const [contextFill, setContextFill] = useState(() => estimateMessageTokens(session.messages));
  const [costUsd, setCostUsd] = useState(session.tokenUsage.estimatedCostUsd);
  const [showCost, setShowCost] = useState(Boolean(config.tui.theme.layout.showCost));
  const [filesEdited, setFilesEdited] = useState(0);
  const [approval, setApproval] = useState<{ request: ApprovalPromptRequest; resolve: (a: ApprovalAnswer) => void } | null>(null);
  /** Session YOLO — `/yolo` toggles; seeded only from CLI `--yolo` (not `--force`). */
  const [yolo, setYolo] = useState(Boolean(props.yolo));
  const yoloRef = useRef(yolo);
  yoloRef.current = yolo;

  const idRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const policyRef = useRef(new Policy(config, session.sessionAllowlist));
  const auditRef = useRef(new AuditLog({ logger: props.logger }));
  const pluginManagerRef = useRef(new PluginManager({ logger: props.logger }));
  const [plugins, setPlugins] = useState<LoadedPlugin[]>(props.plugins ?? []);
  const [activePlugin, setActivePlugin] = useState<string | null>(null);
  /** Brief flash after reload so new plugins are obvious in the status bar. */
  const [pluginsJustReloaded, setPluginsJustReloaded] = useState(false);
  const pluginFlashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attachTransportRef = useRef<{ url: string; token: string } | null>(null);
  const remoteSessionIdRef = useRef<string | null>(props.attach ? null : session.id);
  const [attachReady, setAttachReady] = useState(!props.attach);
  /** Termux cannot rewrite live stream lines — commit once at turn-end instead. */
  const liveStreamRef = useRef(supportsLiveStreamRewrite());

  // Flatten plugin-contributed commands for the palette and for execution.
  const pluginCommands = useMemo<PluginCommand[]>(() => plugins.flatMap((p) => p.commands), [plugins]);
  const extraCommands = useMemo(
    () => pluginCommands.map((c) => ({ name: c.name, description: c.description })),
    [pluginCommands],
  );

  const tokenLimits = useMemo(
    () => (provider ? provider.tokenLimits(model) : { contextWindow: 128_000, maxOutput: 4096 }),
    [provider, model],
  );
  const contextBudgetTokens = useMemo(() => contextBudget(tokenLimits), [tokenLimits]);
  const modelSuggestions = useMemo(
    () => modelsForProvider(providerName, model),
    [providerName, model],
  );
  const providerSuggestions = useMemo(
    () => providersForPalette(config.providers),
    [config.providers],
  );
  const suggestions =
    busy || approval
      ? []
      : getSuggestions(input, {
          modelSuggestions,
          providerSuggestions,
          extraCommands,
          provider: providerName,
        });
  const paletteOpen = suggestions.length > 0;
  const clampedSelected = suggestions.length ? Math.min(selected, suggestions.length - 1) : 0;

  const pushLog = (kind: LogKind, text: string, ok?: boolean): void => {
    setLog((prev) => [...prev, { id: idRef.current++, kind, text, ok }]);
  };

  // The interactive approval prompter: shows the modal and resolves on keypress.
  const prompter: Prompter = (request) =>
    new Promise<ApprovalAnswer>((resolve) => setApproval({ request, resolve }));

  /** Build the provider for a given name, updating state; shows errors in-UI. */
  function buildProvider(name: string, opts: { quiet?: boolean } = {}): Provider | null {
    try {
      const created = props.makeProvider(name, sessionRef.current.model);
      setProvider(created);
      return created;
    } catch (error) {
      setProvider(null);
      if (opts.quiet) return null;
      const skyError = SkyError.from(error);
      // Rich setup card for *-web / custom — avoid a cryptic one-liner loop.
      if (skyError.code === 'SKY-E-1002') {
        pushLog('error', skyError.toUserMessage());
        pushLog('system', providerAuthSetupCard(name));
      } else {
        pushLog('error', `${skyError.toUserMessage()} — set a key with /key <value> or /keys.`);
      }
      return null;
    }
  }

  /** Switch provider + default model, persist, rebuild adapter. */
  function switchProvider(target: string, opts: { announce?: boolean } = {}): boolean {
    const live = sessionRef.current;
    const announce = opts.announce !== false;
    setProvider(null); // drop stale adapter so status never shows the old name
    live.provider = target;
    setProviderName(target);
    config.defaultProvider = target;

    const providerDefaultModel = config.providers[target]?.defaultModel;
    if (providerDefaultModel) {
      live.model = providerDefaultModel;
      setModel(providerDefaultModel);
    } else if (target === 'qwen-web') {
      live.model = 'qwen-plus';
      setModel('qwen-plus');
    } else if (target === 'zai-web') {
      live.model = 'glm-4.5-flash';
      setModel('glm-4.5-flash');
    } else if (target === 'kimi-web') {
      live.model = 'kimi-k2.5';
      setModel('kimi-k2.5');
    } else if (target === 'opencode') {
      live.model = 'deepseek-v4-flash-free';
      setModel('deepseek-v4-flash-free');
    }

    store.save(live);
    try {
      writeConfig(config);
    } catch (error) {
      pushLog('error', `Could not persist provider: ${(error as Error).message}`);
    }

    const built = buildProvider(target);
    if (announce) {
      if (built) {
        pushLog(
          'system',
          target === 'opencode'
            ? `Provider → opencode (keyless free · model ${live.model})`
            : `Provider → ${target} (ready · model ${live.model})`,
        );
      } else if (!hasApiKey(target, config.providers[target])) {
        pushLog('system', `Provider → ${target} (waiting for key · /keys set ${target} <key>)`);
      }
    }
    return Boolean(built);
  }

  /** Reuse the current provider or build one for the active session provider. */
  function ensureProvider(): Provider | null {
    if (provider && provider.name === providerName) return provider;
    return buildProvider(providerName);
  }

  async function runAgent(prompt: string, opts: { activePlugin?: string | null } = {}): Promise<void> {
    if (props.attach) {
      await runAgentAttached(prompt, opts);
      return;
    }

    const activeProvider = ensureProvider();
    if (!activeProvider) return; // provider unavailable; error already shown
    const live = sessionRef.current;
    if (opts.activePlugin) setActivePlugin(opts.activePlugin);
    setBusy(true);
    const abort = new AbortController();
    abortRef.current = abort;
    const approver = new Approver({
      policy: policyRef.current,
      audit: auditRef.current,
      prompter,
      logger: props.logger,
      // force skips prompts; yolo also bypasses tool predicates — keep distinct.
      force: Boolean(props.force) || yoloRef.current,
      yolo: yoloRef.current,
    });
    const loop = new AgentLoop({
      provider: activeProvider,
      registry,
      approver,
      policy: policyRef.current,
      session: live,
      store,
      config,
      logger: props.logger,
      signal: abort.signal,
      skills: props.skills,
    });

    let streamed = '';
    try {
      for await (const event of loop.run(prompt)) {
        switch (event.type) {
          case 'text-delta':
            streamed = applyTextDelta(streamed, event.text);
            if (liveStreamRef.current) setStreaming(streamed);
            break;
          case 'tool-call': {
            pushLog('tool', `${GLYPH} ${event.toolCall.name} ${summarize(event.toolCall.input)}`);
            const fromMcp = pluginForMcpTool(plugins, event.toolCall.name);
            if (fromMcp) setActivePlugin(fromMcp);
            break;
          }
          case 'tool-result':
            pushLog('tool-result', firstLine(event.output), event.ok);
            if (event.ok && (event.toolName === 'write' || event.toolName === 'edit')) {
              setFilesEdited((n) => n + 1);
            }
            break;
          case 'session-compacted':
            setContextFill(estimateMessageTokens(live.messages));
            pushLog(
              'system',
              event.dropped > 0
                ? `Auto-compacted ${event.dropped} messages (${event.reason}) · ${event.remaining} kept`
                : `Auto-compacted tool payloads (${event.reason}) · context reclaimed`,
            );
            break;
          case 'usage':
            setContextFill(estimateMessageTokens(live.messages));
            setCostUsd(live.tokenUsage.estimatedCostUsd);
            break;
          case 'turn-end':
            setContextFill(estimateMessageTokens(live.messages));
            if (streamed.trim()) pushLog('assistant', streamed.trim());
            streamed = '';
            setStreaming('');
            break;
          case 'error':
            if (streamed.trim()) {
              pushLog('assistant', streamed.trim());
              streamed = '';
              setStreaming('');
            }
            setContextFill(estimateMessageTokens(live.messages));
            pushLog('error', event.error.toUserMessage());
            break;
          default:
            break;
        }
      }
    } finally {
      setBusy(false);
      setActivePlugin(null);
      abortRef.current = null;
    }
  }

  /** Daemon SSE path for `sky --attach` — same UI event handling, remote loop. */
  async function runAgentAttached(prompt: string, opts: { activePlugin?: string | null } = {}): Promise<void> {
    const transport = attachTransportRef.current;
    const remoteId = remoteSessionIdRef.current;
    if (!transport || !remoteId) {
      pushLog('error', 'Daemon attach not ready. Is `sky daemon start` running?');
      return;
    }
    if (opts.activePlugin) setActivePlugin(opts.activePlugin);
    setBusy(true);
    const abort = new AbortController();
    abortRef.current = abort;
    let streamed = '';
    try {
      for await (const event of streamDaemonMessage({
        url: transport.url,
        token: transport.token,
        sessionId: remoteId,
        prompt,
        yolo: yoloRef.current,
        force: Boolean(props.force) || yoloRef.current,
        signal: abort.signal,
        onApproval: (req) =>
          new Promise<ApprovalAnswer>((resolve) =>
            setApproval({
              request: {
                toolName: req.toolName,
                input: req.input,
                reason: req.reason,
                diff: req.diff,
              },
              resolve,
            }),
          ),
      })) {
        const type = (event as { type?: string }).type;
        switch (type) {
          case 'text-delta': {
            const text = (event as { text?: string }).text ?? '';
            streamed = applyTextDelta(streamed, text);
            if (liveStreamRef.current) setStreaming(streamed);
            break;
          }
          case 'tool-call': {
            const toolCall = (event as { toolCall?: { name: string; input: Record<string, unknown> } }).toolCall;
            if (toolCall) {
              pushLog('tool', `${GLYPH} ${toolCall.name} ${summarize(toolCall.input)}`);
              const fromMcp = pluginForMcpTool(plugins, toolCall.name);
              if (fromMcp) setActivePlugin(fromMcp);
            }
            break;
          }
          case 'tool-result': {
            const ev = event as { output?: string; ok?: boolean; toolName?: string };
            pushLog('tool-result', firstLine(ev.output ?? ''), ev.ok);
            if (ev.ok && (ev.toolName === 'write' || ev.toolName === 'edit')) {
              setFilesEdited((n) => n + 1);
            }
            break;
          }
          case 'usage':
            // Metadata only — do not commit assistant text (turn-end does that).
            break;
          case 'turn-end':
          case 'done':
            if (streamed.trim()) pushLog('assistant', streamed.trim());
            streamed = '';
            setStreaming('');
            break;
          case 'error': {
            if (streamed.trim()) {
              pushLog('assistant', streamed.trim());
              streamed = '';
              setStreaming('');
            }
            const msg =
              (event as { message?: string; error?: { message?: string } }).message ??
              (event as { error?: { toUserMessage?: () => string } }).error?.toUserMessage?.() ??
              'daemon error';
            pushLog('error', String(msg));
            break;
          }
          default:
            break;
        }
      }
    } catch (error) {
      if (!(error instanceof Error && error.name === 'AbortError')) {
        pushLog('error', (error as Error).message);
      }
    } finally {
      setBusy(false);
      setActivePlugin(null);
      abortRef.current = null;
    }
  }

  function executeSlash(name: string, arg?: string): void {
    const live = sessionRef.current;
    switch (name) {
      case 'help':
        pushLog(
          'system',
          [
            'Sky commands',
            '  /help /status /keys /mode /model /provider /key /cost /diff /plugin',
            '  /compact /new /yolo /clear /exit',
            '  /yolo [on|off|toggle]  auto-approve tools this session (not the same as typing "yolo")',
            '  /new                start a fresh session (keeps previous on disk)',
            '  /compact            trim old turns to reclaim context',
            '  /provider free      keyless OpenCode free models (no API key)',
            '  /keys               API key dashboard — list / set / clear / use',
            '  /key <api-key>      save key for current provider (~/.sky/secrets.json)',
            '  /key clear          remove the stored key for the current provider',
            '  /cost [on|off]      show usage; on/off keeps ~$cost in the status bar',
            '  /plugin marketplace add <owner/repo> · install <name@market> · search <q>',
            'Keys: type / for palette · ↑/↓ · Tab/Enter · Esc clears · Enter submits',
            '      Ctrl+C cancels a running turn · Ctrl+C on empty input or Ctrl+D quits',
            'Start with auto-approve: sky --yolo   or   sky yolo',
            'Auto-compact runs when context fills (~70%) or on overflow — long sessions OK.',
            'Long audits: sessions.maxIterations (default 60); turn soft-stops with a summary if hit.',
          ].join('\n'),
        );
        break;
      case 'clear':
        setLog([]);
        break;
      case 'yolo': {
        const flag = (arg ?? 'toggle').trim().toLowerCase();
        let next = yolo;
        if (flag === 'on' || flag === 'enable' || flag === '1') next = true;
        else if (flag === 'off' || flag === 'disable' || flag === '0') next = false;
        else if (flag === 'toggle' || flag === '') next = !yolo;
        else {
          pushLog(
            'system',
            `YOLO is ${yolo ? 'ON' : 'OFF'} (auto-approve tools).\nUsage: /yolo on | /yolo off | /yolo toggle\nOr start with: sky --yolo   /   sky yolo\nTyping "yolo" as a chat message does not enable this.`,
          );
          break;
        }
        setYolo(next);
        yoloRef.current = next;
        pushLog(
          'system',
          next
            ? 'YOLO ON — tools auto-approved this session (hard denylist still applies). /yolo off to restore prompts.'
            : 'YOLO OFF — tools will ask for approval again.',
        );
        break;
      }
      case 'new':
      case 'reset': {
        if (busy) {
          pushLog('system', 'Finish or cancel the current turn (Ctrl+C), then /new.');
          break;
        }
        store.setStatus(live, 'paused');
        const next = store.create({
          mode: live.mode,
          cwd: live.cwd,
          provider: providerName,
          model,
        });
        sessionRef.current = next;
        policyRef.current = new Policy(config, next.sessionAllowlist);
        setSessionId(next.id);
        setLog([]);
        setStreaming('');
        setContextFill(0);
        setCostUsd(0);
        setFilesEdited(0);
        if (props.attach && attachTransportRef.current) {
          void createDaemonSession(attachTransportRef.current, {
            mode: next.mode,
            cwd: next.cwd,
            provider: next.provider,
            model: next.model,
          })
            .then((remote) => {
              remoteSessionIdRef.current = remote.id;
              pushLog(
                'system',
                `New session ${next.id.slice(0, 8)} (daemon ${remote.id.slice(0, 8)}) · previous ${live.id.slice(0, 8)} saved.`,
              );
            })
            .catch((error) => {
              pushLog('error', `Daemon /new failed: ${(error as Error).message}`);
            });
        } else {
          pushLog(
            'system',
            `New session ${next.id.slice(0, 8)} · previous ${live.id.slice(0, 8)} saved. Resume with: sky resume ${live.id.slice(0, 8)}`,
          );
        }
        break;
      }
      case 'exit':
        store.setStatus(live, 'paused');
        exit();
        break;
      case 'mode':
        if (arg === 'agent' || arg === 'plan' || arg === 'ask') {
          live.mode = arg;
          store.save(live);
          setMode(arg);
          pushLog('system', `Mode → ${arg}`);
        } else {
          pushLog('system', 'Usage: /mode [agent|plan|ask]');
        }
        break;
      case 'model':
        if (arg) {
          live.model = arg;
          store.save(live);
          setModel(arg);
          buildProvider(providerName); // rebuild so token limits/pricing update
          pushLog('system', `Model → ${arg}`);
        } else {
          pushLog('system', 'Usage: /model <name>');
        }
        break;
      case 'provider': {
        const available = providersForPalette(config.providers);
        // `/provider free` → keyless OpenCode Zen free models.
        const target = !arg ? '' : arg.trim() === 'free' ? 'opencode' : arg.trim();
        if (target && (available.includes(target) || available.includes(arg!.trim()) || target === 'opencode')) {
          if (target === 'custom' && !config.providers.custom?.baseUrl) {
            pushLog('system', providerAuthSetupCard('custom'));
            break;
          }
          switchProvider(target);
        } else {
          pushLog(
            'system',
            [
              `Current provider: ${providerName}.`,
              'Usage: /provider <name>   or   /provider free  (keyless OpenCode)',
              `Available: ${available.join(', ')}`,
            ].join('\n'),
          );
        }
        break;
      }
      case 'keys':
      case 'auth': {
        void runKeysSlash(arg ?? '');
        break;
      }
      case 'key': {
        const value = arg?.trim();
        if (!value) {
          pushLog('system', 'Usage: /key <api-key>  ·  /key clear  ·  or open /keys');
          break;
        }
        const name = providerName;
        if (value.toLowerCase() === 'clear') {
          clearSecret(name);
          if (config.providers[name]?.apiKey) {
            delete config.providers[name].apiKey;
            try {
              writeConfig(config);
            } catch {
              /* ignore */
            }
          }
          pushLog('system', `Cleared stored key for ${name}.`);
          buildProvider(name);
          break;
        }
        // Prefer secrets file (0600) — never write plaintext apiKey into config.json.
        try {
          writeSecret(name, value);
          const envHint =
            config.providers[name]?.apiKeyEnv ??
            `${name.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_API_KEY`;
          config.providers[name] = {
            ...(config.providers[name] ?? {}),
            apiKeyEnv: config.providers[name]?.apiKeyEnv ?? envHint,
          };
          delete config.providers[name].apiKey;
          writeConfig(config);
        } catch (error) {
          pushLog('error', `Could not persist key: ${(error as Error).message}`);
          break;
        }
        const built = buildProvider(name);
        pushLog(
          'system',
          built
            ? `API key saved securely for ${name}. Ready — send your message. (/keys to manage)`
            : `Key saved but ${name} still failed to initialize.`,
        );
        break;
      }
      case 'status': {
        const mcpCount = config.mcp.servers.length;
        const toolCount = registry.list().length;
        const skillCount = props.skills?.length ?? 0;
        const pluginCount = plugins.length;
        const fill = estimateMessageTokens(live.messages);
        const budget = contextBudgetTokens || 1;
        pushLog(
          'system',
          [
            `session ${live.id.slice(0, 8)} · ${mode} · ${providerName}:${model}${yolo ? ' · YOLO' : ''}`,
            `cwd ${live.cwd}`,
            `tools ${toolCount} · plugins ${pluginCount}${pluginCount ? ` (${plugins.map((p) => p.name).join(', ')})` : ''} · skills ${skillCount} · mcp servers ${mcpCount}`,
            `context ~${fill}/${budget} tok (${Math.min(100, (fill / budget) * 100).toFixed(1)}%) · lifetime ${live.tokenUsage.input} in / ${live.tokenUsage.output} out · ~$${live.tokenUsage.estimatedCostUsd.toFixed(4)}`,
            `auto-compact: ${config.sessions.autoCompact ? 'on' : 'off'} (ratio ${config.sessions.autoCompactRatio} · threshold ${config.sessions.autoCompactThreshold})`,
            `approvals: ${yolo ? 'YOLO (auto-approve) — /yolo off to prompt' : 'prompt — /yolo on to auto-approve'}`,
            activePlugin ? `active plugin: ${activePlugin}` : 'no plugin active this turn',
            live.lastTurnInterrupted ? '⚠ last turn was interrupted — history may be incomplete' : 'session healthy',
          ].join('\n'),
        );
        break;
      }
      case 'cost': {
        const usageLine = `Tokens: ${live.tokenUsage.input} in / ${live.tokenUsage.output} out · ~$${live.tokenUsage.estimatedCostUsd.toFixed(4)}`;
        const flag = (arg ?? '').trim().toLowerCase();
        if (!flag) {
          pushLog(
            'system',
            `${usageLine}\nStatus-bar cost: ${showCost ? 'ON' : 'OFF'} — /cost on | /cost off | /cost toggle`,
          );
          break;
        }
        let next = showCost;
        if (flag === 'on' || flag === 'show' || flag === 'always') next = true;
        else if (flag === 'off' || flag === 'hide') next = false;
        else if (flag === 'toggle') next = !showCost;
        else {
          pushLog('system', `${usageLine}\nUsage: /cost [on|off|toggle]`);
          break;
        }
        setShowCost(next);
        setCostUsd(live.tokenUsage.estimatedCostUsd);
        config.tui.theme.layout.showCost = next;
        try {
          writeConfig(config);
        } catch (error) {
          pushLog('error', `Could not persist cost preference: ${(error as Error).message}`);
        }
        pushLog(
          'system',
          next
            ? `${usageLine}\nStatus-bar cost: ON (always visible). /cost off to hide.`
            : `${usageLine}\nStatus-bar cost: OFF. /cost on to show always.`,
        );
        break;
      }
      case 'diff':
        pushLog('system', `${filesEdited} file(s) edited this session. Run \`git diff\` to review.`);
        break;
      case 'compact': {
        if (live.messages.filter((m) => m.role !== 'system').length <= 4) {
          pushLog('system', 'Nothing to compact yet.');
          break;
        }
        const result = compactSessionMessages(live.messages, {
          keepRecent: 6,
          stubToolResults: true,
          reason: 'manual',
        });
        live.messages = result.messages;
        store.save(live);
        setContextFill(estimateMessageTokens(live.messages));
        pushLog(
          'system',
          result.dropped > 0
            ? `Compacted ${result.dropped} messages. Context reclaimed.`
            : 'Stubbed large tool results. Context reclaimed.',
        );
        break;
      }
      case 'plugin':
        void runPluginSlash(arg ?? '');
        break;
      default: {
        // A plugin-contributed command? Run its prompt template as a turn.
        const pluginCommand = pluginCommands.find((c) => c.name === name);
        if (pluginCommand) {
          const prompt = applyCommandArgs(pluginCommand.body, arg ?? '');
          const owner = pluginForCommand(plugins, name);
          pushLog(
            'system',
            owner
              ? `Running plugin command /${name}${arg ? ` ${arg}` : ''}  [${owner}]`
              : `Running plugin command /${name}${arg ? ` ${arg}` : ''}`,
          );
          void runAgent(prompt, { activePlugin: owner });
          break;
        }
        // Bare plugin name (e.g. `/ponytail` with only namespaced cmds) → list them.
        const prefixed = pluginCommands.filter((c) => c.name.startsWith(`${name}:`));
        if (prefixed.length > 0) {
          pushLog(
            'system',
            [
              `Plugin commands for "${name}":`,
              ...prefixed.map((c) => `  /${c.name}${c.description ? ` — ${c.description}` : ''}`),
              'Type the full command (or pick it from the / palette).',
            ].join('\n'),
          );
          break;
        }
        pushLog('error', `Unknown command: /${name}`);
        break;
      }
    }
  }

  /** Reload installed plugins so their commands + MCP servers apply immediately. */
  function reloadPlugins(): LoadedPlugin[] {
    const loaded = pluginManagerRef.current.load();
    setPlugins(loaded);
    setPluginsJustReloaded(true);
    // Brief highlight in the status bar so reloads are visible without reading logs.
    if (pluginFlashTimer.current) clearTimeout(pluginFlashTimer.current);
    pluginFlashTimer.current = setTimeout(() => setPluginsJustReloaded(false), 2500);
    // Merge any new MCP servers from plugins into config
    for (const plugin of loaded) {
      for (const server of plugin.mcpServers) {
        if (!config.mcp.servers.some((s) => s.name === server.name)) {
          config.mcp.servers.push({ ...server, approvalMode: 'manual' });
        }
      }
    }
    // Persist updated config with newly added MCP servers to disk
    try {
      writeConfig(config);
    } catch (error) {
      pushLog('error', `Could not persist plugin MCP servers: ${(error as Error).message}`);
    }
    return loaded;
  }

  async function runKeysSlash(argString: string): Promise<void> {
    const parts = argString.trim().split(/\s+/).filter(Boolean);
    const action = (parts[0] ?? 'list').toLowerCase();

    if (action === 'list' || action === 'ls' || action === 'status') {
      pushLog('system', formatKeysDashboard(config.providers, process.env, providerName));
      return;
    }

    if (action === 'set' || action === 'add') {
      const name = parts[1];
      const key = parts.slice(2).join(' ').trim();
      if (!name || !key) {
        pushLog('system', 'Usage: /keys set <provider> <api-key>');
        return;
      }
      try {
        writeSecret(name, key);
        config.providers[name] = {
          ...(config.providers[name] ?? {}),
          apiKeyEnv:
            config.providers[name]?.apiKeyEnv ??
            `${name.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_API_KEY`,
        };
        delete config.providers[name].apiKey;
        writeConfig(config);
        pushLog('system', `Saved key for ${name} (${key.slice(0, 4)}…).`);
        if (name === providerName) buildProvider(name);
        else pushLog('system', `Switch to it with /keys use ${name}  or  /provider ${name}`);
      } catch (error) {
        pushLog('error', `Could not save key: ${(error as Error).message}`);
      }
      return;
    }

    if (action === 'clear' || action === 'remove' || action === 'rm') {
      const name = parts[1] ?? providerName;
      clearSecret(name);
      if (config.providers[name]?.apiKey) {
        delete config.providers[name].apiKey;
        try {
          writeConfig(config);
        } catch {
          /* ignore */
        }
      }
      pushLog('system', `Cleared stored key for ${name}.`);
      if (name === providerName) buildProvider(name);
      return;
    }

    if (action === 'use' || action === 'switch') {
      const name = parts[1] === 'free' ? 'opencode' : parts[1];
      if (!name) {
        pushLog('system', 'Usage: /keys use <provider|free>');
        return;
      }
      switchProvider(name);
      return;
    }

    pushLog(
      'system',
      [
        formatKeysDashboard(config.providers, process.env, providerName),
        '',
        'Usage: /keys [list|set|clear|use] …',
      ].join('\n'),
    );
  }

  async function runPluginSlash(argString: string): Promise<void> {
    const args = argString.trim().split(/\s+/).filter(Boolean);
    pushLog('system', `plugin ${args.join(' ')}…`);
    try {
      const lines = await runPluginCommand(args, pluginManagerRef.current);
      for (const line of lines) pushLog('system', line);

      // Auto-reload after any state-changing operation so new commands appear now.
      const action = args[0];
      if (action && ['install', 'uninstall', 'remove', 'marketplace'].includes(action)) {
        const loaded = reloadPlugins();
        const names = loaded.map((p) => p.name).join(', ') || 'none';
        const commandList = loaded.flatMap((p) => p.commands.map((c) => `/${c.name}`)).join(', ') || 'none';
        pushLog('system', `Reloaded — ${loaded.length} plugin(s): ${names}\nCommands: ${commandList}`);
      } else if (!action) {
        // No subcommand given (e.g. just `/plugin`) — still reload to show current state
        const loaded = reloadPlugins();
        const names = loaded.map((p) => p.name).join(', ') || 'none';
        const commandList = loaded.flatMap((p) => p.commands.map((c) => `/${c.name}`)).join(', ') || 'none';
        pushLog('system', `Reloaded — ${loaded.length} plugin(s): ${names}\nCommands: ${commandList}`);
      }
    } catch (error) {
      pushLog('error', error instanceof Error ? error.message : String(error));
    }
  }

  function acceptSuggestion(suggestion: Suggestion): void {
    if (suggestion.kind === 'command') {
      const cmd = SLASH_COMMANDS.find((c) => c.name === suggestion.value);
      if (cmd?.args) {
        setInput(`/${suggestion.value} `);
        setSelected(0);
      } else {
        executeSlash(suggestion.value);
        setInput('');
      }
    } else {
      const parsed = parseInput(input);
      executeSlash(parsed.command, suggestion.value);
      setInput('');
    }
  }

  function submit(): void {
    const text = input.trim();
    if (!text) return;
    if (text.startsWith('/')) {
      const parsed = parseInput(text);
      executeSlash(parsed.command, parsed.hasSpace ? parsed.arg : undefined);
      setInput('');
      return;
    }
    if (props.attach && !attachReady) {
      pushLog('system', 'Still connecting to daemon…');
      return;
    }
    pushLog('user', text);
    setInput('');
    void runAgent(text);
  }

  useInput((char, key) => {
    // Approval modal takes priority.
    if (approval) {
      const answer = key.return ? 'yes' : char?.toLowerCase();
      let resolved: ApprovalAnswer | null = null;
      if (answer === 'y' || key.return) resolved = 'yes';
      else if (answer === 'n' || key.escape) resolved = 'no';
      else if (answer === 'a') resolved = 'always';
      else if (answer === 'e') {
        // Inline edit is not supported yet — decline so the user can rephrase.
        resolved = 'no';
        pushLog('system', 'Inline edit is not available; declined. Re-send with the change you want.');
      }
      if (resolved) {
        approval.resolve(resolved);
        setApproval(null);
      }
      return;
    }

    if (busy) {
      if (key.ctrl && char === 'c') {
        abortRef.current?.abort();
        const transport = attachTransportRef.current;
        const remoteId = remoteSessionIdRef.current;
        if (props.attach && transport && remoteId) {
          void abortDaemonSession(transport, remoteId);
        }
      }
      return;
    }

    if (key.ctrl && char === 'c') {
      if (input) setInput('');
      else {
        store.setStatus(session, 'paused');
        exit();
      }
      return;
    }
    if (key.ctrl && char === 'd') {
      store.setStatus(session, 'paused');
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
    // PageUp / PageDown — Termux soft-key row sends these.
    if (paletteOpen && key.pageUp) {
      setSelected((s) => Math.max(0, s - 10));
      return;
    }
    if (paletteOpen && key.pageDown) {
      setSelected((s) => Math.min(Math.max(0, suggestions.length - 1), s + 10));
      return;
    }
    if (paletteOpen && key.tab) {
      acceptSuggestion(suggestions[clampedSelected]);
      return;
    }
    if (key.return) {
      if (paletteOpen) {
        const typed = parseInput(input).command;
        const exact = suggestions.find((s) => s.kind === 'command' && s.value === typed);
        const selectedSuggestion = suggestions[clampedSelected];
        // Prefer an exact match for what the user typed (e.g. `/ponytail` over
        // `/ponytail:ponytail`). If the only hits are namespaced children of a
        // bare plugin name, submit the typed token so we can list them.
        if (exact) {
          acceptSuggestion(exact);
        } else if (
          selectedSuggestion?.kind === 'command' &&
          typed &&
          selectedSuggestion.value.startsWith(`${typed}:`)
        ) {
          submit();
        } else {
          acceptSuggestion(selectedSuggestion);
        }
      } else {
        submit();
      }
      return;
    }
    if (key.escape) {
      setInput('');
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
    let cancelled = false;
    async function boot(): Promise<void> {
      if (props.attach) {
        try {
          const transport = await resolveDaemonTransport({
            url: props.attachUrl,
            token: props.attachToken,
          });
          if (cancelled) return;
          attachTransportRef.current = transport;
          const remote = await createDaemonSession(transport, {
            mode: sessionRef.current.mode,
            cwd: sessionRef.current.cwd,
            provider: sessionRef.current.provider,
            model: sessionRef.current.model,
          });
          if (cancelled) return;
          remoteSessionIdRef.current = remote.id;
          setAttachReady(true);
          pushLog('system', `Attached to daemon ${transport.url} · session ${remote.id.slice(0, 8)}`);
        } catch (error) {
          pushLog('error', `Attach failed: ${(error as Error).message}`);
          setAttachReady(false);
          return;
        }
      } else {
        // If the session is stuck on a provider with no key (e.g. qwen-web), fall
        // back to keyless OpenCode so the user can chat immediately.
        const needsKey =
          !isKeylessProvider(providerName) && !hasApiKey(providerName, config.providers[providerName]);
        if (needsKey) {
          pushLog(
            'system',
            `${providerName} needs an API key. Switching to keyless OpenCode free models.\n` +
              `Use /keys to add a key later, or /provider ${providerName} after /keys set ${providerName} <key>.`,
          );
          switchProvider('opencode', { announce: true });
        } else {
          ensureProvider();
        }
      }

      if (props.initialPrompt) {
        pushLog('user', props.initialPrompt);
        void runAgent(props.initialPrompt);
      }
    }
    void boot();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pct =
    contextBudgetTokens > 0
      ? Math.min(100, (contextFill / contextBudgetTokens) * 100).toFixed(1)
      : '0.0';

  return (
    <Box flexDirection="column">
      <Static items={log}>{(item) => <LogLine key={item.id} item={item} />}</Static>

      {streaming ? <Text>{streaming}</Text> : null}
      {busy ? <Text color="yellow">{GLYPH} working… (Ctrl+C to cancel)</Text> : null}

      {approval ? (
        <ApprovalModal request={approval.request} />
      ) : (
        <Box flexDirection="column">
          {paletteOpen ? <Palette suggestions={suggestions} selected={clampedSelected} /> : null}
          <InputBox value={input} mode={mode} />
        </Box>
      )}

      <StatusBar
        mode={mode}
        provider={providerName}
        model={model}
        pct={pct}
        files={filesEdited}
        sessionId={sessionId}
        showCost={showCost}
        costUsd={costUsd}
        showTokenBar={config.tui.theme.layout.showTokenBar !== false}
        pluginNames={plugins.map((p) => p.name)}
        activePlugin={activePlugin}
        pluginsHighlight={pluginsJustReloaded}
        busy={busy}
        yolo={yolo}
      />
    </Box>
  );
}

function LogLine({ item }: { item: LogItem }): React.ReactElement {
  switch (item.kind) {
    case 'user':
      return (
        <Box marginTop={1}>
          <Text color="cyan" bold>
            › {item.text}
          </Text>
        </Box>
      );
    case 'assistant':
      return (
        <Box marginTop={1}>
          <Text>{item.text}</Text>
        </Box>
      );
    case 'tool':
      return <Text color="magenta">{item.text}</Text>;
    case 'tool-result':
      return <Text color={item.ok ? 'green' : 'red'}>{'  '}{GLYPH} {item.text}</Text>;
    case 'system':
      return <Text color="gray">{item.text}</Text>;
    case 'error':
      return <Text color="red">{GLYPH} {item.text}</Text>;
    default:
      return <Text>{item.text}</Text>;
  }
}

function Palette({ suggestions, selected }: { suggestions: Suggestion[]; selected: number }): React.ReactElement {
  // Scroll the visible window with the highlight so ↑/↓ reveals models past the
  // first page (Termux soft-keys previously appeared to "do nothing").
  const { visible, localSelected, hasAbove, hasBelow, start } = paletteWindow(suggestions, selected, 10);
  const total = suggestions.length;

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="gray" paddingX={1}>
      {hasAbove ? (
        <Text color="gray">  ↑ {start} more · ↑/↓ scroll · PgUp/PgDn</Text>
      ) : null}
      {visible.map((s, i) => {
        const active = i === localSelected;
        const prefix = active ? '❯ ' : '  ';
        if (s.kind === 'arg') {
          const tag = s.description ? `  ${s.description}` : '';
          return (
            <Box key={`${s.kind}:${s.value}:${start + i}`}>
              <Text color={active ? 'cyan' : undefined} bold={active}>
                {prefix}
                {s.label}
              </Text>
              {tag ? <Text color="gray">{tag}</Text> : null}
            </Box>
          );
        }
        return (
          <Box key={`${s.kind}:${s.value}:${start + i}`}>
            <Text color={active ? 'cyan' : undefined} bold={active}>
              {prefix}
              {s.label}
            </Text>
            <Text color="gray"> {s.description}</Text>
          </Box>
        );
      })}
      {hasBelow ? (
        <Text color="gray">
          {' '}
          ↓ {total - start - visible.length} more · {localSelected + start + 1}/{total}
        </Text>
      ) : total > visible.length ? (
        <Text color="gray">
          {' '}
          {localSelected + start + 1}/{total}
        </Text>
      ) : null}
    </Box>
  );
}

function InputBox({ value, mode }: { value: string; mode: Mode }): React.ReactElement {
  const placeholder =
    mode === 'ask'
      ? 'Ask about the codebase — or type / for commands'
      : mode === 'plan'
        ? 'Describe what to plan — or type / for commands'
        : 'Ask, build, or type / for commands';
  return (
    <Box borderStyle="round" borderColor={MODE_COLOR[mode]} paddingX={1}>
      <Text color={MODE_COLOR[mode]}>› </Text>
      {value ? <Text>{value}</Text> : <Text color="gray">{placeholder}</Text>}
      <Text color="gray">█</Text>
    </Box>
  );
}

function StatusBar({
  mode,
  provider,
  model,
  pct,
  files,
  sessionId,
  showCost,
  costUsd,
  showTokenBar,
  pluginNames,
  activePlugin,
  pluginsHighlight,
  busy,
  yolo,
}: {
  mode: Mode;
  provider: string;
  model: string;
  pct: string;
  files: number;
  sessionId: string;
  showCost: boolean;
  costUsd: number;
  showTokenBar: boolean;
  pluginNames: string[];
  activePlugin: string | null;
  pluginsHighlight: boolean;
  busy: boolean;
  yolo: boolean;
}): React.ReactElement {
  const pctColor = Number(pct) >= 95 ? 'red' : Number(pct) >= 90 ? 'yellow' : 'green';
  const costLabel = `~$${costUsd.toFixed(4)}`;
  const pluginColor = pluginStatusColor({
    activePlugin,
    pluginsHighlight,
    busy,
    hasPlugins: pluginNames.length > 0,
  });
  const pluginText = pluginStatusText(pluginNames, activePlugin);
  // Short model id for narrow Termux rows (avoid wrap splitting pl:ponytail).
  const modelShort = model.length > 24 ? `${model.slice(0, 22)}…` : model;

  return (
    <Box>
      <Text color={MODE_COLOR[mode]}>
        {GLYPH} {mode}
      </Text>
      {yolo ? <Text color="yellow"> · yolo</Text> : null}
      <Text color="gray"> · {provider}:{modelShort}</Text>
      {showTokenBar ? (
        <>
          <Text color="gray"> · </Text>
          <Text color={pctColor}>{pct}%</Text>
        </>
      ) : null}
      {showCost ? (
        <>
          <Text color="gray"> · </Text>
          <Text color="yellow">{costLabel}</Text>
        </>
      ) : null}
      <Text color="gray"> · {files} files</Text>
      <Text color="gray"> · </Text>
      <Text color={pluginColor} bold={pluginColor !== 'gray'}>
        {pluginText}
      </Text>
      <Text color="gray"> · {sessionId.slice(0, 5)}</Text>
    </Box>
  );
}

function ApprovalModal({ request }: { request: ApprovalPromptRequest }): React.ReactElement {
  const diffLines = request.diff ? request.diff.patch.split('\n').slice(0, 24) : [];
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="yellow" paddingX={1}>
      <Text color="yellow" bold>
        {GLYPH} Approve {request.toolName}? <Text color="gray">({request.reason})</Text>
      </Text>
      {request.diff ? (
        <Box flexDirection="column" marginTop={1}>
          {diffLines.map((line, i) => (
            <Text
              key={i}
              color={
                line.startsWith('+') && !line.startsWith('+++')
                  ? 'green'
                  : line.startsWith('-') && !line.startsWith('---')
                    ? 'red'
                    : line.startsWith('@@')
                      ? 'cyan'
                      : 'gray'
              }
            >
              {line}
            </Text>
          ))}
          <Text color="gray">
            {request.diff.added} added, {request.diff.removed} removed
          </Text>
        </Box>
      ) : (
        <Text color="gray">{summarize(request.input)}</Text>
      )}
      <Box marginTop={1}>
        <Text bold>[y]es [n]o [a]lways</Text>
        <Text color="gray"> · Esc to deny</Text>
      </Box>
    </Box>
  );
}

function summarize(input: Record<string, unknown>): string {
  if (typeof input.path === 'string') return input.path;
  if (typeof input.command === 'string') return input.command.slice(0, 80);
  if (typeof input.pattern === 'string') return `/${input.pattern}/`;
  if (typeof input.action === 'string') return String(input.action);
  return JSON.stringify(input).slice(0, 80);
}

function firstLine(text: string): string {
  const line = text.split('\n')[0];
  return line.length > 100 ? line.slice(0, 99) + '…' : line;
}
