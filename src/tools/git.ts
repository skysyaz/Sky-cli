import { z } from 'zod';
import { simpleGit } from 'simple-git';
import { ErrorCode } from '../errors/index.js';
import type { Tool, ToolContext, ToolResult } from './types.js';

const schema = z.object({
  action: z.enum(['status', 'diff', 'log', 'branch', 'add', 'commit', 'checkout', 'push']),
  args: z.array(z.string()).optional(),
  flags: z.array(z.string()).optional(),
  message: z.string().optional(),
});
type Input = z.infer<typeof schema>;

const READ_ACTIONS = new Set(['status', 'diff', 'log', 'branch']);

/**
 * The `git` tool (§6.7). A typed wrapper so the safety layer can apply targeted
 * rules: reads (status/log/diff/branch) are auto-approved; commit requires
 * approval; `push --force` is denied unless `tools.git.allowForcePush`.
 */
export const gitTool: Tool<Input> = {
  name: 'git',
  description: 'Run a typed git operation (status, diff, log, branch, add, commit, checkout, push).',
  schema,
  parameters: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: ['status', 'diff', 'log', 'branch', 'add', 'commit', 'checkout', 'push'],
      },
      args: { type: 'array', items: { type: 'string' } },
      flags: { type: 'array', items: { type: 'string' } },
      message: { type: 'string', description: 'Commit message (for action=commit)' },
    },
    required: ['action'],
  },
  requiresApproval(input: Input) {
    return !READ_ACTIONS.has(input.action);
  },
  async execute(input: Input, ctx: ToolContext): Promise<ToolResult> {
    const git = simpleGit({ baseDir: ctx.cwd });
    const args = input.args ?? [];
    const flags = input.flags ?? [];
    try {
      switch (input.action) {
        case 'status': {
          const status = await git.status();
          return { ok: true, output: JSON.stringify({ current: status.current, files: status.files }, null, 2) };
        }
        case 'diff': {
          const diff = await git.diff(args);
          return { ok: true, output: diff || '(no changes)' };
        }
        case 'log': {
          const log = await git.log(['-n', args[0] ?? '10']);
          return { ok: true, output: log.all.map((c) => `${c.hash.slice(0, 8)} ${c.message}`).join('\n') };
        }
        case 'branch': {
          const branches = await git.branchLocal();
          return { ok: true, output: branches.all.join('\n') };
        }
        case 'add': {
          await git.add(args.length ? args : ['.']);
          return { ok: true, output: `Staged ${args.length ? args.join(', ') : 'all changes'}.` };
        }
        case 'commit': {
          if (!input.message) {
            return { ok: false, output: 'commit requires a message.', code: ErrorCode.ToolInputInvalid, retryable: true };
          }
          const result = await git.commit(input.message, args);
          return { ok: true, output: `Committed ${result.commit} (${result.summary.changes} changes).` };
        }
        case 'checkout': {
          await git.checkout(args);
          return { ok: true, output: `Checked out ${args.join(' ')}.` };
        }
        case 'push': {
          if (flags.includes('--force') || flags.includes('-f')) {
            if (!ctx.config.tools.git.allowForcePush) {
              return { ok: false, output: 'Force push denied by policy.', code: ErrorCode.GitForcePushDenied };
            }
          }
          await git.push(args.concat(flags));
          return { ok: true, output: 'Pushed.' };
        }
        default:
          return { ok: false, output: `Unsupported git action.`, code: ErrorCode.ToolInputInvalid, retryable: true };
      }
    } catch (error) {
      return { ok: false, output: `git ${input.action} failed: ${(error as Error).message}`, code: ErrorCode.ToolUnexpected };
    }
  },
};
