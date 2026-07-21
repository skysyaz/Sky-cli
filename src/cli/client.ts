/**
 * HTTP + SSE client for the Sky daemon (`sky attach` / TUI `--attach`).
 */

import type { DaemonState } from '../server/daemon.js';
import { readDaemonState, isDaemonHealthy } from '../server/daemon.js';
import type { ApprovalAnswer, ApprovalPromptRequest } from '../safety/approver.js';
import type { AgentEvent } from '../agent/events.js';
import type { Mode } from '../session/types.js';

export interface AttachOptions {
  url?: string;
  token?: string;
  prompt: string;
  mode?: Mode;
  cwd?: string;
  yolo?: boolean;
  force?: boolean;
  /** Called for each SSE JSON payload (already parsed). */
  onEvent?: (event: string, data: unknown) => void;
}

export async function resolveDaemonTransport(
  override?: { url?: string; token?: string },
): Promise<{ url: string; token: string }> {
  if (override?.url && override?.token) return { url: override.url, token: override.token };
  if (process.env.SKY_DAEMON_URL && process.env.SKY_DAEMON_TOKEN) {
    return { url: process.env.SKY_DAEMON_URL, token: process.env.SKY_DAEMON_TOKEN };
  }
  const state = readDaemonState();
  if (!state || !(await isDaemonHealthy(state))) {
    throw new Error('No healthy Sky daemon. Run `sky daemon start` or `sky serve` first.');
  }
  return { url: state.url, token: state.token };
}

export async function api(
  base: string,
  token: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<Response> {
  return fetch(`${base}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Sky-Token': token,
      Authorization: `Bearer ${token}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export async function createDaemonSession(
  transport: { url: string; token: string },
  body: { mode?: Mode; cwd?: string; provider?: string; model?: string },
): Promise<{ id: string; mode: Mode; cwd: string; provider: string; model: string }> {
  const created = await api(transport.url, transport.token, 'POST', '/sessions', body);
  if (!created.ok) {
    throw new Error(`create session failed: ${created.status} ${await created.text()}`);
  }
  return (await created.json()) as { id: string; mode: Mode; cwd: string; provider: string; model: string };
}

export async function listDaemonSessions(
  transport: { url: string; token: string },
): Promise<{ sessions: Array<Record<string, unknown>> }> {
  const res = await api(transport.url, transport.token, 'GET', '/sessions');
  if (!res.ok) throw new Error(`list sessions failed: ${res.status}`);
  return (await res.json()) as { sessions: Array<Record<string, unknown>> };
}

export async function resolveDaemonApproval(
  transport: { url: string; token: string },
  approvalId: string,
  answer: ApprovalAnswer,
): Promise<void> {
  const res = await api(transport.url, transport.token, 'POST', `/approvals/${encodeURIComponent(approvalId)}`, {
    answer,
  });
  if (!res.ok) throw new Error(`resolve approval failed: ${res.status}`);
}

export async function abortDaemonSession(
  transport: { url: string; token: string },
  sessionId: string,
): Promise<void> {
  await api(transport.url, transport.token, 'POST', `/sessions/${encodeURIComponent(sessionId)}/abort`);
}

export type WireEvent =
  | AgentEvent
  | { type: 'ready'; sessionId: string }
  | { type: 'done'; ok: boolean }
  | { type: 'aborted'; sessionId: string }
  | {
      type: 'approval-request';
      approvalId?: string;
      toolName?: string;
      input?: Record<string, unknown>;
      reason?: string;
      diff?: ApprovalPromptRequest['diff'];
      toolCall?: AgentEvent extends { type: 'approval-request' } ? never : unknown;
    };

/**
 * POST a message and yield parsed SSE payloads until `done` / stream end.
 * When an approval with `approvalId` arrives, `onApproval` is awaited and the
 * answer is POSTed to `/approvals/:id`.
 */
export async function* streamDaemonMessage(options: {
  url: string;
  token: string;
  sessionId: string;
  prompt: string;
  yolo?: boolean;
  force?: boolean;
  signal?: AbortSignal;
  onApproval?: (req: ApprovalPromptRequest & { approvalId: string }) => Promise<ApprovalAnswer>;
}): AsyncGenerator<WireEvent> {
  const res = await fetch(
    `${options.url}/sessions/${encodeURIComponent(options.sessionId)}/message`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Sky-Token': options.token,
        Authorization: `Bearer ${options.token}`,
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({
        prompt: options.prompt,
        yolo: options.yolo,
        force: options.force,
      }),
      signal: options.signal,
    },
  );
  if (!res.ok || !res.body) {
    throw new Error(`message failed: ${res.status} ${await res.text()}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split('\n\n');
    buffer = parts.pop() ?? '';
    for (const block of parts) {
      const lines = block.split('\n');
      let event = 'message';
      let data = '';
      for (const line of lines) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) data += line.slice(5).trim();
      }
      if (!data) continue;
      let parsed: unknown = data;
      try {
        parsed = JSON.parse(data);
      } catch {
        /* keep string */
      }

      const wire = (typeof parsed === 'object' && parsed !== null
        ? { type: event, ...(parsed as object) }
        : { type: event, data: parsed }) as WireEvent & { approvalId?: string; type?: string };

      // Wire approvals from ApprovalBridge include approvalId.
      if (
        (event === 'approval-request' || wire.type === 'approval-request') &&
        wire.approvalId &&
        options.onApproval
      ) {
        const w = wire as {
          approvalId: string;
          toolName?: string;
          input?: Record<string, unknown>;
          reason?: string;
          diff?: ApprovalPromptRequest['diff'];
        };
        const answer = await options.onApproval({
          approvalId: w.approvalId,
          toolName: w.toolName ?? 'unknown',
          input: w.input ?? {},
          reason: w.reason ?? 'policy check',
          diff: w.diff,
        });
        await resolveDaemonApproval(
          { url: options.url, token: options.token },
          w.approvalId,
          answer,
        );
      }

      yield wire;
    }
  }
}

/** Create a session, POST a message, stream SSE events to onEvent / stdout NDJSON. */
export async function attachAndRun(options: AttachOptions): Promise<number> {
  const transport = await resolveDaemonTransport({ url: options.url, token: options.token });
  const session = await createDaemonSession(transport, {
    mode: options.mode ?? 'agent',
    cwd: options.cwd,
  });

  let exit = 0;
  for await (const wire of streamDaemonMessage({
    url: transport.url,
    token: transport.token,
    sessionId: session.id,
    prompt: options.prompt,
    yolo: options.yolo,
    force: options.force,
  })) {
    const event = (wire as { type?: string }).type ?? 'message';
    options.onEvent?.(event, wire);
    if (event === 'error') exit = 1;
  }
  return exit;
}

export type { DaemonState };
