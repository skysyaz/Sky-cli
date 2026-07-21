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
