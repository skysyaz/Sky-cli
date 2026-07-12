import React from 'react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { render } from 'ink-testing-library';
import { App } from '../src/tui/App.js';
import { SessionStore } from '../src/session/store.js';
import { MockProvider } from '../src/llm/mock.js';
import { ToolRegistry } from '../src/tools/index.js';
import { defaultConfig } from '../src/config/index.js';
import { nullLogger } from '../src/logging/index.js';

let dir: string;
const delay = (ms = 30) => new Promise((r) => setTimeout(r, ms));
const strip = (s: string) => s.replace(/\[[0-9;]*m/g, '');

function mount() {
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
});
