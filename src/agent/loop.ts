import { ErrorCode, SkyError } from '../errors/index.js';
import { nullLogger, type Logger } from '../logging/index.js';
import type { SkyConfig } from '../config/index.js';
import type { Session, Message, ToolCall } from '../session/types.js';
import type { SessionStore } from '../session/store.js';
import type { Provider, LlmMessage, StreamRequest } from '../llm/types.js';
import { buildContext } from '../llm/context.js';
import { estimateCost } from '../llm/cost.js';
import type { ToolRegistry } from '../tools/registry.js';
import type { ToolContext } from '../tools/types.js';
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
  store: SessionStore;
  config: SkyConfig;
  logger?: Logger;
  signal?: AbortSignal;
  maxIterations?: number;
  /** Skills injected into the system prompt. */
  skills?: Skill[];
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

    const maxIterations = this.opts.maxIterations ?? 25;
    let finishReason = 'stop';

    try {
      this.maybeCompact(session);

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
          yield* this.handleToolCall(session, toolCall);
        }

        if (iteration === maxIterations - 1) {
          throw new SkyError(ErrorCode.MaxIterations, { n: maxIterations });
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

  /** Lightweight auto-compaction when past the configured threshold. */
  private maybeCompact(session: Session): void {
    const { config, store } = this.opts;
    if (!config.sessions.autoCompact) return;
    const total = session.tokenUsage.input + session.tokenUsage.output;
    if (total < config.sessions.autoCompactThreshold) return;
    if (session.messages.length < 12) return;

    const systemKeep = session.messages.filter((m) => m.role === 'system');
    const recent = session.messages.slice(-8);
    const dropped = session.messages.length - systemKeep.length - recent.length;
    if (dropped <= 0) return;

    const summary: Message = {
      role: 'user',
      content: `[compacted ${dropped} earlier messages to reclaim context]`,
    };
    session.messages = [...systemKeep, summary, ...recent];
    store.save(session);
    this.logger.info('agent.compacted', { dropped, remaining: session.messages.length });
  }

  /** Stream one provider response, yielding text/tool-call events. */
  private async *streamTurn(
    session: Session,
  ): AsyncGenerator<AgentEvent, { assistantText: string; toolCalls: ToolCall[]; reason: string }> {
    const { provider, registry, config } = this.opts;
    const limits = provider.tokenLimits(session.model);

    const system: LlmMessage = {
      role: 'system',
      content: buildSystemPrompt(session.mode, session.cwd, this.opts.skills ?? []),
    };
    const history = session.messages as LlmMessage[];
    const messages = buildContext({ messages: [system, ...history], limits });

    const allDefs = registry.definitions();
    const tools = modeHasTools(session.mode) ? filterToolsForMode(session.mode, allDefs) : undefined;

    const request: StreamRequest = {
      messages,
      model: session.model,
      tools: tools?.length ? tools : undefined,
      maxOutputTokens: limits.maxOutput,
      signal: this.opts.signal,
    };

    // Retry the stream only if it fails before emitting any output.
    // Prefer configured provider fallback after repeated failures.
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
            assistantText += chunk.text;
            yield { type: 'text-delta', text: chunk.text };
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
        if (skyError.retryable && !emitted && attempt < retries) {
          const delay = Math.min(30_000, 1000 * 2 ** attempt + Math.floor(Math.random() * 250));
          this.logger.warn('provider.retry', { attempt: attempt + 1, code: skyError.code });
          await new Promise((r) => setTimeout(r, delay));
          // After triggerAfter retries, swap model/provider if fallback configured.
          if (fallback && attempt + 1 >= fallback.triggerAfter) {
            this.logger.warn('provider.fallback', {
              from: `${session.provider}:${session.model}`,
              to: `${fallback.provider}:${fallback.model}`,
            });
            session.provider = fallback.provider;
            session.model = fallback.model;
            request.model = fallback.model;
          }
          continue;
        }
        throw skyError;
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

  /** Validate → approve (with diff) → execute a single tool call. */
  private async *handleToolCall(session: Session, toolCall: ToolCall): AsyncGenerator<AgentEvent> {
    const { registry, approver, policy, store, config } = this.opts;
    yield { type: 'tool-call', toolCall };

    const tool = registry.get(toolCall.name);
    const ctx: ToolContext = { cwd: session.cwd, config, logger: this.logger, signal: this.opts.signal };

    // Validate before doing anything else (SKY-E-3001, retryable).
    try {
      registry.validate(toolCall.name, toolCall.input);
    } catch (error) {
      const skyError = SkyError.from(error, ErrorCode.ToolInputInvalid);
      const output = skyError.message;
      store.appendMessage(session, { role: 'tool', content: output, toolCallId: toolCall.id, name: toolCall.name });
      yield { type: 'tool-result', toolCallId: toolCall.id, toolName: toolCall.name, ok: false, output };
      return;
    }

    // Build a diff for mutating tools so the approval prompt can show it (§9.3).
    let diff: { path: string; patch: string; added: number; removed: number; sha256: string } | undefined;
    if (tool?.preview) {
      const preview = await tool.preview(toolCall.input as any, ctx);
      if (preview) {
        const d = generateDiff(preview.path, preview.oldContent, preview.newContent);
        diff = { path: preview.path, patch: d.patch, added: d.added, removed: d.removed, sha256: d.sha256 };
      }
    }

    const requiresApproval = tool ? tool.requiresApproval(toolCall.input as any) : true;
    yield { type: 'approval-request', toolCall, reason: 'policy check' };

    const result = await approver.request({
      sessionId: session.id,
      toolCallId: toolCall.id,
      toolName: toolCall.name,
      input: toolCall.input,
      requiresApproval,
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
      return;
    }

    // Apply user-edited content from the approval prompt when present.
    let input = toolCall.input;
    if (result.edited !== undefined) {
      if (toolCall.name === 'write') {
        input = { ...input, content: result.edited };
      } else if (toolCall.name === 'shell') {
        input = { ...input, command: result.edited };
      } else if (toolCall.name === 'edit') {
        input = { ...input, newText: result.edited };
      }
    }

    const execResult = await registry.execute(toolCall.name, input, ctx);
    store.appendMessage(session, {
      role: 'tool',
      content: execResult.output,
      toolCallId: toolCall.id,
      name: toolCall.name,
    });
    yield {
      type: 'tool-result',
      toolCallId: toolCall.id,
      toolName: toolCall.name,
      ok: execResult.ok,
      output: execResult.output,
    };
  }
}
