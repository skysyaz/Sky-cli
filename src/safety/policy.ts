import type { SkyConfig } from '../config/index.js';
import type { AllowlistEntry } from '../session/types.js';
import { matchAnyGlob, matchAnyCommand, matchCommandPattern, matchGlob } from './glob.js';
import { classifyShellCommand, isHardDeniedShellCommand, type ShellClassification } from './shell.js';

/** The outcome of classifying a tool call (§9.2). */
export type Decision = 'allow' | 'deny' | 'prompt';

export interface PolicyRequest {
  tool: string;
  input: Record<string, unknown>;
  /** The tool's own `requiresApproval` verdict for these inputs. */
  requiresApproval: boolean;
}

export interface Classification {
  decision: Decision;
  reason: string;
  /** Present for shell calls. */
  shell?: ShellClassification;
}

/**
 * The policy engine (§9.2). Combines static rules from config with dynamic
 * session-allowlist state. Rules are evaluated in a fixed order: denylist first
 * (always wins), then session allowlist, then config allowlist, then the tool's
 * own `requiresApproval` predicate. If nothing is definitive, the default is
 * `prompt`.
 */
export class Policy {
  constructor(
    private readonly config: SkyConfig,
    private sessionAllowlist: AllowlistEntry[] = [],
  ) {}

  setAllowlist(entries: AllowlistEntry[]): void {
    this.sessionAllowlist = entries;
  }

  private tools() {
    return this.config.tools;
  }

  classify(request: PolicyRequest): Classification {
    const { tool, input } = request;

    // --- 1. Denylist (always wins) ---
    if (tool === 'shell') {
      const command = String(input.command ?? '');
      const shell = classifyShellCommand(command);
      if (isHardDeniedShellCommand(command) || matchAnyCommand(command, this.tools().shell.deny, false)) {
        return { decision: 'deny', reason: 'matches shell denylist', shell };
      }
      // Session/config allowlists can auto-approve; otherwise tier default.
      if (this.matchesSessionAllowlist(tool, command)) {
        return { decision: 'allow', reason: 'session allowlist', shell };
      }
      if (matchAnyCommand(command, this.tools().shell.autoApprove, true)) {
        return { decision: 'allow', reason: 'config shell.autoApprove', shell };
      }
      if (shell.tier === 1 && shell.defaultAction === 'auto') {
        // Tier-1 is auto-approved only when explicitly allowlisted; default prompt.
        return { decision: 'prompt', reason: 'tier-1 not allowlisted', shell };
      }
      return { decision: 'prompt', reason: `shell tier-${shell.tier}: ${shell.reason}`, shell };
    }

    if (tool === 'read') {
      const path = String(input.path ?? '');
      if (matchAnyGlob(path, this.tools().read.deny)) {
        return { decision: 'deny', reason: 'matches read denylist' };
      }
      // Absolute / parent escapes always need a prompt (or are refused at execute).
      if (path.startsWith('/') || path.startsWith('..') || /^[A-Za-z]:[\\/]/.test(path)) {
        return { decision: 'prompt', reason: 'read outside working directory' };
      }
      if (this.matchesSessionAllowlist(tool, path)) {
        return { decision: 'allow', reason: 'session allowlist' };
      }
      if (matchAnyGlob(path, this.tools().read.autoApprove)) {
        return { decision: 'allow', reason: 'config read.autoApprove' };
      }
      return this.fromPredicate(request);
    }

    if (tool === 'write' || tool === 'edit') {
      const path = String(input.path ?? '');
      if (this.matchesSessionAllowlist(tool, path)) {
        return { decision: 'allow', reason: 'session allowlist' };
      }
      const autoApprove = tool === 'write' ? this.tools().write.autoApprove : this.tools().edit.autoApprove;
      if (matchAnyGlob(path, autoApprove)) {
        return { decision: 'allow', reason: `config ${tool}.autoApprove` };
      }
      // write/edit always require approval unless explicitly allowlisted (§6.3).
      return { decision: 'prompt', reason: `${tool} requires approval` };
    }

    if (tool === 'git') {
      const action = String(input.action ?? '');
      const flags = Array.isArray(input.flags) ? (input.flags as string[]) : [];
      if (action === 'push' && flags.some((f) => f === '--force' || f === '-f')) {
        if (!this.tools().git.allowForcePush) {
          return { decision: 'deny', reason: 'git force push denied by policy' };
        }
      }
      if (this.tools().git.autoApproveReads && ['status', 'diff', 'log', 'branch'].includes(action)) {
        return { decision: 'allow', reason: 'git read auto-approved' };
      }
      return { decision: 'prompt', reason: `git ${action} requires approval` };
    }

    if (tool === 'search') {
      const path = String(input.path ?? '');
      if (path.startsWith('/') || path.startsWith('..') || /^[A-Za-z]:[\\/]/.test(path)) {
        return { decision: 'prompt', reason: 'search outside working directory' };
      }
      // Read-only within cwd → auto; the tool predicate flags out-of-cwd searches.
      return this.fromPredicate(request);
    }

    // Unknown/MCP tools default to the predicate, then prompt.
    return this.fromPredicate(request);
  }

  private fromPredicate(request: PolicyRequest): Classification {
    return request.requiresApproval
      ? { decision: 'prompt', reason: 'tool requires approval' }
      : { decision: 'allow', reason: 'tool predicate: safe' };
  }

  private matchesSessionAllowlist(tool: string, target: string): boolean {
    return this.sessionAllowlist.some((entry) => {
      if (entry.tool !== tool) return false;
      // shell patterns are command prefixes; path patterns are globs.
      return tool === 'shell'
        ? matchCommandPattern(target, entry.pattern, true)
        : matchGlob(target, entry.pattern);
    });
  }

  /**
   * Derive the most specific pattern that would auto-approve this call, for the
   * "always" (a) decision (§9.8).
   */
  static deriveAllowlistPattern(tool: string, input: Record<string, unknown>): AllowlistEntry {
    if (tool === 'shell') {
      const command = String(input.command ?? '').trim();
      const prefix = command.split(/\s+/).slice(0, 2).join(' ');
      return { tool, pattern: `${prefix}*` };
    }
    const path = String(input.path ?? '');
    const dir = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '.';
    const ext = path.includes('.') ? `*.${path.split('.').pop()}` : '*';
    return { tool, pattern: `${dir}/**/${ext}` };
  }
}
