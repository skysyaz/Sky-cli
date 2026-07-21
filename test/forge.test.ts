import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultConfig } from '../src/config/index.js';
import {
  matchForgeForRemoteUrl,
  repoPathFromRemoteUrl,
  authorizedHttpsRemoteUrl,
  writeForgeToken,
  readForgeToken,
  clearForgeToken,
  listForgeRows,
  normalizeForgeBaseUrl,
} from '../src/forge/index.js';

describe('forge helpers', () => {
  let dir: string;
  let prevHome: string | undefined;
  let prevSecrets: string | undefined;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'sky-forge-'));
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

  it('normalizes base URLs', () => {
    expect(normalizeForgeBaseUrl('https://gitea.example.com/')).toBe('https://gitea.example.com');
  });

  it('parses repo paths from HTTPS and SSH remotes', () => {
    expect(repoPathFromRemoteUrl('https://github.com/acme/app.git')).toBe('acme/app');
    expect(repoPathFromRemoteUrl('git@github.com:acme/app.git')).toBe('acme/app');
    expect(repoPathFromRemoteUrl('https://gitea.example.com/org/repo')).toBe('org/repo');
  });

  it('matches forge by host for GitHub and self-hosted Gitea', () => {
    const config = defaultConfig();
    config.forge.remotes.github = { type: 'github', baseUrl: 'https://github.com' };
    config.forge.remotes.work = { type: 'gitea', baseUrl: 'https://gitea.example.com', username: 'me' };
    config.forge.default = 'work';

    expect(matchForgeForRemoteUrl('https://github.com/acme/app.git', config.forge)?.id).toBe('github');
    expect(matchForgeForRemoteUrl('git@github.com:acme/app.git', config.forge)?.id).toBe('github');
    expect(matchForgeForRemoteUrl('https://gitea.example.com/org/repo.git', config.forge)?.id).toBe('work');
    expect(matchForgeForRemoteUrl('https://gitlab.com/x/y.git', config.forge)).toBeNull();
  });

  it('builds authorized HTTPS URLs without logging tokens', () => {
    const gh = authorizedHttpsRemoteUrl('github', 'https://github.com', 'acme/app', 'ghp_secret');
    expect(gh).toContain('x-access-token');
    expect(gh).toContain('ghp_secret');
    expect(gh).toContain('github.com/acme/app.git');

    const ge = authorizedHttpsRemoteUrl(
      'gitea',
      'https://gitea.example.com',
      'org/repo',
      'tok',
      'alice',
    );
    expect(ge).toContain('alice');
    expect(ge).toContain('tok');
    expect(ge).toContain('gitea.example.com/org/repo.git');
  });

  it('stores forge tokens under forge:<id> secrets', () => {
    writeForgeToken('work', 'pat-123456789');
    expect(readForgeToken('work')).toBe('pat-123456789');
    const config = defaultConfig();
    config.forge.remotes.work = { type: 'gitea', baseUrl: 'https://gitea.example.com' };
    config.forge.default = 'work';
    const rows = listForgeRows(config);
    expect(rows[0]?.hasToken).toBe(true);
    expect(rows[0]?.isDefault).toBe(true);
    clearForgeToken('work');
    expect(readForgeToken('work')).toBeUndefined();
  });

  it('includes empty forge defaults in schema', () => {
    const config = defaultConfig();
    expect(config.forge.remotes).toEqual({});
    expect(config.forge.default).toBeUndefined();
  });
});
