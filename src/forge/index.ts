/**
 * GitHub / Gitea forge helpers — config is non-secret; tokens live in secrets
 * under `forge:<id>`. Used by the git tool for HTTPS push/pull auth and by
 * the local dashboard.
 */

import { readSecret, writeSecret, clearSecret } from '../config/secrets.js';
import type { ForgeConfig, ForgeRemote, SkyConfig } from '../config/schema.js';

export function forgeSecretKey(id: string): string {
  return `forge:${id}`;
}

export function readForgeToken(id: string): string | undefined {
  return readSecret(forgeSecretKey(id));
}

export function writeForgeToken(id: string, token: string): void {
  writeSecret(forgeSecretKey(id), token);
}

export function clearForgeToken(id: string): void {
  clearSecret(forgeSecretKey(id));
}

/** Normalize base URL (no trailing slash). */
export function normalizeForgeBaseUrl(url: string): string {
  return url.replace(/\/+$/, '');
}

/** Host of a forge base URL (for matching remotes). */
export function forgeHost(baseUrl: string): string {
  try {
    return new URL(baseUrl).host.toLowerCase();
  } catch {
    return '';
  }
}

/**
 * Pick the best forge remote for a git remote URL.
 * Matches host against configured forge baseUrls.
 */
export function matchForgeForRemoteUrl(
  remoteUrl: string,
  forge: ForgeConfig,
): { id: string; remote: ForgeRemote } | null {
  let host = '';
  try {
    // git@host:path → fake https for parsing
    if (remoteUrl.startsWith('git@')) {
      const m = remoteUrl.match(/^git@([^:]+):/);
      host = (m?.[1] ?? '').toLowerCase();
    } else {
      host = new URL(remoteUrl).host.toLowerCase();
    }
  } catch {
    return null;
  }
  if (!host) return null;

  for (const [id, remote] of Object.entries(forge.remotes)) {
    if (forgeHost(remote.baseUrl) === host) return { id, remote };
  }
  // Default github.com / gist.github.com
  if ((host === 'github.com' || host.endsWith('.github.com')) && forge.remotes.github) {
    return { id: 'github', remote: forge.remotes.github };
  }
  if (forge.default && forge.remotes[forge.default]) {
    const remote = forge.remotes[forge.default]!;
    if (forgeHost(remote.baseUrl) === host) return { id: forge.default, remote };
  }
  return null;
}

/**
 * Build an authenticated HTTPS remote URL for push/pull (in-memory only).
 * Never log the returned string — it embeds the token.
 */
export function authorizedHttpsRemoteUrl(
  type: ForgeRemote['type'],
  baseUrl: string,
  repoPath: string,
  token: string,
  username?: string,
): string {
  const base = normalizeForgeBaseUrl(baseUrl);
  const path = repoPath.replace(/^\/+/, '').replace(/\.git$/, '') + '.git';
  const u = new URL(base);
  if (type === 'github') {
    // https://docs.github.com/en/authentication/...#using-a-personal-access-token-on-the-command-line
    u.username = 'x-access-token';
    u.password = token;
  } else {
    // Gitea: token as password (username optional)
    u.username = username || 'oauth2';
    u.password = token;
  }
  u.pathname = '/' + path;
  return u.toString();
}

/** Extract owner/repo path from a remote URL. */
export function repoPathFromRemoteUrl(remoteUrl: string): string | null {
  if (remoteUrl.startsWith('git@')) {
    const m = remoteUrl.match(/^git@[^:]+:(.+?)(?:\.git)?$/);
    return m?.[1]?.replace(/\.git$/, '') ?? null;
  }
  try {
    const u = new URL(remoteUrl);
    return u.pathname.replace(/^\/+/, '').replace(/\.git$/, '') || null;
  } catch {
    return null;
  }
}

/** Env for simple-git that injects forge credentials without rewriting remotes. */
export function forgeGitEnv(
  config: SkyConfig,
  remoteUrl: string,
  env: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const match = matchForgeForRemoteUrl(remoteUrl, config.forge);
  if (!match) return { ...env };
  const token = readForgeToken(match.id);
  if (!token) return { ...env };

  const path = repoPathFromRemoteUrl(remoteUrl);
  if (!path) return { ...env };

  const authUrl = authorizedHttpsRemoteUrl(
    match.remote.type,
    match.remote.baseUrl,
    path,
    token,
    match.remote.username,
  );

  // Askpass script via env is complex cross-platform; instead set remote URL
  // only for this process by using GIT_CONFIG_COUNT overrides when possible.
  // Simplest portable approach: SKY_FORGE_AUTH_URL consumed by our wrapper.
  return {
    ...env,
    SKY_FORGE_AUTH_URL: authUrl,
    SKY_FORGE_ID: match.id,
  };
}

export function listForgeRows(config: SkyConfig): Array<{
  id: string;
  type: string;
  baseUrl: string;
  username?: string;
  hasToken: boolean;
  isDefault: boolean;
}> {
  return Object.entries(config.forge.remotes).map(([id, remote]) => ({
    id,
    type: remote.type,
    baseUrl: remote.baseUrl,
    username: remote.username,
    hasToken: Boolean(readForgeToken(id)),
    isDefault: config.forge.default === id,
  }));
}
