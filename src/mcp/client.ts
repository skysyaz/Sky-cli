/**
 * Minimal MCP (Model Context Protocol) JSON-RPC client over stdio.
 * Implements enough of the protocol to initialize, list tools, and call tools
 * without requiring `@modelcontextprotocol/sdk` as a hard dependency.
 */
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { z } from 'zod';
import { ErrorCode, SkyError } from '../errors/index.js';
import { nullLogger, type Logger } from '../logging/index.js';
import type { McpServerConfig } from '../config/schema.js';
import type { Tool, ToolContext, ToolResult } from '../tools/types.js';
import type { ToolRegistry } from '../tools/registry.js';

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: unknown;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number | string | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export interface McpToolInfo {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export interface McpClientOptions {
  server: McpServerConfig;
  logger?: Logger;
  /** Handshake timeout (ms). */
  timeoutMs?: number;
}

/**
 * A single MCP server connection. Spawned on `connect()`, torn down on `close()`.
 */
export class McpClient {
  private readonly server: McpServerConfig;
  private readonly logger: Logger;
  private readonly timeoutMs: number;
  private child: ChildProcessWithoutNullStreams | null = null;
  private nextId = 1;
  private buffer = '';
  private readonly pending = new Map<
    number,
    { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }
  >();
  private tools: McpToolInfo[] = [];
  private closed = false;

  constructor(options: McpClientOptions) {
    this.server = options.server;
    this.logger = options.logger ?? nullLogger;
    this.timeoutMs = options.timeoutMs ?? 15_000;
  }

  get name(): string {
    return this.server.name;
  }

  get listedTools(): McpToolInfo[] {
    return this.tools;
  }

  async connect(): Promise<McpToolInfo[]> {
    if (this.server.approvalMode === 'deny') {
      throw new SkyError(ErrorCode.McpDenyMode, { name: this.server.name });
    }

    this.child = spawn(this.server.command, this.server.args ?? [], {
      env: { ...process.env, ...this.server.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.child.stdout.setEncoding('utf8');
    this.child.stdout.on('data', (chunk: string) => this.onData(chunk));
    this.child.stderr.setEncoding('utf8');
    this.child.stderr.on('data', (chunk: string) => {
      this.logger.debug('mcp.stderr', { name: this.server.name, chunk: chunk.slice(0, 200) });
    });
    this.child.on('exit', (code) => {
      this.logger.info('mcp.exit', { name: this.server.name, code });
      this.failAll(new SkyError(ErrorCode.McpNotConnected, { name: this.server.name }));
      this.closed = true;
    });

    try {
      await this.request('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'sky', version: '1.0.0' },
      });
      this.notify('notifications/initialized', {});
      const listed = (await this.request('tools/list', {})) as { tools?: McpToolInfo[] };
      this.tools = Array.isArray(listed?.tools) ? listed.tools : [];
      this.logger.info('mcp.connected', { name: this.server.name, tools: this.tools.length });
      return this.tools;
    } catch (error) {
      await this.close();
      throw error;
    }
  }

  async callTool(name: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<string> {
    if (this.closed || !this.child) {
      throw new SkyError(ErrorCode.McpNotConnected, { name: this.server.name });
    }
    const result = (await this.request('tools/call', { name, arguments: args }, signal)) as {
      content?: Array<{ type: string; text?: string }>;
      isError?: boolean;
    };
    const texts = (result?.content ?? [])
      .filter((c) => c.type === 'text' && typeof c.text === 'string')
      .map((c) => c.text!);
    const output = texts.join('\n') || JSON.stringify(result);
    if (result?.isError) {
      return `MCP tool error: ${output}`;
    }
    return output;
  }

  async close(): Promise<void> {
    this.closed = true;
    this.failAll(new Error('MCP client closed'));
    if (this.child && !this.child.killed) {
      this.child.kill('SIGTERM');
      this.child = null;
    }
  }

  /** Register each remote tool onto a Sky ToolRegistry as `mcp__<server>__<tool>`. */
  registerOn(registry: ToolRegistry): string[] {
    const registered: string[] = [];
    for (const remote of this.tools) {
      const toolName = `mcp__${this.server.name}__${remote.name}`;
      const approvalMode = this.server.approvalMode;
      const client = this;
      const tool: Tool = {
        name: toolName,
        description: remote.description ?? `MCP tool ${remote.name} from ${this.server.name}`,
        schema: z.record(z.unknown()),
        parameters: remote.inputSchema ?? { type: 'object', properties: {} },
        requiresApproval() {
          return approvalMode !== 'auto';
        },
        async execute(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
          if (approvalMode === 'deny') {
            return { ok: false, output: `MCP server '${client.name}' is in deny mode.`, code: ErrorCode.McpDenyMode };
          }
          try {
            const output = await client.callTool(remote.name, input, ctx.signal);
            return { ok: true, output };
          } catch (error) {
            const sky = SkyError.from(error, ErrorCode.McpNotConnected);
            return { ok: false, output: sky.message, code: sky.code, retryable: sky.retryable };
          }
        },
      };
      registry.register(tool);
      registered.push(toolName);
    }
    return registered;
  }

  private onData(chunk: string): void {
    this.buffer += chunk;
    // Support both Content-Length framed messages and newline-delimited JSON.
    while (true) {
      if (this.buffer.startsWith('Content-Length:')) {
        const headerEnd = this.buffer.indexOf('\r\n\r\n');
        if (headerEnd === -1) return;
        const header = this.buffer.slice(0, headerEnd);
        const match = header.match(/Content-Length:\s*(\d+)/i);
        if (!match) {
          this.buffer = this.buffer.slice(headerEnd + 4);
          continue;
        }
        const length = Number(match[1]);
        const bodyStart = headerEnd + 4;
        if (this.buffer.length < bodyStart + length) return;
        const body = this.buffer.slice(bodyStart, bodyStart + length);
        this.buffer = this.buffer.slice(bodyStart + length);
        this.handleMessage(body);
        continue;
      }

      const nl = this.buffer.indexOf('\n');
      if (nl === -1) return;
      const line = this.buffer.slice(0, nl).trim();
      this.buffer = this.buffer.slice(nl + 1);
      if (!line) continue;
      this.handleMessage(line);
    }
  }

  private handleMessage(raw: string): void {
    let msg: JsonRpcResponse;
    try {
      msg = JSON.parse(raw) as JsonRpcResponse;
    } catch {
      this.logger.warn('mcp.parseFailed', { name: this.server.name, raw: raw.slice(0, 120) });
      return;
    }
    if (msg.id === undefined || msg.id === null) return; // notification
    const id = Number(msg.id);
    const pending = this.pending.get(id);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pending.delete(id);
    if (msg.error) {
      pending.reject(new Error(msg.error.message));
    } else {
      pending.resolve(msg.result);
    }
  }

  private request(method: string, params: unknown, signal?: AbortSignal): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.child?.stdin.writable) {
        reject(new SkyError(ErrorCode.McpNotConnected, { name: this.server.name }));
        return;
      }
      const id = this.nextId++;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new SkyError(ErrorCode.McpNotConnected, { name: this.server.name }));
      }, this.timeoutMs);
      this.pending.set(id, { resolve, reject, timer });

      const onAbort = (): void => {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(new SkyError(ErrorCode.AgentAborted, {}));
      };
      if (signal) {
        if (signal.aborted) {
          onAbort();
          return;
        }
        signal.addEventListener('abort', onAbort, { once: true });
      }

      const payload: JsonRpcRequest = { jsonrpc: '2.0', id, method, params };
      const json = JSON.stringify(payload);
      // Prefer Content-Length framing (MCP stdio transport).
      this.child.stdin.write(`Content-Length: ${Buffer.byteLength(json)}\r\n\r\n${json}`);
    });
  }

  private notify(method: string, params: unknown): void {
    if (!this.child?.stdin.writable) return;
    const payload = { jsonrpc: '2.0', method, params };
    const json = JSON.stringify(payload);
    this.child.stdin.write(`Content-Length: ${Buffer.byteLength(json)}\r\n\r\n${json}`);
  }

  private failAll(error: Error): void {
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(error);
      this.pending.delete(id);
    }
  }
}

export interface ConnectAllOptions {
  servers: McpServerConfig[];
  registry: ToolRegistry;
  logger?: Logger;
}

/** Connect every configured MCP server and register its tools. Best-effort. */
export async function connectAllMcp(options: ConnectAllOptions): Promise<McpClient[]> {
  const clients: McpClient[] = [];
  const logger = options.logger ?? nullLogger;
  for (const server of options.servers) {
    if (server.approvalMode === 'deny') {
      logger.info('mcp.skippedDeny', { name: server.name });
      continue;
    }
    const client = new McpClient({ server, logger });
    try {
      await client.connect();
      client.registerOn(options.registry);
      clients.push(client);
    } catch (error) {
      logger.warn('mcp.connectFailed', {
        name: server.name,
        detail: (error as Error).message,
      });
      await client.close().catch(() => undefined);
    }
  }
  return clients;
}

/** Probe a single server (used by `sky mcp test`). */
export async function testMcpServer(server: McpServerConfig, logger?: Logger): Promise<{ ok: boolean; tools: string[]; error?: string }> {
  const client = new McpClient({ server, logger, timeoutMs: 10_000 });
  try {
    const tools = await client.connect();
    await client.close();
    return { ok: true, tools: tools.map((t) => t.name) };
  } catch (error) {
    await client.close().catch(() => undefined);
    return { ok: false, tools: [], error: (error as Error).message };
  }
}
