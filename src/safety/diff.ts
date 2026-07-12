import { createTwoFilesPatch } from 'diff';
import { createHash } from 'node:crypto';

export interface DiffResult {
  /** Unified diff text (empty when there is no change). */
  patch: string;
  added: number;
  removed: number;
  /** sha256 of the proposed new content, stored in the audit log (§9.6). */
  sha256: string;
}

/**
 * Generate a unified diff between current and proposed file content (§9.3). Used
 * both to render the approval prompt and to record the change in the audit log.
 */
export function generateDiff(path: string, oldContent: string, newContent: string): DiffResult {
  const patch = createTwoFilesPatch(path, path, oldContent, newContent, undefined, undefined, {
    context: 3,
  });
  let added = 0;
  let removed = 0;
  for (const line of patch.split('\n')) {
    if (line.startsWith('+') && !line.startsWith('+++')) added++;
    else if (line.startsWith('-') && !line.startsWith('---')) removed++;
  }
  const sha256 = createHash('sha256').update(newContent).digest('hex');
  return { patch, added, removed, sha256 };
}

/** Colorize a unified diff for the TUI (§9.3): green add, red delete, gray context. */
export function colorizeDiff(patch: string, chalk: { green: (s: string) => string; red: (s: string) => string; gray: (s: string) => string }): string {
  return patch
    .split('\n')
    .map((line) => {
      if (line.startsWith('+') && !line.startsWith('+++')) return chalk.green(line);
      if (line.startsWith('-') && !line.startsWith('---')) return chalk.red(line);
      if (line.startsWith('@@')) return chalk.gray(line);
      return line;
    })
    .join('\n');
}
