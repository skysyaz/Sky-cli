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
        provider: new MockProvider(),
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
