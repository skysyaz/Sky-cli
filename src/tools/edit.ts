import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { z } from 'zod';
import { ErrorCode } from '../errors/index.js';
import type { Tool, ToolContext, ToolResult, ToolDiffPreview } from './types.js';
import { resolveInCwd, isInsideCwd } from './paths.js';

const schema = z.object({
  path: z.string(),
  oldText: z.string(),
  newText: z.string(),
  /** 'all' or a positive count; default fails if oldText appears more than once. */
  occurrences: z.union([z.literal('all'), z.number().int().positive()]).optional(),
});
type Input = z.infer<typeof schema>;

function countOccurrences(haystack: string, needle: string): number {
  if (needle === '') return 0;
  let count = 0;
  let idx = haystack.indexOf(needle);
  while (idx !== -1) {
    count++;
    idx = haystack.indexOf(needle, idx + needle.length);
  }
  return count;
}

function applyEdit(content: string, input: Input): { result: string; count: number } {
  const count = countOccurrences(content, input.oldText);
  if (input.occurrences === 'all') {
    return { result: content.split(input.oldText).join(input.newText), count };
  }
  const limit = typeof input.occurrences === 'number' ? input.occurrences : 1;
  let replaced = 0;
  let result = content;
  let searchFrom = 0;
  while (replaced < limit) {
    const idx = result.indexOf(input.oldText, searchFrom);
    if (idx === -1) break;
    result = result.slice(0, idx) + input.newText + result.slice(idx + input.oldText.length);
    searchFrom = idx + input.newText.length;
    replaced++;
  }
  return { result, count };
}

/**
 * The `edit` tool (§6.4). Preferred over `write` for targeted changes: it fails
 * loudly if `oldText` is not found (drift) and, by default, if it appears more
 * than once (ambiguity), forcing the agent to disambiguate.
 */
export const editTool: Tool<Input> = {
  name: 'edit',
  description: 'Replace an exact string in a file with a new string.',
  schema,
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path relative to the working directory' },
      oldText: { type: 'string', description: 'Exact text to replace (must be unique unless occurrences is set)' },
      newText: { type: 'string', description: 'Replacement text' },
      occurrences: { description: "'all' or a positive integer", type: ['string', 'integer'] },
    },
    required: ['path', 'oldText', 'newText'],
  },
  requiresApproval() {
    return true;
  },
  async preview(input: Input, ctx: ToolContext): Promise<ToolDiffPreview | undefined> {
    const abs = resolveInCwd(ctx.cwd, input.path);
    // Never read file contents outside cwd for the approval preview.
    if (!ctx.config.tools.write.allowOutsideCwd && !isInsideCwd(ctx.cwd, abs)) {
      return undefined;
    }
    if (!existsSync(abs)) return undefined;
    const oldContent = readFileSync(abs, 'utf8');
    if (countOccurrences(oldContent, input.oldText) === 0) return undefined;
    const { result } = applyEdit(oldContent, input);
    return { path: input.path, oldContent, newContent: result };
  },
  async execute(input: Input, ctx: ToolContext): Promise<ToolResult> {
    const abs = resolveInCwd(ctx.cwd, input.path);
    if (!ctx.config.tools.write.allowOutsideCwd && !isInsideCwd(ctx.cwd, abs)) {
      return {
        ok: false,
        output: `Edit refused: ${input.path} is outside the working directory.`,
        code: ErrorCode.WritePathOutsideCwd,
        retryable: true,
      };
    }
    if (!existsSync(abs)) {
      return { ok: false, output: `File not found: ${input.path}`, code: ErrorCode.EditOldTextNotFound, retryable: true };
    }
    const content = readFileSync(abs, 'utf8');
    const count = countOccurrences(content, input.oldText);
    if (count === 0) {
      return {
        ok: false,
        output: `oldText not found in ${input.path}. Re-read the file and try again.`,
        code: ErrorCode.EditOldTextNotFound,
        retryable: true,
      };
    }
    if (count > 1 && input.occurrences === undefined) {
      return {
        ok: false,
        output: `oldText appears ${count} times in ${input.path}; add more context or set occurrences.`,
        code: ErrorCode.EditOldTextAmbiguous,
        retryable: true,
      };
    }
    const { result } = applyEdit(content, input);
    writeFileSync(abs, result, 'utf8');
    return { ok: true, output: `Edited ${input.path} (${count} occurrence${count === 1 ? '' : 's'}).`, data: { count } };
  },
};
