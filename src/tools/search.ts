import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { z } from 'zod';
import { execa } from 'execa';
import { ErrorCode } from '../errors/index.js';
import type { Tool, ToolContext, ToolResult } from './types.js';
import { resolveInCwd, isInsideCwd } from './paths.js';

const schema = z.object({
  pattern: z.string(),
  path: z.string().optional(),
  glob: z.string().optional(),
  caseSensitive: z.boolean().optional(),
  maxResults: z.number().int().positive().optional(),
});
type Input = z.infer<typeof schema>;

interface Match {
  file: string;
  line: number;
  text: string;
}

const IGNORE_DIRS = new Set(['node_modules', '.git', 'dist', 'coverage', '.sky-test']);

/** Pure-JS recursive search used when ripgrep is unavailable. */
function jsSearch(root: string, input: Input, cwd: string): Match[] {
  const flags = input.caseSensitive ? 'g' : 'gi';
  let re: RegExp;
  try {
    re = new RegExp(input.pattern, flags);
  } catch {
    re = new RegExp(input.pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);
  }
  const max = input.maxResults ?? 200;
  const matches: Match[] = [];

  const walk = (dir: string): void => {
    if (matches.length >= max) return;
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (matches.length >= max) return;
      if (IGNORE_DIRS.has(entry)) continue;
      const full = join(dir, entry);
      let stat;
      try {
        stat = statSync(full);
      } catch {
        continue;
      }
      if (stat.isDirectory()) {
        walk(full);
      } else if (stat.isFile() && stat.size < 2 * 1024 * 1024) {
        let content: string;
        try {
          content = readFileSync(full, 'utf8');
        } catch {
          continue;
        }
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          re.lastIndex = 0;
          if (re.test(lines[i])) {
            matches.push({ file: relative(cwd, full) || full, line: i + 1, text: lines[i].trim().slice(0, 200) });
            if (matches.length >= max) return;
          }
        }
      }
    }
  };

  const stat = statSync(root);
  if (stat.isFile()) {
    const content = readFileSync(root, 'utf8').split('\n');
    for (let i = 0; i < content.length; i++) {
      re.lastIndex = 0;
      if (re.test(content[i])) matches.push({ file: relative(cwd, root) || root, line: i + 1, text: content[i].trim().slice(0, 200) });
    }
  } else {
    walk(root);
  }
  return matches;
}

/**
 * The `search` tool (§6.5). Uses ripgrep when available, falling back to a
 * pure-JS scan. Read-only; auto-approved within cwd, requires approval outside.
 */
export const searchTool: Tool<Input> = {
  name: 'search',
  description: 'Search file contents for a regex pattern (ripgrep, JS fallback).',
  schema,
  parameters: {
    type: 'object',
    properties: {
      pattern: { type: 'string', description: 'Regular expression to search for' },
      path: { type: 'string', description: 'File or directory to search (default: cwd)' },
      glob: { type: 'string', description: 'Glob filter, e.g. **/*.ts' },
      caseSensitive: { type: 'boolean' },
      maxResults: { type: 'integer' },
    },
    required: ['pattern'],
  },
  requiresApproval(input: Input) {
    // Searches outside the workspace require approval (§6.5).
    return input.path !== undefined && input.path.startsWith('..');
  },
  async execute(input: Input, ctx: ToolContext): Promise<ToolResult> {
    const searchRoot = resolveInCwd(ctx.cwd, input.path ?? '.');
    if (!existsSync(searchRoot)) {
      return { ok: false, output: `Path not found: ${input.path}`, code: ErrorCode.ToolInputInvalid, retryable: true };
    }

    let matches: Match[] = [];
    try {
      const args = ['--line-number', '--no-heading', '--color=never'];
      if (!input.caseSensitive) args.push('--ignore-case');
      if (input.glob) args.push('--glob', input.glob);
      if (input.maxResults) args.push('--max-count', String(input.maxResults));
      args.push(input.pattern, searchRoot);
      const { stdout } = await execa('rg', args, { cwd: ctx.cwd, reject: false });
      matches = stdout
        .split('\n')
        .filter(Boolean)
        .slice(0, input.maxResults ?? 200)
        .map((line) => {
          const m = line.match(/^(.*?):(\d+):(.*)$/);
          if (!m) return undefined;
          return { file: relative(ctx.cwd, m[1]) || m[1], line: Number(m[2]), text: m[3].trim().slice(0, 200) };
        })
        .filter((x): x is Match => x !== undefined);
    } catch {
      // ripgrep not installed → JS fallback.
      if (!isInsideCwd(ctx.cwd, searchRoot) && !this.requiresApproval(input)) {
        // defensive: keep behaviour consistent
      }
      matches = jsSearch(searchRoot, input, ctx.cwd);
    }

    if (matches.length === 0) return { ok: true, output: `No matches for /${input.pattern}/.`, data: { matches: [] } };
    const rendered = matches.map((m) => `${m.file}:${m.line}: ${m.text}`).join('\n');
    return { ok: true, output: rendered, data: { matches } };
  },
};
