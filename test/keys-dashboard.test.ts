import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { formatKeysDashboard, listKeyRows, maskSecret, writeSecret } from '../src/config/index.js';

describe('keys dashboard', () => {
  let dir: string;
  let prevHome: string | undefined;
  let prevSecrets: string | undefined;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'sky-keys-'));
    prevHome = process.env.SKY_HOME;
    prevSecrets = process.env.SKY_SECRETS;
    process.env.SKY_HOME = dir;
    process.env.SKY_SECRETS = join(dir, 'secrets.json');
  });
  afterEach(() => {
    if (prevHome === undefined) delete process.env.SKY_HOME;
    else process.env.SKY_HOME = prevHome;
    if (prevSecrets === undefined) delete process.env.SKY_SECRETS;
    else process.env.SKY_SECRETS = prevSecrets;
    rmSync(dir, { recursive: true, force: true });
  });

  it('masks secrets', () => {
    expect(maskSecret('sk-abcdefghijklmnop')).toBe('sk-a…mnop');
  });

  it('lists keyless providers as ready without a secret', () => {
    const rows = listKeyRows({}, {});
    const opencode = rows.find((r) => r.provider === 'opencode');
    expect(opencode?.status).toBe('keyless');
    const qwen = rows.find((r) => r.provider === 'qwen-web');
    expect(qwen?.status).toBe('missing');
  });

  it('shows saved secrets as ready with mask', () => {
    writeSecret('qwen-web', 'sk-testkey12345678');
    const rows = listKeyRows({}, {});
    const qwen = rows.find((r) => r.provider === 'qwen-web');
    expect(qwen?.status).toBe('ready');
    expect(qwen?.source).toBe('secrets');
    expect(qwen?.masked).toContain('…');
  });

  it('renders a dashboard with commands', () => {
    const text = formatKeysDashboard({}, {}, 'opencode');
    expect(text).toContain('API keys dashboard');
    expect(text).toContain('opencode');
    expect(text).toContain('← active');
    expect(text).toContain('/keys set');
  });
});
