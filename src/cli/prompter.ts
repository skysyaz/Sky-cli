import { createInterface } from 'node:readline/promises';
import chalk from 'chalk';
import { colorizeDiff } from '../safety/diff.js';
import type { Prompter, ApprovalAnswer } from '../safety/approver.js';

/**
 * An interactive approval prompter (§5.6). Renders the diff (for mutating tools)
 * and asks the user to approve, reject, or always-approve. `edit` is treated as
 * approve in this readline front-end.
 */
export function createInteractivePrompter(color: boolean): Prompter {
  const c = color ? chalk : ({ green: (s: string) => s, red: (s: string) => s, gray: (s: string) => s, bold: (s: string) => s, yellow: (s: string) => s } as any);

  return async (request): Promise<ApprovalAnswer> => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try {
      process.stdout.write('\n' + c.yellow(`⬢ Approve ${request.toolName}?`) + c.gray(` (${request.reason})\n`));
      if (request.diff) {
        process.stdout.write(colorizeDiff(request.diff.patch, c) + '\n');
        process.stdout.write(c.gray(`${request.diff.added} added, ${request.diff.removed} removed\n`));
      } else {
        process.stdout.write(c.gray(JSON.stringify(request.input) + '\n'));
      }
      const answer = (await rl.question(c.bold('[y]es [n]o [a]lways [e]dit > '))).trim().toLowerCase();
      if (answer === 'a' || answer === 'always') return 'always';
      if (answer === 'e' || answer === 'edit') return 'edit';
      if (answer === 'y' || answer === 'yes' || answer === '') return 'yes';
      return 'no';
    } finally {
      rl.close();
    }
  };
}

/** A prompter that denies everything — used when there is no interactive TTY. */
export const denyingPrompter: Prompter = async () => 'no';
