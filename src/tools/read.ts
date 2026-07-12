import { readFileSync, statSync, existsSync } from 'node:fs';
import { z } from 'zod';
import { ErrorCode } from '../errors/index.js';
import type { Tool, ToolContext, ToolResult } from './types.js';
import { resolveInCwd } from './paths.js';

const schema = z.object({
  path: z.string(),
  offset: z.number().int().nonnegative().optional(),
  limit: z.number().int().positive().optional(),
});
type Input = z.infer<typeof schema>;

const MAX_BYTES = 256 * 1024;

/** Detect a binary file via a null-byte heuristic (§6.2). */
function looksBinary(buffer: Buffer): boolean {
  const sample = buffer.subarray(0, 8000);
  return sample.includes(0);
}

/**
 * The `read` tool (§6.2). Reads a file relative to cwd. Binary files return a
 * metadata placeholder; large files are truncated with a notice; `offset`/`limit`
 * select a line range.
 */
export const readTool: Tool<Input> = {
  name: 'read',
  description: 'Read the contents of a file. Supports line offset/limit for large files.',
  schema,
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path relative to the working directory' },
      offset: { type: 'integer', description: '0-based line to start from' },
      limit: { type: 'integer', description: 'Maximum number of lines to return' },
    },
    required: ['path'],
  },
  requiresApproval() {
    // Reads are gated by the policy engine (deny/allow globs), not a predicate.
    return true;
  },
  async execute(input: Input, ctx: ToolContext): Promise<ToolResult> {
    const abs = resolveInCwd(ctx.cwd, input.path);
    if (!existsSync(abs)) {
      return { ok: false, output: `File not found: ${input.path}`, code: ErrorCode.ToolInputInvalid, retryable: true };
    }
    const stat = statSync(abs);
    const buffer = readFileSync(abs);
    if (looksBinary(buffer)) {
      return {
        ok: true,
        output: `[binary file: ${input.path}, ${stat.size} bytes — contents omitted]`,
        data: { binary: true, size: stat.size },
      };
    }

    let text = buffer.toString('utf8');
    let truncated = false;
    if (buffer.byteLength > MAX_BYTES && input.offset === undefined && input.limit === undefined) {
      text = buffer.subarray(0, MAX_BYTES).toString('utf8');
      truncated = true;
    }

    if (input.offset !== undefined || input.limit !== undefined) {
      const lines = text.split('\n');
      const start = input.offset ?? 0;
      const end = input.limit !== undefined ? start + input.limit : lines.length;
      text = lines.slice(start, end).join('\n');
    }

    const notice = truncated ? `\n[truncated at ${MAX_BYTES} bytes; use offset/limit for more]` : '';
    return { ok: true, output: text + notice, data: { size: stat.size, truncated } };
  },
};
