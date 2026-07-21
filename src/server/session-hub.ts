/**
 * Per-session event hub: SSE subscribers + approval bridge + abort control.
 */

import type { ServerResponse } from 'node:http';
import { formatSse } from '../protocol/api.js';
import { ApprovalBridge, type PendingApproval } from './approval-bridge.js';
import type { AgentEvent } from '../agent/events.js';
import type { ApprovalAnswer } from '../safety/approver.js';

export class SessionHub {
  readonly sessionId: string;
  private readonly subscribers = new Set<ServerResponse>();
  readonly bridge: ApprovalBridge;
  abort: AbortController | null = null;
  busy = false;

  constructor(sessionId: string) {
    this.sessionId = sessionId;
    this.bridge = new ApprovalBridge((pending) => this.publishApproval(pending));
  }

  subscribe(res: ServerResponse): () => void {
    this.subscribers.add(res);
    res.write(formatSse('ready', { sessionId: this.sessionId }));
    return () => {
      this.subscribers.delete(res);
    };
  }

  publish(event: AgentEvent | Record<string, unknown>): void {
    const type =
      typeof event === 'object' && event && 'type' in event ? String((event as { type: string }).type) : 'message';
    const frame = formatSse(type, event);
    for (const res of this.subscribers) {
      try {
        res.write(frame);
      } catch {
        this.subscribers.delete(res);
      }
    }
  }

  private publishApproval(pending: PendingApproval): void {
    this.publish({
      type: 'approval-request',
      approvalId: pending.id,
      toolName: pending.request.toolName,
      input: pending.request.input,
      reason: pending.request.reason,
      diff: pending.request.diff,
    } as Record<string, unknown>);
  }

  resolveApproval(id: string, answer: ApprovalAnswer): boolean {
    const ok = this.bridge.resolve(id, answer);
    if (ok) {
      this.publish({ type: 'approval-resolved', approvalId: id, answer } as Record<string, unknown>);
    }
    return ok;
  }

  startAbort(): AbortSignal {
    this.abort?.abort();
    this.abort = new AbortController();
    return this.abort.signal;
  }

  cancel(): void {
    this.abort?.abort();
    this.bridge.rejectAll('no');
    this.publish({ type: 'aborted', sessionId: this.sessionId });
  }

  close(): void {
    this.cancel();
    for (const res of this.subscribers) {
      try {
        res.end();
      } catch {
        /* ignore */
      }
    }
    this.subscribers.clear();
  }
}
