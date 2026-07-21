/**
 * Parks tool approvals until a client POSTs /approvals/:id (OpenCode-style
 * permission dialog over the wire).
 */

import { randomUUID } from 'node:crypto';
import type { ApprovalAnswer, ApprovalPromptRequest, Prompter } from '../safety/approver.js';

export interface PendingApproval {
  id: string;
  request: ApprovalPromptRequest;
  createdAt: number;
}

type Resolver = (answer: ApprovalAnswer) => void;

export type ApprovalNotify = (pending: PendingApproval) => void;

export class ApprovalBridge {
  private readonly pending = new Map<string, { resolve: Resolver; request: ApprovalPromptRequest }>();
  private readonly notify: ApprovalNotify;

  constructor(notify: ApprovalNotify) {
    this.notify = notify;
  }

  createPrompter(): Prompter {
    return (request) =>
      new Promise<ApprovalAnswer>((resolve) => {
        const id = randomUUID();
        this.pending.set(id, { resolve, request });
        this.notify({ id, request, createdAt: Date.now() });
      });
  }

  resolve(id: string, answer: ApprovalAnswer): boolean {
    const hit = this.pending.get(id);
    if (!hit) return false;
    this.pending.delete(id);
    hit.resolve(answer);
    return true;
  }

  rejectAll(answer: ApprovalAnswer = 'no'): void {
    for (const [id, hit] of this.pending) {
      this.pending.delete(id);
      hit.resolve(answer);
    }
  }

  list(): PendingApproval[] {
    return [...this.pending.entries()].map(([id, v]) => ({
      id,
      request: v.request,
      createdAt: Date.now(),
    }));
  }
}
