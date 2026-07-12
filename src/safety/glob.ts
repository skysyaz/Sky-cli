/**
 * Minimal glob / command-pattern matching for the policy engine. Not a full
 * globbing implementation — just enough for the allowlist/denylist patterns in
 * Appendix A (globs like "src slash-star-star slash-star.ts", `npm test*`,
 * `rm -rf /`, `dd of=/dev/*`).
 */

/** Convert a glob into a RegExp. `**` matches across path separators, `*` does not. */
export function globToRegExp(glob: string): RegExp {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        re += '.*';
        i++;
        if (glob[i + 1] === '/') i++; // consume the slash after **
      } else {
        re += '[^/]*';
      }
    } else if (c === '?') {
      re += '[^/]';
    } else if ('.+^${}()|[]\\'.includes(c)) {
      re += '\\' + c;
    } else {
      re += c;
    }
  }
  return new RegExp(`^${re}$`);
}

/** Match a filesystem path against a glob. */
export function matchGlob(path: string, glob: string): boolean {
  const normalized = path.replace(/^\.\//, '');
  return globToRegExp(glob).test(normalized) || globToRegExp(glob).test(path);
}

/** True if the path matches any glob in the list. */
export function matchAnyGlob(path: string, globs: string[]): boolean {
  return globs.some((g) => matchGlob(path, g));
}

/**
 * Match a shell command against a pattern where `*` is a wildcard.
 * `anchored` controls whether the pattern must match from the start of the
 * command (allowlist semantics) or may match anywhere (denylist semantics —
 * so `shutdown` blocks `sudo shutdown now`).
 */
export function matchCommandPattern(command: string, pattern: string, anchored: boolean): boolean {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  const re = anchored ? new RegExp(`^${escaped}`) : new RegExp(escaped);
  return re.test(command.trim());
}

export function matchAnyCommand(command: string, patterns: string[], anchored: boolean): boolean {
  return patterns.some((p) => matchCommandPattern(command, p, anchored));
}
