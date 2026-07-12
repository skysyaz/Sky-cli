import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { ErrorCode, SkyError } from '../errors/index.js';
import { nullLogger, type Logger } from '../logging/index.js';
import { redact } from '../logging/index.js';
import { auditLogPath as defaultAuditPath } from '../config/paths.js';
import type { Decision } from './policy.js';

/** One append-only audit record (§9.6). */
export interface AuditEntry {
  timestamp: string;
  sessionId: string;
  toolCallId: string;
  toolName: string;
  input: Record<string, unknown>;
  decision: Decision;
  reason: string;
  granted: boolean;
  autoApproved: boolean;
  diff?: { path: string; added: number; removed: number; sha256: string };
}

/**
 * The audit log (§9.6). Append-only, one JSON object per line. Every approval
 * decision — granted or denied, auto or interactive — is written before the
 * tool executes. Secret patterns in the input are redacted.
 */
export class AuditLog {
  private readonly path: string;
  private readonly logger: Logger;

  constructor(options: { path?: string; logger?: Logger } = {}) {
    this.path = options.path ?? defaultAuditPath();
    this.logger = options.logger ?? nullLogger;
  }

  write(entry: AuditEntry): void {
    const line = JSON.stringify({ ...entry, input: redact(entry.input) }) + '\n';
    try {
      mkdirSync(dirname(this.path), { recursive: true });
      appendFileSync(this.path, line, 'utf8');
    } catch (cause) {
      // A failed audit write is itself an error (§B.6 SKY-E-6020) because the
      // safety guarantee depends on the record existing.
      this.logger.error('audit.writeFailed', { detail: (cause as Error).message });
      throw new SkyError(ErrorCode.AuditWriteFailed, { detail: (cause as Error).message }, cause);
    }
  }
}
