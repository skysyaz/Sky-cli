import React from 'react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { render } from 'ink-testing-library';
import { App } from '../src/tui/App.js';
import { SessionStore } from '../src/session/store.js';
import { MockProvider } from '../src/llm/mock.js';
import { ToolRegistry } from '../src/tools/index.js';
import { defaultConfig } from '../src/config/index.js';
import { nullLogger } from '../src/logging/index.js';
import type { LoadedPlugin } from '../src/plugins/index.js';
import { SkyError, ErrorCode } from '../src/errors/index.js';

let dir: string;
const delay = (ms = 30) => new Promise((r) => setTimeout(r, ms));
const strip = (s: string) => s.replace(/\[[0-9;]*m/g, '');

function mount(plugins?: LoadedPlugin[]) {
  const store = new SessionStore({ dir: join(dir, 'sessions'), indexPath: join(dir, 'sessions.index') });
  const session = store.create({ mode: 'agent', cwd: dir, provider: 'mock', model: 'mock-1' });
  return {
    store,
    session,
    ...render(
      React.createElement(App, {
        makeProvider: () => new MockProvider(),
        registry: new ToolRegistry(),
        session,
        store,
        config: defaultConfig(),
        logger: nullLogger,
        plugins,
      }),
    ),
  };
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'sky-tui-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('Ink TUI', () => {
  it('renders the input box and status bar', async () => {
    const { lastFrame, unmount } = mount();
    await delay();
    const frame = strip(lastFrame() ?? '');
    expect(frame).toContain('type / for commands');
    expect(frame).toContain('agent'); // status bar mode
    expect(frame).toContain('mock:mock-1'); // provider:model
    unmount();
  });

  it('opens the slash palette when you type /', async () => {
    const { stdin, lastFrame, unmount } = mount();
    await delay();
    stdin.write('/');
    await delay();
    const frame = strip(lastFrame() ?? '');
    expect(frame).toContain('/help');
    expect(frame).toContain('/mode');
    expect(frame).toContain('/model');
    unmount();
  });

  it('filters the palette as you type', async () => {
    const { stdin, lastFrame, unmount } = mount();
    await delay();
    stdin.write('/mo');
    await delay();
    const frame = strip(lastFrame() ?? '');
    expect(frame).toContain('/mode');
    expect(frame).toContain('/model');
    expect(frame).not.toContain('/help');
    unmount();
  });

  it('shows argument suggestions after /mode ', async () => {
    const { stdin, lastFrame, unmount } = mount();
    await delay();
    stdin.write('/mode ');
    await delay();
    const frame = strip(lastFrame() ?? '');
    expect(frame).toContain('agent');
    expect(frame).toContain('plan');
    expect(frame).toContain('ask');
    unmount();
  });

  it('selects an argument and switches mode (updates the status bar)', async () => {
    const { stdin, lastFrame, unmount } = mount();
    await delay();
    stdin.write('/mode plan');
    await delay();
    stdin.write('\r'); // Enter accepts the selected suggestion
    await delay();
    const frame = strip(lastFrame() ?? '');
    expect(frame).toContain('Mode → plan');
    // status bar now reflects plan mode
    expect(frame).toMatch(/⬢ plan/);
    unmount();
  });

  it('navigates the palette with the down arrow', async () => {
    const { stdin, lastFrame, unmount } = mount();
    await delay();
    stdin.write('/');
    await delay();
    stdin.write('[B'); // down arrow
    await delay();
    const frame = strip(lastFrame() ?? '');
    // the selection marker moved to the second command
    expect(frame).toMatch(/❯ \/mode/);
    unmount();
  });

  it('switches provider live with /provider', async () => {
    const store = new SessionStore({ dir: join(dir, 'sessions'), indexPath: join(dir, 'sessions.index') });
    const session = store.create({ mode: 'agent', cwd: dir, provider: 'zenmux', model: 'x-ai/grok-4.5-free' });
    const { stdin, lastFrame, unmount } = render(
      React.createElement(App, {
        makeProvider: (name: string) => {
          if (name === 'zenmux') throw new SkyError(ErrorCode.NoApiKey, { name });
          return new MockProvider();
        },
        registry: new ToolRegistry(),
        session,
        store,
        config: defaultConfig(),
        logger: nullLogger,
      }),
    );
    await delay(60);
    // Missing key auto-falls back to keyless OpenCode.
    expect(strip(lastFrame() ?? '')).toContain('opencode');
    expect(strip(lastFrame() ?? '')).toContain('deepseek-v4-flash-free');
    stdin.write('/provider mock');
    await delay();
    stdin.write('\r');
    await delay(60);
    const frame = strip(lastFrame() ?? '');
    expect(frame).toContain('mock (ready');
    expect(frame).toContain('mock:deepseek-v4-flash-free');
    unmount();
  });

  it('sets the API key with /keys dashboard and switches live', async () => {
    process.env.SKY_HOME = join(dir, 'home');
    const config = defaultConfig();
    const store = new SessionStore({ dir: join(dir, 'sessions'), indexPath: join(dir, 'sessions.index') });
    const session = store.create({ mode: 'agent', cwd: dir, provider: 'zenmux', model: 'x-ai/grok-4.5-free' });
    const { readSecret } = await import('../src/config/secrets.js');
    const { stdin, lastFrame, unmount } = render(
      React.createElement(App, {
        // Provider succeeds once a key is present in the secrets file (or config).
        makeProvider: (name: string) => {
          const hasKey = Boolean(config.providers[name]?.apiKey) || Boolean(readSecret(name));
          if (name === 'zenmux' && !hasKey) throw new SkyError(ErrorCode.NoApiKey, { name });
          return new MockProvider();
        },
        registry: new ToolRegistry(),
        session,
        store,
        config,
        logger: nullLogger,
      }),
    );
    await delay(60);
    expect(strip(lastFrame() ?? '')).toContain('opencode');
    stdin.write('/keys set zenmux sk-live-test-key');
    await delay();
    stdin.write('\r');
    await delay(80);
    expect(strip(lastFrame() ?? '')).toContain('Saved key for zenmux');
    expect(readSecret('zenmux')).toBe('sk-live-test-key');
    stdin.write('/provider zenmux');
    await delay();
    stdin.write('\r');
    await delay(80);
    expect(strip(lastFrame() ?? '')).toContain('zenmux (ready');
    expect(config.providers.zenmux?.apiKey).toBeUndefined();
    unmount();
    delete process.env.SKY_HOME;
  });

  it('installs a plugin from the TUI and reloads its commands live', async () => {
    process.env.SKY_HOME = join(dir, 'home');
    // Fixture marketplace on disk (copy path, no network).
    const fixture = join(dir, 'ponytail-src');
    mkdirSync(join(fixture, '.claude-plugin'), { recursive: true });
    mkdirSync(join(fixture, 'commands'), { recursive: true });
    writeFileSync(
      join(fixture, '.claude-plugin', 'marketplace.json'),
      JSON.stringify({ name: 'ponytail', plugins: [{ name: 'ponytail', source: './', description: 'wt' }] }),
    );
    writeFileSync(join(fixture, 'commands', 'create.md'), '---\ndescription: Create a worktree\n---\nGo.');

    const { stdin, lastFrame, unmount } = mount();
    await delay();
    stdin.write(`/plugin install ${fixture}`); // owner/repo-style shorthand (local path)
    await delay();
    stdin.write('\r');
    await delay(300);
    expect(strip(lastFrame() ?? '')).toContain('Reloaded');

    // The freshly-installed command now appears in the palette.
    stdin.write('/pony');
    await delay();
    expect(strip(lastFrame() ?? '')).toContain('/ponytail:create');
    unmount();
    delete process.env.SKY_HOME;
  });

  it('shows a provider error in-UI without crashing (no autoclose)', async () => {
    const store = new SessionStore({ dir: join(dir, 'sessions'), indexPath: join(dir, 'sessions.index') });
    const session = store.create({ mode: 'agent', cwd: dir, provider: 'zenmux', model: 'x-ai/grok-4.5-free' });
    const { stdin, lastFrame, unmount } = render(
      React.createElement(App, {
        makeProvider: () => {
          throw new SkyError(ErrorCode.NoApiKey, { name: 'broken', hint: '' });
        },
        registry: new ToolRegistry(),
        session,
        store,
        config: defaultConfig(),
        logger: nullLogger,
      }),
    );
    await delay(60);
    const frame = strip(lastFrame() ?? '');
    expect(frame).toContain('SKY-E-1002');
    expect(frame).toContain('type / for commands');
    stdin.write('review');
    await delay();
    stdin.write('\r');
    await delay(60);
    expect(strip(lastFrame() ?? '')).toContain('type / for commands');
    unmount();
  });

  it('shows plugin-contributed commands in the palette', async () => {
    const plugins: LoadedPlugin[] = [
      { name: 'ponytail', commands: [{ name: 'ponytail:create', description: 'Create a worktree', body: 'do it' }], mcpServers: [] },
    ];
    const { stdin, lastFrame, unmount } = mount(plugins);
    await delay();
    stdin.write('/pony');
    await delay();
    expect(strip(lastFrame() ?? '')).toContain('/ponytail:create');
    unmount();
  });

  it('lists plugin commands when a bare plugin name is submitted', async () => {
    const plugins: LoadedPlugin[] = [
      { name: 'ponytail', commands: [{ name: 'ponytail:create', description: 'Create a worktree', body: 'do it' }], mcpServers: [] },
    ];
    const { stdin, lastFrame, unmount } = mount(plugins);
    await delay();
    stdin.write('/ponytail');
    await delay();
    stdin.write('\r');
    await delay(80);
    const frame = strip(lastFrame() ?? '');
    expect(frame).toContain('Plugin commands for "ponytail"');
    expect(frame).toContain('/ponytail:create');
    expect(frame).not.toContain('Unknown command');
    unmount();
  });

  it('runs short Claude-style plugin commands like /ponytail', async () => {
    const plugins: LoadedPlugin[] = [
      {
        name: 'ponytail',
        commands: [
          { name: 'ponytail:ponytail', description: 'Lazy mode', body: 'Switch to ponytail {{args}} mode.' },
          { name: 'ponytail', description: 'Lazy mode', body: 'Switch to ponytail {{args}} mode.' },
        ],
        mcpServers: [],
      },
    ];
    const { stdin, lastFrame, unmount } = mount(plugins);
    await delay();
    stdin.write('/ponytail ultra');
    await delay();
    stdin.write('\r');
    await delay(100);
    const frame = strip(lastFrame() ?? '');
    expect(frame).toContain('Running plugin command /ponytail ultra');
    expect(frame).toContain('Switch to ponytail ultra mode.');
    unmount();
  });

  it('runs `/plugin marketplace add` then `/plugin install` from the TUI', async () => {
    // A fixture marketplace on disk (plain dir → copy path, no network).
    const fixture = join(dir, 'ponytail-src');
    mkdirSync(join(fixture, '.claude-plugin'), { recursive: true });
    writeFileSync(
      join(fixture, '.claude-plugin', 'marketplace.json'),
      JSON.stringify({ name: 'ponytail', plugins: [{ name: 'ponytail', source: './', description: 'wt' }] }),
    );
    // Point the plugin manager's storage at a temp SKY_HOME.
    const prevHome = process.env.SKY_HOME;
    process.env.SKY_HOME = join(dir, 'home');

    const { stdin, lastFrame, unmount } = mount();
    await delay();
    stdin.write(`/plugin marketplace add ${fixture}`);
    await delay();
    stdin.write('\r');
    await delay(250); // allow the copy to complete
    expect(strip(lastFrame() ?? '')).toContain('Added marketplace');

    stdin.write('/plugin install ponytail@ponytail');
    await delay();
    stdin.write('\r');
    await delay(250);
    expect(strip(lastFrame() ?? '')).toContain('Installed');

    unmount();
    if (prevHome === undefined) delete process.env.SKY_HOME;
    else process.env.SKY_HOME = prevHome;
  });
});
