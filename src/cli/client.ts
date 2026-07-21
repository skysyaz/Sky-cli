/**
 * HTTP + SSE client for the Sky daemon (`sky attach`).
 */

import type { DaemonState } from '../server/daemon.js';
import { readDaemonState, isDaemonHealthy } from '../server/daemon.js';

export interface AttachOptions {
  url?: string;
  token?: string;
  prompt: string;
  mode?: 'agent' | 'plan' | 'ask';
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

async function api(
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

/** Create a session, POST a message, stream SSE events to onEvent / stdout NDJSON. */
export async function attachAndRun(options: AttachOptions): Promise<number> {
  const transport = await resolveDaemonTransport({ url: options.url, token: options.token });
  const created = await api(transport.url, transport.token, 'POST', '/sessions', {
    mode: options.mode ?? 'agent',
    cwd: options.cwd,
  });
  if (!created.ok) {
    const err = await created.text();
    throw new Error(`create session failed: ${created.status} ${err}`);
  }
  const session = (await created.json()) as { id: string };

  const res = await fetch(`${transport.url}/sessions/${encodeURIComponent(session.id)}/message`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Sky-Token': transport.token,
      Authorization: `Bearer ${transport.token}`,
      Accept: 'text/event-stream',
    },
    body: JSON.stringify({
      prompt: options.prompt,
      yolo: options.yolo,
      force: options.force,
    }),
  });
  if (!res.ok || !res.body) {
    throw new Error(`message failed: ${res.status} ${await res.text()}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let exit = 0;

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
      options.onEvent?.(event, parsed);
      if (event === 'error') exit = 1;
    }
  }
  return exit;
}

export type { DaemonState };
