/**
 * Streaming / interactive-style shell execution (OpenCode PTY analogue).
 * Uses child_process pipes (no native node-pty) so it works on Termux/CI.
 */

import { spawn } from 'node:child_process';
import { z } from 'zod';
import { ErrorCode } from '../errors/index.js';
import type { Tool, ToolContext, ToolResult } from './types.js';

const schema = z.object({
  command: z.string(),
  timeoutMs: z.number().int().positive().optional(),
  /** Optional stdin to feed the process (for non-interactive scripts). */
  stdin: z.string().optional(),
});
type Input = z.infer<typeof schema>;

const MAX_OUTPUT = 40_000;

export const ptyTool: Tool<Input> = {
  name: 'pty',
  description:
    'Run a shell command with streaming stdout/stderr (PTY-like). Prefer for long-running or interactive-style commands; use `shell` for short one-shots.',
  schema,
  parameters: {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'Shell command to run' },
      timeoutMs: { type: 'integer', description: 'Timeout in milliseconds' },
      stdin: { type: 'string', description: 'Optional stdin payload' },
    },
    required: ['command'],
  },
  requiresApproval() {
    return true;
  },
  async execute(input: Input, ctx: ToolContext): Promise<ToolResult> {
    const timeout = input.timeoutMs ?? ctx.config.tools.shell.timeoutMs;
    return await new Promise<ToolResult>((resolve) => {
      const child = spawn(input.command, {
        cwd: ctx.cwd,
        shell: true,
        env: { ...process.env, ...ctx.config.tools.shell.env, TERM: process.env.TERM ?? 'xterm-256color' },
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let out = '';
      let settled = false;
      const finish = (result: ToolResult) => {
        if (settled) return;
        settled = true;
        resolve(result);
      };

      const timer = setTimeout(() => {
        child.kill('SIGTERM');
        finish({
          ok: false,
          output: (out.slice(0, MAX_OUTPUT) || '(no output)') + `\n[timed out after ${timeout}ms]`,
          code: ErrorCode.ShellTimeout,
        });
      }, timeout);

      const onAbort = () => {
        child.kill('SIGTERM');
        finish({ ok: false, output: (out || '(aborted)') + '\n[aborted]', code: ErrorCode.ToolUnexpected });
      };
      ctx.signal?.addEventListener('abort', onAbort, { once: true });

      child.stdout?.on('data', (chunk: Buffer) => {
        out += chunk.toString('utf8');
        if (out.length > MAX_OUTPUT) out = out.slice(0, MAX_OUTPUT);
      });
      child.stderr?.on('data', (chunk: Buffer) => {
        out += chunk.toString('utf8');
        if (out.length > MAX_OUTPUT) out = out.slice(0, MAX_OUTPUT);
      });

      if (input.stdin && child.stdin) {
        child.stdin.write(input.stdin);
        child.stdin.end();
      } else {
        child.stdin?.end();
      }

      child.on('error', (error) => {
        clearTimeout(timer);
        finish({ ok: false, output: `pty failed: ${error.message}`, code: ErrorCode.ToolUnexpected });
      });

      child.on('close', (code) => {
        clearTimeout(timer);
        ctx.signal?.removeEventListener('abort', onAbort);
        const status = `\n[exit code ${code ?? 'null'}]`;
        finish({
          ok: code === 0,
          output: (out || '(no output)') + status,
          data: { exitCode: code, streamed: true },
        });
      });
    });
  },
};
