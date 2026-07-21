import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ToolRegistry } from '../src/tools/registry.js';
import { nullLogger } from '../src/logging/index.js';
import { defaultConfig } from '../src/config/index.js';
import type { ToolContext } from '../src/tools/types.js';
import { ErrorCode } from '../src/errors/index.js';

let dir: string;
let ctx: ToolContext;
const registry = new ToolRegistry();

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'sky-tools-'));
  ctx = { cwd: dir, config: defaultConfig(), logger: nullLogger };
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('read tool (§6.2)', () => {
  it('reads a file', async () => {
    writeFileSync(join(dir, 'a.txt'), 'hello world');
    const result = await registry.execute('read', { path: 'a.txt' }, ctx);
    expect(result.ok).toBe(true);
    expect(result.output).toContain('hello world');
  });
  it('reports a missing file as retryable', async () => {
    const result = await registry.execute('read', { path: 'nope.txt' }, ctx);
    expect(result.ok).toBe(false);
    expect(result.retryable).toBe(true);
  });
  it('supports offset/limit', async () => {
    writeFileSync(join(dir, 'lines.txt'), 'a\nb\nc\nd\ne');
    const result = await registry.execute('read', { path: 'lines.txt', offset: 1, limit: 2 }, ctx);
    expect(result.output).toBe('b\nc');
  });
});

describe('write tool (§6.3)', () => {
  it('creates a file', async () => {
    const result = await registry.execute('write', { path: 'out.txt', content: 'data' }, ctx);
    expect(result.ok).toBe(true);
    expect(readFileSync(join(dir, 'out.txt'), 'utf8')).toBe('data');
  });
  it('refuses to write outside cwd (SKY-E-3010)', async () => {
    const result = await registry.execute('write', { path: '../escape.txt', content: 'x' }, ctx);
    expect(result.ok).toBe(false);
    expect(result.code).toBe(ErrorCode.WritePathOutsideCwd);
  });
});

describe('edit tool (§6.4)', () => {
  it('replaces a unique string', async () => {
    writeFileSync(join(dir, 'e.txt'), 'foo bar baz');
    const result = await registry.execute('edit', { path: 'e.txt', oldText: 'bar', newText: 'qux' }, ctx);
    expect(result.ok).toBe(true);
    expect(readFileSync(join(dir, 'e.txt'), 'utf8')).toBe('foo qux baz');
  });
  it('fails when oldText is missing (SKY-E-3020)', async () => {
    writeFileSync(join(dir, 'e.txt'), 'foo');
    const result = await registry.execute('edit', { path: 'e.txt', oldText: 'zzz', newText: 'x' }, ctx);
    expect(result.code).toBe(ErrorCode.EditOldTextNotFound);
  });
  it('fails when oldText is ambiguous (SKY-E-3021)', async () => {
    writeFileSync(join(dir, 'e.txt'), 'x x x');
    const result = await registry.execute('edit', { path: 'e.txt', oldText: 'x', newText: 'y' }, ctx);
    expect(result.code).toBe(ErrorCode.EditOldTextAmbiguous);
  });
  it('replaces all when occurrences=all', async () => {
    writeFileSync(join(dir, 'e.txt'), 'x x x');
    const result = await registry.execute('edit', { path: 'e.txt', oldText: 'x', newText: 'y', occurrences: 'all' }, ctx);
    expect(result.ok).toBe(true);
    expect(readFileSync(join(dir, 'e.txt'), 'utf8')).toBe('y y y');
  });
  it('produces a preview diff', async () => {
    writeFileSync(join(dir, 'e.txt'), 'foo bar');
    const preview = await registry.get('edit')!.preview!({ path: 'e.txt', oldText: 'bar', newText: 'baz' }, ctx);
    expect(preview?.newContent).toBe('foo baz');
  });
});

describe('search tool (§6.5)', () => {
  it('finds matches via the JS fallback', async () => {
    writeFileSync(join(dir, 'a.ts'), 'const answer = 42;\nconst other = 1;');
    const result = await registry.execute('search', { pattern: 'answer' }, ctx);
    expect(result.ok).toBe(true);
    expect(result.output).toContain('a.ts');
    expect((result.data?.matches as unknown[]).length).toBeGreaterThan(0);
  });
});

describe('shell tool', () => {
  it('runs a simple command', async () => {
    const result = await registry.execute('shell', { command: 'echo sky-ok' }, ctx);
    expect(result.ok).toBe(true);
    expect(result.output).toContain('sky-ok');
  });
  it('accepts an AbortSignal via cancelSignal (execa v9)', async () => {
    const ac = new AbortController();
    const result = await registry.execute(
      'shell',
      { command: 'echo aborted-ok' },
      { ...ctx, signal: ac.signal },
    );
    expect(result.ok).toBe(true);
    expect(result.output).toContain('aborted-ok');
    expect(result.output).not.toContain('cancelSignal');
    expect(result.output).not.toContain('renamed to');
  });
});
