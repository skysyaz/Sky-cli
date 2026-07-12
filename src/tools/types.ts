import type { z } from 'zod';
import type { SkyConfig } from '../config/index.js';
import type { Logger } from '../logging/index.js';
import type { ErrorCode } from '../errors/index.js';

/** Runtime context handed to every tool execution. */
export interface ToolContext {
  /** The session's working directory; all relative paths resolve against it. */
  cwd: string;
  config: SkyConfig;
  logger: Logger;
  signal?: AbortSignal;
}

/** The structured result every tool returns (§6.9). */
export interface ToolResult {
  ok: boolean;
  /** Text handed back to the model. */
  output: string;
  /** Error code when `ok` is false. */
  code?: ErrorCode;
  /** Whether the agent may retry with different inputs. */
  retryable?: boolean;
  /** Structured data for the TUI (e.g. search matches). */
  data?: Record<string, unknown>;
}

/** A proposed file mutation, used to build the approval diff (§9.3). */
export interface ToolDiffPreview {
  path: string;
  oldContent: string;
  newContent: string;
}

/**
 * The Tool interface (§6.1). Deliberately minimal: metadata, a Zod input schema,
 * an approval predicate, and an execute method. Tools are pure functions of
 * their inputs — they do not read the session, call the LLM, or render the TUI.
 */
export interface Tool<TInput = Record<string, unknown>> {
  readonly name: string;
  readonly description: string;
  /** Zod schema validating the tool input. */
  readonly schema: z.ZodType<TInput>;
  /** JSON-schema parameters advertised to the provider. */
  readonly parameters: Record<string, unknown>;
  /** Whether these specific inputs require user approval. */
  requiresApproval(input: TInput): boolean;
  /** For mutating tools: the current/proposed content for a diff. */
  preview?(input: TInput, ctx: ToolContext): Promise<ToolDiffPreview | undefined>;
  execute(input: TInput, ctx: ToolContext): Promise<ToolResult>;
}
