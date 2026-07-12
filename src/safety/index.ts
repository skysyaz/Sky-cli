/**
 * The `safety/` module (§2.4.4, §9). Sits between the agent loop and the tool
 * registry: classify → authorize → audit. Depends only on config/logging/errors
 * (and the session `AllowlistEntry` type, which is a pure data shape).
 */
export { Policy, type Decision, type PolicyRequest, type Classification } from './policy.js';
export {
  classifyShellCommand,
  HARDCODED_SHELL_DENY,
  type ShellTier,
  type ShellClassification,
} from './shell.js';
export { generateDiff, colorizeDiff, type DiffResult } from './diff.js';
export { AuditLog, type AuditEntry } from './audit.js';
export {
  Approver,
  type Prompter,
  type ApprovalAnswer,
  type ApprovalRequest,
  type ApprovalResult,
  type ApprovalPromptRequest,
  type ApproverOptions,
} from './approver.js';
export { matchGlob, matchAnyGlob, matchCommandPattern, matchAnyCommand, globToRegExp } from './glob.js';
