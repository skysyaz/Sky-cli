import chalk from 'chalk';
import type { AgentEvent } from '../agent/events.js';

/** Status glyph from §5.1. */
const HEX = '⬢';

export interface RenderOptions {
  /** NDJSON output for CI/headless (§5.10). */
  json: boolean;
  color: boolean;
}

/**
 * Consume an agent event stream and render it. In `--json` mode each event is
 * serialized as one NDJSON line (§5.10); otherwise it is rendered as
 * human-readable text with the hex status glyph (§5.1). Returns the process
 * exit code implied by the stream (0 unless an error event carried one).
 */
export async function renderStream(
  events: AsyncIterable<AgentEvent>,
  options: RenderOptions,
): Promise<number> {
  const c = options.color ? chalk : noColorChalk();
  let exitCode = 0;
  let streaming = false;

  for await (const event of events) {
    if (options.json) {
      process.stdout.write(JSON.stringify(serialize(event)) + '\n');
      if (event.type === 'error') exitCode = event.error.exitCode;
      continue;
    }

    switch (event.type) {
      case 'turn-start':
        break;
      case 'text-delta':
        streaming = true;
        process.stdout.write(event.text);
        break;
      case 'tool-call':
        if (streaming) {
          process.stdout.write('\n');
          streaming = false;
        }
        process.stdout.write(c.magenta(`${HEX} ${event.toolCall.name}`) + c.gray(` ${summarizeInput(event.toolCall.input)}\n`));
        break;
      case 'approval-resolved':
        if (event.autoApproved) {
          process.stdout.write(c.gray(`  ${HEX} auto-approved\n`));
        }
        break;
      case 'tool-result':
        process.stdout.write(
          (event.ok ? c.green(`  ${HEX} `) : c.red(`  ${HEX} `)) + c.gray(truncate(event.output.split('\n')[0], 100)) + '\n',
        );
        break;
      case 'usage':
        break;
      case 'turn-end':
        if (streaming) process.stdout.write('\n');
        process.stdout.write(c.green(`${HEX} Done\n`));
        break;
      case 'error':
        if (streaming) process.stdout.write('\n');
        process.stderr.write(c.red(`${HEX} ${event.error.toUserMessage()}\n`));
        exitCode = event.error.exitCode;
        break;
    }
  }
  return exitCode;
}

function serialize(event: AgentEvent): Record<string, unknown> {
  if (event.type === 'error') {
    return { type: 'error', payload: event.error.toJSON() };
  }
  const { type, ...payload } = event;
  return { type, payload };
}

function summarizeInput(input: Record<string, unknown>): string {
  if (typeof input.path === 'string') return input.path;
  if (typeof input.command === 'string') return truncate(input.command, 60);
  if (typeof input.pattern === 'string') return `/${input.pattern}/`;
  if (typeof input.action === 'string') return String(input.action);
  return '';
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max - 1) + '…';
}

/** A chalk-shaped object that applies no color (for --no-color). */
function noColorChalk(): typeof chalk {
  const identity = (s: string): string => s;
  return new Proxy({}, { get: () => identity }) as unknown as typeof chalk;
}
