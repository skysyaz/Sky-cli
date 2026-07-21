import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { z } from 'zod';
import { ErrorCode } from '../errors/index.js';
import type { Tool, ToolContext, ToolResult, ToolDiffPreview } from './types.js';
import { resolveInCwd, isInsideCwd } from './paths.js';

const schema = z.object({
  path: z.string(),
  content: z.string(),
});
type Input = z.infer<typeof schema>;

/**
 * The `write` tool (§6.3). The most dangerous tool — it can destroy existing
 * content — so it always requires approval unless allowlisted. Refuses to write
 * outside cwd unless `tools.write.allowOutsideCwd` is set.
 */
export const writeTool: Tool<Input> = {
  name: 'write',
  description: 'Write content to a file, creating or overwriting it.',
  schema,
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path relative to the working directory' },
      content: { type: 'string', description: 'Full file content to write' },
    },
    required: ['path', 'content'],
  },
  requiresApproval() {
    return true;
  },
  async preview(input: Input, ctx: ToolContext): Promise<ToolDiffPreview | undefined> {
    const abs = resolveInCwd(ctx.cwd, input.path);
    // Do not leak contents of files outside the sandbox into the approval UI.
    if (!ctx.config.tools.write.allowOutsideCwd && !isInsideCwd(ctx.cwd, abs)) {
      return { path: input.path, oldContent: '', newContent: input.content };
    }
    const oldContent = existsSync(abs) ? readFileSync(abs, 'utf8') : '';
    return { path: input.path, oldContent, newContent: input.content };
  },
  async execute(input: Input, ctx: ToolContext): Promise<ToolResult> {
    const abs = resolveInCwd(ctx.cwd, input.path);
    if (!ctx.config.tools.write.allowOutsideCwd && !isInsideCwd(ctx.cwd, abs)) {
      return {
        ok: false,
        output: `Write refused: ${input.path} is outside the working directory.`,
        code: ErrorCode.WritePathOutsideCwd,
        retryable: true,
      };
    }
    mkdirSync(dirname(abs), { recursive: true });
    const existed = existsSync(abs);
    writeFileSync(abs, input.content, 'utf8');
    return {
      ok: true,
      output: `${existed ? 'Overwrote' : 'Created'} ${input.path} (${Buffer.byteLength(input.content)} bytes).`,
      data: { created: !existed },
    };
  },
};
