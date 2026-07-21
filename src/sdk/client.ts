/**
 * Typed HTTP + SSE SDK client for the Sky daemon (Phase 4 packaging).
 * Prefer this over ad-hoc fetch when embedding Sky programmatically.
 */

import {
  resolveDaemonTransport,
  createDaemonSession,
  listDaemonSessions,
  streamDaemonMessage,
  resolveDaemonApproval,
  abortDaemonSession,
  api,
  type WireEvent,
} from '../cli/client.js';
import type { ApprovalAnswer } from '../safety/approver.js';
import type { Mode } from '../session/types.js';

export interface SkySdkOptions {
  url?: string;
  token?: string;
}

export class SkyDaemonClient {
  private transport: { url: string; token: string } | null = null;

  constructor(private readonly options: SkySdkOptions = {}) {}

  async connect(): Promise<{ url: string; token: string }> {
    this.transport = await resolveDaemonTransport(this.options);
    return this.transport;
  }

  private async ensure(): Promise<{ url: string; token: string }> {
    if (!this.transport) return this.connect();
    return this.transport;
  }

  async health(): Promise<{ ok: boolean; version?: string; pid?: number }> {
    const t = await this.ensure();
    const res = await api(t.url, t.token, 'GET', '/health');
    if (!res.ok) throw new Error(`health failed: ${res.status}`);
    return (await res.json()) as { ok: boolean; version?: string; pid?: number };
  }

  async createSession(body: {
    mode?: Mode;
    cwd?: string;
    provider?: string;
    model?: string;
  } = {}): Promise<{ id: string; mode: Mode; cwd: string; provider: string; model: string }> {
    const t = await this.ensure();
    return createDaemonSession(t, body);
  }

  async listSessions(): Promise<{ sessions: Array<Record<string, unknown>> }> {
    const t = await this.ensure();
    return listDaemonSessions(t);
  }

  async *message(
    sessionId: string,
    prompt: string,
    opts: {
      yolo?: boolean;
      force?: boolean;
      signal?: AbortSignal;
      onApproval?: Parameters<typeof streamDaemonMessage>[0]['onApproval'];
    } = {},
  ): AsyncGenerator<WireEvent> {
    const t = await this.ensure();
    yield* streamDaemonMessage({
      url: t.url,
      token: t.token,
      sessionId,
      prompt,
      yolo: opts.yolo,
      force: opts.force,
      signal: opts.signal,
      onApproval: opts.onApproval,
    });
  }

  async resolveApproval(approvalId: string, answer: ApprovalAnswer): Promise<void> {
    const t = await this.ensure();
    await resolveDaemonApproval(t, approvalId, answer);
  }

  async abort(sessionId: string): Promise<void> {
    const t = await this.ensure();
    await abortDaemonSession(t, sessionId);
  }
}

export {
  resolveDaemonTransport,
  createDaemonSession,
  listDaemonSessions,
  streamDaemonMessage,
  resolveDaemonApproval,
  abortDaemonSession,
};
export type { WireEvent, SkySdkOptions as SkyClientOptions };
