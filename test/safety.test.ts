import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultConfig } from '../src/config/index.js';
import { classifyShellCommand } from '../src/safety/shell.js';
import { Policy } from '../src/safety/policy.js';
import { generateDiff } from '../src/safety/diff.js';
import { matchGlob, matchCommandPattern } from '../src/safety/glob.js';
import { AuditLog } from '../src/safety/audit.js';
import { Approver } from '../src/safety/approver.js';

describe('shell classification (§9.4)', () => {
  it('classifies read-only commands as tier 1', () => {
    expect(classifyShellCommand('ls -la').tier).toBe(1);
    expect(classifyShellCommand('git status').tier).toBe(1);
    expect(classifyShellCommand('cat file.txt').tier).toBe(1);
  });
  it('classifies network reads as tier 2', () => {
    expect(classifyShellCommand('ping example.com').tier).toBe(2);
    expect(classifyShellCommand('dig example.com').tier).toBe(2);
  });
  it('classifies reversible mutations as tier 3', () => {
    expect(classifyShellCommand('npm install').tier).toBe(3);
    expect(classifyShellCommand('mkdir foo').tier).toBe(3);
  });
  it('classifies destructive commands as tier 4', () => {
    expect(classifyShellCommand('rm -rf /').tier).toBe(4);
    expect(classifyShellCommand('git push origin main --force').tier).toBe(4);
    expect(classifyShellCommand('git reset --hard').tier).toBe(4);
  });
});

describe('glob & command matching', () => {
  it('matches path globs', () => {
    expect(matchGlob('src/auth/token.ts', 'src/**/*.ts')).toBe(true);
    expect(matchGlob('README.md', 'src/**/*.ts')).toBe(false);
    expect(matchGlob('.env.local', '.env*')).toBe(true);
  });
  it('matches anchored command patterns', () => {
    expect(matchCommandPattern('npm test --watch', 'npm test*', true)).toBe(true);
    expect(matchCommandPattern('rm file', 'npm test*', true)).toBe(false);
  });
  it('treats ? in command patterns as a literal', () => {
    expect(matchCommandPattern('curl -I https://x?', 'curl -I https://x?', true)).toBe(true);
    expect(matchCommandPattern('curl -I https://xy', 'curl -I https://x?', true)).toBe(false);
  });
});

describe('Policy engine (§9.2)', () => {
  const config = defaultConfig();

  it('denies reads of secret files', () => {
    const p = new Policy(config);
    expect(p.classify({ tool: 'read', input: { path: '.env' }, requiresApproval: true }).decision).toBe('deny');
  });
  it('denies destructive shell via the hardcoded denylist', () => {
    const p = new Policy(config);
    expect(p.classify({ tool: 'shell', input: { command: 'rm -rf /' }, requiresApproval: true }).decision).toBe('deny');
  });
  it('prompts for a write by default', () => {
    const p = new Policy(config);
    expect(p.classify({ tool: 'write', input: { path: 'src/a.ts' }, requiresApproval: true }).decision).toBe('prompt');
  });
  it('auto-approves a write that matches an autoApprove glob', () => {
    const custom = defaultConfig();
    custom.tools.write.autoApprove = ['src/**/*.ts'];
    const p = new Policy(custom);
    expect(p.classify({ tool: 'write', input: { path: 'src/a.ts' }, requiresApproval: true }).decision).toBe('allow');
  });
  it('auto-approves git reads and denies force push', () => {
    const p = new Policy(config);
    expect(p.classify({ tool: 'git', input: { action: 'status' }, requiresApproval: false }).decision).toBe('allow');
    expect(
      p.classify({ tool: 'git', input: { action: 'push', flags: ['--force'] }, requiresApproval: true }).decision,
    ).toBe('deny');
  });
  it('honours a session allowlist', () => {
    const p = new Policy(config, [{ tool: 'shell', pattern: 'npm test*' }]);
    expect(p.classify({ tool: 'shell', input: { command: 'npm test' }, requiresApproval: true }).decision).toBe('allow');
  });
  it('derives the most specific allowlist pattern (§9.8)', () => {
    expect(Policy.deriveAllowlistPattern('shell', { command: 'npm test --watch' })).toEqual({
      tool: 'shell',
      pattern: 'npm test*',
    });
  });
});

describe('diff generation (§9.3)', () => {
  it('counts added and removed lines and hashes the new content', () => {
    const d = generateDiff('a.ts', 'line1\nline2\n', 'line1\nline2-changed\n');
    expect(d.added).toBeGreaterThan(0);
    expect(d.removed).toBeGreaterThan(0);
    expect(d.sha256).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('Approver (§9.1)', () => {
  let dir: string;
  let audit: AuditLog;
  const config = defaultConfig();

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'sky-audit-'));
    audit = new AuditLog({ path: join(dir, 'audit.log') });
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('auto-approves an allowed call and audits it', async () => {
    const approver = new Approver({ policy: new Policy(config), audit });
    const result = await approver.request({
      sessionId: 's',
      toolCallId: 'c1',
      toolName: 'git',
      input: { action: 'status' },
      requiresApproval: false,
    });
    expect(result.granted).toBe(true);
    expect(result.autoApproved).toBe(true);
    const log = readFileSync(join(dir, 'audit.log'), 'utf8');
    expect(log).toContain('"granted":true');
  });

  it('denies a denylisted call regardless of flags', async () => {
    const approver = new Approver({ policy: new Policy(config), audit, yolo: true });
    const result = await approver.request({
      sessionId: 's',
      toolCallId: 'c2',
      toolName: 'shell',
      input: { command: 'rm -rf /' },
      requiresApproval: true,
    });
    expect(result.granted).toBe(false);
    expect(result.decision).toBe('deny');
  });

  it('--force auto-approves a call that would otherwise prompt', async () => {
    const approver = new Approver({ policy: new Policy(config), audit, force: true });
    const result = await approver.request({
      sessionId: 's',
      toolCallId: 'c3',
      toolName: 'write',
      input: { path: 'src/a.ts', content: 'x' },
      requiresApproval: true,
    });
    expect(result.granted).toBe(true);
    expect(result.autoApproved).toBe(true);
  });

  it('uses the interactive prompter and records an "always" allowlist entry', async () => {
    const approver = new Approver({
      policy: new Policy(config),
      audit,
      prompter: async () => 'always',
    });
    const result = await approver.request({
      sessionId: 's',
      toolCallId: 'c4',
      toolName: 'write',
      input: { path: 'src/a.ts', content: 'x' },
      requiresApproval: true,
    });
    expect(result.granted).toBe(true);
    expect(result.allowlistAdded).toEqual({ tool: 'write', pattern: 'src/**/*.ts' });
  });

  it('denies when a prompt is required but no channel exists', async () => {
    const approver = new Approver({ policy: new Policy(config), audit });
    await expect(
      approver.request({
        sessionId: 's',
        toolCallId: 'c5',
        toolName: 'write',
        input: { path: 'src/a.ts', content: 'x' },
        requiresApproval: true,
      }),
    ).rejects.toMatchObject({ code: 'SKY-E-6000' });
  });
});
