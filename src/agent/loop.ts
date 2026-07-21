import { ErrorCode, SkyError } from '../errors/index.js';
import { nullLogger, type Logger } from '../logging/index.js';
import type { SkyConfig } from '../config/index.js';
import type { Session, Message, ToolCall } from '../session/types.js';
import type { SessionStore } from '../session/store.js';
import type { AnySessionStore } from '../session/create-store.js';
import {
  compactSessionMessages,
  shouldAutoCompact,
  overflowKeepRecent,
  estimateMessageTokens,
  contextBudget,
  sanitizeToolTurns,
  AUTO_COMPACT_KEEP_RECENT,
  AUTO_COMPACT_PROTECT_TOOLS,
  AUTO_COMPACT_STUB_CHARS,
  type CompactReason,
} from '../session/compact.js';
import type { Provider, LlmMessage, StreamRequest } from '../llm/types.js';
import { buildContext } from '../llm/context.js';
import { estimateCost } from '../llm/cost.js';
import { createProvider } from '../llm/registry.js';
import { textDeltaPiece } from '../llm/text-delta.js';
import type { ToolRegistry } from '../tools/registry.js';
import type { ToolContext } from '../tools/types.js';
import { PARALLEL_SAFE_TOOLS } from '../tools/types.js';
import type { Approver } from '../safety/approver.js';
import type { Policy } from '../safety/policy.js';
import { generateDiff } from '../safety/diff.js';
import type { Skill } from '../skills/types.js';
import { buildSystemPrompt, modeHasTools, filterToolsForMode, toolsForMode } from './prompts.js';
import type { AgentEvent } from './events.js';

export interface AgentLoopOptions {
  provider: Provider;
  registry: ToolRegistry;
  approver: Approver;
  policy: Policy;
  session: Session;
  store: SessionStore | AnySessionStore;
  config: SkyConfig;
  logger?: Logger;
  signal?: AbortSignal;
  maxIterations?: number;
  /** Skills injected into the system prompt. */
  skills?: Skill[];
  /**
   * Build a provider adapter by name (used on fallback). Defaults to
   * {@link createProvider}. Inject in tests to assert adapter rebuild.
   */
  createProvider?: (providerName: string) => Provider;
}

/**
 * The agent loop (§2.4.1). Given a user message and a session, it produces a
 * stream of {@link AgentEvent}s. It is a generator so the TUI can render events
 * incrementally and the headless runner can serialize them — the same loop
 * drives both.
 */
export class AgentLoop {
  private readonly opts: AgentLoopOptions;
  private readonly logger: Logger;

  constructor(options: AgentLoopOptions) {
    this.opts = options;
    this.logger = options.logger ?? nullLogger;
    this.opts.policy.setAllowlist(options.session.sessionAllowlist);
  }

  async *run(userMessage?: string): AsyncGenerator<AgentEvent> {
    const { session, store } = this.opts;

    if (session.lastTurnInterrupted) {
      this.logger.warn('agent.resume.interrupted', { sessionId: session.id });
    }

    if (userMessage !== undefined) {
      store.appendMessage(session, { role: 'user', content: userMessage });
    }

    session.lastTurnInterrupted = true;
    store.save(session);

    yield { type: 'turn-start', mode: session.mode, model: session.model, provider: session.provider };

    const maxIterations = this.opts.maxIterations ?? this.opts.config.sessions.maxIterations ?? 60;
    let finishReason = 'stop';

    try {
      for (let iteration = 0; iteration < maxIterations; iteration++) {
        if (this.opts.signal?.aborted) throw new SkyError(ErrorCode.AgentAborted, {});

        const { assistantText, toolCalls, reason } = yield* this.streamTurn(session);
        finishReason = reason;

        const assistantMessage: Message = {
          role: 'assistant',
          content: assistantText,
          ...(toolCalls.length ? { toolCalls } : {}),
        };
        store.appendMessage(session, assistantMessage);

        if (toolCalls.length === 0) break; // turn complete

        // In modes without tools, any tool call is a protocol violation.
        if (!modeHasTools(session.mode)) {
          throw new SkyError(
            session.mode === 'plan' ? ErrorCode.PlanModeRejectedTool : ErrorCode.AskModeReceivedTool,
            { name: toolCalls[0].name },
          );
        }

        // Plan/ask: reject mutating tools even if the model invents them.
        const access = toolsForMode(session.mode);
        const allowedCalls: ToolCall[] = [];
        for (const toolCall of toolCalls) {
          if (access === 'readonly') {
            const allowed = filterToolsForMode(session.mode, [{ name: toolCall.name }]);
            if (allowed.length === 0) {
              const output = `${session.mode} mode is read-only; '${toolCall.name}' is not permitted.`;
              store.appendMessage(session, {
                role: 'tool',
                content: output,
                toolCallId: toolCall.id,
                name: toolCall.name,
              });
              yield { type: 'tool-result', toolCallId: toolCall.id, toolName: toolCall.name, ok: false, output };
              continue;
            }
          }
          allowedCalls.push(toolCall);
        }

        // Approve serially, then settle parallel-safe tools concurrently.
        yield* this.handleToolCalls(session, allowedCalls);

        // Last budgeted tool round — ask for a summary instead of SKY-E-2003.
        if (iteration === maxIterations - 1) {
          finishReason = yield* this.wrapUpMaxIterations(session, maxIterations);
          break;
        }
      }

      session.lastTurnInterrupted = false;
      store.save(session);
      yield { type: 'turn-end', finishReason };
    } catch (error) {
      const skyError = SkyError.from(error);
      // Keep interrupted=true on abort so resume can surface it; clear on other errors.
      if (skyError.code !== ErrorCode.AgentAborted) {
        session.lastTurnInterrupted = false;
      }
      store.save(session);
      this.logger.error('agent.turn.failed', { code: skyError.code });
      yield { type: 'error', error: skyError };
    }
  }

  /**
   * Soft-stop when the tool-round budget is exhausted: nudge the model to
   * summarize without more tools, instead of failing the turn with SKY-E-2003.
   */
  private async *wrapUpMaxIterations(
    session: Session,
    maxIterations: number,
  ): AsyncGenerator<AgentEvent, string> {
    const { store } = this.opts;
    this.logger.warn('agent.max_iterations.wrap_up', { n: maxIterations });
    store.appendMessage(session, {
      role: 'user',
      content:
        `[sky] Reached the max tool iterations (${maxIterations}) for this turn. ` +
        `Do not call more tools. Summarize findings so far in a short bullet list. ` +
        `The user can send another message to continue.`,
    });

    const wrap = yield* this.streamTurn(session, { disableTools: true });
    const text =
      wrap.assistantText.trim() ||
      `(Stopped after ${maxIterations} tool rounds — send another message to continue the audit.)`;
    store.appendMessage(session, { role: 'assistant', content: text });
    if (!wrap.assistantText.trim()) {
      yield { type: 'text-delta', text };
    }
    return 'max_iterations';
  }

  /**
   * Proactive compact when estimated history size passes configured thresholds.
   * Returns an event when history was changed.
   */
  private applyAutoCompact(session: Session): AgentEvent | null {
    const { config, store, provider } = this.opts;
    const limits = provider.tokenLimits(session.model);
    if (
      !shouldAutoCompact({
        messages: session.messages,
        limits,
        autoCompact: config.sessions.autoCompact,
        autoCompactThreshold: config.sessions.autoCompactThreshold,
        autoCompactRatio: config.sessions.autoCompactRatio,
      })
    ) {
      return null;
    }

    const historyTokens = estimateMessageTokens(session.messages);
    const reason: CompactReason =
      historyTokens >= config.sessions.autoCompactThreshold ? 'threshold' : 'ratio';
    const result = compactSessionMessages(session.messages, {
      keepRecent: AUTO_COMPACT_KEEP_RECENT,
      stubToolResults: true,
      stubMaxChars: AUTO_COMPACT_STUB_CHARS,
      protectRecentTools: AUTO_COMPACT_PROTECT_TOOLS,
      reason,
    });
    if (result.dropped <= 0 && result.messages === session.messages) return null;
    // Even if dropped is 0, stubbing may have shrunk tool payloads.
    const before = historyTokens;
    const after = estimateMessageTokens(result.messages);
    if (after >= before && result.dropped <= 0) return null;

    session.messages = result.messages;
    store.save(session);
    this.logger.info('agent.compacted', {
      reason,
      dropped: result.dropped,
      remaining: session.messages.length,
      before,
      after,
    });
    return {
      type: 'session-compacted',
      dropped: result.dropped,
      reason,
      remaining: session.messages.length,
    };
  }

  /** Emergency compact after ContextWindowExceeded — progressively aggressive. */
  private applyOverflowCompact(session: Session, attempt: number): AgentEvent | null {
    const { store } = this.opts;
    const result = compactSessionMessages(session.messages, {
      keepRecent: overflowKeepRecent(attempt),
      stubToolResults: true,
      stubMaxChars: AUTO_COMPACT_STUB_CHARS,
      // On overflow we must reclaim space — protect only the newest couple.
      protectRecentTools: attempt === 0 ? 4 : 2,
      reason: 'overflow',
    });
    session.messages = result.messages;
    store.save(session);
    this.logger.warn('agent.compacted.overflow', {
      attempt,
      dropped: result.dropped,
      remaining: session.messages.length,
      budgetFill: estimateMessageTokens(session.messages),
    });
    return {
      type: 'session-compacted',
      dropped: result.dropped,
      reason: 'overflow',
      remaining: session.messages.length,
    };
  }

  /** Stream one provider response, yielding text/tool-call events. */
  private async *streamTurn(
    session: Session,
    options: { disableTools?: boolean } = {},
  ): AsyncGenerator<AgentEvent, { assistantText: string; toolCalls: ToolCall[]; reason: string }> {
    const { registry, config } = this.opts;
    // Mutable — rebuilt when provider fallback switches adapters.
    let provider = this.opts.provider;
    let limits = provider.tokenLimits(session.model);

    // Proactive compact before each provider call (also mid-turn after tools).
    const proactive = this.applyAutoCompact(session);
    if (proactive) yield proactive;

    const allDefs = registry.definitions();
    const tools =
      !options.disableTools && modeHasTools(session.mode)
        ? filterToolsForMode(session.mode, allDefs)
        : undefined;

    // Retry buildContext after overflow compact; then retry the stream.
    const overflowRetries = config.sessions.autoCompact ? 3 : 0;
    for (let overflowAttempt = 0; ; overflowAttempt++) {
      const system: LlmMessage = {
        role: 'system',
        content: buildSystemPrompt(session.mode, session.cwd, this.opts.skills ?? []),
      };
      const safetyMargin = overflowAttempt === 0 ? 2048 : overflowAttempt === 1 ? 1024 : 512;
      const keepRecentTurns = overflowAttempt === 0 ? 6 : overflowAttempt === 1 ? 3 : 1;

      let messages: LlmMessage[];
      try {
        const history = sanitizeToolTurns(session.messages as Message[]);
        if (history.length !== session.messages.length) {
          session.messages = history;
          this.opts.store.save(session);
        }
        messages = buildContext({
          messages: [system, ...(history as LlmMessage[])],
          limits,
          safetyMargin,
          keepRecentTurns,
        });
      } catch (error) {
        const skyError = SkyError.from(error);
        if (
          skyError.code === ErrorCode.ContextWindowExceeded &&
          overflowAttempt < overflowRetries
        ) {
          const ev = this.applyOverflowCompact(session, overflowAttempt);
          if (ev) yield ev;
          // If still hopeless (single huge message), stop retrying.
          const budget = contextBudget(limits, safetyMargin);
          if (budget > 0 && estimateMessageTokens(session.messages) > budget * 2) {
            // Keep trying with more aggressive keepRecent via next attempt.
          }
          continue;
        }
        throw skyError;
      }

      const request: StreamRequest = {
        messages,
        model: session.model,
        tools: tools?.length ? tools : undefined,
        maxOutputTokens: limits.maxOutput,
        signal: this.opts.signal,
      };

      // Retry the stream only if it fails before emitting any output.
      const retries = 4;
      const fallback = config.providers[session.provider]?.fallback;
      for (let attempt = 0; ; attempt++) {
        let assistantText = '';
        const toolCalls: ToolCall[] = [];
        let reason = 'stop';
        let emitted = false;
        try {
          for await (const chunk of provider.stream(request)) {
            if (this.opts.signal?.aborted) throw new SkyError(ErrorCode.AgentAborted, {});
            if (chunk.type === 'text-delta') {
              emitted = true;
              const { next, piece } = textDeltaPiece(assistantText, chunk.text);
              assistantText = next;
              if (piece) yield { type: 'text-delta', text: piece };
            } else if (chunk.type === 'tool-call') {
              emitted = true;
              toolCalls.push(chunk.toolCall);
            } else if (chunk.type === 'done') {
              reason = chunk.finishReason;
              const cost = estimateCost(session.model, chunk.usage);
              session.tokenUsage.input += chunk.usage.inputTokens;
              session.tokenUsage.output += chunk.usage.outputTokens;
              session.tokenUsage.estimatedCostUsd += cost;
              yield { type: 'usage', usage: chunk.usage, estimatedCostUsd: session.tokenUsage.estimatedCostUsd };
              this.checkBudget(config, session);
            }
          }
          return { assistantText, toolCalls, reason };
        } catch (error) {
          const skyError = SkyError.from(error, ErrorCode.ProviderRequestFailed);
          // Some providers report overflow as a bad request — compact and retry once.
          if (
            !emitted &&
            overflowAttempt < overflowRetries &&
            isProviderContextOverflow(skyError)
          ) {
            const ev = this.applyOverflowCompact(session, overflowAttempt);
            if (ev) yield ev;
            break; // break inner loop → outer overflow retry rebuilds context
          }
          if (skyError.retryable && !emitted && attempt < retries) {
            const delay = Math.min(30_000, 1000 * 2 ** attempt + Math.floor(Math.random() * 250));
            this.logger.warn('provider.retry', { attempt: attempt + 1, code: skyError.code });
            await new Promise((r) => setTimeout(r, delay));
            if (fallback && attempt + 1 >= fallback.triggerAfter) {
              this.logger.warn('provider.fallback', {
                from: `${session.provider}:${session.model}`,
                to: `${fallback.provider}:${fallback.model}`,
              });
              session.provider = fallback.provider;
              session.model = fallback.model;
              request.model = fallback.model;
              // Rebuild the adapter — model name alone is not enough across providers.
              const factory =
                this.opts.createProvider ??
                ((name: string) =>
                  createProvider({ config, provider: name, logger: this.logger }));
              provider = factory(fallback.provider);
              this.opts.provider = provider;
              limits = provider.tokenLimits(session.model);
              request.maxOutputTokens = limits.maxOutput;
            }
            continue;
          }
          throw skyError;
        }
      }
    }
  }

  private checkBudget(config: SkyConfig, session: Session): void {
    const budget = config.sessions.budgetUsd;
    if (budget !== undefined && session.tokenUsage.estimatedCostUsd > budget) {
      throw new SkyError(ErrorCode.ProviderBudgetExceeded, {
        spent: session.tokenUsage.estimatedCostUsd.toFixed(4),
        budget: budget.toFixed(4),
      });
    }
  }

  /**
   * Approve tool calls serially, then settle parallel-safe tools concurrently
   * (OpenCode-style concurrent tool settlement). Mutating tools stay serial.
   */
  private async *handleToolCalls(session: Session, toolCalls: ToolCall[]): AsyncGenerator<AgentEvent> {
    type Pending = {
      toolCall: ToolCall;
      input: Record<string, unknown>;
      parallelSafe: boolean;
    };
    const toSettle: Pending[] = [];

    for (const toolCall of toolCalls) {
      const prepared = yield* this.prepareToolCall(session, toolCall);
      if (prepared) {
        toSettle.push({
          toolCall: prepared.toolCall,
          input: prepared.input,
          parallelSafe: PARALLEL_SAFE_TOOLS.has(prepared.toolCall.name),
        });
      }
    }

    const parallel = toSettle.filter((p) => p.parallelSafe);
    const serial = toSettle.filter((p) => !p.parallelSafe);

    if (parallel.length > 0) {
      const settled = await Promise.all(
        parallel.map(async (p) => {
          const result = await this.settlePrepared(session, p.toolCall, p.input);
          return { p, result };
        }),
      );
      for (const { p, result } of settled) {
        this.opts.store.appendMessage(session, {
          role: 'tool',
          content: result.output,
          toolCallId: p.toolCall.id,
          name: p.toolCall.name,
        });
        yield {
          type: 'tool-result',
          toolCallId: p.toolCall.id,
          toolName: p.toolCall.name,
          ok: result.ok,
          output: result.output,
        };
      }
    }

    for (const p of serial) {
      const result = await this.settlePrepared(session, p.toolCall, p.input);
      this.opts.store.appendMessage(session, {
        role: 'tool',
        content: result.output,
        toolCallId: p.toolCall.id,
        name: p.toolCall.name,
      });
      yield {
        type: 'tool-result',
        toolCallId: p.toolCall.id,
        toolName: p.toolCall.name,
        ok: result.ok,
        output: result.output,
      };
    }
  }

  /**
   * Materialize + approve a tool call. Yields AgentEvents; returns prepared
   * input for settle, or null when denied / invalid.
   */
  private async *prepareToolCall(
    session: Session,
    toolCall: ToolCall,
  ): AsyncGenerator<AgentEvent, { toolCall: ToolCall; input: Record<string, unknown> } | null> {
    const { registry, approver, policy, store, config } = this.opts;
    yield { type: 'tool-call', toolCall };

    const ctx: ToolContext = { cwd: session.cwd, config, logger: this.logger, signal: this.opts.signal };

    let materialized;
    try {
      materialized = await registry.materialize(toolCall.name, toolCall.input, ctx);
    } catch (error) {
      const skyError = SkyError.from(error, ErrorCode.ToolInputInvalid);
      const output = skyError.message;
      store.appendMessage(session, { role: 'tool', content: output, toolCallId: toolCall.id, name: toolCall.name });
      yield { type: 'tool-result', toolCallId: toolCall.id, toolName: toolCall.name, ok: false, output };
      return null;
    }

    let diff: { path: string; patch: string; added: number; removed: number; sha256: string } | undefined;
    if (materialized.preview) {
      const d = generateDiff(
        materialized.preview.path,
        materialized.preview.oldContent,
        materialized.preview.newContent,
      );
      diff = { path: materialized.preview.path, patch: d.patch, added: d.added, removed: d.removed, sha256: d.sha256 };
    }

    yield { type: 'approval-request', toolCall, reason: 'policy check' };

    const result = await approver.request({
      sessionId: session.id,
      toolCallId: toolCall.id,
      toolName: toolCall.name,
      input: materialized.input,
      requiresApproval: materialized.requiresApproval,
      diff,
    });

    if (result.allowlistAdded) {
      session.sessionAllowlist.push(result.allowlistAdded);
      policy.setAllowlist(session.sessionAllowlist);
      store.save(session);
    }

    yield {
      type: 'approval-resolved',
      toolCallId: toolCall.id,
      granted: result.granted,
      autoApproved: result.autoApproved,
    };

    if (!result.granted) {
      const output =
        result.decision === 'deny'
          ? `Denied by policy: ${toolCall.name} is not permitted.`
          : `User declined the ${toolCall.name} action.`;
      store.appendMessage(session, { role: 'tool', content: output, toolCallId: toolCall.id, name: toolCall.name });
      yield { type: 'tool-result', toolCallId: toolCall.id, toolName: toolCall.name, ok: false, output };
      return null;
    }

    let input = materialized.input;
    if (result.edited !== undefined) {
      if (toolCall.name === 'write') input = { ...input, content: result.edited };
      else if (toolCall.name === 'shell' || toolCall.name === 'pty') input = { ...input, command: result.edited };
      else if (toolCall.name === 'edit') input = { ...input, newText: result.edited };
    }

    return { toolCall, input };
  }

  private settlePrepared(
    session: Session,
    toolCall: ToolCall,
    input: Record<string, unknown>,
  ): Promise<import('../tools/types.js').ToolResult> {
    const ctx: ToolContext = {
      cwd: session.cwd,
      config: this.opts.config,
      logger: this.logger,
      signal: this.opts.signal,
    };
    return this.opts.registry.settle(toolCall.name, input, ctx);
  }
}

/** Detect provider errors that usually mean the prompt is too long. */
function isProviderContextOverflow(error: SkyError): boolean {
  if (error.code === ErrorCode.ContextWindowExceeded) return true;
  const causeMsg = error.cause instanceof Error ? error.cause.message : String(error.cause ?? '');
  const detail = `${error.message} ${causeMsg} ${JSON.stringify(error.context)}`.toLowerCase();
  return (
    detail.includes('context_length') ||
    detail.includes('context length') ||
    detail.includes('context window') ||
    detail.includes('maximum context') ||
    detail.includes('too many tokens') ||
    (detail.includes('token') && detail.includes('limit') && detail.includes('exceed'))
  );
}
