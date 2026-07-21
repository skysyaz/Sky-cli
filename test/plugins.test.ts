import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PluginManager, parseSpec, runPluginCommand } from '../src/plugins/index.js';

let root: string;
let marketSrc: string;
let manager: PluginManager;

/** Build a fixture marketplace repo containing a "ponytail" plugin. */
function buildFixtureMarketplace(dir: string): void {
  mkdirSync(join(dir, '.claude-plugin'), { recursive: true });
  writeFileSync(
    join(dir, '.claude-plugin', 'marketplace.json'),
    JSON.stringify({
      name: 'ponytail',
      owner: { name: 'DietrichGebert' },
      plugins: [{ name: 'ponytail', source: './', description: 'Git worktree helper' }],
    }),
  );
  writeFileSync(
    join(dir, '.claude-plugin', 'plugin.json'),
    JSON.stringify({ name: 'ponytail', version: '1.2.0', description: 'Manage git worktrees' }),
  );
  mkdirSync(join(dir, 'commands'), { recursive: true });
  writeFileSync(
    join(dir, 'commands', 'create.md'),
    '---\ndescription: Create a new worktree\n---\nCreate a git worktree for the branch named $ARGUMENTS.',
  );
  writeFileSync(
    join(dir, '.mcp.json'),
    JSON.stringify({ mcpServers: { ponytail: { command: 'node', args: ['server.js'], env: { PONY: '1' } } } }),
  );
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'sky-plugins-'));
  marketSrc = join(root, 'ponytail-src');
  mkdirSync(marketSrc, { recursive: true });
  buildFixtureMarketplace(marketSrc);
  manager = new PluginManager({
    marketplacesDir: join(root, 'marketplaces'),
    installedDir: join(root, 'installed'),
    statePath: join(root, 'plugins.json'),
  });
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('PluginManager', () => {
  it('adds a marketplace from a local path and reads its manifest', async () => {
    const lines = await manager.addMarketplace(marketSrc);
    expect(lines.join('\n')).toContain('ponytail');
    const markets = manager.listMarketplaces();
    expect(markets).toHaveLength(1);
    expect(markets[0].plugins.map((p) => p.name)).toEqual(['ponytail']);
  });

  it('installs a plugin and records it', async () => {
    await manager.addMarketplace(marketSrc);
    const lines = await manager.install('ponytail@ponytail');
    expect(lines[0]).toContain("Installed 'ponytail@ponytail'");
    expect(lines.join('\n')).toContain('v1.2.0');
    const installed = manager.listInstalled();
    expect(installed).toHaveLength(1);
    expect(existsSync(installed[0].path)).toBe(true);
  });

  it('loads plugin commands and MCP servers (auto-reload)', async () => {
    await manager.addMarketplace(marketSrc);
    await manager.install('ponytail@ponytail');
    const loaded = manager.load();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].commands.map((c) => c.name).sort()).toEqual(['create', 'ponytail:create']);
    expect(loaded[0].commands.find((c) => c.name === 'ponytail:create')!.description).toBe(
      'Create a new worktree',
    );
    expect(loaded[0].commands[0].body).toContain('Create a git worktree');
    expect(loaded[0].mcpServers).toEqual([
      { name: 'ponytail', command: 'node', args: ['server.js'], env: { PONY: '1' } },
    ]);
  });

  it('loads .toml Claude-style commands with short aliases', async () => {
    writeFileSync(
      join(marketSrc, 'commands', 'ponytail.toml'),
      'description = "Switch intensity"\nprompt = "Switch to ponytail {{args}} mode."\n',
    );
    writeFileSync(
      join(marketSrc, 'commands', 'ponytail-help.toml'),
      'description = "Help card"\nprompt = "Show ponytail help."\n',
    );
    await manager.addMarketplace(marketSrc);
    await manager.install('ponytail@ponytail');
    const names = manager.load()[0]!.commands.map((c) => c.name).sort();
    expect(names).toEqual([
      'create',
      'ponytail',
      'ponytail-help',
      'ponytail:create',
      'ponytail:ponytail',
      'ponytail:ponytail-help',
    ]);
    const { applyCommandArgs, parseCommandToml } = await import('../src/plugins/index.js');
    expect(parseCommandToml('description = "d"\nprompt = "Go {{args}}"').prompt).toBe('Go {{args}}');
    expect(applyCommandArgs('Go {{args}}', 'ultra')).toBe('Go ultra');
  });

  it('uninstalls a plugin', async () => {
    await manager.addMarketplace(marketSrc);
    await manager.install('ponytail@ponytail');
    manager.uninstall('ponytail');
    expect(manager.listInstalled()).toHaveLength(0);
    expect(manager.load()).toHaveLength(0);
  });

  it('fails to install from an unregistered marketplace', () => {
    expect(() => manager.install('ponytail@nope')).toThrow(/not registered/);
  });

  it('fails to install an unknown plugin', async () => {
    await manager.addMarketplace(marketSrc);
    expect(() => manager.install('missing@ponytail')).toThrow(/not found/);
  });
});

describe('parseSpec', () => {
  it('splits plugin@marketplace', () => {
    expect(parseSpec('ponytail@ponytail')).toEqual({ plugin: 'ponytail', marketplace: 'ponytail' });
  });
  it('defaults marketplace to the plugin name', () => {
    expect(parseSpec('ponytail')).toEqual({ plugin: 'ponytail', marketplace: 'ponytail' });
  });
});

describe('runPluginCommand (shared CLI/TUI logic)', () => {
  it('drives the full add → install → list flow', async () => {
    const add = await runPluginCommand(['marketplace', 'add', marketSrc], manager);
    expect(add.join('\n')).toContain('Added marketplace');

    const install = await runPluginCommand(['install', 'ponytail@ponytail'], manager);
    expect(install.join('\n')).toContain('Installed');

    const list = await runPluginCommand(['list'], manager);
    expect(list.join('\n')).toContain('ponytail@ponytail');

    const markets = await runPluginCommand(['marketplace', 'list'], manager);
    expect(markets.join('\n')).toContain('ponytail');
  });

  it('reports missing arguments', async () => {
    await expect(runPluginCommand(['marketplace', 'add'], manager)).rejects.toThrow(/Missing required argument/);
  });

  it('searches plugins across registered marketplaces', async () => {
    await runPluginCommand(['marketplace', 'add', marketSrc], manager);
    const hit = await runPluginCommand(['search', 'worktree'], manager);
    expect(hit.join('\n')).toContain('ponytail@ponytail');
    const miss = await runPluginCommand(['search', 'nonsense'], manager);
    expect(miss.join('\n')).toMatch(/No plugins match/);
  });

  it('installs via the owner/repo shorthand (adds marketplace + installs)', async () => {
    // marketSrc is a path containing "/" and no "@", triggering the shorthand.
    const lines = await runPluginCommand(['install', marketSrc], manager);
    expect(lines.join('\n')).toContain('Added marketplace');
    expect(lines.join('\n')).toContain('Installed');
    expect(manager.listInstalled().map((p) => p.name)).toContain('ponytail');
  });
});
