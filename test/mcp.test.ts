import { describe, it, expect, afterEach } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { McpClient, connectAllMcp, testMcpServer } from '../src/mcp/index.js';
import { ToolRegistry } from '../src/tools/registry.js';
import { defaultConfig } from '../src/config/index.js';
import { nullLogger } from '../src/logging/index.js';
import { ErrorCode } from '../src/errors/index.js';
import type { McpServerConfig } from '../src/config/schema.js';

const fixture = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'fake-mcp-server.mjs');

function server(overrides: Partial<McpServerConfig> = {}): McpServerConfig {
  return {
    name: 'fake',
    command: process.execPath,
    args: [fixture],
    env: {},
    approvalMode: 'manual',
    ...overrides,
  };
}

const clients: McpClient[] = [];
afterEach(async () => {
  while (clients.length) {
    const c = clients.pop()!;
    await c.close().catch(() => undefined);
  }
});

describe('McpClient', () => {
  it('connects, lists tools, calls a tool, and registers on a registry', async () => {
    const client = new McpClient({ server: server(), logger: nullLogger, timeoutMs: 5_000 });
    clients.push(client);

    const tools = await client.connect();
    expect(tools.map((t) => t.name)).toEqual(['echo']);
    expect(client.name).toBe('fake');
    expect(client.listedTools).toHaveLength(1);

    const output = await client.callTool('echo', { message: 'hi' });
    expect(output).toBe('echo:hi');

    const registry = new ToolRegistry([]);
    const registered = client.registerOn(registry);
    expect(registered).toEqual(['mcp__fake__echo']);
    expect(registry.has('mcp__fake__echo')).toBe(true);

    const result = await registry.execute(
      'mcp__fake__echo',
      { message: 'sky' },
      { cwd: process.cwd(), config: defaultConfig(), logger: nullLogger },
    );
    expect(result.ok).toBe(true);
    expect(result.output).toBe('echo:sky');
  });

  it('throws McpDenyMode when approvalMode is deny', async () => {
    const client = new McpClient({ server: server({ approvalMode: 'deny' }), logger: nullLogger });
    clients.push(client);
    await expect(client.connect()).rejects.toMatchObject({ code: ErrorCode.McpDenyMode });
  });

  it('requiresApproval is false when approvalMode is auto', async () => {
    const client = new McpClient({ server: server({ approvalMode: 'auto' }), logger: nullLogger, timeoutMs: 5_000 });
    clients.push(client);
    await client.connect();
    const registry = new ToolRegistry([]);
    client.registerOn(registry);
    const tool = registry.get('mcp__fake__echo')!;
    expect(tool.requiresApproval({})).toBe(false);
  });

  it('callTool fails after close', async () => {
    const client = new McpClient({ server: server(), logger: nullLogger, timeoutMs: 5_000 });
    clients.push(client);
    await client.connect();
    await client.close();
    await expect(client.callTool('echo', { message: 'x' })).rejects.toMatchObject({
      code: ErrorCode.McpNotConnected,
    });
  });
});

describe('connectAllMcp / testMcpServer', () => {
  it('connectAllMcp registers tools and skips deny servers', async () => {
    const registry = new ToolRegistry([]);
    const connected = await connectAllMcp({
      servers: [server({ name: 'ok' }), server({ name: 'blocked', approvalMode: 'deny' })],
      registry,
      logger: nullLogger,
    });
    clients.push(...connected);
    expect(connected).toHaveLength(1);
    expect(registry.has('mcp__ok__echo')).toBe(true);
    expect(registry.has('mcp__blocked__echo')).toBe(false);
  });

  it('testMcpServer reports ok with tool names', async () => {
    const result = await testMcpServer(server(), nullLogger);
    expect(result.ok).toBe(true);
    expect(result.tools).toEqual(['echo']);
  });

  it('testMcpServer reports failure for a bad command', async () => {
    const result = await testMcpServer(
      {
        name: 'missing',
        command: 'this-binary-does-not-exist-sky-mcp',
        args: [],
        env: {},
        approvalMode: 'manual',
      },
      nullLogger,
    );
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
  }, 8_000);
});
