import { z } from 'zod';
import { simpleGit } from 'simple-git';
import { ErrorCode } from '../errors/index.js';
import {
  matchForgeForRemoteUrl,
  readForgeToken,
  repoPathFromRemoteUrl,
  authorizedHttpsRemoteUrl,
} from '../forge/index.js';
import type { Tool, ToolContext, ToolResult } from './types.js';

const ACTIONS = [
  'status',
  'diff',
  'log',
  'branch',
  'add',
  'commit',
  'checkout',
  'push',
  'pull',
  'fetch',
  'remote',
] as const;

const schema = z.object({
  action: z.enum(ACTIONS),
  args: z.array(z.string()).optional(),
  flags: z.array(z.string()).optional(),
  message: z.string().optional(),
});
type Input = z.infer<typeof schema>;

const READ_ACTIONS = new Set(['status', 'diff', 'log', 'branch', 'remote', 'fetch']);

/** Strip credentials from URLs so PATs never land in tool output / session history. */
export function redactSecrets(text: string): string {
  return text
    .replace(/:\/\/[^/\s]+@/g, '://***@')
    .replace(/\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{20,}\b/g, '$1_***')
    .replace(/\b(glpat-|gitea_)[A-Za-z0-9_]{10,}\b/g, '***');
}

/**
 * Resolve an authenticated HTTPS URL for a named remote when a forge + token
 * are configured. Returns null to use the normal remote name.
 */
async function forgeAuthUrl(
  cwd: string,
  config: ToolContext['config'],
  remoteName: string,
): Promise<string | null> {
  const git = simpleGit({ baseDir: cwd });
  const remotes = await git.getRemotes(true);
  const remote = remotes.find((r) => r.name === remoteName) ?? remotes[0];
  if (!remote) return null;
  const url = remote.refs.push || remote.refs.fetch;
  if (!url) return null;
  const match = matchForgeForRemoteUrl(url, config.forge);
  if (!match) return null;
  const token = readForgeToken(match.id);
  if (!token) return null;
  const path = repoPathFromRemoteUrl(url);
  if (!path) return null;
  return authorizedHttpsRemoteUrl(
    match.remote.type,
    match.remote.baseUrl,
    path,
    token,
    match.remote.username,
  );
}

/**
 * The `git` tool (§6.7). Typed wrapper for safety rules. When a GitHub/Gitea
 * forge token is configured, push/pull use HTTPS auth without rewriting remotes.
 */
export const gitTool: Tool<Input> = {
  name: 'git',
  description:
    'Run a typed git operation (status, diff, log, branch, add, commit, checkout, push, pull, fetch, remote). Uses forge tokens for HTTPS push/pull when configured.',
  schema,
  parameters: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: [...ACTIONS],
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
          const parsed = Number.parseInt(String(args[0] ?? '10'), 10);
          const count = Number.isFinite(parsed) && parsed > 0 ? String(parsed) : '10';
          const log = await git.log(['-n', count]);
          return { ok: true, output: log.all.map((c) => `${c.hash.slice(0, 8)} ${c.message}`).join('\n') };
        }
        case 'branch': {
          const branches = await git.branchLocal();
          return { ok: true, output: branches.all.join('\n') };
        }
        case 'remote': {
          const remotes = await git.getRemotes(true);
          const lines = remotes.map((r) => `${r.name}\t${r.refs.fetch || r.refs.push || ''}`);
          return { ok: true, output: lines.join('\n') || '(no remotes)' };
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
        case 'fetch': {
          const remoteName = args[0] ?? 'origin';
          const authUrl = await forgeAuthUrl(ctx.cwd, ctx.config, remoteName);
          if (authUrl) {
            await git.fetch(authUrl, args.slice(1).concat(flags));
            return { ok: true, output: `Fetched via forge auth (${remoteName}).` };
          }
          await git.fetch(args.concat(flags));
          return { ok: true, output: 'Fetched.' };
        }
        case 'pull': {
          const remoteName = args[0] ?? 'origin';
          const branch = args[1];
          const authUrl = await forgeAuthUrl(ctx.cwd, ctx.config, remoteName);
          if (authUrl) {
            if (branch) await git.pull(authUrl, branch, flags);
            else await git.pull(authUrl, undefined, flags);
            return { ok: true, output: `Pulled via forge auth (${remoteName}).` };
          }
          await git.pull(args.concat(flags));
          return { ok: true, output: 'Pulled.' };
        }
        case 'push': {
          const allOpts = [...flags, ...args];
          if (allOpts.includes('--force') || allOpts.includes('-f')) {
            if (!ctx.config.tools.git.allowForcePush) {
              return { ok: false, output: 'Force push denied by policy.', code: ErrorCode.GitForcePushDenied };
            }
          }
          const remoteName = args[0] ?? 'origin';
          const branch = args[1];
          const authUrl = await forgeAuthUrl(ctx.cwd, ctx.config, remoteName);
          if (authUrl) {
            if (branch) await git.push(authUrl, branch, flags);
            else await git.push(authUrl, undefined, flags);
            return { ok: true, output: `Pushed via forge auth (${remoteName}).` };
          }
          await git.push(args.concat(flags));
          return { ok: true, output: 'Pushed.' };
        }
        default:
          return { ok: false, output: `Unsupported git action.`, code: ErrorCode.ToolInputInvalid, retryable: true };
      }
    } catch (error) {
      return {
        ok: false,
        output: redactSecrets(`git ${input.action} failed: ${(error as Error).message}`),
        code: ErrorCode.ToolUnexpected,
      };
    }
  },
};
