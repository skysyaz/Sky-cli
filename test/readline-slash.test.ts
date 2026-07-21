import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { handleSlashCommand } from '../src/cli/session-runner.js';
import { buildRuntime } from '../src/cli/runtime.js';
import { writeFileSync } from 'node:fs';

describe('readline slash commands', () => {
  let dir: string;
  let prevHome: string | undefined;
  let stdout: string[];

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'sky-slash-'));
    prevHome = process.env.SKY_HOME;
    process.env.SKY_HOME = dir;
    writeFileSync(join(dir, 'config.json'), JSON.stringify({ defaultProvider: 'opencode' }, null, 2));
    stdout = [];
    vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: string) => {
      stdout.push(String(chunk));
      return true;
    }) as typeof process.stdout.write);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (prevHome === undefined) delete process.env.SKY_HOME;
    else process.env.SKY_HOME = prevHome;
    rmSync(dir, { recursive: true, force: true });
  });

  it('lists models when /model has no argument', () => {
    const runtime = buildRuntime({ cwd: dir, provider: 'opencode', quiet: true }, false);
    const session = runtime.store.create({
      mode: 'agent',
      cwd: dir,
      provider: 'opencode',
      model: 'deepseek-v4-flash-free',
    });
    handleSlashCommand('/model', session, runtime);
    const out = stdout.join('');
    expect(out).toContain('Models for opencode');
    expect(out).toContain('deepseek-v4-flash-free');
    expect(out).toContain('mimo-v2.5-free');
  });

  it('sets model when /model <name> is given', () => {
    const runtime = buildRuntime({ cwd: dir, provider: 'opencode', quiet: true }, false);
    const session = runtime.store.create({
      mode: 'agent',
      cwd: dir,
      provider: 'opencode',
      model: 'deepseek-v4-flash-free',
    });
    handleSlashCommand('/model big-pickle', session, runtime);
    expect(session.model).toBe('big-pickle');
    expect(stdout.join('')).toContain('Model set to big-pickle');
  });

  it('lists providers when /provider has no argument', () => {
    const runtime = buildRuntime({ cwd: dir, provider: 'opencode', quiet: true }, false);
    const session = runtime.store.create({
      mode: 'agent',
      cwd: dir,
      provider: 'opencode',
      model: 'deepseek-v4-flash-free',
    });
    handleSlashCommand('/provider', session, runtime);
    const out = stdout.join('');
    expect(out).toContain('Providers');
    expect(out).toContain('opencode');
  });
});
