import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findAppRoot } from '../src/cli/update.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'sky-update-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('findAppRoot', () => {
  it('finds the @sky/cli package root by ascending', () => {
    const root = join(dir, 'app');
    const nested = join(root, 'dist', 'cli');
    mkdirSync(nested, { recursive: true });
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: '@sky/cli' }));
    expect(findAppRoot(nested)).toBe(root);
  });

  it('ignores unrelated package.json files', () => {
    const nested = join(dir, 'a', 'b');
    mkdirSync(nested, { recursive: true });
    writeFileSync(join(dir, 'a', 'package.json'), JSON.stringify({ name: 'something-else' }));
    expect(findAppRoot(nested)).toBeUndefined();
  });

  it('resolves this repository when run from src', () => {
    // The real repo root has package.json name "@sky/cli".
    const fromSrc = join(process.cwd(), 'src', 'cli');
    const root = findAppRoot(fromSrc);
    expect(root).toBe(process.cwd());
  });
});
