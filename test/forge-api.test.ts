import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultConfig } from '../src/config/index.js';
import { writeForgeToken } from '../src/forge/index.js';
import {
  forgeApiBase,
  forgeAuthHeaders,
  resolveForge,
  forgeListRepos,
  forgeWhoami,
  formatForgeStatus,
} from '../src/forge/api.js';
import { forgeTool } from '../src/tools/forge.js';
import { ToolRegistry } from '../src/tools/registry.js';
import { Policy } from '../src/safety/policy.js';
import { providerErrorFromStatus } from '../src/llm/errors.js';
import { ErrorCode } from '../src/errors/index.js';
import { sanitizeToolTurns } from '../src/session/compact.js';
import { nullLogger } from '../src/logging/index.js';
import type { Message } from '../src/session/types.js';

describe('forge API helpers', () => {
  it('maps GitHub and Gitea API bases', () => {
    expect(forgeApiBase({ type: 'github', baseUrl: 'https://github.com' })).toBe('https://api.github.com');
    expect(forgeApiBase({ type: 'gitea', baseUrl: 'https://gitea.example.com/' })).toBe(
      'https://gitea.example.com/api/v1',
    );
  });

  it('builds auth headers', () => {
    expect(forgeAuthHeaders({ type: 'github', baseUrl: 'https://github.com' }, 'tok').Authorization).toBe(
      'Bearer tok',
    );
    expect(forgeAuthHeaders({ type: 'gitea', baseUrl: 'https://gitea.example.com' }, 'tok').Authorization).toBe(
      'token tok',
    );
  });
});

describe('forge tool', () => {
  let dir: string;
  let prevHome: string | undefined;
  let prevSecrets: string | undefined;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'sky-forge-api-'));
    prevHome = process.env.SKY_HOME;
    prevSecrets = process.env.SKY_SECRETS;
    process.env.SKY_HOME = dir;
    process.env.SKY_SECRETS = join(dir, 'secrets.json');
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    if (prevHome === undefined) delete process.env.SKY_HOME;
    else process.env.SKY_HOME = prevHome;
    if (prevSecrets === undefined) delete process.env.SKY_SECRETS;
    else process.env.SKY_SECRETS = prevSecrets;
    rmSync(dir, { recursive: true, force: true });
  });

  it('status explains how to connect when empty', () => {
    const config = defaultConfig();
    expect(formatForgeStatus(config)).toContain('No forges connected');
  });

  it('lists repos via GitHub API using the dashboard token', async () => {
    const config = defaultConfig();
    config.forge.remotes.github = { type: 'github', baseUrl: 'https://github.com', username: 'octo' };
    config.forge.default = 'github';
    writeForgeToken('github', 'ghp_testtoken');

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        expect(String(url)).toContain('api.github.com/user/repos');
        return {
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify([
              {
                full_name: 'octo/hello',
                private: false,
                description: 'demo',
                html_url: 'https://github.com/octo/hello',
                default_branch: 'main',
                updated_at: '2026-01-01T00:00:00Z',
              },
            ]),
        };
      }),
    );

    const resolved = resolveForge(config);
    expect(resolved?.id).toBe('github');
    const repos = await forgeListRepos(resolved!);
    expect(repos[0]?.fullName).toBe('octo/hello');

    const result = await forgeTool.execute(
      { action: 'repos', limit: 10 },
      { cwd: dir, config, logger: nullLogger },
    );
    expect(result.ok).toBe(true);
    expect(result.output).toContain('octo/hello');
  });

  it('whoami hits /user', async () => {
    const config = defaultConfig();
    config.forge.remotes.github = { type: 'github', baseUrl: 'https://github.com' };
    config.forge.default = 'github';
    writeForgeToken('github', 'ghp_testtoken');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ login: 'octo', name: 'Octo Cat', html_url: 'https://github.com/octo' }),
      })),
    );
    const me = await forgeWhoami(resolveForge(config)!);
    expect(me.login).toBe('octo');

    const result = await forgeTool.execute(
      { action: 'whoami' },
      { cwd: dir, config, logger: nullLogger },
    );
    expect(result.ok).toBe(true);
    expect(result.output).toContain('login=octo');
  });

  it('status / missing token / repo name validation', async () => {
    const config = defaultConfig();
    const status = await forgeTool.execute(
      { action: 'status' },
      { cwd: dir, config, logger: nullLogger },
    );
    expect(status.ok).toBe(true);
    expect(status.output).toContain('No forges connected');

    const missing = await forgeTool.execute(
      { action: 'repos' },
      { cwd: dir, config, logger: nullLogger },
    );
    expect(missing.ok).toBe(false);
    expect(missing.output).toContain('No forge token');

    config.forge.remotes.github = { type: 'github', baseUrl: 'https://github.com' };
    writeForgeToken('github', 'ghp_x');
    const needName = await forgeTool.execute(
      { action: 'repo' },
      { cwd: dir, config, logger: nullLogger },
    );
    expect(needName.ok).toBe(false);
    expect(needName.output).toContain('owner/repo');
  });

  it('repo lookup and empty list via tool', async () => {
    const config = defaultConfig();
    config.forge.remotes.github = { type: 'github', baseUrl: 'https://github.com' };
    config.forge.default = 'github';
    writeForgeToken('github', 'ghp_testtoken');

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const u = String(url);
        if (u.includes('/repos/octo/hello')) {
          return {
            ok: true,
            status: 200,
            text: async () =>
              JSON.stringify({
                full_name: 'octo/hello',
                private: true,
                description: 'secret',
                html_url: 'https://github.com/octo/hello',
                default_branch: 'main',
                updated_at: '2026-01-02T00:00:00Z',
              }),
          };
        }
        return { ok: true, status: 200, text: async () => '[]' };
      }),
    );

    const empty = await forgeTool.execute(
      { action: 'repos' },
      { cwd: dir, config, logger: nullLogger },
    );
    expect(empty.ok).toBe(true);
    expect(empty.output).toContain('no repositories');

    const one = await forgeTool.execute(
      { action: 'repo', name: 'octo/hello' },
      { cwd: dir, config, logger: nullLogger },
    );
    expect(one.ok).toBe(true);
    expect(one.output).toContain('octo/hello');
    expect(one.output).toContain('private');
  });

  it('surfaces API failures as retryable tool errors', async () => {
    const config = defaultConfig();
    config.forge.remotes.github = { type: 'github', baseUrl: 'https://github.com' };
    writeForgeToken('github', 'ghp_bad');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 401,
        text: async () => 'bad credentials',
      })),
    );
    const result = await forgeTool.execute(
      { action: 'whoami' },
      { cwd: dir, config, logger: nullLogger },
    );
    expect(result.ok).toBe(false);
    expect(result.retryable).toBe(true);
    expect(result.output).toContain('failed');
  });

  it('maps GitHub Enterprise and Gitea API bases', () => {
    expect(forgeApiBase({ type: 'github', baseUrl: 'https://github.example.com' })).toBe(
      'https://github.example.com/api/v3',
    );
    expect(forgeApiBase({ type: 'github', baseUrl: 'not a url' })).toBe('https://api.github.com');
  });

  it('is registered and auto-approved by policy', () => {
    const registry = new ToolRegistry();
    expect(registry.has('forge')).toBe(true);
    const policy = new Policy(defaultConfig());
    expect(
      policy.classify({ tool: 'forge', input: { action: 'repos' }, requiresApproval: false }).decision,
    ).toBe('allow');
  });
});

describe('provider upstream 400 handling', () => {
  it('treats OpenCode upstream 400 as retryable request failure', () => {
    const err = providerErrorFromStatus(400, '400 Error from provider (Console): Upstream request failed');
    expect(err.code).toBe(ErrorCode.ProviderRequestFailed);
    expect(err.retryable).toBe(true);
  });

  it('keeps genuine bad requests as SKY-E-5010', () => {
    const err = providerErrorFromStatus(400, 'invalid tool schema');
    expect(err.code).toBe(ErrorCode.ProviderBadRequest);
  });

  it('maps common provider statuses', () => {
    expect(providerErrorFromStatus(429, 'slow').code).toBe(ErrorCode.ProviderRateLimited);
    expect(providerErrorFromStatus(503, 'down').code).toBe(ErrorCode.ProviderUnavailable);
    expect(providerErrorFromStatus(401, 'nope').code).toBe(ErrorCode.ProviderAuthFailed);
    expect(providerErrorFromStatus(403, 'no').code).toBe(ErrorCode.ProviderForbidden);
    expect(providerErrorFromStatus(451, 'blocked').code).toBe(ErrorCode.ProviderContentFilter);
    expect(providerErrorFromStatus(502, 'bad gateway').code).toBe(ErrorCode.ProviderUnavailable);
    expect(providerErrorFromStatus(418, 'teapot').code).toBe(ErrorCode.ProviderRequestFailed);
    expect(providerErrorFromStatus(400, 'Upstream error from proxy').code).toBe(
      ErrorCode.ProviderRequestFailed,
    );
  });
});

describe('sanitizeToolTurns', () => {
  it('drops orphan tool messages', () => {
    const messages: Message[] = [
      { role: 'user', content: 'hi' },
      { role: 'tool', content: 'orphan', toolCallId: 'missing', name: 'shell' },
      {
        role: 'assistant',
        content: '',
        toolCalls: [{ id: 't1', name: 'shell', input: {} }],
      },
      { role: 'tool', content: 'ok', toolCallId: 't1', name: 'shell' },
    ];
    const cleaned = sanitizeToolTurns(messages);
    expect(cleaned.filter((m) => m.role === 'tool')).toHaveLength(1);
    expect(cleaned.find((m) => m.role === 'tool')?.toolCallId).toBe('t1');
  });
});
