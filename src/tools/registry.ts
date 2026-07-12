import { ErrorCode, SkyError } from '../errors/index.js';
import type { ToolDefinition } from '../llm/types.js';
import type { Tool, ToolContext, ToolResult } from './types.js';
import { readTool } from './read.js';
import { writeTool } from './write.js';
import { editTool } from './edit.js';
import { searchTool } from './search.js';
import { shellTool } from './shell.js';
import { gitTool } from './git.js';

/**
 * The tool registry (§2.4.3). Discovers tools, validates their inputs against
 * their Zod schema, and exposes them to the agent loop by name. Tool side
 * effects are mediated by the safety layer, which the loop invokes before
 * calling {@link ToolRegistry.execute}.
 */
export class ToolRegistry {
  private readonly tools = new Map<string, Tool<any>>();

  constructor(tools: Tool<any>[] = defaultTools()) {
    for (const tool of tools) this.register(tool);
  }

  register(tool: Tool<any>): void {
    this.tools.set(tool.name, tool);
  }

  get(name: string): Tool<any> | undefined {
    return this.tools.get(name);
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  list(): Tool<any>[] {
    return [...this.tools.values()];
  }

  /** Tool definitions advertised to the provider for function calling. */
  definitions(): ToolDefinition[] {
    return this.list().map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    }));
  }

  /** Validate the input against the tool's schema (SKY-E-3001 on failure). */
  validate(name: string, input: unknown): Record<string, unknown> {
    const tool = this.tools.get(name);
    if (!tool) throw new SkyError(ErrorCode.UnknownTool, { name });
    const result = tool.schema.safeParse(input);
    if (!result.success) {
      throw new SkyError(ErrorCode.ToolInputInvalid, {
        detail: result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; '),
      });
    }
    return result.data as Record<string, unknown>;
  }

  /** Validate then execute. Never throws for a tool-level failure — returns a ToolResult. */
  async execute(name: string, input: unknown, ctx: ToolContext): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) return { ok: false, output: `Unknown tool: ${name}`, code: ErrorCode.UnknownTool };
    let validated: unknown;
    try {
      validated = this.validate(name, input);
    } catch (error) {
      const skyError = SkyError.from(error, ErrorCode.ToolInputInvalid);
      return { ok: false, output: skyError.message, code: skyError.code, retryable: skyError.retryable };
    }
    try {
      return await tool.execute(validated, ctx);
    } catch (error) {
      const skyError = SkyError.from(error, ErrorCode.ToolUnexpected);
      return { ok: false, output: skyError.message, code: skyError.code, retryable: skyError.retryable };
    }
  }
}

/** The six built-in tools (§6). */
export function defaultTools(): Tool<any>[] {
  return [readTool, writeTool, editTool, searchTool, shellTool, gitTool];
}
