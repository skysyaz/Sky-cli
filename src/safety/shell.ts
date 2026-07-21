/**
 * Shell command classification (§9.4). Every command is assigned one of four
 * risk tiers before any policy rule is evaluated. The tier sets the default
 * behaviour; user policy can tighten it but never loosen it.
 */

export type ShellTier = 1 | 2 | 3 | 4;

/**
 * Legacy string patterns kept for config-merge compatibility. Prefer
 * {@link isHardDeniedShellCommand} for the hardcoded denylist — substring
 * matching of `rm -rf /` falsely blocked `rm -rf /tmp`.
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
const TIER1 = [
  /^ls\b/,
  /^cat\b/,
  /^head\b/,
  /^tail\b/,
  /^wc\b/,
  /^git\s+status\b/,
  /^git\s+log\b/,
  /^pwd\b/,
  /^echo\b/,
  /^grep\b/,
  /^rg\b/,
  /^find\b/,
];

/** Tier-2: read-only network side effects. Prompt by default. */
const TIER2 = [
  /^curl\s+(-[A-Za-z]*\s+)*(--request\s+GET|-X\s+GET|https?:\/\/)/,
  /^wget\b/,
  /^dig\b/,
  /^nslookup\b/,
  /^ping\b/,
];

/** Absolute or bare shell interpreter after a pipe / list separator. */
const PIPE_TO_SHELL =
  /(?:\||;)\s*(?:sudo\s+)?(?:\/(?:usr\/)?(?:local\/)?bin\/)?(?:ba)?sh\b/;
const PIPE_TO_ZSH =
  /\|\s*(?:sudo\s+)?(?:\/(?:usr\/)?(?:local\/)?bin\/)?zsh\b/;

/** Tier-4: mutating, irreversible or destructive. Always prompt; some denied. */
const TIER4 = [
  /\brm\s+-[a-z]*r[a-z]*f/,
  /\brm\s+-[a-z]*f[a-z]*r/,
  /\brm\s+.*--recursive\b.*--force\b/,
  /\brm\s+.*--force\b.*--recursive\b/,
  /\bgit\s+push\s+.*--force/,
  /\bgit\s+reset\s+--hard/,
  /\bmkfs\b/,
  /\bdd\s+of=/,
  /\bshutdown\b/,
  /\breboot\b/,
  /\b:\(\)\s*\{/,
  /\bchmod\s+-R\b/,
  /\bchown\s+-R\b/,
  PIPE_TO_SHELL,
  PIPE_TO_ZSH,
];

/** Tokenize a shell command roughly (enough for denylist checks). */
function tokenize(command: string): string[] {
  return command
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .filter(Boolean);
}

/** True when a path argument targets the filesystem root (`/` or `/*`). */
function isRootPath(arg: string): boolean {
  const cleaned = arg.replace(/^['"]|['"]$/g, '');
  return cleaned === '/' || cleaned === '/*' || cleaned === '/.';
}

/**
 * Hardcoded denylist that always wins over `--yolo` / `--force` (§9.5).
 * Uses structured checks so `rm -rf /tmp` is allowed (still tier-4 prompt)
 * while `rm -rf /`, long-form flags, pipe-to-shell, and device wipes are blocked.
 */
export function isHardDeniedShellCommand(command: string): boolean {
  const cmd = command.trim();
  if (!cmd) return false;

  // Fork bomb
  if (/:\(\)\s*\{\s*:\|:&\s*\}\s*;?\s*:/.test(cmd)) return true;

  // Pipe / redirect into a shell interpreter (curl|sh, wget|/bin/bash, …)
  if (PIPE_TO_SHELL.test(cmd) || PIPE_TO_ZSH.test(cmd)) {
    return true;
  }
  // Explicit `bash -c "$(curl …)"` / `sh -c` wrapping a download is tier-4, not hard-deny,
  // unless it also matches other patterns below.

  // mkfs / wipefs / disk destroyers
  if (/\b(?:mkfs(?:\.\w+)?|wipefs|fdisk|parted)\b/.test(cmd)) return true;

  // dd writing to a block device
  if (/\bdd\b/.test(cmd) && /\bof=\/dev\//.test(cmd)) return true;

  // Power control
  if (/\b(?:shutdown|reboot|poweroff|halt)\b/.test(cmd)) return true;

  // chmod/chown -R on root
  if (/\b(?:chmod|chown)\s+(?:-[a-zA-Z]*R[a-zA-Z]*|--recursive)\b/.test(cmd)) {
    const tokens = tokenize(cmd);
    if (tokens.some(isRootPath)) return true;
  }

  // rm with recursive+force targeting root (short and long form)
  const hasRm = /\brm\b/.test(cmd);
  if (hasRm) {
    const recursive =
      /(?:^|\s)-[a-zA-Z]*r[a-zA-Z]*(?:\s|$)/i.test(cmd) || /\s--recursive(?:\s|$)/.test(cmd);
    const force =
      /(?:^|\s)-[a-zA-Z]*f[a-zA-Z]*(?:\s|$)/i.test(cmd) || /\s--force(?:\s|$)/.test(cmd);
    if (recursive && force) {
      const tokens = tokenize(cmd);
      // Skip the `rm` binary and flag tokens; inspect path operands.
      for (const token of tokens.slice(1)) {
        if (token.startsWith('-')) continue;
        if (isRootPath(token)) return true;
      }
    }
  }

  return false;
}

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
