import { ErrorCode, SkyError } from '../errors/index.js';
import { nullLogger, type Logger } from '../logging/index.js';
import type { AllowlistEntry } from '../session/types.js';
import { Policy, type Decision } from './policy.js';
import { AuditLog, type AuditEntry } from './audit.js';

/** The user's choice at an interactive approval prompt (§5.6). */
export type ApprovalAnswer = 'yes' | 'no' | 'edit' | 'always';

export interface ApprovalPromptRequest {
  toolName: string;
  input: Record<string, unknown>;
  reason: string;
  /** A rendered diff to show, when the call is a file mutation. */
  diff?: { path: string; patch: string; added: number; removed: number; sha256: string };
}

/** Async prompter injected by the TUI/CLI; headless mode supplies none. */
export type Prompter = (request: ApprovalPromptRequest) => Promise<ApprovalAnswer>;

export interface ApproverOptions {
  policy: Policy;
  audit: AuditLog;
  prompter?: Prompter;
  logger?: Logger;
  /** `--force`: bypass interactive prompts (still respects denylist). */
  force?: boolean;
  /** `--yolo`: implies force and bypasses tool predicates. */
  yolo?: boolean;
}

export interface ApprovalRequest {
  sessionId: string;
  toolCallId: string;
  toolName: string;
  input: Record<string, unknown>;
  requiresApproval: boolean;
  diff?: ApprovalPromptRequest['diff'];
}

export interface ApprovalResult {
  granted: boolean;
  decision: Decision;
  autoApproved: boolean;
  /** Replacement content when the user chose "edit". */
  edited?: string;
  /** A session-allowlist entry to persist when the user chose "always". */
  allowlistAdded?: AllowlistEntry;
}

/**
 * The Approver (§9.1). Every tool call passes through `request()`, which
 * classifies via the {@link Policy}, resolves the decision (auto or interactive),
 * and writes an {@link AuditLog} entry before returning. The tool only executes
 * if the result is `granted`.
 */
export class Approver {
  private readonly policy: Policy;
  private readonly audit: AuditLog;
  private readonly prompter?: Prompter;
  private readonly logger: Logger;
  private readonly force: boolean;
  private readonly yolo: boolean;

  constructor(options: ApproverOptions) {
    this.policy = options.policy;
    this.audit = options.audit;
    this.prompter = options.prompter;
    this.logger = options.logger ?? nullLogger;
    this.force = options.force ?? options.yolo ?? false;
    this.yolo = options.yolo ?? false;
  }

  async request(req: ApprovalRequest): Promise<ApprovalResult> {
    const classification = this.policy.classify({
      tool: req.toolName,
      input: req.input,
      // In --yolo mode the tool's own predicate is bypassed (treated as safe).
      requiresApproval: this.yolo ? false : req.requiresApproval,
    });

    const base = {
      timestamp: new Date().toISOString(),
      sessionId: req.sessionId,
      toolCallId: req.toolCallId,
      toolName: req.toolName,
      input: req.input,
      reason: classification.reason,
      ...(req.diff
        ? { diff: { path: req.diff.path, added: req.diff.added, removed: req.diff.removed, sha256: req.diff.sha256 } }
        : {}),
    };

    // Denylist always wins — never overridable by any flag (§9.5).
    if (classification.decision === 'deny') {
      this.record({ ...base, decision: 'deny', granted: false, autoApproved: false });
      return { granted: false, decision: 'deny', autoApproved: false };
    }

    if (classification.decision === 'allow') {
      this.record({ ...base, decision: 'allow', granted: true, autoApproved: true });
      return { granted: true, decision: 'allow', autoApproved: true };
    }

    // decision === 'prompt'
    if (this.force || this.yolo) {
      this.record({ ...base, decision: 'prompt', granted: true, autoApproved: true });
      return { granted: true, decision: 'prompt', autoApproved: true };
    }

    if (!this.prompter) {
      // No interactive channel and not forced → deny with a clear safety error.
      this.record({ ...base, decision: 'prompt', granted: false, autoApproved: false });
      throw new SkyError(ErrorCode.ApprovalDenied, { name: req.toolName });
    }

    const answer = await this.prompter({
      toolName: req.toolName,
      input: req.input,
      reason: classification.reason,
      diff: req.diff,
    });

    if (answer === 'no') {
      this.record({ ...base, decision: 'prompt', granted: false, autoApproved: false });
      return { granted: false, decision: 'prompt', autoApproved: false };
    }

    let allowlistAdded: AllowlistEntry | undefined;
    if (answer === 'always') {
      allowlistAdded = Policy.deriveAllowlistPattern(req.toolName, req.input);
    }

    this.record({ ...base, decision: 'prompt', granted: true, autoApproved: false });
    return { granted: true, decision: 'prompt', autoApproved: false, allowlistAdded };
  }

  private record(entry: AuditEntry): void {
    try {
      this.audit.write(entry);
    } catch (error) {
      // Surface but do not silently drop; the loop decides how to proceed.
      this.logger.error('approver.auditFailed', { code: SkyError.from(error).code });
      throw error;
    }
  }
}
