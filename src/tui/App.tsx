import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Box, Text, Static, useApp, useInput } from 'ink';
import type { SkyConfig } from '../config/index.js';
import type { Logger } from '../logging/index.js';
import type { Session, Mode } from '../session/types.js';
import type { SessionStore } from '../session/store.js';
import type { Provider } from '../llm/types.js';
import type { ToolRegistry } from '../tools/index.js';
import { Policy } from '../safety/policy.js';
import { AuditLog } from '../safety/audit.js';
import { Approver, type Prompter, type ApprovalAnswer, type ApprovalPromptRequest } from '../safety/approver.js';
import { AgentLoop } from '../agent/loop.js';
import { SkyError } from '../errors/index.js';
import { writeConfig, writeSecret, clearSecret } from '../config/index.js';
import { PluginManager, runPluginCommand, applyCommandArgs, type LoadedPlugin, type PluginCommand } from '../plugins/index.js';
import type { Skill } from '../skills/index.js';
import {
  getSuggestions,
  parseInput,
  SLASH_COMMANDS,
  modelsForProvider,
  paletteWindow,
  PROVIDER_NAMES,
  type Suggestion,
} from './commands.js';

export interface AppProps {
  /** Lazily create a provider by name so a config error (e.g. missing API key)
   *  shows as an in-UI error instead of preventing the TUI from mounting, and so
   *  `/provider` can switch providers live. */
  makeProvider: (providerName: string) => Provider;
  registry: ToolRegistry;
  session: Session;
  store: SessionStore;
  config: SkyConfig;
  logger: Logger;
  force?: boolean;
  yolo?: boolean;
  initialPrompt?: string;
  /** Plugins auto-loaded at startup; their commands appear in the palette. */
  plugins?: LoadedPlugin[];
  /** Skills loaded from ~/.sky/skills and project paths. */
  skills?: Skill[];
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
  const { registry, session, store, config } = props;
  const [provider, setProvider] = useState<Provider | null>(null);

  const [log, setLog] = useState<LogItem[]>([]);
  const [streaming, setStreaming] = useState('');
  const [input, setInput] = useState('');
  const [selected, setSelected] = useState(0);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<Mode>(session.mode);
  const [model, setModel] = useState(session.model);
  const [tokenUsed, setTokenUsed] = useState(session.tokenUsage.input + session.tokenUsage.output);
  const [costUsd, setCostUsd] = useState(session.tokenUsage.estimatedCostUsd);
  const [showCost, setShowCost] = useState(Boolean(config.tui.theme.layout.showCost));
  const [filesEdited, setFilesEdited] = useState(0);
  const [approval, setApproval] = useState<{ request: ApprovalPromptRequest; resolve: (a: ApprovalAnswer) => void } | null>(null);

  const idRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const policyRef = useRef(new Policy(config, session.sessionAllowlist));
  const auditRef = useRef(new AuditLog({ logger: props.logger }));
  const pluginManagerRef = useRef(new PluginManager({ logger: props.logger }));
  const [plugins, setPlugins] = useState<LoadedPlugin[]>(props.plugins ?? []);

  // Flatten plugin-contributed commands for the palette and for execution.
  const pluginCommands = useMemo<PluginCommand[]>(() => plugins.flatMap((p) => p.commands), [plugins]);
  const extraCommands = useMemo(
    () => pluginCommands.map((c) => ({ name: c.name, description: c.description })),
    [pluginCommands],
  );

  const tokenLimit = useMemo(
    () => (provider ? provider.tokenLimits(model).contextWindow : 128_000),
    [provider, model],
  );
  const modelSuggestions = useMemo(
    () => modelsForProvider(session.provider, model),
    [session.provider, model],
  );
  const suggestions =
    busy || approval
      ? []
      : getSuggestions(input, { modelSuggestions, extraCommands, provider: session.provider });
  const paletteOpen = suggestions.length > 0;
  const clampedSelected = suggestions.length ? Math.min(selected, suggestions.length - 1) : 0;

  const pushLog = (kind: LogKind, text: string, ok?: boolean): void => {
    setLog((prev) => [...prev, { id: idRef.current++, kind, text, ok }]);
  };

  // The interactive approval prompter: shows the modal and resolves on keypress.
  const prompter: Prompter = (request) =>
    new Promise<ApprovalAnswer>((resolve) => setApproval({ request, resolve }));

  /** Build the provider for a given name, updating state; shows errors in-UI. */
  function buildProvider(name: string): Provider | null {
    try {
      const created = props.makeProvider(name);
      setProvider(created);
      return created;
    } catch (error) {
      setProvider(null);
      const skyError = SkyError.from(error);
      pushLog('error', `${skyError.toUserMessage()} — set a key with /key <value> or switch with /provider.`);
      return null;
    }
  }

  /** Reuse the current provider or build one for the active session provider. */
  function ensureProvider(): Provider | null {
    return provider ?? buildProvider(session.provider);
  }

  async function runAgent(prompt: string): Promise<void> {
    const activeProvider = ensureProvider();
    if (!activeProvider) return; // provider unavailable; error already shown
    setBusy(true);
    const abort = new AbortController();
    abortRef.current = abort;
    const approver = new Approver({
      policy: policyRef.current,
      audit: auditRef.current,
      prompter,
      logger: props.logger,
      force: props.force,
      yolo: props.yolo,
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
      signal: abort.signal,
      skills: props.skills,
    });

    let streamed = '';
    try {
      for await (const event of loop.run(prompt)) {
        switch (event.type) {
          case 'text-delta':
            streamed += event.text;
            setStreaming(streamed);
            break;
          case 'tool-call':
            pushLog('tool', `${GLYPH} ${event.toolCall.name} ${summarize(event.toolCall.input)}`);
            break;
          case 'tool-result':
            pushLog('tool-result', firstLine(event.output), event.ok);
            if (event.ok && (event.toolName === 'write' || event.toolName === 'edit')) {
              setFilesEdited((n) => n + 1);
            }
            break;
          case 'usage':
            setTokenUsed(session.tokenUsage.input + session.tokenUsage.output);
            setCostUsd(session.tokenUsage.estimatedCostUsd);
            break;
          case 'turn-end':
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
            pushLog('error', event.error.toUserMessage());
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

  function executeSlash(name: string, arg?: string): void {
    switch (name) {
      case 'help':
        pushLog(
          'system',
          [
            'Sky commands',
            '  /help /status /mode /model /provider /key /cost /diff /plugin /compact /clear /exit',
            '  /provider <name>   switch LLM provider (openai, anthropic, gemini, …)',
            '  /key <api-key>     save key to ~/.sky/secrets.json (mode 0600) and reload',
            '  /key clear         remove the stored key for the current provider',
            '  /cost [on|off]     show usage; on/off keeps ~$cost in the status bar',
            '  /plugin marketplace add <owner/repo> · install <name@market> · search <q>',
            'Keys: type / for palette · ↑/↓ · Tab/Enter · Esc clears · Enter submits',
            '      Ctrl+C cancels a running turn · Ctrl+C on empty input or Ctrl+D quits',
          ].join('\n'),
        );
        break;
      case 'clear':
        setLog([]);
        break;
      case 'exit':
        store.setStatus(session, 'paused');
        exit();
        break;
      case 'mode':
        if (arg === 'agent' || arg === 'plan' || arg === 'ask') {
          session.mode = arg;
          store.save(session);
          setMode(arg);
          pushLog('system', `Mode → ${arg}`);
        } else {
          pushLog('system', 'Usage: /mode [agent|plan|ask]');
        }
        break;
      case 'model':
        if (arg) {
          session.model = arg;
          store.save(session);
          setModel(arg);
          buildProvider(session.provider); // rebuild so token limits/pricing update
          pushLog('system', `Model → ${arg}`);
        } else {
          pushLog('system', 'Usage: /model <name>');
        }
        break;
      case 'provider':
        if (arg && PROVIDER_NAMES.includes(arg)) {
          session.provider = arg;
          config.defaultProvider = arg as typeof config.defaultProvider;
          const providerDefaultModel = config.providers[arg]?.defaultModel;
          if (providerDefaultModel) {
            session.model = providerDefaultModel;
            setModel(providerDefaultModel);
          }
          store.save(session);
          const built = buildProvider(arg);
          pushLog('system', `Provider → ${arg}${built ? ' (ready)' : ' — set a key with /key <value>'}`);
        } else {
          pushLog('system', `Current provider: ${session.provider}. Usage: /provider <${PROVIDER_NAMES.join('|')}>`);
        }
        break;
      case 'key': {
        const value = arg?.trim();
        if (!value) {
          pushLog('system', 'Usage: /key <api-key>   or   /key clear');
          break;
        }
        const providerName = session.provider;
        if (value.toLowerCase() === 'clear') {
          clearSecret(providerName);
          if (config.providers[providerName]?.apiKey) {
            delete config.providers[providerName].apiKey;
            try {
              writeConfig(config);
            } catch {
              /* ignore */
            }
          }
          pushLog('system', `Cleared stored key for ${providerName}.`);
          buildProvider(providerName);
          break;
        }
        // Prefer secrets file (0600) — never write plaintext apiKey into config.json.
        try {
          writeSecret(providerName, value);
          // Ensure config points at a conventional env name for documentation.
          const envHint =
            config.providers[providerName]?.apiKeyEnv ??
            `${providerName.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_API_KEY`;
          config.providers[providerName] = {
            ...(config.providers[providerName] ?? {}),
            apiKeyEnv: config.providers[providerName]?.apiKeyEnv ?? envHint,
          };
          // Strip any previously stored plaintext key.
          delete config.providers[providerName].apiKey;
          writeConfig(config);
        } catch (error) {
          pushLog('error', `Could not persist key: ${(error as Error).message}`);
          break;
        }
        const built = buildProvider(providerName);
        pushLog(
          'system',
          built
            ? `API key saved securely for ${providerName}. Ready — send your message.`
            : `Key saved but ${providerName} still failed to initialize.`,
        );
        break;
      }
      case 'status': {
        const mcpCount = config.mcp.servers.length;
        const toolCount = registry.list().length;
        const skillCount = props.skills?.length ?? 0;
        const pluginCount = plugins.length;
        pushLog(
          'system',
          [
            `session ${session.id.slice(0, 8)} · ${mode} · ${session.provider}:${model}`,
            `cwd ${session.cwd}`,
            `tools ${toolCount} · plugins ${pluginCount} · skills ${skillCount} · mcp servers ${mcpCount}`,
            `tokens ${session.tokenUsage.input} in / ${session.tokenUsage.output} out · ~$${session.tokenUsage.estimatedCostUsd.toFixed(4)}`,
            session.lastTurnInterrupted ? '⚠ last turn was interrupted — history may be incomplete' : 'session healthy',
          ].join('\n'),
        );
        break;
      }
      case 'cost': {
        const usageLine = `Tokens: ${session.tokenUsage.input} in / ${session.tokenUsage.output} out · ~$${session.tokenUsage.estimatedCostUsd.toFixed(4)}`;
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
        setCostUsd(session.tokenUsage.estimatedCostUsd);
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
      case 'compact':
        // Trigger by lowering effective history via a marker message the loop will compact next turn.
        if (session.messages.length > 4) {
          const keep = session.messages.slice(-6);
          const dropped = session.messages.length - keep.length;
          session.messages = [
            { role: 'user', content: `[compacted ${dropped} earlier messages]` },
            ...keep,
          ];
          store.save(session);
          pushLog('system', `Compacted ${dropped} messages. Context reclaimed.`);
        } else {
          pushLog('system', 'Nothing to compact yet.');
        }
        break;
      case 'plugin':
        void runPluginSlash(arg ?? '');
        break;
      default: {
        // A plugin-contributed command? Run its prompt template as a turn.
        const pluginCommand = pluginCommands.find((c) => c.name === name);
        if (pluginCommand) {
          const prompt = applyCommandArgs(pluginCommand.body, arg ?? '');
          pushLog('system', `Running plugin command /${name}${arg ? ` ${arg}` : ''}`);
          void runAgent(prompt);
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
        const commandList = loaded.flatMap((p) => p.commands.map((c) => `/${c.name}`)).join(', ') || 'none';
        pushLog('system', `Reloaded — ${loaded.length} plugin(s). Commands: ${commandList}`);
      } else if (!action) {
        // No subcommand given (e.g. just `/plugin`) — still reload to show current state
        const loaded = reloadPlugins();
        const commandList = loaded.flatMap((p) => p.commands.map((c) => `/${c.name}`)).join(', ') || 'none';
        pushLog('system', `Reloaded — ${loaded.length} plugin(s). Commands: ${commandList}`);
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
      if (key.ctrl && char === 'c') abortRef.current?.abort();
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
    // Surface a provider/config error (e.g. missing API key) immediately, so the
    // status is clear without the user having to send a message first.
    ensureProvider();
    if (props.initialPrompt) {
      pushLog('user', props.initialPrompt);
      void runAgent(props.initialPrompt);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pct = tokenLimit > 0 ? ((tokenUsed / tokenLimit) * 100).toFixed(1) : '0.0';

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
        provider={provider?.name ?? session.provider}
        model={model}
        pct={pct}
        files={filesEdited}
        sessionId={session.id}
        showCost={showCost}
        costUsd={costUsd}
        showTokenBar={config.tui.theme.layout.showTokenBar !== false}
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
}): React.ReactElement {
  const pctColor = Number(pct) >= 95 ? 'red' : Number(pct) >= 90 ? 'yellow' : 'green';
  const costLabel = `~$${costUsd.toFixed(4)}`;
  return (
    <Box>
      <Text color={MODE_COLOR[mode]}>
        {GLYPH} {mode}
      </Text>
      <Text color="gray"> · {provider}:{model}</Text>
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
      <Text color="gray"> · {files} files · {sessionId.slice(0, 5)}</Text>
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
