import { z } from 'zod';
import { execa } from 'execa';
import { ErrorCode } from '../errors/index.js';
import type { Tool, ToolContext, ToolResult } from './types.js';

const schema = z.object({
  command: z.string(),
  timeoutMs: z.number().int().positive().optional(),
});
type Input = z.infer<typeof schema>;

const MAX_OUTPUT = 30_000;

/**
 * The `shell` tool (§6.6). The highest-risk tool: every invocation is subject to
 * the strictest policy (classification + denylist, enforced in the safety layer
 * before execute is ever called). This module only runs the command.
 */
export const shellTool: Tool<Input> = {
  name: 'shell',
  description: 'Execute a shell command in the working directory.',
  schema,
  parameters: {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'The shell command to run' },
      timeoutMs: { type: 'integer', description: 'Timeout in milliseconds' },
    },
    required: ['command'],
  },
  requiresApproval() {
    // Always requires approval unless the policy allowlist matches (§6.6).
    return true;
  },
  async execute(input: Input, ctx: ToolContext): Promise<ToolResult> {
    const timeout = input.timeoutMs ?? ctx.config.tools.shell.timeoutMs;
    try {
      const result = await execa(input.command, {
        cwd: ctx.cwd,
        shell: true,
        timeout,
        reject: false,
        env: { ...process.env, ...ctx.config.tools.shell.env },
        signal: ctx.signal,
      });
      if (result.timedOut) {
        return { ok: false, output: `Command timed out after ${timeout}ms.`, code: ErrorCode.ShellTimeout };
      }
      const out = [result.stdout, result.stderr].filter(Boolean).join('\n').slice(0, MAX_OUTPUT);
      const status = `\n[exit code ${result.exitCode}]`;
      return {
        ok: result.exitCode === 0,
        output: (out || '(no output)') + status,
        data: { exitCode: result.exitCode },
      };
    } catch (error) {
      return { ok: false, output: `Shell execution failed: ${(error as Error).message}`, code: ErrorCode.ToolUnexpected };
    }
  },
};
