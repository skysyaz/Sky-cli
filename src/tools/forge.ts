import { z } from 'zod';
import { ErrorCode } from '../errors/index.js';
import {
  resolveForge,
  forgeWhoami,
  forgeListRepos,
  forgeGetRepo,
  formatForgeStatus,
} from '../forge/api.js';
import type { Tool, ToolContext, ToolResult } from './types.js';

const ACTIONS = ['status', 'whoami', 'repos', 'repo'] as const;

const schema = z.object({
  action: z.enum(ACTIONS),
  /** Forge id from config (default: config.forge.default / first with token). */
  forge: z.string().optional(),
  /** owner/repo for action=repo */
  name: z.string().optional(),
  /** Max repos for action=repos (default 30, max 100). */
  limit: z.number().int().positive().max(100).optional(),
});
type Input = z.infer<typeof schema>;

/**
 * Browse GitHub / Gitea via the REST API using the PAT saved in the dashboard.
 * Read-only — listing repos does not require approval.
 */
export const forgeTool: Tool<Input> = {
  name: 'forge',
  description:
    'GitHub/Gitea API: status (configured forges), whoami, repos (list your repositories), repo (get owner/repo). Uses the token from `sky dashboard` / `sky forge`. Prefer this over guessing clone URLs when the user asks to list GitHub/Gitea repos.',
  schema,
  parameters: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: [...ACTIONS] },
      forge: { type: 'string', description: 'Forge id (e.g. github, work)' },
      name: { type: 'string', description: 'owner/repo for action=repo' },
      limit: { type: 'number', description: 'Max repos to list (default 30)' },
    },
    required: ['action'],
  },
  requiresApproval() {
    return false;
  },
  async execute(input: Input, ctx: ToolContext): Promise<ToolResult> {
    try {
      if (input.action === 'status') {
        return { ok: true, output: formatForgeStatus(ctx.config) };
      }

      const resolved = resolveForge(ctx.config, input.forge);
      if (!resolved) {
        return {
          ok: false,
          output:
            'No forge token configured. Connect GitHub/Gitea in `sky dashboard` (Source Control → Connect),\n' +
            'or run: sky forge add github --type github --url https://github.com --token <pat>',
          code: ErrorCode.ToolInputInvalid,
          retryable: true,
        };
      }

      if (input.action === 'whoami') {
        const me = await forgeWhoami(resolved, ctx.signal);
        return {
          ok: true,
          output: `forge=${resolved.id} (${resolved.remote.type}) · login=${me.login}${me.name ? ` · ${me.name}` : ''}${me.htmlUrl ? `\n${me.htmlUrl}` : ''}`,
        };
      }

      if (input.action === 'repos') {
        const repos = await forgeListRepos(resolved, { limit: input.limit, signal: ctx.signal });
        if (repos.length === 0) {
          return { ok: true, output: `(no repositories visible on forge ${resolved.id})` };
        }
        const lines = repos.map(
          (r) =>
            `${r.private ? 'private' : 'public'}\t${r.fullName}\t${r.defaultBranch}\t${r.htmlUrl}${r.description ? `\t${r.description.slice(0, 80)}` : ''}`,
        );
        return {
          ok: true,
          output: `forge=${resolved.id} · ${repos.length} repo(s)\n` + lines.join('\n'),
          data: { count: repos.length, repos },
        };
      }

      // action === 'repo'
      if (!input.name) {
        return {
          ok: false,
          output: 'action=repo requires name (owner/repo).',
          code: ErrorCode.ToolInputInvalid,
          retryable: true,
        };
      }
      const repo = await forgeGetRepo(resolved, input.name, ctx.signal);
      return {
        ok: true,
        output: [
          `${repo.fullName} (${repo.private ? 'private' : 'public'})`,
          `branch: ${repo.defaultBranch}`,
          `url: ${repo.htmlUrl}`,
          repo.description ? `desc: ${repo.description}` : '',
          repo.updatedAt ? `updated: ${repo.updatedAt}` : '',
        ]
          .filter(Boolean)
          .join('\n'),
        data: { repo },
      };
    } catch (error) {
      return {
        ok: false,
        output: `forge ${input.action} failed: ${(error as Error).message}`,
        code: ErrorCode.ToolUnexpected,
        retryable: true,
      };
    }
  },
};
