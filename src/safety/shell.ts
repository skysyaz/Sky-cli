/**
 * Shell command classification (§9.4). Every command is assigned one of four
 * risk tiers before any policy rule is evaluated. The tier sets the default
 * behaviour; user policy can tighten it but never loosen it.
 */

export type ShellTier = 1 | 2 | 3 | 4;

/**
 * Patterns that are ALWAYS denied, regardless of user config or `--yolo`
 * (§9.5). These are enforced in addition to the user's configurable denylist.
 */
export const HARDCODED_SHELL_DENY = [
  'rm -rf /',
  'rm -rf /*',
  'mkfs',
  'dd of=/dev/',
  'shutdown',
  'reboot',
  ':(){ :|:& };:',
];

export interface ShellClassification {
  tier: ShellTier;
  /** The default action implied by the tier. */
  defaultAction: 'auto' | 'prompt';
  reason: string;
}

/** Tier-1: read-only, in-workspace. Auto-approved only if allowlisted. */
const TIER1 = [/^ls\b/, /^cat\b/, /^head\b/, /^tail\b/, /^wc\b/, /^git\s+status\b/, /^git\s+log\b/, /^pwd\b/, /^echo\b/, /^grep\b/, /^rg\b/, /^find\b/];

/** Tier-2: read-only network side effects. Prompt by default. */
const TIER2 = [/^curl\s+(-[A-Za-z]*\s+)*(--request\s+GET|-X\s+GET|https?:\/\/)/, /^wget\b/, /^dig\b/, /^nslookup\b/, /^ping\b/];

/** Tier-4: mutating, irreversible or destructive. Always prompt; some denied. */
const TIER4 = [/\brm\s+-[a-z]*r[a-z]*f/, /\brm\s+-[a-z]*f[a-z]*r/, /\bgit\s+push\s+.*--force/, /\bgit\s+reset\s+--hard/, /\bmkfs\b/, /\bdd\s+of=/, /\bshutdown\b/, /\breboot\b/, /\b:\(\)\s*\{/];

/** Classify a shell command into its risk tier. */
export function classifyShellCommand(command: string): ShellClassification {
  const cmd = command.trim();

  if (TIER4.some((re) => re.test(cmd))) {
    return { tier: 4, defaultAction: 'prompt', reason: 'mutating, irreversible or destructive' };
  }
  if (TIER2.some((re) => re.test(cmd))) {
    return { tier: 2, defaultAction: 'prompt', reason: 'read-only network side effect' };
  }
  if (TIER1.some((re) => re.test(cmd))) {
    return { tier: 1, defaultAction: 'auto', reason: 'read-only, in-workspace' };
  }
  // Everything else is treated as tier-3: mutating but reversible.
  return { tier: 3, defaultAction: 'prompt', reason: 'mutating, reversible' };
}
