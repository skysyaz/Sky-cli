import { describe, it, expect, afterEach } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { attachMcp, type Runtime } from '../src/cli/runtime.js';
import { ToolRegistry } from '../src/tools/registry.js';
import { defaultConfig } from '../src/config/index.js';
import { nullLogger } from '../src/logging/index.js';

const fixture = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'fake-mcp-server.mjs');

function makeRuntime(withServer: boolean): Runtime {
  const config = defaultConfig();
  if (withServer) {
    config.mcp.servers = [
      { name: 'fake', command: process.execPath, args: [fixture], env: {}, approvalMode: 'manual' },
    ];
  }
  return {
    config,
    logger: nullLogger,
    store: {} as never,
    registry: new ToolRegistry([]),
    cwd: process.cwd(),
    color: false,
    json: false,
    plugins: [],
    skills: [],
    mcpClients: [],
  };
}

const openRuntimes: Runtime[] = [];
afterEach(async () => {
  while (openRuntimes.length) {
    const rt = openRuntimes.pop()!;
    for (const c of rt.mcpClients) await c.close().catch(() => undefined);
  }
});

describe('attachMcp idempotency (SKY readline loop re-attach bug)', () => {
  it('connects MCP servers only once even when called every turn', async () => {
    const runtime = makeRuntime(true);
    openRuntimes.push(runtime);

    await attachMcp(runtime);
    expect(runtime.mcpAttached).toBe(true);
    expect(runtime.registry.has('mcp__fake__echo')).toBe(true);
    const firstClients = runtime.mcpClients;
    expect(firstClients).toHaveLength(1);

    // Simulate subsequent turns in the interactive loop.
    await attachMcp(runtime);
    await attachMcp(runtime);

    // No re-connect: same client array, no duplicate spawns.
    expect(runtime.mcpClients).toBe(firstClients);
    expect(runtime.mcpClients).toHaveLength(1);
  }, 10_000);

  it('marks attach complete even with no servers configured', async () => {
    const runtime = makeRuntime(false);
    await attachMcp(runtime);
    expect(runtime.mcpAttached).toBe(true);
    expect(runtime.mcpClients).toHaveLength(0);
  });
});
